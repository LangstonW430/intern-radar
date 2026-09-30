import numpy as np
import pytest

from intern_radar_ml.features import FeatureSpec
from intern_radar_ml.train import (
    TrainingRow,
    precision_at_k,
    rows_from_export,
    train_models,
)

SPEC = FeatureSpec()
DIM = SPEC.dim
SIM_IDX = SPEC.names.index("embed_sim_resume")


def make_row(user: str, y: int, sim: float, split: str = "train") -> TrainingRow:
    x = np.full(DIM, 0.5)
    x[0] = 1.0  # bias
    x[SIM_IDX] = sim
    return TrainingRow(
        user_id=user, y=y, split=split, source="label", exploration=False, x=x
    )


def synthetic_rows(user: str = "u1", n: int = 40) -> list[TrainingRow]:
    rows = []
    rng = np.random.default_rng(7)
    for _ in range(n):
        sim = float(rng.uniform(0.6, 0.95))
        rows.append(make_row(user, 1, sim))
    for _ in range(n):
        sim = float(rng.uniform(0.1, 0.45))
        rows.append(make_row(user, 0, sim))
    return rows


def test_feature_spec_loads_shared_file():
    assert SPEC.names[0] == "bias"
    assert "embed_sim_resume" in SPEC.names
    assert SPEC.dim == len(SPEC.bounds)


def test_feature_spec_detects_drift():
    with pytest.raises(ValueError, match="drift"):
        SPEC.assert_matches(["bias", "something_else"])


def test_global_model_learns_the_separating_feature():
    rows = synthetic_rows()
    priors = {"u1": [0.0] * DIM}
    w_global, user_weights = train_models(rows, SPEC, priors)
    assert w_global[SIM_IDX] > 0.5  # similarity drives the label
    lo, hi = SPEC.bounds[SIM_IDX]
    assert lo <= w_global[SIM_IDX] <= hi
    assert "u1" in user_weights


def test_user_with_few_rows_stays_near_global():
    rows = synthetic_rows("u1", 40) + [make_row("u2", 1, 0.9)]
    priors = {"u1": [0.0] * DIM, "u2": [0.0] * DIM}
    w_global, user_weights = train_models(rows, SPEC, priors)
    diff = np.abs(np.array(user_weights["u2"]) - np.array(w_global)).max()
    assert diff < 0.5  # one label can't drag the user far from global


def test_train_refuses_degenerate_data():
    with pytest.raises(ValueError, match="not enough"):
        train_models([make_row("u1", 1, 0.9)] * 12, SPEC, {})


def test_precision_at_k():
    # 6 eval rows; model score follows sim, top-5 contains 4 positives
    rows = [
        make_row("u1", 1, 0.9, "eval"),
        make_row("u1", 1, 0.8, "eval"),
        make_row("u1", 0, 0.7, "eval"),
        make_row("u1", 1, 0.6, "eval"),
        make_row("u1", 1, 0.5, "eval"),
        make_row("u1", 0, 0.1, "eval"),
    ]
    weights = [0.0] * DIM
    weights[SIM_IDX] = 5.0
    p = precision_at_k(rows, {"u1": weights}, weights, k=5)
    assert p == pytest.approx(4 / 5)


def test_rows_from_export_skips_missing_snapshots_and_checks_names():
    export = {
        "featureNames": SPEC.names,
        "rows": [
            {
                "userId": "u1",
                "y": 1,
                "split": "train",
                "source": "label",
                "exploration": False,
                "features": {name: 0.5 for name in SPEC.names},
            },
            {
                "userId": "u1",
                "y": 0,
                "split": "train",
                "source": "label",
                "exploration": False,
                "features": None,
            },
        ],
    }
    rows = rows_from_export(export, SPEC)
    assert len(rows) == 1

    export["featureNames"] = ["nope"]
    with pytest.raises(ValueError):
        rows_from_export(export, SPEC)
