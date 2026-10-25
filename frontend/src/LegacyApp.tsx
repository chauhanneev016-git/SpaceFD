
import { useEffect, useState } from "react";

import {
  Activity,
  AlertCircle,
  CircleHelp,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  LayoutDashboard,
  RadioTower,
  Satellite
} from "lucide-react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";


const API = "http://127.0.0.1:8000";

type Channel = {
  channel: string;
  segments: number;
  anomalies: number;
};

type Segment = {
  segment: number;
  channel: string;
  actual: number;
  split: string;
};

type Reading = {
  time: number;
  value: number | null;
  timestamp?: string;
};

type Telemetry = {
  channel: string;
  segment: number;
  actual: number;
  split: string;
  readings: Reading[];
};

type Prediction = {
  prediction: number;
  prediction_label: string;
  anomaly_probability: number;
  actual_label: string;
  correct: boolean;
  model: string;
};

type Metric = {
  Model: string;
  Accuracy: number;
  Precision: number;
  Recall: number;
  F1: number;
  MCC: number;
};

type LabPoint = {
  index: number;
  value: number | null;
};

type LabResult = {
  segment: number;
  channel: string;
  split: string;
  actual: number;
  fault: string;
  intensity: number;
  fault_start_index: number;
  original: LabPoint[];
  injected: LabPoint[];
  before: {
    prediction: number;
    anomaly_score: number;
    features: Record<string, number>;
  };
  after: {
    prediction: number;
    anomaly_score: number;
    features: Record<string, number>;
  };
  score_delta: number;
  limitations: string;
};

type LabStatus = {
  ready: boolean;
  faults: string[];
  metadata: {
    metrics: {
      accuracy: number;
      recall: number;
      f1: number;
    };
  } | null;
};

const navigation = [
  ["Mission Control", LayoutDashboard],
  ["Telemetry Explorer", Activity],
  ["Fault Injection Lab", FlaskConical],
  ["ML Analytics", Cpu],
  ["Diagnosis Centre", CircleHelp],
  ["Reports", FileText]
] as const;

const faults = [
  ["bias", "Constant Bias"],
  ["drift", "Gradual Drift"],
  ["spike", "Sudden Spike"],
  ["noise", "Measurement Noise"],
  ["stuck", "Stuck Sensor"],
  ["dropout", "Signal Dropout"]
];

const selectStyle = {
  width: "100%",
  marginTop: 8,
  padding: "11px 12px",
  border: "1px solid #e0e7f0",
  borderRadius: 9,
  background: "#fff",
  color: "#233650",
  fontFamily: "inherit"
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 700 as const,
  color: "#40536c"
};

