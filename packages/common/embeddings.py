"""Text embedding utilities for the NEXUSA platform.

If `sentence_transformers` is available, uses the "all-MiniLM-L6-v2" model.
Otherwise falls back to a simple hash-seeded NumPy vector to keep code runnable.
"""  # :contentReference[oaicite:0]{index=0}

from typing import List

try:
    # Optional: if installed
    from sentence_transformers import SentenceTransformer
    _model = SentenceTransformer("all-MiniLM-L6-v2")
except Exception:
    _model = None
import numpy as np


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a list of texts into dense vectors.

    Uses a SentenceTransformer model when available; otherwise, generates
    a fixed-size numeric vector per text via a hash-based fallback.

    Args:
        texts: List of input strings.

    Returns:
        List of embedding vectors (each a list of floats).
    """  # :contentReference[oaicite:1]{index=1}
    if _model:
        return _model.encode(texts, convert_to_numpy=True).tolist()
    # Fallback deterministic hash embedding (not good, but keeps code runnable)
    def h(t: str) -> List[float]:
        """Hash-based fallback embedding for a single text string.

        Args:
            t: Input text.

        Returns:
            A 384-dimensional list of floats representing the pseudo-embedding.
        """  # :contentReference[oaicite:2]{index=2}
        np.random.seed(abs(hash(t)) % (2**32))
        return np.random.normal(size=(384,)).tolist()
    return [h(t) for t in texts]
