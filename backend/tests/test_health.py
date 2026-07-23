from fastapi.testclient import TestClient

from app.main import app


def test_root_probe_is_available_without_a_database() -> None:
    response = TestClient(app).get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_live_health_does_not_require_a_database() -> None:
    response = TestClient(app).get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "live"}
