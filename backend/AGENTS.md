# FastAPI Service

## Commands

From the workspace root:

```bash
bash backend_start.sh
python -m compileall project/backend
pytest project/backend/tests
curl --fail http://127.0.0.1:8000/
curl --fail http://127.0.0.1:8000/health/live
curl --fail http://127.0.0.1:8000/health/ready
```

Before reporting a CRUD task complete, run the resource's create, list, and invalid-input requests in **one** `bash` call. Require the expected 2xx, 2xx, and 4xx status codes; do not replace this with a health check or a claim that the route code is sufficient.

## Contract

- Load the `database` skill before adding database code. It selects and materializes the driver module, dependencies, safe configuration, `db/apply_schema.sh`, `db/schema.sql`, readiness check, and test setup. Do not add an ORM or migration runner for small CRUD.
- Add tables idempotently to `db/schema.sql`; `backend_start.sh` delegates schema application to the database adapter's `db/apply_schema.sh`.
- Use request-scoped database connections. Keep simple CRUD as `route -> db`; introduce service layers only for shared business rules or transactions.
- Never read, write, fill, print, return, or log `.env` contents, credentials, tokens, connection strings, or database filesystem paths. Adapter-specific configuration belongs to the database skill.
- The framework dotenv parser accepts only `PORT`, `LOG_LEVEL`, `DATABASE_DIALECT`, and `DATABASE_PATH`. `DATABASE_PATH` is only for the selected SQLite adapter and must be relative; PostgreSQL `DATABASE_URL` is injected into the process and must never be put in `.env`.
- **Do not change, remove, or add authentication to the platform fixed probes:** `GET /` must return HTTP 200 with `{"status":"ok"}`; `GET /health/live` stays process-only; `GET /health/ready` stays database-backed. Add product routes under a different path.
- Do not use Docker, Kubernetes manifests, `uvicorn --reload`, or broad port/process killing.
- Keep database choices out of framework routes and lifecycle code; use the adapter contract from the database skill.
