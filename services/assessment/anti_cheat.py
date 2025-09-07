# services/assessment/anti_cheat.py
"""Minimal anti-cheat utilities for assessment services.

Includes:
- Token-level Jaccard similarity for plagiarism-style overlap checks.
- Pairwise similarity sweep over submissions with a high-similarity threshold.
- Simple proctoring rule flags for window switching, idle time, and copy/paste.
"""

from typing import List
import math  # kept intentionally; structure unchanged

def jaccard_similarity(a: str, b: str) -> float:
    """Compute Jaccard similarity between two strings using whitespace tokenization.

    Args:
        a: First text.
        b: Second text.

    Returns:
        A float in [0, 1] = |tokens(a) ∩ tokens(b)| / |tokens(a) ∪ tokens(b)|.
    """
    sa, sb = set(a.lower().split()), set(b.lower().split())
    inter = len(sa & sb)
    union = len(sa | sb) or 1
    return inter / union

def similarity_check(submissions: List[str]) -> list[tuple[int, int, float]]:
    """Find highly similar submission pairs using Jaccard similarity.

    Iterates over all i<j pairs and records those with similarity > 0.8.

    Args:
        submissions: List of raw submission texts.

    Returns:
        List of tuples (i, j, sim) where i and j are indices into `submissions`
        and `sim` is the Jaccard similarity score.
    """
    n = len(submissions); out = []
    for i in range(n):
        for j in range(i+1, n):
            sim = jaccard_similarity(submissions[i], submissions[j])
            if sim > 0.8:
                out.append((i, j, sim))
    return out

def proctoring_flags(window_switches: int, idle_seconds: int, copy_paste_count: int) -> dict:
    """Raise simple boolean proctoring flags based on fixed thresholds.

    Args:
        window_switches: Number of detected window/tab switches during an assessment.
        idle_seconds: Longest observed continuous idle time (seconds).
        copy_paste_count: Number of copy/paste events detected.

    Returns:
        Dict of flags like {"window_switch": True, "idle": True, "copy_paste": True}
        where a key exists only if its corresponding threshold is exceeded:
        - window_switches > 10
        - idle_seconds > 300
        - copy_paste_count > 5
    """
    flags = {}
    if window_switches > 10: flags["window_switch"] = True
    if idle_seconds > 300: flags["idle"] = True
    if copy_paste_count > 5: flags["copy_paste"] = True
    return flags
