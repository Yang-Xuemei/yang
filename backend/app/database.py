"""SQLite adapter for the inventory transfer assistant."""
from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_DB_PATH = _BACKEND_DIR / "data" / "app.sqlite3"

_local = threading.local()


def _db_path() -> Path:
    env_path = os.environ.get("DATABASE_PATH", "")
    if env_path:
        candidate = Path(env_path)
        if not candidate.is_absolute():
            candidate = _BACKEND_DIR / candidate
        return candidate
    return _DEFAULT_DB_PATH


def open_database() -> None:
    """Initialize SQLite database: create parent dir, apply schema once."""
    db_path = _db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # Apply schema (idempotent) on first open
    schema_file = _BACKEND_DIR / "db" / "schema.sql"
    if schema_file.exists():
        conn = sqlite3.connect(str(db_path))
        try:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.executescript(schema_file.read_text(encoding="utf-8"))
            # Seed data if tables are empty
            seed_file = _BACKEND_DIR / "db" / "seed.sql"
            if seed_file.exists():
                # Check if warehouses table is empty
                cur = conn.execute("SELECT COUNT(*) FROM warehouses")
                count = cur.fetchone()[0]
                if count == 0:
                    conn.executescript(seed_file.read_text(encoding="utf-8"))
            conn.commit()
        finally:
            conn.close()


def close_database() -> None:
    conn = getattr(_local, "conn", None)
    if conn is not None:
        try:
            conn.close()
        finally:
            _local.conn = None


def get_connection() -> sqlite3.Connection:
    """Get a per-request SQLite connection (thread-local)."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        db_path = _db_path()
        conn = sqlite3.connect(str(db_path), timeout=10.0)
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.row_factory = sqlite3.Row
        _local.conn = conn
    return conn


def release_connection() -> None:
    conn = getattr(_local, "conn", None)
    if conn is not None:
        try:
            conn.close()
        finally:
            _local.conn = None


@contextmanager
def connection_scope() -> Iterator[sqlite3.Connection]:
    """Context manager that yields a connection and releases it on exit."""
    conn = get_connection()
    try:
        yield conn
    finally:
        release_connection()


def database_is_ready() -> bool:
    try:
        with connection_scope() as conn:
            cur = conn.execute("SELECT 1")
            return cur.fetchone() is not None
    except Exception:
        return False
