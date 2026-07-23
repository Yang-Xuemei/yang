"""Parameter scenarios router."""
from __future__ import annotations

import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user, require_admin, write_audit_log
from app.database import get_connection
from app.schemas import ScenarioItem, ScenarioParams, ScenarioResponse

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


def _to_scenario_dict(row) -> dict:
    try:
        params = json.loads(row["params_json"])
    except Exception:
        params = {}
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "is_default": bool(row["is_default"]),
        "params": params,
        "created_by": row["created_by"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.get("", response_model=List[dict])
def list_scenarios(user: dict = Depends(get_current_user)):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM scenarios ORDER BY is_default DESC, id").fetchall()
    return [_to_scenario_dict(r) for r in rows]


@router.get("/{scenario_id}", response_model=dict)
def get_scenario(scenario_id: int, user: dict = Depends(get_current_user)):
    conn = get_connection()
    row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="scenario_not_found")
    return _to_scenario_dict(row)


@router.post("", response_model=dict)
def create_scenario(payload: ScenarioItem, user: dict = Depends(require_admin)):
    conn = get_connection()
    existing = conn.execute("SELECT id FROM scenarios WHERE name = ?", (payload.name,)).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="name_taken")
    params_dict = payload.params.model_dump() if payload.params else ScenarioParams().model_dump()
    conn.execute(
        "INSERT INTO scenarios (name, description, is_default, params_json, created_by) VALUES (?, ?, ?, ?, ?)",
        (payload.name, payload.description, int(payload.is_default), json.dumps(params_dict, ensure_ascii=False), user["id"]),
    )
    conn.commit()
    if payload.is_default:
        conn.execute("UPDATE scenarios SET is_default = 0 WHERE name != ? AND id != last_insert_rowid()", (payload.name,))
        conn.commit()
    write_audit_log(user["id"], "create", "scenario")
    return {"status": "created"}


@router.put("/{scenario_id}", response_model=dict)
def update_scenario(scenario_id: int, payload: ScenarioItem, user: dict = Depends(require_admin)):
    conn = get_connection()
    row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="scenario_not_found")
    params_dict = payload.params.model_dump() if payload.params else {}
    conn.execute(
        "UPDATE scenarios SET name=?, description=?, is_default=?, params_json=?, updated_at=datetime('now') WHERE id=?",
        (payload.name, payload.description, int(payload.is_default), json.dumps(params_dict, ensure_ascii=False), scenario_id),
    )
    if payload.is_default:
        conn.execute("UPDATE scenarios SET is_default = 0 WHERE id != ?", (scenario_id,))
    conn.commit()
    write_audit_log(user["id"], "update", "scenario", target_id=str(scenario_id))
    return {"status": "updated"}


@router.delete("/{scenario_id}")
def delete_scenario(scenario_id: int, user: dict = Depends(require_admin)):
    conn = get_connection()
    row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="scenario_not_found")
    conn.execute("DELETE FROM scenarios WHERE id = ?", (scenario_id,))
    conn.commit()
    write_audit_log(user["id"], "delete", "scenario", target_id=str(scenario_id))
    return {"status": "deleted"}


@router.post("/{scenario_id}/copy", response_model=dict)
def copy_scenario(scenario_id: int, user: dict = Depends(require_admin)):
    conn = get_connection()
    row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="scenario_not_found")
    new_name = f"{row['name']} (副本)"
    i = 1
    while conn.execute("SELECT id FROM scenarios WHERE name = ?", (new_name,)).fetchone():
        i += 1
        new_name = f"{row['name']} (副本{i})"
    conn.execute(
        "INSERT INTO scenarios (name, description, is_default, params_json, created_by) VALUES (?, ?, 0, ?, ?)",
        (new_name, row["description"], row["params_json"], user["id"]),
    )
    conn.commit()
    write_audit_log(user["id"], "copy", "scenario", target_id=str(scenario_id))
    return {"status": "copied", "new_name": new_name}


@router.post("/{scenario_id}/set_default")
def set_default(scenario_id: int, user: dict = Depends(require_admin)):
    conn = get_connection()
    conn.execute("UPDATE scenarios SET is_default = 0")
    conn.execute("UPDATE scenarios SET is_default = 1, updated_at = datetime('now') WHERE id = ?", (scenario_id,))
    conn.commit()
    return {"status": "set"}
