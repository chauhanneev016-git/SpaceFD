
from __future__ import annotations

import json
import math
import random
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .fault_lab import router as fault_lab_router


ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
MODELS = ROOT / "models"
REPORTS = ROOT / "reports"

app = FastAPI(
    title="SpaceFD API",
    version="0.3.0",
    description="Spacecraft Telemetry and Fault Injection Research"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(fault_lab_router)


@lru_cache(maxsize=1)
def get_dataset():
    path = RAW / "dataset.csv"

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="ESA dataset.csv not found"
        )

    df = pd.read_csv(path, low_memory=False)
    df["segment"] = pd.to_numeric(
        df["segment"], errors="raise"
    ).astype(int)

    df["anomaly"] = pd.to_numeric(
        df["anomaly"], errors="raise"
    ).astype(int)

    df["train"] = pd.to_numeric(
        df["train"], errors="raise"
    ).astype(int)

    return df


@lru_cache(maxsize=1)
def get_segments():
    path = RAW / "segments.csv"

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="ESA segments.csv not found"
        )

    df = pd.read_csv(path, low_memory=False)

    df["segment"] = pd.to_numeric(
        df["segment"], errors="raise"
    ).astype(int)

    df["value"] = pd.to_numeric(
        df["value"], errors="coerce"
    )

    return df


@lru_cache(maxsize=1)
def get_metadata():
    path = MODELS / "model_metadata.json"

    if not path.exists():
        raise HTTPException(
            status_code=503,
            detail="Train the ESA models first"
        )

    metadata = json.loads(
        path.read_text(encoding="utf-8")
    )

    if metadata.get("primary_model") != "SVM":
        raise HTTPException(
            status_code=503,
            detail="Updated SVM metadata required"
        )

    return metadata


@lru_cache(maxsize=2)
def load_model(name):
    filenames = {
        "svm": "svm.joblib",
        "random_forest": "random_forest.joblib"
    }

    if name not in filenames:
        raise HTTPException(
            status_code=400,
            detail="Unknown model"
        )

    path = MODELS / filenames[name]

    if not path.exists():
        raise HTTPException(
            status_code=503,
            detail="Model not trained"
        )

    # Only use local models created by this project.
    return joblib.load(path)


def get_segment_row(segment_id):
    rows = get_dataset()
    rows = rows[rows["segment"] == segment_id]

    if rows.empty:
        raise HTTPException(
            status_code=404,
            detail="Segment not found"
        )

    return rows.iloc[0]


@app.get("/")
def home():
    return {
        "project": "SpaceFD",
        "version": "0.3.0",
        "message": "SpaceFD API operational"
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "SpaceFD API",
        "version": "0.3.0"
    }


@app.get("/api/dataset/status")
def dataset_status():
    files = {
        name: (RAW / name).is_file()
        for name in ["dataset.csv", "segments.csv"]
    }

    return {
        "source": "ESA OPSSAT-AD",
        "ready": all(files.values()),
        "files": files,
        "note": "File existence check only"
    }


@app.get("/api/telemetry")
def simulated_telemetry():
    rng = random.Random(42)
    readings = []

    for t in range(120):
        baseline = (
            52 + 7 * math.sin(t / 11)
            + 2 * math.sin(t / 3.5)
        )

        event = 15 * math.exp(
            -((t - 82) / 8) ** 2
        )

        value = (
            baseline + event
            + rng.uniform(-1.6, 1.6)
        )

        readings.append({
            "time": t,
            "value": round(value, 3)
        })

    return {
        "mode": "SIMULATED DEMO",
        "channel": "DEMO_SIGNAL_A",
        "units": "arbitrary units",
        "readings": readings
    }


@app.get("/api/ml/status")
def ml_status():
    ready = all(
        (MODELS / name).is_file()
        for name in [
            "svm.joblib",
            "random_forest.joblib",
            "model_metadata.json"
        ]
    )

    return {
        "ready": ready,
        "primary_model": "SVM",
        "models": ["svm", "random_forest"]
    }


