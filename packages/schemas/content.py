"""Content schemas: course modules and lessons for the platform."""  # :contentReference[oaicite:0]{index=0}

from pydantic import BaseModel, Field
from typing import List, Optional

class Module(BaseModel):
    """A course module grouping related lessons."""
    id: int
    title: str
    description: Optional[str] = None
    version: str = "v1"
    lang: str = "fa"

class Lesson(BaseModel):
    """A single lesson belonging to a module with markdown content."""
    id: int
    module_id: int
    title: str
    body_md: str
    skills: List[str] = []
    version: str = "v1"
    lang: str = "fa"

class CreateLesson(BaseModel):
    """Payload for creating a new lesson."""
    module_id: int
    title: str
    body_md: str
    skills: List[str] = []
    version: str = "v1"
    lang: str = "fa"
