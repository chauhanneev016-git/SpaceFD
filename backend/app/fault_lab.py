
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
MODELS = ROOT / "models"
REPORTS = ROOT / "reports"

MODEL_FILE = MODELS / "fault_lab_rf.joblib"
METADATA_FILE = MODELS / "fault_lab_metadata.json"

router = APIRouter(prefix="/api/lab", tags=["Fault Injection Lab"])

FEATURES = [
    "count",
    "mean",
    "median",
    "std",
    "min",
    "max",
    "range",
    "slope",
    "diff_mean",
    "diff_std",
    "abs_diff_mean",
    "unchanged_ratio",
    "first_last_delta",
    "missing_ratio",
]


@lru_cache(maxsize=1)
def load_raw():
    path = RAW / "segments.csv"

    if not path.exists():
        raise FileNotFoundError(f"Missing {path}")

    df = pd.read_csv(path, low_memory=False)

    required = {
        "segment", "channel", "timestamp",
        "value", "anomaly", "train"
    }

    if not required.issubset(df.columns):
        raise ValueError("Missing required ESA telemetry columns")

    df["value"] = pd.to_numeric(
        df["value"], errors="coerce"
    )

    df["segment"] = pd.to_numeric(
        df["segment"], errors="raise"
    ).astype(int)

    df = df.sort_values(
        ["segment", "timestamp"]
    ).reset_index(drop=True)

    return df


def signal_features(values):
    x = np.asarray(values, dtype=float)
    total = len(x)
    valid = x[np.isfinite(x)]

    if total == 0 or len(valid) == 0:
        raise ValueError("Signal has no valid measurements")

    differences = np.diff(valid)
    minimum = float(np.min(valid))
    maximum = float(np.max(valid))
    spread = maximum - minimum

    slope = 0.0

    if len(valid) > 1:
        # Use original sample positions when some
        # measurements are missing.
        positions = np.flatnonzero(np.isfinite(x))
        normalized = (
            positions - positions.mean()
        ) / max(total - 1, 1)

        denominator = np.sum(normalized ** 2)

        if denominator > 0:
            slope = float(
                np.sum(
                    normalized * (valid - valid.mean())
                ) / denominator
            )

    # Scale-aware threshold to avoid treating tiny
    # floating-point differences as exact changes.
    tolerance = max(spread * 1e-8, 1e-12)

    unchanged = (
        float(np.mean(np.abs(differences) <= tolerance))
        if differences.size else 1.0
    )

    features = {
        "count": float(total),
        "mean": float(np.mean(valid)),
        "median": float(np.median(valid)),
        "std": float(np.std(valid)),
        "min": minimum,
        "max": maximum,
        "range": spread,
        "slope": slope,
        "diff_mean": (
            float(np.mean(differences))
            if differences.size else 0.0
        ),
        "diff_std": (
            float(np.std(differences))
            if differences.size else 0.0
        ),
        "abs_diff_mean": (
            float(np.mean(np.abs(differences)))
            if differences.size else 0.0
        ),
        "unchanged_ratio": unchanged,
        "first_last_delta": float(valid[-1] - valid[0]),
        "missing_ratio": float(1 - len(valid) / total),
    }

    return {name: features[name] for name in FEATURES}


def inject_fault(values, fault, intensity, seed=42):
    original = np.asarray(values, dtype=float)
    modified = original.copy()

    if len(original) < 5:
        raise ValueError("At least five readings are required")

    if not np.isfinite(original).all():
        raise ValueError(
            "Fault injection requires a complete original signal"
        )

    if not 0 <= intensity <= 100:
        raise ValueError("Intensity must be between 0 and 100")

    rng = np.random.default_rng(seed)
    n = len(modified)
    start = max(1, int(n * 0.35))
    amount = intensity / 100.0

    spread = float(np.ptp(original))
    scale = max(
        spread,
        float(np.std(original)) * 3,
        1e-8
    )

    tail_length = n - start

    if fault == "bias":
        modified[start:] += amount * scale

    elif fault == "drift":
        modified[start:] += np.linspace(
            0, amount * scale * 2, tail_length
        )

    elif fault == "spike":
        position = start + tail_length // 2
        modified[position] += amount * scale * 4

    elif fault == "noise":
        modified[start:] += rng.normal(
            0, amount * scale * 0.4, tail_length
        )

    elif fault == "stuck":
        # Increasing intensity lengthens the frozen period.
        freeze_length = max(
            1, int(tail_length * amount)
        )
        modified[-freeze_length:] = (
            modified[-freeze_length - 1]
            if freeze_length < n else modified[0]
        )

    elif fault == "dropout":
        missing_count = int(round(tail_length * amount))

        if missing_count:
            positions = rng.choice(
                np.arange(start, n),
                size=missing_count,
                replace=False
            )
            modified[positions] = np.nan

    else:
        raise ValueError(f"Unsupported fault: {fault}")

    return modified, start


