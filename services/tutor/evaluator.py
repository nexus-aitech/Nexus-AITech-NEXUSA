"""Lightweight evaluator utilities for the Tutor service.

Provides a tiny in-memory registry of numeric facts/metrics and an accessor.
"""

from typing import Optional, Union

# Fact-check placeholder: numeric facts against a small registry.
FACTS: dict[str, Union[int, float]] = {
    "btc_supply": 21_000_000,
}


def get_metric(name: str) -> Optional[Union[int, float]]:
    """Return a numeric metric by name if present.

    Args:
        name: The registry key to look up.

    Returns:
        The numeric value if found; otherwise None.
    """
    return FACTS.get(name)
