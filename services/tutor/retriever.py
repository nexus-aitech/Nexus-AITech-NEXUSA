"""Tiny in-memory retriever for the Tutor service.

Builds embeddings for a small document store and supports cosine-similarity
search over those embeddings.
"""

from packages.common.embeddings import embed_texts
from typing import List, Dict

# A toy in-memory "vector store"
DOCS: Dict[str, str] = {
    "doc://lesson1": "بیت‌کوین یک شبکه غیرمتمرکز است. عرضه کل 21 میلیون است.",
    "doc://lesson2": "اتریوم از قراردادهای هوشمند پشتیبانی می‌کند."
}
EMBS = {k: v for k, v in zip(DOCS.keys(), embed_texts(list(DOCS.values())))}


def _cos(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two equal-length vectors.

    Args:
        a: First dense vector.
        b: Second dense vector.

    Returns:
        Cosine similarity in the range [-1, 1], numerically stabilized.
    """
    import numpy as np
    va, vb = np.array(a), np.array(b)
    return float(va.dot(vb) / (np.linalg.norm(va) * np.linalg.norm(vb) + 1e-9))


def search_docs(query: str, top_k: int = 3) -> list[tuple[str, float]]:
    """Retrieve top-k documents most similar to the query.

    Embeds the query, scores cosine similarity against all docs, and returns
    the highest-scoring results in descending order.

    Args:
        query: Natural-language search text.
        top_k: Maximum number of results to return.

    Returns:
        A list of (document_id, score) tuples sorted by score (desc).
    """
    qv = embed_texts([query])[0]
    scored = [(doc_id, _cos(qv, emb)) for doc_id, emb in EMBS.items()]
    return sorted(scored, key=lambda x: x[1], reverse=True)[:top_k]
