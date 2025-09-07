"""Schemas for the tutor chat system: messages, turns, and responses."""  # :contentReference[oaicite:0]{index=0}

from pydantic import BaseModel
from typing import List

class TutorMessage(BaseModel):
    """A single chat message in a tutoring session."""
    role: str  # user/assistant/system
    content: str
    citations: List[str] = []

class TutorTurn(BaseModel):
    """A turn consisting of a session id and the list of exchanged messages."""
    session_id: str
    messages: List[TutorMessage]

class TutorResponse(BaseModel):
    """Model for the assistant's response with provenance and confidence."""
    answer: str
    citations: list[str]
    confidence: float
    facts: list[str]
