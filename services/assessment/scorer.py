# services/assessment/scorer.py
"""Scoring utilities for Assessment service.

Functions:
- score_mcq: نمره‌دهی تک‌گزینه‌ای بر اساس گزینه صحیح.
- score_cloze: تطبیق پاسخ کوتاه/متنی با کلید پاسخ.
- score_coding: سنجش پاسخ کدنویسی با جست‌وجوی الگوها/Regexهای کلیدی.
- score_attempt: تجمیع نمره پرسش‌ها و بازگردانی مدل Score.
"""

from packages.schemas.assessment import Attempt, Question, Score, Choice
from typing import List, Dict
import re

def score_mcq(q: Question, ans: str) -> float:
    """Return 1.0 if `ans` equals the id of the correct choice in `q`, else 0.0."""
    if not q.choices:
        return 0.0
    correct = next((c.id for c in q.choices if c.is_correct), None)
    return 1.0 if ans == correct else 0.0

def score_cloze(q: Question, ans: str) -> float:
    """Case-insensitive/trimmed equality check between `ans` and `q.answer_key` -> {0.0, 1.0}."""
    # Normalize simple numeric/text answers
    gold = (q.answer_key or "").strip().lower()
    cand = (ans or "").strip().lower()
    return 1.0 if gold == cand else 0.0

def score_coding(q: Question, ans: str) -> float:
    """Score coding/free-form answers by counting regex pattern hits from `q.answer_key`.

    `q.answer_key` may contain comma-separated regex patterns. Score = hits / patterns_count.
    """
    # Very conservative: check for presence of key functions/regex in answer (pseudo code or Python)
    patterns = [p.strip() for p in (q.answer_key or "").split(",") if p.strip()]
    if not patterns:
        return 0.0
    hit = sum(1 for p in patterns if re.search(p, ans or "", flags=re.I))
    return hit / len(patterns)

def score_attempt(quiz_id: str, user_id: str, questions: List[Question], answers: Dict[str, str]) -> Score:
    """Aggregate per-question scores and return a `Score` model (percentage in [0, 100])."""
    total = 0.0
    for q in questions:
        a = answers.get(q.id, "")
        if q.type == "mcq":
            total += score_mcq(q, a)
        elif q.type == "cloze":
            total += score_cloze(q, a)
        elif q.type == "coding":
            total += score_coding(q, a)
    score = (total / max(1, len(questions))) * 100.0
    return Score(quiz_id=quiz_id, user_id=user_id, score=round(score, 2), details={"total": total, "count": len(questions)})
