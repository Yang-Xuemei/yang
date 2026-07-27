"""FastAPI main application for Inventory Transfer Assistant."""
from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.database import close_database, database_is_ready, open_database

logging.basicConfig(
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("app.request")


@asynccontextmanager
async def lifespan(_: FastAPI):
    open_database()
    try:
        yield
    finally:
        close_database()


app = FastAPI(title="库存调拨助手", lifespan=lifespan)

# CORS - allow all origins for dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    candidate = request.headers.get("X-Request-ID", "")
    try:
        request_id = str(uuid.UUID(candidate))
    except (ValueError, AttributeError):
        request_id = str(uuid.uuid4())
    started = perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": request_id},
        )
        logger.error(
            "request_failed request_id=%s method=%s path=%s status=500 category=unhandled",
            request_id, request.method, request.url.path,
        )
    response.headers["X-Request-ID"] = request_id
    elapsed_ms = round((perf_counter() - started) * 1000)
    response.headers["X-Elapsed-Ms"] = str(elapsed_ms)
    logger.info(
        "request_complete request_id=%s method=%s path=%s status=%s elapsed_ms=%s",
        request_id, request.method, request.url.path, response.status_code, elapsed_ms,
    )
    return response


# Platform fixed probes
@app.get("/")
def root_probe() -> dict:
    return {"status": "ok"}


@app.get("/health/live")
def live() -> dict:
    return {"status": "live"}


@app.get("/health/ready")
def ready():
    if not database_is_ready():
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ready"}


# Register routers
from app.routers import auth, data, rules, scenarios, solver, history, compare, health_monitor

app.include_router(auth.router)
app.include_router(data.router)
app.include_router(rules.router)
app.include_router(scenarios.router)
app.include_router(solver.router)
app.include_router(history.router)
app.include_router(compare.router)
app.include_router(health_monitor.router)
