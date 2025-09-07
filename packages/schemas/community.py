"""Community schemas for posts and moderation outcomes."""  # :contentReference[oaicite:0]{index=0}

from pydantic import BaseModel
from typing import Optional, List

class Post(BaseModel):
    """A community post within a lesson thread, with optional parent for replies."""
    id: str
    lesson_id: int
    user_id: str
    body: str
    toxicity: float = 0.0
    parent_id: Optional[str] = None

class ModerationVerdict(BaseModel):
    """Result of automated/manual moderation for a given post."""
    ok: bool
    reasons: List[str] = []
