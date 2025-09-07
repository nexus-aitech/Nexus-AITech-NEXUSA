"""Schemas for content recommendations to users."""  # :contentReference[oaicite:0]{index=0}

from pydantic import BaseModel
from typing import List

class Recommendation(BaseModel):
    """A recommendation payload listing suggested lessons for a user."""
    user_id: str
    lesson_ids: List[int]
    reason: str
