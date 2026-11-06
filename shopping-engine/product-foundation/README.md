# Shopping product foundation

Status: local development preview; no engine, live shopping data, authentication, deployment, or APK. This is not v0.9 or v0.9.1.

## Run (Python 3.12)

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000. From this directory run `.venv\Scripts\python -m pytest -q`. API docs: `/docs`. Search returns 503 until a verified engine is integrated. The service binds to localhost in this example; it is not production-ready.

## Optional OpenAI shopping assistant (local preview)

The assistant gives general buying criteria, not live prices or search. It sends the question to OpenAI and may incur API charges. The existing key must be supplied to the server process as `OPENAI_API_KEY` by your secret manager or environment; never place it in the browser or git. Set `SHOPPING_AI_ENABLED=1` to enable it; optionally set `OPENAI_MODEL` (default `gpt-4.1-mini`) to a model available to your account. Restart the server after configuration. No key or live call was verified in this change.

**Local preview only:** there is no authentication, per-user quota, rate limiting or abuse protection. Do not expose this endpoint publicly; add these controls before any hosted deployment. Do not submit sensitive information.
