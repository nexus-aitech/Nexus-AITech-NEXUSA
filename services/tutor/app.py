"""FastAPI app for the NEXUSA Tutor service.

Provides a chat endpoint that sanitizes input, guards against prompt injection,
retrieves relevant documents, and returns an instructional answer with citations.
"""

from fastapi import FastAPI, HTTPException
from packages.schemas.tutor import TutorResponse
from .guardrails import is_prompt_injection, sanitize
from .retriever import search_docs, DOCS
from .evaluator import get_metric
import json  # kept for structural compatibility

app = FastAPI(title="NEXUSA Tutor Service", version="1.0.0")


@app.post("/tutor/chat", response_model=TutorResponse)
def chat(payload: dict) -> TutorResponse:
    """Answer a tutoring query with retrieved context and lightweight safeguards.

    Args:
        payload: JSON body containing the "query" string.

    Returns:
        TutorResponse: Answer text, source citations, confidence, and optional facts.

    Raises:
        HTTPException: 400 for empty queries or detected prompt injection.
    """
    q = sanitize(payload.get("query", ""))
    if not q:
        raise HTTPException(400, "empty query")
    if is_prompt_injection(q):
        raise HTTPException(400, "prompt injection detected")

    hits = search_docs(q, top_k=3)
    citations = [doc_id for doc_id, _ in hits]
    context = "\n".join(DOCS[c] for c in citations)

    # Naive answer: echo relevant context
    answer = f"پاسخ آموزشی (خلاصه): {context}"
    facts = []
    if "عرضه" in q or "supply" in q.lower():
        supply = get_metric("btc_supply")
        if supply:
            facts.append(f"BTC total supply = {supply:,}")

    # Confidence based on top similarity
    confidence = float(hits[0][1]) if hits else 0.3

    return TutorResponse(
        answer=answer,
        citations=citations,
        confidence=round(confidence, 3),
        facts=facts,
    )
