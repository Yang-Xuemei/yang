"""Business rules router."""
from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.auth import get_current_user, require_admin, write_audit_log
from app.database import get_connection
from app.schemas import BusinessRuleItem, BusinessRuleResponse

router = APIRouter(prefix="/api/rules", tags=["rules"])


def _to_rule_dict(row) -> dict:
    return {
        "id": row["id"],
        "rule_type": row["rule_type"],
        "rule_json": row["rule_json"],
        "enabled": bool(row["enabled"]),
        "created_by": row["created_by"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.get("", response_model=List[dict])
def list_rules(user: dict = Depends(get_current_user)):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM business_rules ORDER BY id").fetchall()
    return [_to_rule_dict(r) for r in rows]


@router.post("", response_model=dict)
def create_rule(payload: BusinessRuleItem, user: dict = Depends(require_admin)):
    # Validate JSON
    try:
        parsed = json.loads(payload.rule_json)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_json")
    # Validate type-specific
    if payload.rule_type == "TRANSPORT_BAN":
        if "source" not in parsed or "target" not in parsed:
            raise HTTPException(status_code=400, detail="transport_ban_requires_source_target")
    elif payload.rule_type == "MAX_TRANSPORT_QUANTITY":
        if "sku" not in parsed or "max_quantity" not in parsed:
            raise HTTPException(status_code=400, detail="max_transport_requires_sku_quantity")
    conn = get_connection()
    conn.execute(
        "INSERT INTO business_rules (rule_type, rule_json, enabled, created_by) VALUES (?, ?, ?, ?)",
        (payload.rule_type, payload.rule_json, int(payload.enabled), user["id"]),
    )
    conn.commit()
    write_audit_log(user["id"], "create", "business_rule")
    return {"status": "created"}


@router.put("/{rule_id}", response_model=dict)
def update_rule(rule_id: int, payload: BusinessRuleItem, user: dict = Depends(require_admin)):
    try:
        json.loads(payload.rule_json)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_json")
    conn = get_connection()
    conn.execute(
        "UPDATE business_rules SET rule_type=?, rule_json=?, enabled=?, updated_at=datetime('now') WHERE id=?",
        (payload.rule_type, payload.rule_json, int(payload.enabled), rule_id),
    )
    conn.commit()
    write_audit_log(user["id"], "update", "business_rule", target_id=str(rule_id))
    return {"status": "updated"}


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, user: dict = Depends(require_admin)):
    conn = get_connection()
    conn.execute("DELETE FROM business_rules WHERE id = ?", (rule_id,))
    conn.commit()
    write_audit_log(user["id"], "delete", "business_rule", target_id=str(rule_id))
    return {"status": "deleted"}


@router.post("/{rule_id}/toggle")
def toggle_rule(rule_id: int, user: dict = Depends(require_admin)):
    conn = get_connection()
    conn.execute(
        "UPDATE business_rules SET enabled = 1 - enabled, updated_at = datetime('now') WHERE id = ?",
        (rule_id,),
    )
    conn.commit()
    return {"status": "toggled"}


@router.post("/import")
async def import_rules(file: UploadFile = File(...), user: dict = Depends(require_admin)):
    """Import rules from JSON file."""
    contents = await file.read()
    try:
        data = json.loads(contents)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_json")
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="expected_array")
    conn = get_connection()
    for item in data:
        if not isinstance(item, dict):
            continue
        conn.execute(
            "INSERT INTO business_rules (rule_type, rule_json, enabled, created_by) VALUES (?, ?, ?, ?)",
            (item.get("rule_type", ""), json.dumps(item.get("rule_json", {}), ensure_ascii=False), int(item.get("enabled", 1)), user["id"]),
        )
    conn.commit()
    write_audit_log(user["id"], "import", "business_rule")
    return {"status": "imported", "count": len(data)}


@router.get("/export")
def export_rules(user: dict = Depends(get_current_user)):
    """Export rules as JSON."""
    from fastapi.responses import JSONResponse
    conn = get_connection()
    rows = conn.execute("SELECT * FROM business_rules ORDER BY id").fetchall()
    data = []
    for r in rows:
        try:
            rule_json = json.loads(r["rule_json"])
        except Exception:
            rule_json = r["rule_json"]
        data.append({
            "rule_type": r["rule_type"],
            "rule_json": rule_json,
            "enabled": bool(r["enabled"]),
        })
    return JSONResponse(content=data, headers={
        "Content-Disposition": "attachment; filename=business_rules.json",
    })
