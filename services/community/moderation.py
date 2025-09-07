# services/community/moderation.py
"""Simple moderation helpers for the Community service.

- `score_toxicity`: محاسبهٔ نمرهٔ سمی بودن متن بر اساس لیست واژگان ممنوعه.
- `moderate`: برگرداندن رأی نهایی (ok / reasons) بر اساس آستانهٔ سمی بودن.
"""

from packages.schemas.community import ModerationVerdict

# Minimal banned-word lexicon (demo only)
BANNED = {"کثافت", "احمق", "خنگ", "idiot", "stupid"}

def score_toxicity(text: str) -> float:
    """Compute a toxicity score in [0, 1] as (banned_hits/len(tokens))*5, clamped to 1.0."""
    toks = (text or "").lower().split()
    hits = sum(1 for t in toks if t in BANNED)
    return min(1.0, hits / max(1, len(toks)) * 5)

def moderate(text: str) -> ModerationVerdict:
    """Return a ModerationVerdict: ok=True if toxicity < 0.3, else False with reasons."""
    score = score_toxicity(text or "")
    ok = score < 0.3
    reasons = []
    if not ok:
        reasons.append(f"toxicity={score:.2f} exceeds threshold")
    return ModerationVerdict(ok=ok, reasons=reasons)
