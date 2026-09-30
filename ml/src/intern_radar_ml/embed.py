"""Embedding of listings and resumes with bge-small-en-v1.5.

All embeddings in the system come from this module so vectors stay
consistent. Vectors are L2-normalized, so cosine similarity is a dot
product on the Convex side. The model runs on ONNX Runtime via fastembed
(no torch): much lighter in CI and not blocked by Windows App Control
policies in local dev.
"""

from __future__ import annotations

import hashlib
from typing import Any

from .client import ConvexClient

MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBEDDING_DIM = 384
_ENCODE_BATCH = 64


def build_embed_text(item: dict[str, Any]) -> str:
    """JD text when we have it, else title + company + category."""
    jd = item.get("jdText")
    if jd:
        return str(jd)
    return f"{item.get('title', '')} at {item.get('company', '')} ({item.get('category', '')})"


def embedding_version(text: str) -> str:
    """Hash of the embedded text: JD arrival changes it, timestamp churn doesn't."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


class Embedder:
    """Lazy wrapper so tests never load the model."""

    def __init__(self, model_name: str = MODEL_NAME) -> None:
        self._model_name = model_name
        self._model = None

    def encode(self, texts: list[str]) -> list[list[float]]:
        if self._model is None:
            from fastembed import TextEmbedding

            self._model = TextEmbedding(self._model_name)
        vectors = self._model.embed(texts, batch_size=_ENCODE_BATCH)
        out = [[float(x) for x in vec] for vec in vectors]
        for vec in out:
            if len(vec) != EMBEDDING_DIM:
                raise ValueError(
                    f"expected {EMBEDDING_DIM}-dim vectors, got {len(vec)}"
                )
        return out


def run_embed(client: ConvexClient, embedder: Embedder | None = None) -> int:
    """Embeds all pending listings and resumes; returns records pushed."""
    embedder = embedder or Embedder()
    pushed = 0

    for page in client.export_pages("embed_pending"):
        texts = [build_embed_text(item) for item in page]
        vectors = embedder.encode(texts)
        items = [
            {
                "listingId": item["listingId"],
                "embedding": vec,
                "embeddingVersion": embedding_version(text),
            }
            for item, text, vec in zip(page, texts, vectors, strict=True)
        ]
        pushed += client.import_embeddings(items)
        print(f"embed: pushed {pushed} so far")

    for page in client.export_pages("resumes"):
        texts = [item["resumeText"] for item in page]
        vectors = embedder.encode(texts)
        resumes = [
            {"userId": item["userId"], "embedding": vec}
            for item, vec in zip(page, vectors, strict=True)
        ]
        pushed += client.import_embeddings([], resumes)
        print(f"embed: pushed {len(resumes)} resume embeddings")

    return pushed
