"""Solver router: invoke algorithm engines."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user, write_audit_log
from app.database import get_connection
from app.engines import baseline as baseline_engine
from app.engines import heuristic as heuristic_engine
from app.engines import milp as milp_engine
from app.schemas import ScenarioParams, SolveRequest, SolveResult

router = APIRouter(prefix="/api/solver", tags=["solver"])


def _resolve_params(scenario_id: Optional[int], override: Optional[ScenarioParams]) -> dict:
    """Resolve the final parameter dict: scenario + overrides."""
    conn = get_connection()
    base = ScenarioParams().model_dump()
    if scenario_id is not None:
        row = conn.execute("SELECT params_json FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
        if row is not None:
            try:
                scenario_params = json.loads(row["params_json"])
                base.update(scenario_params)
            except Exception:
                pass
    if override is not None:
        base.update(override.model_dump())
    return base


@router.post("/solve", response_model=dict)
def solve(payload: SolveRequest, user: dict = Depends(get_current_user)):
    if payload.algorithm not in ("baseline", "heuristic", "milp"):
        raise HTTPException(status_code=400, detail="invalid_algorithm")

    conn = get_connection()
    # Resolve scenario name if any
    scenario_name = None
    if payload.scenario_id is not None:
        row = conn.execute("SELECT name FROM scenarios WHERE id = ?", (payload.scenario_id,)).fetchone()
        if row is not None:
            scenario_name = row["name"]

    params = _resolve_params(payload.scenario_id, payload.params)

    # Capture input snapshot
    input_snapshot = {
        "skus": [dict(r) for r in conn.execute("SELECT * FROM skus").fetchall()],
        "warehouses": [dict(r) for r in conn.execute("SELECT * FROM warehouses").fetchall()],
        "inventory": [dict(r) for r in conn.execute("SELECT * FROM inventory").fetchall()],
        "demand": [dict(r) for r in conn.execute("SELECT * FROM demand_forecast").fetchall()],
        "transport_cost": [dict(r) for r in conn.execute("SELECT * FROM transport_cost").fetchall()],
        "holding_cost": [dict(r) for r in conn.execute("SELECT * FROM holding_cost").fetchall()],
        "shortage_cost": [dict(r) for r in conn.execute("SELECT * FROM shortage_cost").fetchall()],
        "warehouse_capacity": [dict(r) for r in conn.execute("SELECT * FROM warehouse_capacity").fetchall()],
    }

    # Compute result
    if payload.algorithm == "baseline":
        result = baseline_engine.compute_baseline(conn, params)
        lp_path = mps_path = None
        model_info = None
        model_vars = model_cons = None
        solver_status = None
    elif payload.algorithm == "heuristic":
        result = heuristic_engine.compute_heuristic(conn, params)
        lp_path = mps_path = None
        model_info = None
        model_vars = model_cons = None
        solver_status = None
    else:  # milp
        # Create history entry first to get id for model file naming
        now = datetime.now().strftime("%Y%m%d_%H%M%S")
        solve_name = f"milp_{now}_0"
        cur = conn.execute(
            "INSERT INTO solve_history (solve_name, algorithm_type, scenario_id, scenario_name, params_snapshot_json, input_snapshot_json, result_json, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (solve_name, "milp", payload.scenario_id, scenario_name, json.dumps(params, ensure_ascii=False), json.dumps(input_snapshot, ensure_ascii=False), "{}", "running", user["id"]),
        )
        conn.commit()
        history_id = cur.lastrowid
        result = milp_engine.compute_milp(conn, params, history_id=history_id)
        lp_path = result.get("model_info", {}).get("lp_path")
        mps_path = result.get("model_info", {}).get("mps_path")
        model_info = result.get("model_info")
        model_vars = model_info.get("variables") if model_info else None
        model_cons = model_info.get("constraints") if model_info else None
        solver_status = result.pop("_solver_status", None)
        if result.pop("_infeasible", False):
            solver_status = solver_status or "INFEASIBLE"

    # Build history record
    if payload.algorithm != "milp":
        now = datetime.now().strftime("%Y%m%d_%H%M%S")
        solve_name = f"{payload.algorithm}_{now}_0"
        cur = conn.execute(
            "INSERT INTO solve_history (solve_name, algorithm_type, scenario_id, scenario_name, params_snapshot_json, input_snapshot_json, result_json, status, total_cost, service_level, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (solve_name, payload.algorithm, payload.scenario_id, scenario_name, json.dumps(params, ensure_ascii=False), json.dumps(input_snapshot, ensure_ascii=False), json.dumps(result, ensure_ascii=False), "completed", result["total_cost"], result["service_level"], user["id"]),
        )
        conn.commit()
        history_id = cur.lastrowid
    else:
        # Update the milp record we inserted above
        status = "completed" if solver_status in (None, "OPTIMAL", "FEASIBLE") else "failed"
        conn.execute(
            "UPDATE solve_history SET result_json=?, status=?, total_cost=?, service_level=?, model_file_lp=?, model_file_mps=?, model_variables=?, model_constraints=?, solver_status=? WHERE id=?",
            (json.dumps(result, ensure_ascii=False), status, result["total_cost"], result["service_level"], lp_path, mps_path, model_vars, model_cons, solver_status, history_id),
        )
        conn.commit()

    write_audit_log(user["id"], "solve", payload.algorithm, target_id=str(history_id))

    return {
        "history_id": history_id,
        "algorithm": payload.algorithm,
        "scenario_id": payload.scenario_id,
        "scenario_name": scenario_name,
        "result": result,
    }


@router.get("/model/{history_id}")
def get_model_description(history_id: int, user: dict = Depends(get_current_user)):
    """Get the math model description for MILP history."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM solve_history WHERE id = ?", (history_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="history_not_found")
    if row["algorithm_type"] != "milp":
        raise HTTPException(status_code=400, detail="only_milp_has_model")
    try:
        params = json.loads(row["params_snapshot_json"])
    except Exception:
        params = {}
    stats = {
        "variables": row["model_variables"],
        "constraints": row["model_constraints"],
        "solver": row["solver_status"],
    }
    return milp_engine.get_model_math_description(params, stats)


@router.get("/model/{history_id}/file/{file_type}")
def download_model_file(history_id: int, file_type: str, user: dict = Depends(get_current_user)):
    """Download LP or MPS model file."""
    from fastapi.responses import FileResponse
    conn = get_connection()
    row = conn.execute("SELECT * FROM solve_history WHERE id = ?", (history_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="history_not_found")
    if file_type not in ("lp", "mps"):
        raise HTTPException(status_code=400, detail="invalid_file_type")
    path = row[f"model_file_{file_type}"]
    if not path:
        raise HTTPException(status_code=404, detail="model_file_not_found")
    import os
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="file_not_on_disk")
    return FileResponse(path, filename=f"model_{history_id}.{file_type}", media_type="text/plain")
