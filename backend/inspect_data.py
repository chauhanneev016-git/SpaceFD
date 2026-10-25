
from pathlib import Path
import json

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
REPORTS = ROOT / "reports"

REPORTS.mkdir(exist_ok=True)


def inspect_csv(filename):
    path = RAW / filename

    if not path.exists():
        print(f"\nERROR: Missing file: {path}")
        return None

    print("\n" + "=" * 65)
    print(f"SPACEFD DATA INSPECTION: {filename}")
    print("=" * 65)

    df = pd.read_csv(path, low_memory=False)

    print("\nDATASET SHAPE")
    print(f"Rows: {len(df):,}")
    print(f"Columns: {len(df.columns)}")

    print("\nCOLUMN NAMES")
    for index, column in enumerate(df.columns, 1):
        print(f"{index:3}. {column}")

    print("\nFIRST FIVE ROWS")
    print(df.head().to_string())

    print("\nDATA TYPES")
    print(df.dtypes.value_counts())

    print("\nMISSING VALUES")
    missing = df.isna().sum()
    missing = missing[missing > 0].sort_values(
        ascending=False
    )

    if missing.empty:
        print("No missing values.")
    else:
        print(missing.head(20).to_string())

    print("\nLABEL INFORMATION")

    label_candidates = [
        c for c in df.columns
        if "label" in c.lower()
        or "anomaly" in c.lower()
        or c.lower() in ["target", "class"]
    ]

    for column in label_candidates:
        print(f"\n{column}:")
        print(df[column].value_counts(
            dropna=False
        ).to_string())

    print("\nDATA SPLIT INFORMATION")

    split_candidates = [
        c for c in df.columns
        if "train" in c.lower()
        or "split" in c.lower()
        or "test" in c.lower()
    ]

    for column in split_candidates:
        print(f"\n{column}:")
        print(df[column].value_counts(
            dropna=False
        ).to_string())

    numeric = df.select_dtypes(
        include=[np.number]
    )

    print("\nNUMERIC FEATURES:", len(numeric.columns))

    if not numeric.empty:
        print("\nNUMERICAL SUMMARY")
        print(
            numeric.describe()
            .transpose()
            .head(15)
            .to_string()
        )

    report = {
        "filename": filename,
        "rows": len(df),
        "columns": df.columns.tolist(),
        "column_count": len(df.columns),
        "numeric_column_count": len(numeric.columns),
        "missing_total": int(df.isna().sum().sum()),
        "label_candidates": label_candidates,
        "split_candidates": split_candidates
    }

    if label_candidates:
        report["label_distribution"] = {
            column: {
                str(k): int(v)
                for k, v in df[column]
                .value_counts(dropna=False)
                .items()
            }
            for column in label_candidates
        }

    output_path = REPORTS / (
        filename.replace(".csv", "_inspection.json")
    )

    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(report, file, indent=2)

    print(f"\nSaved report: {output_path}")

    return df


def main():
    print("=" * 65)
    print("SPACEFD 2.0 — ESA SPACECRAFT DATA EXPLORATION")
    print("=" * 65)

    dataset = inspect_csv("dataset.csv")
    segments = inspect_csv("segments.csv")

    if dataset is not None and segments is not None:
        print("\n" + "=" * 65)
        print("DATASET INSPECTION COMPLETED SUCCESSFULLY")
        print("=" * 65)

        print("\nBoth ESA files loaded successfully.")
        print("Next: Determine the correct ML features and labels.")

    else:
        print("\nDataset inspection incomplete.")
        print("Download the missing files and run again.")


if __name__ == "__main__":
    main()
