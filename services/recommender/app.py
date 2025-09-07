"""FastAPI app for the NEXUSA Recommender service.

Provides an endpoint to suggest next lessons based on a simple DKT surrogate.
"""

from fastapi import FastAPI
from packages.schemas.recommender import Recommendation
from .bkt import predict as bkt_predict  # noqa: F401  # kept for structural compatibility
from .dkt import DKTModel

app = FastAPI(title="NEXUSA Recommender Service", version="1.0.0")
_models: dict[str, DKTModel] = {}


@app.post("/recommender/next", response_model=Recommendation)
def next_lessons(payload: dict) -> Recommendation:
    """Recommend next lesson IDs for a user based on recent performance.

    Args:
        payload: JSON body containing:
            - user_id (str): Identifier of the user.
            - last_correct (bool): Whether the user's last answer was correct.

    Returns:
        Recommendation: DTO with user_id, list of suggested lesson IDs, and a reason.
    """
    user_id = payload.get("user_id", "unknown")
    correct = bool(payload.get("last_correct", False))
    model = _models.setdefault(user_id, DKTModel())
    model.update(correct)
    mastery = model.mastery()  # 0..1
    # Simple policy: suggest easier lessons if mastery<0.6, else advanced ids
    lessons = [1, 2, 3] if mastery < 0.6 else [10, 11, 12]
    reason = f"mastery={mastery:.2f} via DKT surrogate"
    return Recommendation(user_id=user_id, lesson_ids=lessons, reason=reason)
