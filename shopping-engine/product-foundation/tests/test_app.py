from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_discloses_engine_unavailable():
    assert client.get("/api/v1/health").json() == {"status": "ok", "engine": "unavailable"}

def test_search_does_not_fabricate_results():
    response = client.get("/api/v1/search", params={"q": "청소기"})
    assert response.status_code == 503
    assert "연결되지" in response.json()["detail"]

def test_empty_and_oversized_queries_are_rejected():
    for query in ("", "   ", "x" * 201):
        assert client.get("/api/v1/search", params={"q": query}).status_code == 422

def test_frontend_is_served():
    response = client.get("/")
    assert response.status_code == 200
    assert "엔진 연결 대기" in response.text
    assert client.get("/static/main.js").status_code == 200