async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`);

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${path}`
    );
  }

  return response.json() as Promise<T>;
}

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function SignalChart({
  telemetry
}: {
  telemetry: Telemetry | null;
}) {
  if (!telemetry) {
    return <div className="empty">Select an ESA segment.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={telemetry.readings}>
        <CartesianGrid
          vertical={false}
          stroke="#e7ecf5"
          strokeDasharray="3 4"
        />
        <XAxis
          dataKey="time"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
        />
        <YAxis
          width={85}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) =>
            Number(v).toPrecision(3)
          }
        />
        <Tooltip
          formatter={(v) => [
            Number(v).toPrecision(6),
            "ESA value"
          ]}
        />
        <Area
          dataKey="value"
          type="linear"
          stroke="#327be4"
          fill="#dceaff"
          strokeWidth={2}
          connectNulls={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ExperimentChart({
  result
}: {
  result: LabResult;
}) {
  const merged = result.original.map((point, i) => ({
    index: point.index,
    original: point.value,
    injected: result.injected[i]?.value ?? null
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={merged}>
        <CartesianGrid
          vertical={false}
          stroke="#e7ecf5"
          strokeDasharray="3 4"
        />
        <XAxis
          dataKey="index"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
        />
        <YAxis
          width={85}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) =>
            Number(v).toPrecision(3)
          }
        />
        <Tooltip
          formatter={(v) =>
            typeof v === "number"
              ? v.toPrecision(7)
              : String(v)
          }
        />
        <Legend />
        <ReferenceLine
          x={result.fault_start_index}
          stroke="#b58a36"
          strokeDasharray="5 5"
          label="Fault begins"
        />
        <Line
          dataKey="original"
          name="Original ESA"
          stroke="#327be4"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="injected"
          name="Injected Signal"
          stroke="#df8643"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}


export default function App() {
  const [tab, setTab] = useState("Mission Control");
  const [online, setOnline] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [mlReady, setMLReady] = useState(false);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [channel, setChannel] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentId, setSegmentId] = useState("");

  const [telemetry, setTelemetry] =
    useState<Telemetry | null>(null);
  const [prediction, setPrediction] =
    useState<Prediction | null>(null);

  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [model, setModel] = useState("svm");

  const [labStatus, setLabStatus] =
    useState<LabStatus | null>(null);
  const [fault, setFault] = useState("drift");
  const [intensity, setIntensity] = useState(50);
  const [labResult, setLabResult] =
    useState<LabResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function initialize() {
    try {
      const [
        health,
        dataset,
        ml,
        channelData,
        metricData,
        lab
      ] = await Promise.all([
        getJSON<{ status: string }>("/api/health"),
        getJSON<{ ready: boolean }>("/api/dataset/status"),
        getJSON<{ ready: boolean }>("/api/ml/status"),
        getJSON<{ channels: Channel[] }>("/api/ml/channels"),
        getJSON<{ results: Metric[] }>("/api/ml/metrics"),
        getJSON<LabStatus>("/api/lab/status")
      ]);

      setOnline(health.status === "ok");
      setDataReady(dataset.ready);
      setMLReady(ml.ready);
      setChannels(channelData.channels);
      setMetrics(metricData.results);
      setLabStatus(lab);
      setChannel(
        current =>
          current || channelData.channels[0]?.channel || ""
      );
      setError("");
    } catch (err) {
      setOnline(false);
      setError(String(err));
    }
  }

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!channel) return;

    let active = true;

    async function fetchSegments() {
      try {
        const data = await getJSON<{ segments: Segment[] }>(
          `/api/ml/segments?channel=${
            encodeURIComponent(channel)
          }&split=test&limit=500`
        );

        if (!active) return;

        setSegments(data.segments);
        setSegmentId(
          data.segments.length
            ? String(data.segments[0].segment)
            : ""
        );
        setTelemetry(null);
        setPrediction(null);
        setLabResult(null);
      } catch (err) {
        if (active) setError(String(err));
      }
    }

    void fetchSegments();

    return () => {
      active = false;
    };
  }, [channel]);

  useEffect(() => {
    if (!segmentId) return;

    let active = true;

    async function fetchTelemetry() {
      try {
        const data = await getJSON<Telemetry>(
          `/api/ml/telemetry/${segmentId}`
        );

        if (active) {
          setTelemetry(data);
          setPrediction(null);
          setLabResult(null);
        }
      } catch (err) {
        if (active) setError(String(err));
      }
    }

    void fetchTelemetry();

    return () => {
      active = false;
    };
  }, [segmentId]);

  useEffect(() => {
    setPrediction(null);
  }, [model]);

  useEffect(() => {
    setLabResult(null);
  }, [fault, intensity]);

  async function analyze() {
    if (!segmentId) return;

    setBusy(true);
    setError("");

    try {
      const data = await getJSON<Prediction>(
        `/api/ml/predict/${segmentId}?model=${model}`
      );

      setPrediction(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runFaultLab() {
    if (!segmentId || !labStatus?.ready) return;

    setBusy(true);
    setError("");
    setLabResult(null);

    try {
      const data = await getJSON<LabResult>(
        `/api/lab/run/${segmentId}?fault=${fault}&intensity=${intensity}`
      );

      setLabResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const best = [...metrics].sort(
    (a, b) => b.F1 - a.F1
  )[0];

  const showExplorer =
    tab === "Mission Control" ||
    tab === "Telemetry Explorer";

  const showControls =
    showExplorer || tab === "Fault Injection Lab";

  return (
    <div className="shell">

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Satellite size={22} />
          </div>
          <div>
            <strong>SpaceFD</strong>
            <small>MISSION INTELLIGENCE</small>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav>
          {navigation.map(([name, Icon]) => (
            <button
              key={name}
              className={
                "nav-item " +
                (tab === name ? "active" : "")
              }
              onClick={() => setTab(name)}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="small-panel">
            <RadioTower size={18} />
            <div>
              <b>SpaceFD v0.3</b>
              <span>Fault research workspace</span>
            </div>
          </div>
          <p>
            Experimental software. Not for flight control.
          </p>
        </div>
      </aside>

      <main className="main">
        <header className="top">
          <span>SpaceFD / {tab}</span>

          <div className="top-actions">
            <span className={
              "connection " + (online ? "good" : "bad")
            }>
              <span className="dot" />
              {online ? "API connected" : "API offline"}
            </span>

            <button
              className="refresh"
              onClick={() => void initialize()}
            >
              Refresh ↗
            </button>
          </div>
        </header>

        <div className="content">

          <div className="heading">
            <div>
              <div className="eyebrow">
                SPACECRAFT HEALTH INTELLIGENCE
              </div>
              <h1>{tab}</h1>
              <p>
                ESA OPS-SAT telemetry and experimental
                machine-learning diagnostics.
              </p>
            </div>
            <span className="mode">RESEARCH MODE</span>
          </div>

          {error && (
            <div className="error">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="stats">
            <div className="stat">
              <span>API STATUS <RadioTower size={17}/></span>
              <strong>
                {online ? "Connected" : "Offline"}
              </strong>
              <small>FastAPI backend</small>
            </div>

            <div className="stat">
              <span>ESA DATA <Database size={17}/></span>
              <strong>
                {dataReady ? "Ready" : "Missing"}
              </strong>
              <small>Original telemetry files</small>
            </div>

            <div className="stat">
              <span>ML ENGINE <Cpu size={17}/></span>
              <strong>
                {mlReady ? "Ready" : "Pending"}
              </strong>
              <small>SVM and Random Forest</small>
            </div>

            <div className="stat">
              <span>FAULT LAB <FlaskConical size={17}/></span>
              <strong>
                {labStatus?.ready ? "Ready" : "Pending"}
              </strong>
              <small>Raw-signal experiment model</small>
            </div>
          </div>

          {showControls && (
            <div className="panel">
              <div className="panel-top">
                <div>
                  <div className="eyebrow">
                    ESA TELEMETRY SELECTION
                  </div>
                  <h2>Select a Spacecraft Signal</h2>
                  <p>
                    Choose a channel and an official
                    held-out test segment.
                  </p>
                </div>
                <span className="pill">ESA DATA</span>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 16,
                marginTop: 22
              }}>
                <label style={labelStyle}>
                  Telemetry Channel
                  <select
                    style={selectStyle}
                    value={channel}
                    onChange={e => setChannel(e.target.value)}
                  >
                    {channels.map(c => (
                      <option
                        key={c.channel}
                        value={c.channel}
                      >
                        {c.channel}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={labelStyle}>
                  Telemetry Segment
                  <select
                    style={selectStyle}
                    value={segmentId}
                    onChange={e =>
                      setSegmentId(e.target.value)
                    }
                  >
                    {segments.map(s => (
                      <option
                        key={s.segment}
                        value={s.segment}
                      >
                        Segment {s.segment}
                        {" · "}
                        {s.actual ? "Annotated anomaly" : "Normal"}
                      </option>
                    ))}
                  </select>
                </label>

                {showExplorer && (
                  <label style={labelStyle}>
                    ML Model
                    <select
                      style={selectStyle}
                      value={model}
                      onChange={e =>
                        setModel(e.target.value)
                      }
                    >
                      <option value="svm">
                        Calibrated SVM
                      </option>
                      <option value="random_forest">
                        Random Forest
                      </option>
                    </select>
                  </label>
                )}
              </div>
            </div>
          )}

          {showExplorer && (
            <>
              <div className="panel">
                <div className="panel-top">
                  <div>
                    <div className="eyebrow">
                      REAL SPACECRAFT TELEMETRY
                    </div>
                    <h2>Signal Explorer</h2>
                    <p>
                      Recorded ESA measurements —
                      not a live spacecraft feed.
                    </p>
                  </div>
                  <span className="pill">REAL DATA</span>
                </div>

                <div className="chart">
                  <SignalChart telemetry={telemetry}/>
                </div>

                <button
                  className="refresh"
                  onClick={() => void analyze()}
                  disabled={busy || !mlReady || !segmentId}
                  style={{
                    background: "#2868cf",
                    color: "#fff",
                    border: 0,
                    padding: "12px 18px"
                  }}
                >
                  {busy ? "Analyzing..." : "Run ML Analysis"}
                </button>
              </div>

              <div className="lower">
                <div className="panel">
                  <div className="eyebrow">MODEL OUTPUT</div>
                  <h2>Anomaly Detection</h2>

                  {prediction ? (
                    <div style={{ marginTop: 20 }}>
                      <h2 style={{
                        color: prediction.prediction
                          ? "#b87938" : "#16835b",
                        fontSize: 26
                      }}>
                        {prediction.prediction_label}
                      </h2>

                      <div className="file">
                        <span>Anomaly score</span>
                        <b>
                          {percent(prediction.anomaly_probability)}
                        </b>
                      </div>

                      <div className="file">
                        <span>Ground truth</span>
                        <b>{prediction.actual_label}</b>
                      </div>

                      <div className="file">
                        <span>Prediction match</span>
                        <b>
                          {prediction.correct ? "YES" : "NO"}
                        </b>
                      </div>
                    </div>
                  ) : (
                    <p className="footnote">
                      Run analysis to view the prediction.
                    </p>
                  )}
                </div>

                <div className="panel">
                  <div className="eyebrow">
                    CLASSICAL ML BENCHMARK
                  </div>
                  <h2>Best Model by F1</h2>

                  {best && (
                    <div style={{ marginTop: 20 }}>
                      <h2>{best.Model}</h2>
                      <div className="file">
                        <span>Accuracy</span>
                        <b>{percent(best.Accuracy)}</b>
                      </div>
                      <div className="file">
                        <span>Anomaly Recall</span>
                        <b>{percent(best.Recall)}</b>
                      </div>
                      <div className="file">
                        <span>F1 Score</span>
                        <b>{best.F1.toFixed(4)}</b>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === "Fault Injection Lab" && (
            <>
              <div className="panel">
                <div className="panel-top">
                  <div>
                    <div className="eyebrow">
                      CONTROLLED FAULT EXPERIMENTS
                    </div>
                    <h2>Fault Configuration</h2>
                    <p>
                      Modify recorded telemetry and
                      observe the model's response.
                    </p>
                  </div>
                  <span className="pill">SIMULATED FAULT</span>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 24,
                  marginTop: 24
                }}>
                  <label style={labelStyle}>
                    Fault Type
                    <select
                      style={selectStyle}
                      value={fault}
                      onChange={e =>
                        setFault(e.target.value)
                      }
                    >
                      {faults.map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={labelStyle}>
                    Fault Intensity: {intensity}%
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={intensity}
                      onChange={e =>
                        setIntensity(Number(e.target.value))
                      }
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: 22,
                        accentColor: "#2868cf"
                      }}
                    />
                  </label>
                </div>

                <button
                  className="refresh"
                  disabled={
                    busy ||
                    !segmentId ||
                    !labStatus?.ready
                  }
                  onClick={() => void runFaultLab()}
                  style={{
                    marginTop: 22,
                    padding: "13px 20px",
                    background: "#2868cf",
                    color: "white",
                    border: 0,
                    opacity:
                      busy || !labStatus?.ready ? 0.55 : 1
                  }}
                >
                  {busy
                    ? "Running Experiment..."
                    : "Inject Fault & Analyze"}
                </button>

                {!labStatus?.ready && (
                  <p className="footnote">
                    Train the raw-signal Fault Lab model
                    before running an experiment.
                  </p>
                )}
              </div>

              <div className="panel">
                <div className="panel-top">
                  <div>
                    <div className="eyebrow">
                      BEFORE / AFTER ANALYSIS
                    </div>
                    <h2>Telemetry Comparison</h2>
                    <p>
                      Blue = original ESA signal.
                      Orange = experimentally modified signal.
                    </p>
                  </div>
                </div>

                <div className="chart" style={{ height: 370 }}>
                  {labResult ? (
                    <ExperimentChart result={labResult}/>
                  ) : (
                    <div className="empty">
                      Run a fault experiment to display both signals.
                    </div>
                  )}
                </div>
              </div>

              {labResult && (
                <div className="lower">
                  <div className="panel">
                    <div className="eyebrow">
                      ORIGINAL SIGNAL
                    </div>
                    <h2>Before Fault Injection</h2>

                    <div style={{
                      fontSize: 26,
                      fontWeight: 800,
                      marginTop: 20,
                      color: labResult.before.prediction
                        ? "#b87938" : "#16835b"
                    }}>
                      {labResult.before.prediction
                        ? "ANOMALY" : "NORMAL"}
                    </div>

                    <div className="file">
                      <span>Anomaly score</span>
                      <b>
                        {percent(
                          labResult.before.anomaly_score
                        )}
                      </b>
                    </div>

                    <div className="file">
                      <span>Original annotation</span>
                      <b>
                        {labResult.actual
                          ? "Anomaly" : "Normal"}
                      </b>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="eyebrow">
                      MODIFIED SIGNAL
                    </div>
                    <h2>After Fault Injection</h2>

                    <div style={{
                      fontSize: 26,
                      fontWeight: 800,
                      marginTop: 20,
                      color: labResult.after.prediction
                        ? "#b87938" : "#16835b"
                    }}>
                      {labResult.after.prediction
                        ? "ANOMALY" : "NORMAL"}
                    </div>

                    <div className="file">
                      <span>Anomaly score</span>
                      <b>
                        {percent(
                          labResult.after.anomaly_score
                        )}
                      </b>
                    </div>

                    <div className="file">
                      <span>Score change</span>
                      <b>
                        {labResult.score_delta >= 0 ? "+" : ""}
                        {(
                          labResult.score_delta * 100
                        ).toFixed(2)} pp
                      </b>
                    </div>
                  </div>
                </div>
              )}

              {labResult && (
                <div className="panel">
                  <div className="eyebrow">
                    EXPERIMENT NOTES
                  </div>
                  <h2>Interpretation</h2>

                  <p className="footnote">
                    Segment {labResult.segment} ·
                    Channel {labResult.channel} ·
                    {labResult.fault.toUpperCase()} fault ·
                    {labResult.intensity}% intensity.
                  </p>

                  <p className="footnote">
                    {labResult.limitations}
                  </p>

                  {labStatus?.metadata && (
                    <p className="footnote">
                      Raw-signal model held-out F1: {
                        labStatus.metadata.metrics.f1.toFixed(4)
                      }.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "ML Analytics" && (
            <div className="panel">
              <div className="eyebrow">
                SUPERVISED ML BENCHMARK
              </div>
              <h2>ESA Model Comparison</h2>
              <p className="footnote">
                Official held-out test partition.
              </p>

              <div style={{
                overflowX: "auto",
                marginTop: 20
              }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13
                }}>
                  <thead>
                    <tr>
                      {[
                        "Model", "Accuracy", "Precision",
                        "Recall", "F1", "MCC"
                      ].map(name => (
                        <th key={name} style={{
                          textAlign: "left",
                          padding: 12,
                          borderBottom: "1px solid #e7edf5"
                        }}>
                          {name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map(m => (
                      <tr key={m.Model}>
                        <td style={{ padding: 12 }}>
                          <b>{m.Model}</b>
                        </td>
                        <td>{percent(m.Accuracy)}</td>
                        <td>{percent(m.Precision)}</td>
                        <td>{percent(m.Recall)}</td>
                        <td>{m.F1.toFixed(4)}</td>
                        <td>{m.MCC.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {[
            "Diagnosis Centre",
            "Reports"
          ].includes(tab) && (
            <div className="panel upcoming">
              <CircleHelp size={32}/>
              <h2>{tab}</h2>
              <p>
                This module will be developed
                in an upcoming milestone.
              </p>
              <button
                onClick={() => setTab("Mission Control")}
              >
                Return to Mission Control
              </button>
            </div>
          )}

          <footer>
            SPACEFD RESEARCH SYSTEM ·
            ESA TELEMETRY ·
            EXPERIMENTAL FAULT INJECTION
          </footer>

        </div>
      </main>
    </div>
  );
}

