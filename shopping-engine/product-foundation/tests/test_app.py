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


def test_ai_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("SHOPPING_AI_ENABLED", raising=False)
    assert client.post("/api/v1/assistant", json={"question": "청소기 선택 기준"}).status_code == 503


def test_ai_requires_key_and_valid_question(monkeypatch):
    monkeypatch.setenv("SHOPPING_AI_ENABLED", "1")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert client.post("/api/v1/assistant", json={"question": "기준"}).status_code == 503
    assert client.post("/api/v1/assistant", json={"question": "  "}).status_code == 422


def test_ai_uses_server_key_without_live_call(monkeypatch):
    from types import SimpleNamespace
    import app.main as module
    captured = {}
    class FakeResponses:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_text="흡입력과 배터리를 비교하세요.")
    monkeypatch.setenv("SHOPPING_AI_ENABLED", "1")
    monkeypatch.setenv("OPENAI_API_KEY", "test-placeholder")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    monkeypatch.setattr(module, "OpenAI", lambda **kwargs: SimpleNamespace(responses=FakeResponses()))
    result = client.post("/api/v1/assistant", json={"question": "청소기 기준"})
    assert result.status_code == 200
    assert result.json()["live_shopping_data"] is False
    assert captured["model"] == "test-model" and captured["store"] is False
