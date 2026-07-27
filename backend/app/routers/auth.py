"""Auth router: register, login, user info."""
from __future__ import annotations

import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_admin,
    verify_password,
)
from app.database import get_connection
from app.schemas import (
    AdminUserUpdate,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^1[3-9]\d{9}$")


def _to_user_dict(row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "phone": row["phone"],
        "name": row["name"],
        "role": row["role"],
        "created_at": row["created_at"],
    }


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest):
    if not payload.email and not payload.phone:
        raise HTTPException(status_code=400, detail="email_or_phone_required")
    if payload.email and not EMAIL_RE.match(payload.email):
        raise HTTPException(status_code=400, detail="invalid_email")
    if payload.phone and not PHONE_RE.match(payload.phone):
        raise HTTPException(status_code=400, detail="invalid_phone")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="password_too_short")

    conn = get_connection()
    if payload.email:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (payload.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="email_taken")
    if payload.phone:
        existing = conn.execute("SELECT id FROM users WHERE phone = ?", (payload.phone,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="phone_taken")

    pw_hash = hash_password(payload.password)
    cur = conn.execute(
        "INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)",
        (payload.email, payload.phone, pw_hash, payload.name or "", "user"),
    )
    conn.commit()
    user_id = cur.lastrowid

    token = create_access_token({"sub": str(user_id)})
    user_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return TokenResponse(access_token=token, user=_to_user_dict(user_row))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    conn = get_connection()
    account = payload.account.strip()
    if not account:
        raise HTTPException(status_code=400, detail="account_required")
    if EMAIL_RE.match(account):
        row = conn.execute("SELECT * FROM users WHERE email = ?", (account,)).fetchone()
    elif PHONE_RE.match(account):
        row = conn.execute("SELECT * FROM users WHERE phone = ?", (account,)).fetchone()
    else:
        raise HTTPException(status_code=400, detail="invalid_account")
    if row is None:
        raise HTTPException(status_code=401, detail="user_not_found")
    if not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid_password")

    token = create_access_token({"sub": str(row["id"])})
    return TokenResponse(access_token=token, user=_to_user_dict(row))


@router.get("/me", response_model=dict)
def me(user: dict = Depends(get_current_user)):
    return user


@router.get("/users", response_model=List[UserResponse])
def list_users(user: dict = Depends(require_admin)):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
    return [_to_user_dict(r) for r in rows]


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, payload: AdminUserUpdate, admin: dict = Depends(require_admin)):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    updates = {}
    if payload.role is not None:
        if payload.role not in ("admin", "user"):
            raise HTTPException(status_code=400, detail="invalid_role")
        updates["role"] = payload.role
    if payload.name is not None:
        updates["name"] = payload.name
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE users SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
            (*updates.values(), user_id),
        )
        conn.commit()
    new_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _to_user_dict(new_row)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="cannot_delete_self")
    conn = get_connection()
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    return {"status": "deleted"}
