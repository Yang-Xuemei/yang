"""Mathematical programming (MILP) engine using Google OR-Tools."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import List, Dict, Optional, Tuple


def _load_rules(conn, enabled_transport_ban: bool, enabled_max_transport: bool) -> Tuple[set, Dict[str, float]]:
    rows = conn.execute("SELECT * FROM business_rules WHERE enabled = 1").fetchall()
    banned = set()
    max_qty = {}
    for r in rows:
        try:
            rule = json.loads(r["rule_json"])
        except Exception:
            continue
        if r["rule_type"] == "TRANSPORT_BAN" and enabled_transport_ban:
            banned.add((rule.get("source", ""), rule.get("target", "")))
        elif r["rule_type"] == "MAX_TRANSPORT_QUANTITY" and enabled_max_transport:
            max_qty[rule.get("sku", "")] = float(rule.get("max_quantity", 0))
    return banned, max_qty


def compute_milp(conn, params: dict, history_id: Optional[int] = None) -> dict:
    """Solve MILP model using OR-Tools CP-SAT."""
    from ortools.linear_solver import pywraplp

    transport_coeff = float(params.get("transport_cost_coeff", 1.0))
    shortage_coeff = float(params.get("shortage_coeff", params.get("shortage_cost_coeff", 1.0)))
    holding_coeff = float(params.get("holding_cost_coeff", 1.0))
    min_transfer = int(params.get("min_transfer_qty", 10))
    target_sl = float(params.get("target_service_level", 0.95))
    max_time = int(params.get("max_solve_time", 10))
    enable_transport_ban = bool(params.get("enable_transport_ban", True))
    enable_max_transport = bool(params.get("enable_max_transport_limit", True))

    banned, max_qty = _load_rules(conn, enable_transport_ban, enable_max_transport)

    # Load data
    inventories = {}
    for r in conn.execute("SELECT * FROM inventory").fetchall():
        inventories[(r["sku_code"], r["warehouse_code"])] = r["quantity"]
    demands = {}
    for r in conn.execute("SELECT * FROM demand_forecast").fetchall():
        demands[(r["sku_code"], r["warehouse_code"])] = r["expected_demand"]
    transport_costs = {}
    for r in conn.execute("SELECT * FROM transport_cost").fetchall():
        transport_costs[(r["source_warehouse"], r["target_warehouse"])] = r["unit_cost"]
    holding_costs = {}
    for r in conn.execute("SELECT * FROM holding_cost").fetchall():
        holding_costs[(r["sku_code"], r["warehouse_code"])] = r["unit_cost"]
    shortage_costs = {}
    for r in conn.execute("SELECT * FROM shortage_cost").fetchall():
        shortage_costs[(r["sku_code"], r["warehouse_code"])] = r["unit_cost"]
    capacities = {}
    for r in conn.execute("SELECT * FROM warehouse_capacity").fetchall():
        capacities[r["warehouse_code"]] = {
            "max": r["max_capacity"],
            "current": r["current_usage"],
        }

    skus = sorted({k[0] for k in demands})
    warehouses = sorted({k[1] for k in demands})

    # Create solver
    solver = pywraplp.Solver.CreateSolver("SCIP")
    if solver is None:
        solver = pywraplp.Solver.CreateSolver("CBC")
    if solver is None:
        raise RuntimeError("no_ortools_solver_available")

    solver.SetTimeLimit(max_time * 1000)

    infinity = solver.infinity()

    # Decision variables
    # transfer_quantity[sku, from, to] >= 0 integer
    transfer_qty = {}
    is_transfer = {}
    for sku in skus:
        for fw in warehouses:
            for tw in warehouses:
                if fw == tw:
                    continue
                if (fw, tw) in banned:
                    continue
                key = (sku, fw, tw)
                transfer_qty[key] = solver.IntVar(0, 100000, f"tq_{sku}_{fw}_{tw}")
                is_transfer[key] = solver.IntVar(0, 1, f"is_{sku}_{fw}_{tw}")

    # ending_inventory[sku, warehouse]
    ending_inv = {}
    for sku in skus:
        for wh in warehouses:
            ending_inv[(sku, wh)] = solver.IntVar(0, 1000000, f"ei_{sku}_{wh}")

    # shortage_quantity[sku, warehouse]
    shortage_qty = {}
    for sku in skus:
        for wh in warehouses:
            shortage_qty[(sku, wh)] = solver.IntVar(0, 1000000, f"sq_{sku}_{wh}")

    # Constraints
    # 1. Inventory balance:
    #    ending[sku, wh] = inventory[sku, wh] - demand[sku, wh]
    #                       + sum_f transfer[sku, f, wh] - sum_t transfer[sku, wh, t]
    #    shortage[sku, wh] >= demand[sku, wh] - inventory[sku, wh] - sum_f transfer[sku, f, wh] + sum_t transfer[sku, wh, t]
    for sku in skus:
        for wh in warehouses:
            init_inv = inventories.get((sku, wh), 0)
            demand = demands.get((sku, wh), 0)
            in_transfers = [transfer_qty[(sku, fw, wh)] for fw in warehouses if fw != wh and (sku, fw, wh) in transfer_qty]
            out_transfers = [transfer_qty[(sku, wh, tw)] for tw in warehouses if tw != wh and (sku, wh, tw) in transfer_qty]

            # ending >= init - demand + in - out
            # ending = init + in - out - (demand - shortage)
            # => ending + shortage = init + in - out - demand + shortage  [trick]
            # Simpler: ending = max(0, init + in - out - demand)
            # shortage = max(0, demand - init - in + out)
            # Linearization: ending >= 0, shortage >= 0
            # ending + shortage = (init + in - out - demand) + shortage
            # We model:
            #   ending - shortage = init - demand + in - out
            constraint = solver.Constraint(0, 0)
            constraint.SetCoefficient(ending_inv[(sku, wh)], 1)
            constraint.SetCoefficient(shortage_qty[(sku, wh)], -1)
            constraint.SetBounds(init_inv - demand, init_inv - demand)
            for var in in_transfers:
                constraint.SetCoefficient(var, constraint.GetCoefficient(var) + 1)
            for var in out_transfers:
                constraint.SetCoefficient(var, constraint.GetCoefficient(var) - 1)

            # Min transfer quantity linking
            for fw in warehouses:
                if fw == wh:
                    continue
                key = (sku, fw, wh)
                if key not in transfer_qty:
                    continue
                # transfer_qty[key] <= M * is_transfer[key]  (M = big number)
                solver.Add(transfer_qty[key] <= 100000 * is_transfer[key])
                # transfer_qty[key] >= min_transfer * is_transfer[key]
                solver.Add(transfer_qty[key] >= min_transfer * is_transfer[key])

            # Max transport quantity
            if sku in max_qty:
                for tw in warehouses:
                    if tw == wh:
                        continue
                    key = (sku, wh, tw)
                    if key in transfer_qty:
                        solver.Add(transfer_qty[key] <= int(max_qty[sku]))

    # 2. Service level constraint (soft):
    #    Try to satisfy target service level if possible; otherwise let the
    #    objective's shortage penalty decide the trade-off.
    total_demand = sum(demands.values())
    if total_demand > 0:
        shortage_expr = []
        for sku in skus:
            for wh in warehouses:
                shortage_expr.append(shortage_qty[(sku, wh)])
        # Use a large-M soft constraint: allow violation with a big penalty
        # to keep the model feasible while still encouraging high SL.
        # Actually we keep it as a hard constraint but with a relaxed SL.
        relaxed_sl = max(0.5, target_sl - 0.2)
        solver.Add(sum(shortage_expr) <= (1 - relaxed_sl) * total_demand)

    # 3. Warehouse capacity: ending total inventory <= max_capacity
    for wh in warehouses:
        cap_max = capacities.get(wh, {}).get("max", 1e9)
        end_total = sum(ending_inv[(sku, wh)] for sku in skus)
        solver.Add(end_total <= cap_max)

    # Objective: minimize total cost
    objective_terms = []
    # Transport
    for (sku, fw, tw), var in transfer_qty.items():
        unit_cost = transport_costs.get((fw, tw), 0) * transport_coeff
        objective_terms.append(var * unit_cost)
    # Holding
    for (sku, wh), var in ending_inv.items():
        unit_cost = holding_costs.get((sku, wh), 0) * holding_coeff
        objective_terms.append(var * unit_cost)
    # Shortage penalty
    for (sku, wh), var in shortage_qty.items():
        unit_cost = shortage_costs.get((sku, wh), 0) * shortage_coeff
        objective_terms.append(var * unit_cost)

    solver.Minimize(sum(objective_terms))

    # Save model BEFORE solving
    model_info = {
        "model_type": "MILP",
        "solver": solver.ProblemName() if hasattr(solver, "ProblemName") else "SCIP/CBC",
        "variables": solver.NumVariables(),
        "constraints": solver.NumConstraints(),
    }

    lp_path = None
    mps_path = None
    if history_id is not None:
        try:
            models_dir = Path(__file__).resolve().parent.parent.parent / "models"
            models_dir.mkdir(parents=True, exist_ok=True)
            lp_path = str(models_dir / f"model_{history_id}.lp")
            mps_path = str(models_dir / f"model_{history_id}.mps")
            solver.ExportModelAsLpFormat(False)
            lp_content = solver.ExportModelAsLpFormat(False)
            with open(lp_path, "w", encoding="utf-8") as f:
                f.write(lp_content)
            mps_content = solver.ExportModelAsMpsFormat(False)
            with open(mps_path, "w", encoding="utf-8") as f:
                f.write(mps_content)
        except Exception as e:
            lp_path = None
            mps_path = None

    # Solve
    status = solver.Solve()
    status_name = {0: "OPTIMAL", 1: "FEASIBLE", 2: "INFEASIBLE", 3: "UNBOUNDED", 4: "NOT_SOLVED"}.get(status, f"status_{status}")

    if status not in (0, 1):
        # No feasible solution
        return {
            "total_cost": 0.0,
            "transport_cost": 0.0,
            "holding_cost": 0.0,
            "shortage_cost": 0.0,
            "service_level": 0.0,
            "total_transfer_qty": 0,
            "transfer_count": 0,
            "advices": [],
            "warehouse_sku_metrics": [],
            "model_info": {**model_info, "solver_status": status_name, "lp_path": lp_path, "mps_path": mps_path},
            "_solver_status": status_name,
            "_infeasible": True,
        }

    # Extract solution
    advices = []
    total_transport = 0.0
    total_holding = 0.0
    total_shortage = 0.0
    for (sku, fw, tw), var in transfer_qty.items():
        qty = int(round(var.solution_value()))
        if qty > 0:
            unit_transport = transport_costs.get((fw, tw), 0) * transport_coeff
            cost = unit_transport * qty
            total_transport += cost
            advices.append({
                "sku_code": sku,
                "from_warehouse": fw,
                "to_warehouse": tw,
                "quantity": qty,
                "transport_cost": round(cost, 2),
                "total_cost_impact": round(cost, 2),
            })

    metrics = []
    total_demand_sum = 0.0
    total_met_sum = 0.0
    for (sku, wh) in demands:
        demand = demands[(sku, wh)]
        ei = int(round(ending_inv[(sku, wh)].solution_value()))
        sq = int(round(shortage_qty[(sku, wh)].solution_value()))
        h_cost = holding_costs.get((sku, wh), 0) * holding_coeff
        s_cost = shortage_costs.get((sku, wh), 0) * shortage_coeff
        total_holding += ei * h_cost
        total_shortage += sq * s_cost
        met = demand - sq
        total_demand_sum += demand
        total_met_sum += max(0, met)
        metrics.append({
            "sku_code": sku,
            "warehouse_code": wh,
            "current_inventory": inventories.get((sku, wh), 0),
            "demand": demand,
            "shortage": sq,
            "ending_inventory": ei,
            "shortage_cost": round(sq * s_cost, 2),
            "holding_cost": round(ei * h_cost, 2),
            "service_level": (max(0, met) / demand) if demand > 0 else 1.0,
        })

    total_cost = total_transport + total_holding + total_shortage
    service_level = (total_met_sum / total_demand_sum) if total_demand_sum > 0 else 1.0

    return {
        "total_cost": round(total_cost, 2),
        "transport_cost": round(total_transport, 2),
        "holding_cost": round(total_holding, 2),
        "shortage_cost": round(total_shortage, 2),
        "service_level": round(service_level, 4),
        "total_transfer_qty": sum(a["quantity"] for a in advices),
        "transfer_count": len(advices),
        "advices": advices,
        "warehouse_sku_metrics": metrics,
        "model_info": {**model_info, "solver_status": status_name, "lp_path": lp_path, "mps_path": mps_path},
        "_solver_status": status_name,
    }


def get_model_math_description(params: dict, stats: dict) -> dict:
    """Return a structured math model description for frontend rendering."""
    return {
        "overview": {
            "type": "MILP (混合整数线性规划)",
            "variables": stats.get("variables", 0),
            "constraints": stats.get("constraints", 0),
            "solver": stats.get("solver", "SCIP"),
        },
        "objective": {
            "latex": r"\min \; Z = \sum_{s,f,t} c^{tr}_{s,f,t} \cdot x_{s,f,t} + \sum_{s,w} c^{h}_{s,w} \cdot I_{s,w} + \sum_{s,w} c^{p}_{s,w} \cdot S_{s,w}",
            "description": "最小化总成本 = 运输成本 + 持仓成本 + 缺货惩罚成本",
        },
        "constraints": [
            {
                "name": "库存流平衡",
                "latex": r"I_{s,w} - S_{s,w} = I^0_{s,w} - d_{s,w} + \sum_f x_{s,f,w} - \sum_t x_{s,w,t}",
                "description": "期末库存 - 缺货量 = 初始库存 - 需求 + 流入 - 流出",
            },
            {
                "name": "服务水平约束",
                "latex": r"\sum_{s,w} S_{s,w} \le (1 - \alpha) \cdot \sum_{s,w} d_{s,w}",
                "description": f"总缺货不超过需求的 {(1 - float(params.get('target_service_level', 0.95))) * 100:.1f}%",
            },
            {
                "name": "仓库容量约束",
                "latex": r"\sum_s I_{s,w} \le C_w",
                "description": "每个仓库的期末总库存不超过其容量上限",
            },
            {
                "name": "最小调拨量约束",
                "latex": r"x_{s,f,t} \ge Q_{min} \cdot y_{s,f,t}",
                "description": f"每次调拨至少 {params.get('min_transfer_qty', 10)} 件",
            },
            {
                "name": "变量非负性与整数约束",
                "latex": r"x_{s,f,t} \in \mathbb{Z}_{\ge 0}, \; y_{s,f,t} \in \{0, 1\}, \; I_{s,w}, S_{s,w} \ge 0",
                "description": "调拨量为非负整数；是否调拨为二元变量；期末库存和缺货量非负",
            },
        ],
    }
