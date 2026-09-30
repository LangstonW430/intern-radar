"""Training: global logistic regression on all labels + feedback, then
per-user weights pulled toward the global vector by an L2 penalty that
weakens as the user accumulates labels. Weights are clamped to the bounds
in shared/features.json so feedback can tune but never invert a stated
preference.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from .features import FeatureSpec


@dataclass
class TrainingRow:
    user_id: str
    y: int
    split: str  # train | eval
    source: str
    exploration: bool
    x: np.ndarray
    weight: float = 1.0


def rows_from_export(export: dict[str, Any], spec: FeatureSpec) -> list[TrainingRow]:
    spec.assert_matches(export["featureNames"])
    rows: list[TrainingRow] = []
    skipped = 0
    for raw in export["rows"]:
        features = raw.get("features")
        if not features:
            skipped += 1
            continue
        x = np.array([float(features.get(name, 0.0)) for name in spec.names])
        rows.append(
            TrainingRow(
                user_id=raw["userId"],
                y=int(raw["y"]),
                split=raw["split"],
                source=raw["source"],
                exploration=bool(raw.get("exploration", False)),
                x=x,
                weight=float(
                    raw.get("weight", spec.feedback_weights["default"])
                ),
            )
        )
    if skipped:
        print(f"train: skipped {skipped} rows without feature snapshots")
    return rows


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def _fit_logistic(
    X: np.ndarray,
    y: np.ndarray,
    *,
    prior_mean: np.ndarray,
    l2: float,
    sample_weight: np.ndarray | None = None,
    lr: float = 0.1,
    steps: int = 2000,
) -> np.ndarray:
    """Gradient descent on BCE + l2·‖w − prior_mean‖². No intercept — bias is
    a feature. Small d and n make plain GD plenty."""
    w = prior_mean.copy()
    sw = np.ones(len(y)) if sample_weight is None else sample_weight
    n = max(sw.sum(), 1.0)
    for _ in range(steps):
        p = _sigmoid(X @ w)
        grad = X.T @ (sw * (p - y)) / n + 2.0 * l2 * (w - prior_mean)
        w -= lr * grad
    return w


def class_balanced_weights(y: np.ndarray) -> np.ndarray:
    pos = max(int(y.sum()), 1)
    neg = max(len(y) - pos, 1)
    total = len(y)
    return np.where(y == 1, total / (2.0 * pos), total / (2.0 * neg))


def train_models(
    rows: list[TrainingRow],
    spec: FeatureSpec,
    prior_weights_by_user: dict[str, list[float]],
) -> tuple[list[float], dict[str, list[float]]]:
    """Returns (global_weights, user_weights)."""
    train_rows = [r for r in rows if r.split == "train"]
    if len(train_rows) < 10 or len({r.y for r in train_rows}) < 2:
        raise ValueError(
            f"not enough training data: {len(train_rows)} rows, "
            f"classes {sorted({r.y for r in train_rows})}"
        )

    X = np.stack([r.x for r in train_rows])
    y = np.array([r.y for r in train_rows], dtype=float)
    # Class balance × per-row weight (applied feedback counts double) —
    # applied to the global fit and, via sw[mask], to every per-user fit.
    sw = class_balanced_weights(y) * np.array([r.weight for r in train_rows])

    # Global model: regularized toward the average prior vector so it stays
    # sane with few labels.
    priors = list(prior_weights_by_user.values())
    prior_mean = (
        np.mean(np.array(priors), axis=0) if priors else np.zeros(spec.dim)
    )
    w_global = _fit_logistic(X, y, prior_mean=prior_mean, l2=0.05, sample_weight=sw)
    w_global = np.array(spec.clamp(list(w_global)))

    user_weights: dict[str, list[float]] = {}
    for user_id in {r.user_id for r in train_rows}:
        mask = np.array([r.user_id == user_id for r in train_rows])
        n_user = int(mask.sum())
        # few labels → strong pull to global; many → personalized
        l2 = 10.0 / (n_user + 10.0)
        w_user = _fit_logistic(
            X[mask],
            y[mask],
            prior_mean=w_global,
            l2=l2,
            sample_weight=sw[mask],
        )
        user_weights[user_id] = spec.clamp(list(w_user))

    return list(w_global), user_weights


def precision_at_k(
    rows: list[TrainingRow],
    weights_by_user: dict[str, list[float]],
    fallback: list[float],
    k: int = 10,
) -> float:
    """Of the top-k eval rows ranked by model score, the fraction labeled
    good/applied. Eval rows only — never trained on."""
    eval_rows = [r for r in rows if r.split == "eval"]
    if not eval_rows:
        return 0.0
    scored = []
    for r in eval_rows:
        w = np.array(weights_by_user.get(r.user_id, fallback))
        scored.append((float(_sigmoid(r.x @ w)), r.y))
    scored.sort(key=lambda t: t[0], reverse=True)
    top = scored[:k]
    return sum(y for _, y in top) / len(top)


def run_training(client: Any) -> dict[str, Any]:
    spec = FeatureSpec()
    export = client.export_training()
    rows = rows_from_export(export, spec)
    priors = {u["userId"]: u["priorWeights"] for u in export["users"]}

    w_global, user_weights = train_models(rows, spec, priors)

    p10_model = precision_at_k(rows, user_weights, w_global)
    p10_prior = precision_at_k(rows, priors, priors_fallback(priors, spec))
    n_train = sum(1 for r in rows if r.split == "train")
    n_eval = sum(1 for r in rows if r.split == "eval")
    metrics = {
        "precisionAt10": p10_model,
        "priorBaselinePrecisionAt10": p10_prior,
        "nTrain": n_train,
        "nEval": n_eval,
    }
    print(f"train: p@10 model={p10_model:.3f} prior-baseline={p10_prior:.3f} "
          f"(train n={n_train}, eval n={n_eval})")

    result = client.import_model(
        feature_names=spec.names,
        global_weights=w_global,
        user_weights=[
            {"userId": uid, "weights": w} for uid, w in user_weights.items()
        ],
        metrics=metrics,
    )
    print(f"train: pushed model: {result}")
    return {"metrics": metrics, "result": result}


def priors_fallback(priors: dict[str, list[float]], spec: FeatureSpec) -> list[float]:
    if priors:
        return list(next(iter(priors.values())))
    return [0.0] * spec.dim
