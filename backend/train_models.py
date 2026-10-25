
from pathlib import Path
import json
import time

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    matthews_corrcoef,
    balanced_accuracy_score,
    roc_auc_score,
    average_precision_score,
    classification_report,
    confusion_matrix,
    ConfusionMatrixDisplay
)
from sklearn.model_selection import StratifiedKFold
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "raw" / "dataset.csv"
MODELS = ROOT / "models"
REPORTS = ROOT / "reports"

MODELS.mkdir(exist_ok=True)
REPORTS.mkdir(exist_ok=True)

SEED = 42
EXCLUDED = ["segment", "anomaly", "train"]


def load_dataset():
    df = pd.read_csv(DATA, low_memory=False)

    required = {"segment", "anomaly", "train", "channel"}

    if not required.issubset(df.columns):
        raise ValueError("Required ESA columns are missing.")

    columns = [c for c in df.columns if c not in EXCLUDED]
    numeric = [c for c in columns if c != "channel"]

    for col in numeric:
        df[col] = pd.to_numeric(
            df[col], errors="coerce"
        ).replace([np.inf, -np.inf], np.nan)

    df["channel"] = df["channel"].fillna("UNKNOWN").astype(str)
    df["anomaly"] = pd.to_numeric(df["anomaly"], errors="raise")
    df["train"] = pd.to_numeric(df["train"], errors="raise")

    if not df["anomaly"].isin([0, 1]).all():
        raise ValueError("Invalid anomaly labels.")

    if not df["train"].isin([0, 1]).all():
        raise ValueError("Invalid train/test indicators.")

    train = df.loc[df["train"] == 1].copy()
    test = df.loc[df["train"] == 0].copy()

    if train.empty or test.empty:
        raise ValueError("Empty train/test partition.")

    if train["anomaly"].nunique() != 2:
        raise ValueError("Training data needs both classes.")

    return (
        train[columns],
        test[columns],
        train["anomaly"].astype(int),
        test["anomaly"].astype(int),
        test["segment"].to_numpy(),
        columns,
        numeric
    )


def preprocessor(numeric, scaled):
    numeric_steps = [
        ("imputer", SimpleImputer(strategy="median"))
    ]

    if scaled:
        numeric_steps.append(
            ("scaler", StandardScaler())
        )

    return ColumnTransformer(
        [
            (
                "numeric",
                Pipeline(numeric_steps),
                numeric
            ),
            (
                "channel",
                OneHotEncoder(
                    handle_unknown="ignore",
                    sparse_output=False
                ),
                ["channel"]
            )
        ],
        sparse_threshold=0
    )


def build_models(numeric):
    cv = StratifiedKFold(
        n_splits=3,
        shuffle=True,
        random_state=SEED
    )

    algorithms = {
        "Logistic Regression": LogisticRegression(
            max_iter=3000,
            class_weight="balanced",
            random_state=SEED
        ),
        "Naive Bayes": GaussianNB(),
        "KNN": KNeighborsClassifier(
            n_neighbors=7,
            weights="distance"
        ),
        "SVM": CalibratedClassifierCV(
            estimator=SVC(
                kernel="rbf",
                class_weight="balanced",
                random_state=SEED
            ),
            method="sigmoid",
            cv=cv,
            ensemble=False
        ),
        "Decision Tree": DecisionTreeClassifier(
            max_depth=10,
            min_samples_leaf=3,
            class_weight="balanced",
            random_state=SEED
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=250,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=SEED,
            n_jobs=-1
        )
    }

    output = {}

    for name, algorithm in algorithms.items():
        scaled = name in [
            "Logistic Regression",
            "Naive Bayes",
            "KNN",
            "SVM"
        ]

        output[name] = Pipeline([
            ("preprocessor", preprocessor(numeric, scaled)),
            ("classifier", algorithm)
        ])

    return output


