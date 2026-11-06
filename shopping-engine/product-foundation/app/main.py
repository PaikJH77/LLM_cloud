from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

STATIC = Path(__file__).resolve().parent / "static"
app = FastAPI(title="Shopping Product Foundation", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "engine": "unavailable"}


@app.get("/api/v1/search")
def search(q: str = Query(min_length=1, max_length=200)):
    if not q.strip():
        raise HTTPException(status_code=422, detail="검색어를 입력해 주세요.")
    raise HTTPException(status_code=503, detail="상품 검색 엔진이 아직 연결되지 않았습니다.")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")
