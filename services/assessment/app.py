# services/assessment/app.py
"""FastAPI app for NEXUSA Assessment Service:
- /assessment/score: محاسبه نمره‌ی آزمون
- /assessment/anti-cheat/similarity: بررسی شباهت ارسال‌ها
- /assessment/anti-cheat/proctor: پرچم‌های پروکتورینگ ساده
"""

from fastapi import FastAPI, HTTPException
from packages.schemas.assessment import Attempt, Question, Score, Choice
from .scorer import score_attempt
from .anti_cheat import similarity_check, proctoring_flags
from typing import List, Dict, Any

app = FastAPI(title="NEXUSA Assessment Service", version="1.0.0")

# In-memory quiz bank for demo
QUIZES: dict[str, List[Question]] = {
    "crypto-basics": [
        Question(id="q1", type="mcq", text="BTC total supply?", choices=[
            Choice(id="a", text="21 million", is_correct=True),
            Choice(id="b", text="Unlimited"), Choice(id="c", text="210 million")
        ]),
        Question(id="q2", type="cloze", text="First BTC block name", answer_key="genesis"),
        Question(id="q3", type="coding", text="Python regex for BTC address", answer_key="(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}")
    ]
}

@app.post("/assessment/score", response_model=Score)
def score(a: Attempt) -> Score:
    """Compute and return the `Score` for a given `Attempt`."""
    questions = QUIZES.get(a.quiz_id)
    if not questions:
        raise HTTPException(404, "quiz not found")
    return score_attempt(a.quiz_id, a.user_id, questions, a.answers)

@app.post("/assessment/anti-cheat/similarity")
def anti_cheat(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Return highly similar submission pairs using Jaccard similarity."""
    return {"pairs": similarity_check(payload.get("submissions", []))}

@app.post("/assessment/anti-cheat/proctor")
def proctor(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Return boolean proctoring flags given window switches, idle time, and copy/paste count."""
    return {
        "flags": proctoring_flags(
            payload.get("window_switches", 0),
            payload.get("idle_seconds", 0),
            payload.get("copy_paste_count", 0),
        )
    }
