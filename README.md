# SpaceFD 2.0

**Spacecraft Telemetry Anomaly Detection, Fault Simulation & Digital-Twin Monitoring**

SpaceFD is a research-oriented web prototype combining **supervised machine-learning anomaly detection on ESA OPS-SAT telemetry** with a separate **synthetic spacecraft operations simulator**, diagnostic decision support, controlled sensor-fault experiments, and an interactive 3D spacecraft twin.

> **Scope:** This is an educational/research prototype, not flight-qualified software. ESA telemetry and the synthetic 45-sensor simulator are **different data sources**. ML classifies recorded telemetry segments as *normal/anomalous*; synthetic fault injection and downstream impact advisories are **not** ML-based physical-failure predictions.

## Features

- **ESA Research:** Inspect recorded telemetry segments, review model predictions and compare classification metrics.
- **Supervised ML:** Compare SVM, Random Forest, Logistic Regression, KNN, Decision Tree and Naive Bayes.
- **Synthetic mission replay:** Explore 720 ten-second steps across six scenarios and eight subsystem groups.
- **Spacecraft monitoring:** Review 45 simulated sensor readings, reference ranges, alerts and diagnostics.
- **Sensor Fault Workbench:** Apply simulated bias, drift, transient spikes, stuck readings and missing-signal/dropout conditions.
- **3D Vehicle Twin:** Inspect component locations and distinguish source faults from potentially affected subsystems.
- **Diagnostic Intelligence:** Compare simulated scenarios against nominal operation using engineering calculations and predefined subsystem relationships.

## System architecture

```text
                              SPACEFD WEB UI
                      React + TypeScript + Vite
                                  |
                  +---------------+---------------+
                  |                               |
        ESA Research workspace           Mission-control workspace
                  |                               |
           FastAPI :8000                     FastAPI :8001
                  |                               |
        Trained ML model inference       Synthetic telemetry simulator
                  |                       + scenario diagnostics
         OPSSAT-AD segment data            + sensor fault injection
                  |                               |
       Binary anomaly classification      3D vehicle twin + advisories
```

**Key distinction:** The ESA ML backend handles classification of recorded telemetry. The simulator API generates synthetic spacecraft conditions; diagnostics and downstream impact explanations rely on mathematical models and engineering rules, not a trained failure-propagation predictor.

## Dataset and evaluation

The ML pipeline uses a prepared dataset derived from **OPSSAT-AD**, based on ESA's OPS-SAT telemetry.

| Property | SpaceFD prepared dataset |
|---|---:|
| Labeled segments | 2,123 |
| Raw signal readings | 303,493 |
| Telemetry channels | 9 |
| Numeric ML features | 20 |
| Train segments | 1,594 |
| Held-out test segments | 529 |
| Labels | 0 = normal, 1 = anomaly |

The recorded benchmark results for the **anomaly class F1 score** are:

| Model | Anomaly F1 |
|---|---:|
| Calibrated SVM | **0.9140** |
| Random Forest | 0.9067 |
| K-Nearest Neighbors | 0.8614 |
| Logistic Regression | 0.8571 |
| Decision Tree | 0.8250 |
| Naive Bayes | 0.7489 |

SVM held-out confusion matrix, with rows representing true labels and columns predicted labels (0 = normal, 1 = anomaly):

```text
[[409,   7],
 [ 12, 101]]
```

SVM held-out accuracy: **510 / 529 = 96.41%**. These are test-set results, **not evidence of generalization to unrelated spacecraft or real-time fault identification**. Detailed output artifacts are available under `reports/`. A separate experimental raw-signal fault-lab model is maintained in `models/fault_lab_rf.joblib`; it is not one of the six main evaluation scores.

## Repository structure

```text
SpaceFD/
├── backend/
│   ├── app/
│   │   ├── main.py                 # ESA ML / telemetry API (:8000)
│   │   ├── simulator_api.py        # Synthetic simulator API (:8001)
│   │   ├── simulator.py            # Synthetic mission scenarios
│   │   ├── registry.py             # Simulated sensor inventory
│   │   ├── diagnosis_engine.py     # Scenario-vs-nominal analysis
│   │   ├── fault_experiment.py     # Synthetic sensor fault behaviors
│   │   ├── fault_experiment_api.py
│   │   ├── propagation_rules.py
│   │   └── fault_lab.py            # Experimental raw-signal ML lab
│   ├── train_models.py            # ESA ML training/evaluation
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── MissionState.tsx
│   │   ├── OperationsConsole.tsx
│   │   ├── SpacecraftTwin.tsx
│   │   ├── SensorFaultWorkbench.tsx
│   │   ├── DiagnosticIntelligence.tsx
│   │   ├── ResearchWorkspace.tsx
│   │   └── LegacyApp.tsx
│   ├── package.json
│   └── package-lock.json
├── data/raw/                     # Prepared OPS-SAT-derived data
├── models/                       # Saved model artifacts + metadata
└── reports/                      # Evaluation figures and outputs
```

