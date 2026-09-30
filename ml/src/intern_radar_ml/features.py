"""Loads shared/features.json — the same file TS inference uses — and
refuses to run when the Convex export disagrees with it. One file, no drift.
"""

from __future__ import annotations

import json
from pathlib import Path

_FEATURES_PATH = Path(__file__).parents[3] / "shared" / "features.json"


class FeatureSpec:
    def __init__(self, path: Path = _FEATURES_PATH) -> None:
        raw = json.loads(path.read_text(encoding="utf-8"))
        self.version: int = raw["version"]
        self.embedding_dim: int = raw["embeddingDim"]
        self.names: list[str] = [f["name"] for f in raw["features"]]
        self.bounds: list[tuple[float, float]] = [
            (f["bounds"][0], f["bounds"][1]) for f in raw["features"]
        ]

    @property
    def dim(self) -> int:
        return len(self.names)

    def assert_matches(self, feature_names: list[str]) -> None:
        if feature_names != self.names:
            raise ValueError(
                "feature definition drift: shared/features.json has "
                f"{self.names} but the export sent {feature_names}"
            )

    def clamp(self, weights: list[float]) -> list[float]:
        return [
            min(max(w, lo), hi)
            for w, (lo, hi) in zip(weights, self.bounds, strict=True)
        ]
