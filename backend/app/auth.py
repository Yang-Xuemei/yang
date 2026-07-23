"""JWT authentication helpers."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request, status
from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY = os.environ.get("JWT_SECRET", "change-me-in-production-098f6bcd4621d373cade4e832627b4f6")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Extract user from Authorization header Bearer token."""
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_token")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_authorization")
    token = parts[1]
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_payload")
    try:
        user_id_int = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_payload")
    # Load user from DB
    from app.database import get_connection
    conn = get_connection()
    cur = conn.execute("SELECT id, email, phone, name, role FROM users WHERE id = ?", (user_id_int,))
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user_not_found")
    return {
        "id": row["id"],
        "email": row["email"],
        "phone": row["phone"],
        "name": row["name"],
        "role": row["role"],
    }


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_required")
    return user


def write_audit_log(user_id: Optional[int], action: str, target_type: str, target_id: Optional[str] = None, detail: Optional[str] = None):
    """Record audit log for data mutations."""
    from app.database import get_connection
    conn = get_connection()
    conn.execute(
        "INSERT INTO audit_log (user_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)",
        (user_id, action, target_type, target_id, detail)
    )
    conn.commit()