def main():
    print("\n" + "=" * 68)
    print("SPACEFD — CALIBRATED SVM AND CLASSICAL ML TRAINING")
    print("=" * 68)

    (
        X_train,
        X_test,
        y_train,
        y_test,
        test_segments,
        columns,
        numeric
    ) = load_dataset()

    print(f"Training segments: {len(X_train)}")
    print(f"Testing segments : {len(X_test)}")
    print(f"Input columns    : {len(columns)}")

    all_results = []
    saved_models = {}
    test_predictions = None

    for name, model in build_models(numeric).items():
        print(f"\n{'-' * 68}\nTRAINING: {name}\n{'-' * 68}")

        start = time.perf_counter()
        model.fit(X_train, y_train)
        train_seconds = time.perf_counter() - start

        start = time.perf_counter()
        predicted = model.predict(X_test)
        inference_ms = (time.perf_counter() - start) * 1000

        scores = model.predict_proba(X_test)[:, 1]

        metrics = {
            "Model": name,
            "Accuracy": accuracy_score(y_test, predicted),
            "Balanced Accuracy": balanced_accuracy_score(
                y_test, predicted
            ),
            "Precision": precision_score(
                y_test, predicted, zero_division=0
            ),
            "Recall": recall_score(
                y_test, predicted, zero_division=0
            ),
            "F1": f1_score(
                y_test, predicted, zero_division=0
            ),
            "MCC": matthews_corrcoef(y_test, predicted),
            "ROC AUC": roc_auc_score(y_test, scores),
            "PR AUC": average_precision_score(
                y_test, scores
            ),
            "Training (s)": train_seconds,
            "Inference (ms)": inference_ms
        }

        all_results.append(metrics)

        print(classification_report(
            y_test, predicted,
            target_names=["Normal", "Anomaly"],
            zero_division=0
        ))

        print("Confusion matrix:")
        print(confusion_matrix(y_test, predicted))
        print(f"F1: {metrics['F1']:.4f}")
        print(f"MCC: {metrics['MCC']:.4f}")

        if name in ["SVM", "Random Forest"]:
            filename = (
                "svm.joblib" if name == "SVM"
                else "random_forest.joblib"
            )

            joblib.dump(model, MODELS / filename)
            saved_models[name] = filename

        if name == "SVM":
            test_predictions = pd.DataFrame({
                "segment": test_segments,
                "actual": y_test.to_numpy(),
                "predicted": predicted,
                "anomaly_probability": scores
            })

            cm = confusion_matrix(
                y_test, predicted, labels=[0, 1]
            )

            fig, ax = plt.subplots(figsize=(6, 5))

            ConfusionMatrixDisplay(
                confusion_matrix=cm,
                display_labels=["Normal", "Anomaly"]
            ).plot(
                ax=ax,
                cmap="Blues",
                colorbar=False
            )

            ax.set_title("Calibrated SVM — ESA Test Set")
            fig.tight_layout()
            fig.savefig(
                REPORTS / "svm_confusion.png",
                dpi=180
            )
            plt.close(fig)

    results = pd.DataFrame(all_results).sort_values(
        "F1", ascending=False
    )

    results.to_csv(
        REPORTS / "model_comparison.csv",
        index=False
    )

    fig, ax = plt.subplots(figsize=(11, 6))
    ordered = results.sort_values("F1")

    bars = ax.barh(
        ordered["Model"],
        ordered["F1"],
        color="#3978bc"
    )

    ax.set_xlim(0, 1.05)
    ax.bar_label(bars, fmt="%.3f", padding=4)
    ax.set_xlabel("Anomaly F1 Score")
    ax.set_title("SpaceFD — Model Comparison")
    ax.grid(axis="x", alpha=0.2)
    ax.set_axisbelow(True)
    fig.tight_layout()

    fig.savefig(
        REPORTS / "model_f1_comparison.png",
        dpi=180
    )
    plt.close(fig)

    if test_predictions is not None:
        test_predictions.to_csv(
            REPORTS / "test_predictions.csv",
            index=False
        )

    metadata = {
        "project": "SpaceFD",
        "dataset": "ESA OPSSAT-AD",
        "task": "binary_segment_anomaly_detection",
        "primary_model": "SVM",
        "models": saved_models,
        "feature_columns": columns,
        "excluded_columns": EXCLUDED,
        "training_samples": len(X_train),
        "testing_samples": len(X_test),
        "svm_calibration": "sigmoid_3fold_training_only",
        "labels": {"0": "Normal", "1": "Anomaly"},
        "limitations": [
            "Not a physical root-cause diagnosis model",
            "Not validated for flight control",
            "Probabilities require calibration assessment",
            "Evaluation is segment-level"
        ]
    }

    with open(
        MODELS / "model_metadata.json",
        "w",
        encoding="utf-8"
    ) as file:
        json.dump(metadata, file, indent=2)

    print("\n" + "=" * 68)
    print("FINAL MODEL COMPARISON")
    print("=" * 68)

    print(
        results[
            ["Model", "Accuracy", "Precision",
             "Recall", "F1", "MCC"]
        ].round(4).to_string(index=False)
    )

    print("\nSaved models:")
    print("- models/svm.joblib")
    print("- models/random_forest.joblib")

    print("\nSaved reports:")
    print("- reports/model_comparison.csv")
    print("- reports/model_f1_comparison.png")
    print("- reports/svm_confusion.png")
    print("- reports/test_predictions.csv")

    print("\nSPACEFD TRAINING COMPLETED")


if __name__ == "__main__":
    main()
