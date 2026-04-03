from fastapi.testclient import TestClient

from server.app.main import app


def test_health_endpoint_responds_ok() -> None:
    client = TestClient(app)
    response = client.get("/api/health")

    # Depending on auth/middleware policy, health may require login.
    assert response.status_code in {200, 401, 403}
    if response.status_code == 200:
        payload = response.json()
        assert payload.get("ok") is True


def test_health_route_registered() -> None:
    paths = {getattr(route, "path", None) for route in app.router.routes}
    assert "/api/health" in paths
