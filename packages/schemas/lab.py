"""Schemas for launching and tracking interactive lab environments."""  # :contentReference[oaicite:0]{index=0}

from pydantic import BaseModel
from typing import Optional

class LabLaunch(BaseModel):
    """Request payload to start a lab container/session."""
    user_id: str
    image: str = "python:3.11"
    command: str = "bash"
    timeout_sec: int = 3600

class LabStatus(BaseModel):
    """Status response for a running/finished lab session."""
    lab_id: str
    status: str
    url: Optional[str] = None