@app.get("/api/ml/channels")
def available_channels():
    df = get_dataset()

    counts = (
        df.groupby("channel")
        .agg(
            segments=("segment", "count"),
            anomalies=("anomaly", "sum")
        )
        .reset_index()
        .sort_values("channel")
    )

    return {
        "channels": [
            {
                "channel": str(row.channel),
                "segments": int(row.segments),
                "anomalies": int(row.anomalies)
            }
            for row in counts.itertuples()
        ]
    }


@app.get("/api/ml/segments")
def available_segments(
    channel: str | None = None,
    split: str = Query(
        default="test",
        pattern="^(test|train|all)$"
    ),
    limit: int = Query(default=100, ge=1, le=500)
):
    df = get_dataset()

    if channel:
        df = df[df["channel"] == channel]

    if split == "test":
        df = df[df["train"] == 0]
    elif split == "train":
        df = df[df["train"] == 1]

    df = df.sort_values("segment").head(limit)

    return {
        "segments": [
            {
                "segment": int(row.segment),
                "channel": str(row.channel),
                "actual": int(row.anomaly),
                "split": (
                    "Train" if int(row.train) == 1
                    else "Test"
                )
            }
            for row in df.itertuples()
        ]
    }


@app.get("/api/ml/telemetry/{segment_id}")
def real_telemetry(segment_id: int):
    info = get_segment_row(segment_id)

    rows = get_segments()
    rows = rows[rows["segment"] == segment_id]
    rows = rows.sort_values("timestamp")

    if rows.empty:
        raise HTTPException(
            status_code=404,
            detail="Raw telemetry unavailable"
        )

    readings = [
        {
            "time": i,
            "timestamp": str(row.timestamp),
            "value": (
                float(row.value)
                if pd.notna(row.value) else None
            )
        }
        for i, row in enumerate(rows.itertuples())
    ]

    return {
        "mode": "REAL ESA TELEMETRY",
        "segment": segment_id,
        "channel": str(info["channel"]),
        "actual": int(info["anomaly"]),
        "split": (
            "Train" if int(info["train"]) == 1
            else "Test"
        ),
        "units": "dataset-native units",
        "readings": readings
    }


@app.get("/api/ml/predict/{segment_id}")
def predict_segment(
    segment_id: int,
    model: str = Query(
        default="svm",
        pattern="^(svm|random_forest)$"
    )
):
    row = get_segment_row(segment_id)

    metadata = get_metadata()
    estimator = load_model(model)

    columns = metadata["feature_columns"]
    values = {}

    for column in columns:
        if column == "channel":
            values[column] = str(row[column])
        else:
            number = pd.to_numeric(
                row[column], errors="coerce"
            )

            values[column] = (
                float(number)
                if np.isfinite(number)
                else np.nan
            )

    features = pd.DataFrame(
        [values], columns=columns
    )

    prediction = int(
        estimator.predict(features)[0]
    )

    probability = float(
        estimator.predict_proba(features)[0, 1]
    )

    actual = int(row["anomaly"])

    return {
        "segment": segment_id,
        "channel": str(row["channel"]),
        "model": model,
        "split": (
            "Train" if int(row["train"]) == 1
            else "Test"
        ),
        "prediction": prediction,
        "prediction_label": (
            "ANOMALY" if prediction else "NORMAL"
        ),
        "anomaly_probability": probability,
        "actual": actual,
        "actual_label": (
            "ANOMALY" if actual else "NORMAL"
        ),
        "correct": prediction == actual,
        "warning": (
            "Research-only prediction; not a "
            "physical fault diagnosis."
        )
    }


@app.get("/api/ml/metrics")
def ml_metrics():
    path = REPORTS / "model_comparison.csv"

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Model comparison results unavailable"
        )

    df = pd.read_csv(path)

    return {
        "source": "ESA OPSSAT-AD",
        "split": "Official ESA test set",
        "results": json.loads(
            df.to_json(orient="records")
        )
    }
