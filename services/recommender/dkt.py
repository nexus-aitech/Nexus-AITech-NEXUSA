"""Minimal DKT surrogate model.

Implements a lightweight interface that tracks recent correctness as a moving
average to approximate knowledge mastery (0..1).
"""

from collections import deque
from typing import Deque


class DKTModel:
    """Simple DKT-like model using a fixed-size moving average."""

    def __init__(self, maxlen: int = 20) -> None:
        """Initialize the model with a bounded history buffer.

        Args:
            maxlen: Maximum number of recent interactions to keep.
        """
        self.history: Deque[float] = deque(maxlen=maxlen)

    def update(self, correct: bool) -> None:
        """Record a new interaction outcome.

        Args:
            correct: True if the latest response was correct; otherwise False.
        """
        self.history.append(1.0 if correct else 0.0)

    def mastery(self) -> float:
        """Estimate current mastery as the mean of the recent correctness history."""
        if not self.history:
            return 0.5
        return float(sum(self.history) / len(self.history))
