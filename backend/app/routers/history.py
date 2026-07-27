"""Solve history router."""
from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.auth import get_current_user, require_admin, write_audit_log
from app.database import get_connection

router = APIRouter(prefix="/api/history", tags=["history"])


def _to_history_dict(row) -> dict:
    try:
        params = json.loads(row["params_snapshot_json"])
    except Exception:
        params = {}
    try:
        inp = json.loads(row["input_snapshot_json"])
    except Exception:
        inp = {}
    try:
        result = json.loads(row["result_json"])
    except Exception:
        result = {}
    return {
        "id": row["id"],
        "solve_name": row["solve_name"],
        "algorithm_type": row["algorithm_type"],
        "scenario_id": row["scenario_id"],
        "scenario_name": row["scenario_name"],
        "params_snapshot": params,
        "input_snapshot": inp,
        "result": result,
        "status": row["status"],
        "total_cost": row["total_cost"],
        "service_level": row["service_level"],
        "model_file_lp": row["model_file_lp"],
        "model_file_mps": row["model_file_mps"],
        "model_variables": row["model_variables"],
        "model_constraints": row["model_constraints"],
        "solver_status": row["solver_status"],
        "is_starred": bool(row["is_starred"]),
        "created_by": row["created_by"],
        "created_at": row["created_at"],
    }


@router.get("", response_model=List[dict])
def list_history(user: dict = Depends(get_current_user)):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM solve_history ORDER BY is_starred DESC, created_at DESC"
    ).fetchall()
    return [_to_history_dict(r) for r in rows]


@router.get("/{history_id}", response_model=dict)
def get_history(history_id: int, user: dict = Depends(get_current_user)):
    conn = get_connection()
    row = conn.execute("SELECT * FROM solve_history WHERE id = ?", (history_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="history_not_found")
    return _to_history_dict(row)


@router.delete("/{history_id}")
def delete_history(history_id: int, user: dict = Depends(require_admin)):
    conn = get_connection()
    conn.execute("DELETE FROM solve_history WHERE id = ?", (history_id,))
    conn.commit()
    return {"status": "deleted"}


@router.post("/{history_id}/star")
def toggle_star(history_id: int, user: dict = Depends(get_current_user)):
    conn = get_connection()
    conn.execute("UPDATE solve_history SET is_starred = 1 - is_starred WHERE id = ?", (history_id,))
    conn.commit()
    return {"status": "toggled"}


@router.get("/{history_id}/pdf")
def download_pdf(history_id: int, user: dict = Depends(get_current_user)):
    """Generate and download PDF report for the solve history."""
    from app.services.pdf_export import generate_report_pdf
    conn = get_connection()
    row = conn.execute("SELECT * FROM solve_history WHERE id = ?", (history_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="history_not_found")
    data = _to_history_dict(row)
    pdf_bytes = generate_report_pdf(data)
    return StreamingResponse(
        pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=report_{history_id}.pdf"},
    )
