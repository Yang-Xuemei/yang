"""Heuristic transfer optimization engine.

Fast (<2s) greedy algorithm for daily decision support.
"""
from __future__ import annotations

import json
from typing import List, Dict, Tuple

from app.database import get_connection


def _load_rules(conn, enabled_transport_ban: bool, enabled_max_transport: bool) -> Tuple[set, Dict[str, float]]:
    """Load enabled business rules."""
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


def compute_heuristic(conn, params: dict) -> dict:
    """Generate transfer advice via greedy heuristic."""
    transport_coeff = float(params.get("transport_cost_coeff", 1.0))
    shortage_coeff = float(params.get("shortage_cost_coeff", 1.0))
    holding_coeff = float(params.get("holding_cost_coeff", 1.0))
    min_transfer = int(params.get("min_transfer_qty", 10))
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

    # Track mutable state
    cur_inv = dict(inventories)
    cur_cap = {w: capacities.get(w, {}).get("current", 0) for w in warehouses}
    max_caps = {w: capacities.get(w, {}).get("max", 1e9) for w in warehouses}

    advices = []
    metrics = []

    # For each SKU, match surplus sources to deficit targets
    for sku in skus:
        # Build lists of surplus and deficit warehouses
        surpluses = []
        deficits = []
        for wh in warehouses:
            inv = cur_inv.get((sku, wh), 0)
            demand = demands.get((sku, wh), 0)
            gap = inv - demand
            if gap > 0:
                surpluses.append((wh, gap, inv))
            elif gap < 0:
                deficits.append((wh, -gap, inv))

        # Sort: highest surplus first, highest deficit first
        surpluses.sort(key=lambda x: -x[1])
        deficits.sort(key=lambda x: -x[1])

        for (target_wh, deficit, _) in deficits:
            shortage_unit_cost = shortage_costs.get((sku, target_wh), 10) * shortage_coeff
            for (source_wh, surplus, _) in surpluses:
                if surplus <= 0:
                    continue
                if (source_wh, target_wh) in banned:
                    continue
                transport_unit = transport_costs.get((source_wh, target_wh), 999) * transport_coeff
                # Save in holding at source
                source_holding_cost = holding_costs.get((sku, source_wh), 0) * holding_coeff
                # Cost to transfer one unit
                transfer_cost = transport_unit + source_holding_cost
                # Avoid transfer if transport > shortage savings (but only marginally; still beneficial to service level)
                # Greedy: transfer as much as possible
                max_transfer = int(min(surplus, deficit))
                # Apply max_qty rule
                if sku in max_qty:
                    max_transfer = min(max_transfer, int(max_qty[sku]))
                # Apply capacity constraint
                available_cap = max_caps.get(target_wh, 1e9) - cur_cap.get(target_wh, 0)
                max_transfer = min(max_transfer, int(available_cap))
                if max_transfer < min_transfer:
                    continue

                total_cost = transfer_cost * max_transfer
                advices.append({
                    "sku_code": sku,
                    "from_warehouse": source_wh,
                    "to_warehouse": target_wh,
                    "quantity": max_transfer,
                    "transport_cost": round(transport_unit * max_transfer, 2),
                    "total_cost_impact": round(total_cost, 2),
                })

                # Update state
                cur_inv[(sku, source_wh)] = cur_inv.get((sku, source_wh), 0) - max_transfer
                cur_inv[(sku, target_wh)] = cur_inv.get((sku, target_wh), 0) + max_transfer
                cur_cap[target_wh] = cur_cap.get(target_wh, 0) + max_transfer
                surpluses[:] = [(w, s - max_transfer if w == source_wh else s, inv) for (w, s, inv) in surpluses]
                deficit -= max_transfer
                if deficit <= 0:
                    break

    # Recompute final costs
    total_transport = sum(a["transport_cost"] for a in advices)
    total_holding = 0.0
    total_shortage = 0.0
    total_demand = 0.0
    total_met = 0.0
    for (sku, wh), demand in demands.items():
        inv = cur_inv.get((sku, wh), 0)
        h_cost = holding_costs.get((sku, wh), 0) * holding_coeff
        s_cost = shortage_costs.get((sku, wh), 0) * shortage_coeff
        shortage = max(0, demand - inv)
        ending = max(0, inv - demand)
        total_holding += ending * h_cost
        total_shortage += shortage * s_cost
        met = min(inv, demand)
        total_demand += demand
        total_met += met
        metrics.append({
            "sku_code": sku,
            "warehouse_code": wh,
            "current_inventory": inventories.get((sku, wh), 0),
            "demand": demand,
            "shortage": shortage,
            "ending_inventory": ending,
            "shortage_cost": round(shortage * s_cost, 2),
            "holding_cost": round(ending * h_cost, 2),
            "service_level": (met / demand) if demand > 0 else 1.0,
        })

    total_cost = total_transport + total_holding + total_shortage
    service_level = (total_met / total_demand) if total_demand > 0 else 1.0

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
        "model_info": None,
    }