## Requirements

- Python **3.11** recommended for the project's development setup
- Node.js and npm compatible with the pinned frontend lockfile
- Windows PowerShell commands below; equivalent commands work on macOS/Linux

### 1. Clone and set up the Python backend

```powershell
git clone https://github.com/YOUR-USERNAME/SpaceFD.git
cd SpaceFD
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Replace `YOUR-USERNAME` with the actual repository owner. If PowerShell blocks activation, you can use `.\.venv\Scripts\python.exe` directly instead.

### 2. Start the ESA ML backend (terminal 1)

From the project root:

```powershell
python -m uvicorn backend.app.main:app --reload --port 8000
```

### 3. Start the synthetic spacecraft simulator (terminal 2)

From the project root with the virtual environment enabled:

```powershell
python -m uvicorn backend.app.simulator_api:app --reload --port 8001
```

### 4. Start the React frontend (terminal 3)

```powershell
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. The frontend expects the ESA service at `http://127.0.0.1:8000` and the simulator at `http://127.0.0.1:8001` in this local configuration. Both backends must be running for all workspaces to function.

### Validate a local build

```powershell
# From frontend/
npm run build
```

```powershell
# From project root
python -m compileall -q backend
```

A successful build verifies compilation; it does not constitute automated integration or browser testing.

## Example demonstration

1. Open **Operations**, select a scenario and move the replay to a relevant point after fault onset.
2. Inspect telemetry and a scenario-vs-nominal diagnostic explanation.
3. Use the **Sensor Fault Workbench** to simulate bias, drift, spike, stuck or dropout behavior.
4. Compare baseline versus modified readings and inspect the corresponding component in **Vehicle Twin**.
5. Open **ESA Research** to review actual ML anomaly-classification results, which are separate from the synthetic fault experiment.

## Known limitations

- **Replay UI rendering:** During active playback, the chart and fault-injection interface may visibly flicker. They remain stable when replay is paused. This is a known frontend rendering issue in the current prototype.
- **Synthetic physics:** The 45-sensor mission model uses assumed reference bands, scenarios and simplified equations. It is **not** a validated spacecraft digital-twin physics model.
- **Fault interpretation:** A corrupted measurement can exceed physical bounds without the underlying spacecraft being in that physical state. A flagged downstream subsystem is a **potential impact**, not a confirmed hardware failure.
- **ML task:** The trained ESA models classify labeled telemetry segments as normal/anomalous. They do **not** establish fault root cause, remaining useful life, or flight-ready predictive maintenance.
- **Evaluation:** Results reflect the prepared held-out split; broader mission, domain-shift and operational validation remain future work.
- **Local deployment:** Current frontend API URLs target locally running services; hosted deployment requires configuration of API endpoints and cross-origin settings.

## Data provenance and attribution

- OPSSAT-AD dataset record: https://zenodo.org/records/12588359
- Official project repository: https://github.com/kplabs-pl/OPS-SAT-AD
- Related research article: https://doi.org/10.1038/s41597-025-05035-3

Credit the dataset authors and follow the license terms on the primary dataset record when reusing or redistributing data. The files in `data/raw/` are **prepared inputs used by this project**, not a claim that the full original ESA archive is replicated here.

## Security and reproducibility

- Never commit `.env` files, credentials, Python virtual environments, `node_modules/` or development backups.
- Serialized `.joblib` model files should be loaded **only from trusted sources**, as deserializing untrusted files can execute arbitrary code.
- Requirements, training scripts, metadata, sample counts and reports are included so results can be examined and reproduced, subject to the available data and dependency environment.

## Future work

Reduce replay-driven UI repaints; improve asynchronous API state consistency; benchmark against spacecraft/domain-shift datasets; calibrate uncertainty; and validate fault models against higher-fidelity simulators or hardware-in-the-loop data before making operational predictive-maintenance claims.
