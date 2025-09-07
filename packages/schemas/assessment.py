"""Assessment schemas for quizzes, questions, attempts, and scoring."""  # :contentReference[oaicite:0]{index=0}

from pydantic import BaseModel
from typing import List, Optional, Literal

QuestionType = Literal["mcq", "cloze", "coding"]


class Choice(BaseModel):
    """A selectable choice for a multiple-choice question."""
    id: str
    text: str
    is_correct: bool = False


class Question(BaseModel):
    """A quiz question with optional choices or an answer key."""
    id: str
    type: QuestionType
    text: str
    choices: Optional[List[Choice]] = None
    answer_key: Optional[str] = None


class Attempt(BaseModel):
    """A user's attempt mapping question ids to submitted answers."""
    user_id: str
    quiz_id: str
    answers: dict[str, str]  # qid -> answer or choice id


class Score(BaseModel):
    """Computed score for a user's quiz attempt, with details."""
    quiz_id: str
    user_id: str
    score: float
    details: dict
