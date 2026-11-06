import os
from pathlib import Path

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

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


class ShoppingQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


@app.post("/api/v1/assistant")
def shopping_assistant(payload: ShoppingQuestion):
    if not payload.question.strip():
        raise HTTPException(status_code=422, detail="질문을 입력해 주세요.")
    if os.getenv("SHOPPING_AI_ENABLED") != "1":
        raise HTTPException(status_code=503, detail="AI 도우미가 비활성화되어 있습니다.")
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="서버에 OpenAI API 키가 설정되지 않았습니다.")
    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    try:
        client = OpenAI(timeout=20.0, max_retries=0)
        result = client.responses.create(
            model=model,
            instructions=("당신은 한국어 쇼핑 비교 도우미입니다. 검색 도구나 실시간 상품 데이터가 "
                          "없으므로 현재 가격, 재고, 판매자 평점이나 검증된 상품 결과를 지어내지 마세요. "
                          "일반적인 구매 기준을 설명하고 확인이 필요한 항목을 구분하세요."),
            input=payload.question.strip(),
            max_output_tokens=400,
            store=False,
        )
    except OpenAIError:
        raise HTTPException(status_code=502, detail="AI 서비스에 연결하지 못했습니다. 설정과 사용 한도를 확인해 주세요.") from None
    if not result.output_text:
        raise HTTPException(status_code=502, detail="AI 서비스에서 답변을 받지 못했습니다.")
    return {"answer": result.output_text, "live_shopping_data": False}