def train_model():
    print("=" * 62)
    print("SPACEFD — RAW TELEMETRY FAULT LAB TRAINING")
    print("=" * 62)

    df = load_raw()
    records = []

    for segment_id, group in df.groupby("segment", sort=True):
        group = group.sort_values("timestamp")

        features = signal_features(
            group["value"].to_numpy()
        )

        row = {
            "segment": int(segment_id),
            "anomaly": int(group["anomaly"].iloc[0]),
            "train": int(group["train"].iloc[0]),
            **features
        }

        if group["anomaly"].nunique() != 1:
            raise ValueError(
                f"Conflicting labels for segment {segment_id}"
            )

        if group["train"].nunique() != 1:
            raise ValueError(
                f"Conflicting split for segment {segment_id}"
            )

        records.append(row)

    features_df = pd.DataFrame(records)

    training = features_df[
        features_df["train"] == 1
    ].copy()

    testing = features_df[
        features_df["train"] == 0
    ].copy()

    X_train = training[FEATURES]
    y_train = training["anomaly"]

    X_test = testing[FEATURES]
    y_test = testing["anomaly"]

    model = RandomForestClassifier(
        n_estimators=250,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    metrics = {
        "accuracy": float(
            accuracy_score(y_test, predictions)
        ),
        "precision": float(
            precision_score(
                y_test, predictions, zero_division=0
            )
        ),
        "recall": float(
            recall_score(
                y_test, predictions, zero_division=0
            )
        ),
        "f1": float(
            f1_score(y_test, predictions, zero_division=0)
        ),
        "confusion_matrix": confusion_matrix(
            y_test, predictions, labels=[0, 1]
        ).tolist(),
    }

    MODELS.mkdir(exist_ok=True)
    REPORTS.mkdir(exist_ok=True)

    joblib.dump(model, MODEL_FILE)

    metadata = {
        "name": "SpaceFD Raw Signal Random Forest",
        "features": FEATURES,
        "training_segments": len(training),
        "testing_segments": len(testing),
        "metrics": metrics,
        "purpose": "Experimental raw-signal anomaly response",
        "limitations": [
            "Not a fault-type classifier",
            "Not a physical root-cause diagnosis model",
            "Injected faults have no real mission ground-truth labels",
            "Probability changes are exploratory, not calibrated risk",
            "No fault-injected samples were used in training"
        ]
    }

    METADATA_FILE.write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8"
    )

    features_df.to_csv(
        REPORTS / "raw_signal_features.csv",
        index=False
    )

    print("\nTraining segments:", len(training))
    print("Testing segments :", len(testing))
    print("Features         :", len(FEATURES))

    print("\nHELD-OUT TEST METRICS")

    for key in ["accuracy", "precision", "recall", "f1"]:
        print(f"{key.upper():12}: {metrics[key]:.4f}")

    print("\nConfusion Matrix:")
    print(np.array(metrics["confusion_matrix"]))

    print("\nSaved:", MODEL_FILE)
    print("Saved:", METADATA_FILE)
    print("\nTRAINING COMPLETE")


@lru_cache(maxsize=1)
def get_model():
    if not MODEL_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail="Train the Fault Lab model first."
        )

    return joblib.load(MODEL_FILE)


def get_signal(segment_id):
    raw = load_raw()
    group = raw[raw["segment"] == segment_id]

    if group.empty:
        raise HTTPException(
            status_code=404,
            detail="ESA segment not found"
        )

    group = group.sort_values("timestamp")

    return group


@router.get("/status")
def lab_status():
    metadata = None

    if METADATA_FILE.exists():
        metadata = json.loads(
            METADATA_FILE.read_text(encoding="utf-8")
        )

    return {
        "ready": MODEL_FILE.exists() and metadata is not None,
        "faults": [
            "bias", "drift", "spike",
            "noise", "stuck", "dropout"
        ],
        "metadata": metadata
    }


@router.get("/run/{segment_id}")
def run_experiment(
    segment_id: int,
    fault: str = Query(
        default="drift",
        pattern="^(bias|drift|spike|noise|stuck|dropout)$"
    ),
    intensity: int = Query(default=50, ge=0, le=100)
):
    group = get_signal(segment_id)

    values = group["value"].to_numpy(dtype=float)

    if len(values) > 3000:
        raise HTTPException(
            status_code=400,
            detail="Segment exceeds demo length limit"
        )

    try:
        modified, start = inject_fault(
            values, fault, intensity
        )

        before_features = signal_features(values)
        after_features = signal_features(modified)

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc)
        ) from exc

    model = get_model()

    before_frame = pd.DataFrame(
        [before_features], columns=FEATURES
    )

    after_frame = pd.DataFrame(
        [after_features], columns=FEATURES
    )

    before_score = float(
        model.predict_proba(before_frame)[0, 1]
    )

    after_score = float(
        model.predict_proba(after_frame)[0, 1]
    )

    before_label = int(
        model.predict(before_frame)[0]
    )

    after_label = int(
        model.predict(after_frame)[0]
    )

    original = [
        {
            "index": i,
            "value": float(v)
        }
        for i, v in enumerate(values)
    ]

    injected = [
        {
            "index": i,
            "value": (
                float(v) if np.isfinite(v) else None
            )
        }
        for i, v in enumerate(modified)
    ]

    return {
        "segment": segment_id,
        "channel": str(group["channel"].iloc[0]),
        "split": (
            "Train" if int(group["train"].iloc[0]) == 1
            else "Test"
        ),
        "actual": int(group["anomaly"].iloc[0]),
        "fault": fault,
        "intensity": intensity,
        "fault_start_index": start,
        "original": original,
        "injected": injected,
        "before": {
            "prediction": before_label,
            "anomaly_score": before_score,
            "features": before_features
        },
        "after": {
            "prediction": after_label,
            "anomaly_score": after_score,
            "features": after_features
        },
        "score_delta": after_score - before_score,
        "limitations": (
            "Experimental injected signal. The model detects "
            "anomalies, not fault type or spacecraft damage. "
            "Scores are not calibrated failure probabilities."
        )
    }


if __name__ == "__main__":
    import sys

    if "--train" in sys.argv:
        train_model()
    else:
        print(
            "Run: python -m backend.app.fault_lab --train"
        )
