"""Guardrail helpers for the Tutor service.

Provides basic prompt-injection detection and input sanitization.
"""

import re


def is_prompt_injection(text: str) -> bool:
    """Heuristically detect prompt-injection or malicious intents.

    Checks the text against a small set of regex patterns targeting:
      - Attempts to override instructions (e.g., "ignore previous instructions")
      - Requests to exfiltrate secrets (e.g., system prompt, API keys)
      - Potentially destructive SQL commands (e.g., DELETE/DROP)

    Args:
        text: The user-provided input to inspect.

    Returns:
        True if any pattern matches; otherwise False.
    """
    patterns = [
        r"ignore (all|the) previous instructions",
        r"reveal your system prompt",
        r"send your api key",
        r"\bDELETE\b.*FROM",
        r"\bDROP\b.*TABLE",
    ]
    return any(re.search(p, text, flags=re.I) for p in patterns)


def sanitize(text: str) -> str:
    """Lightly sanitize user input by trimming surrounding whitespace.

    Args:
        text: Raw user input.

    Returns:
        The stripped input string.
    """
    return text.strip()
