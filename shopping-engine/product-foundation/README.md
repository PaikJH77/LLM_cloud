# Shopping product foundation

Status: local development preview; no engine, live shopping data, authentication, deployment, or APK. This is not v0.9 or v0.9.1.

## Run (Python 3.12)

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000. From this directory run `.venv\Scripts\python -m pytest -q`. API docs: `/docs`. Search returns 503 until a verified engine is integrated. The service binds to localhost in this example; it is not production-ready.
