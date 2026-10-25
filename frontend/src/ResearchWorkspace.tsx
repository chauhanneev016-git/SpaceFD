import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Database, FlaskConical, Radar, SearchCheck } from "lucide-react";
import LegacyApp from "./LegacyApp";

type Tab = "overview" | "evaluation" | "errors" | "workflow" | "explorer";

const MODEL_ROWS = [
  { model: "SVM", accuracy: 96.4, recall: 89.4, f1: 0.914, mcc: 0.892, tp: 101, fn: 12, fp: 7, tn: 409 },
  { model: "Random Forest", accuracy: 96.0, recall: 90.3, f1: 0.907, mcc: 0.881, tp: 102, fn: 11, fp: 10, tn: 406 },
  { model: "KNN", accuracy: 94.7, recall: 77.0, f1: 0.861, mcc: 0.838, tp: 87, fn: 26, fp: 2, tn: 414 },
  { model: "Logistic Regression", accuracy: 93.6, recall: 90.3, f1: 0.857, mcc: 0.818, tp: 102, fn: 11, fp: 23, tn: 393 },
  { model: "Decision Tree", accuracy: 92.1, recall: 87.6, f1: 0.825, mcc: 0.776, tp: 99, fn: 14, fp: 28, tn: 388 },
  { model: "Naive Bayes", accuracy: 89.2, recall: 75.2, f1: 0.749, mcc: 0.680, tp: 85, fn: 28, fp: 29, tn: 387 },
];

const STEPS = [
  {
    icon: Database,
    title: "Dataset inspection",
    text: "ESA OPSSAT‑AD feature data and segment-wise raw telemetry were profiled first to validate sample counts, label balance, train/test partitioning, and absence of missing values.",
  },
  {
    icon: Radar,
    title: "Feature-space anomaly learning",
    text: "Classical ML models were trained on 20 engineered numeric features derived from telemetry segments. The task is binary anomaly detection, not physical root-cause diagnosis.",
  },
  {
    icon: SearchCheck,
    title: "Held-out evaluation",
    text: "Models were compared on the provided test split. SVM and Random Forest achieved the strongest overall F1 and MCC while retaining high anomaly recall.",
  },
  {
    icon: FlaskConical,
    title: "Fault experimentation layer",
    text: "Separate from ESA recorded data, the simulator injects controlled scenario deviations into a synthetic multi-sensor mission model so users can reason about predictive maintenance and subsystem interactions.",
  },
];

export default function ResearchWorkspace() {
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedModel,setSelectedModel] = useState("SVM");
  const selected = MODEL_ROWS.find(x=>x.model===selectedModel)||MODEL_ROWS[0];
  const best = MODEL_ROWS[0];
  const avgF1 = useMemo(() => (MODEL_ROWS.reduce((sum, row) => sum + row.f1, 0) / MODEL_ROWS.length).toFixed(3), []);

  return (
    <main className="research-page">
      <section className="page-title-row research-title-row">
        <div>
          <p className="eyebrow">RESEARCH WORKSPACE / RECORDED TELEMETRY</p>
          <h1>ESA telemetry research</h1>
          <p className="page-intro">Segment-level anomaly detection, model comparison, controlled fault experimentation, and project framing in one presentable workspace.</p>
        </div>
        <div className="research-tab-switcher">
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><BarChart3 size={15} /> Overview</button>
          <button className={tab === "evaluation" ? "active" : ""} onClick={() => setTab("evaluation")}><Radar size={15} /> Evaluation</button>
          <button className={tab === "errors" ? "active" : ""} onClick={() => setTab("errors")}><AlertTriangle size={15} /> Error analysis</button>
          <button className={tab === "workflow" ? "active" : ""} onClick={() => setTab("workflow")}><FlaskConical size={15} /> Workflow</button>
          <button className={tab === "explorer" ? "active" : ""} onClick={() => setTab("explorer")}><Database size={15} /> Explorer & fault lab</button>
        </div>
      </section>

      <div className="mission-context-banner research-callout">
        <Database size={16} />
        <span>ESA OPSSAT‑AD is a recorded anomaly-detection dataset. It remains separate from the synthetic 45-parameter mission simulator used in Operations, Diagnostics and Vehicle Twin.</span>
      </div>

      <section className="metric-grid metric-grid-4 bottom-gap">
        <article className="metric-card"><span>Recorded segments</span><strong>2,123</strong><small>ESA feature dataset</small></article>
        <article className="metric-card"><span>Test segments</span><strong>529</strong><small>Provided held-out partition</small></article>
        <article className="metric-card"><span>Telemetry channels</span><strong>9</strong><small>Unique channel identifiers</small></article>
        <article className="metric-card"><span>Best F1</span><strong>{best.f1.toFixed(3)}</strong><small>{best.model}</small></article>
      </section>

      {tab === "overview" && (
        <section className="research-grid-2">
          <article className="panel-card">
            <div className="panel-header compact"><div><p className="eyebrow">MODEL RANKING</p><h2>Leaderboard snapshot</h2></div><small>Positive class: anomaly</small></div>
            <div className="research-bars">
              {MODEL_ROWS.map((row) => (
                <div key={row.model} className="research-bar-row">
                  <div className="research-bar-label"><strong>{row.model}</strong><span>F1 {row.f1.toFixed(3)}</span></div>
                  <div className="research-bar-track"><div className="research-bar-fill" style={{ width: `${row.f1 * 100}%` }} /></div>
                </div>
              ))}
            </div>
            <p className="sub-copy">Average model F1 across the six evaluated classical algorithms: <strong>{avgF1}</strong>.</p>
          </article>

          <article className="panel-card">
            <div className="panel-header compact"><div><p className="eyebrow">PROJECT VALUE</p><h2>Why this panel matters</h2></div></div>
            <ul className="simple-list">
              <li>Shows that SpaceFD includes both a research-grade anomaly-detection study and an engineering-facing simulator.</li>
              <li>Separates what is learned from recorded ESA data versus what is demonstrated in the synthetic twin.</li>
              <li>Makes the ML story presentation-ready with clear metrics, error analysis and workflow context.</li>
              <li>Supports viva questions on dataset choice, feature engineering, evaluation and limitations.</li>
            </ul>
          </article>
        </section>
      )}

      {tab === "evaluation" && (
        <section className="research-grid-2">
          <article className="panel-card">
            <div className="panel-header compact"><div><p className="eyebrow">EVALUATION SUMMARY</p><h2>Held-out test performance</h2></div></div>
            <div className="table-shell">
              <table className="clean-table">
                <thead><tr><th>Model</th><th>Accuracy</th><th>Recall</th><th>F1</th><th>MCC</th></tr></thead>
                <tbody>
                  {MODEL_ROWS.map((row) => (
                    <tr key={row.model} className={row.model === best.model ? "highlight-row" : ""}>
                      <td>{row.model}</td><td>{row.accuracy.toFixed(1)}%</td><td>{row.recall.toFixed(1)}%</td><td>{row.f1.toFixed(3)}</td><td>{row.mcc.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel-card">
            <div className="panel-header compact"><div><p className="eyebrow">BEST MODEL DETAIL</p><h2>{selected.model} confusion matrix</h2>
              <select className="research-model-select" value={selectedModel} onChange={e=>setSelectedModel(e.target.value)}>{MODEL_ROWS.map(x=><option key={x.model}>{x.model}</option>)}</select></div></div>
            <div className="confusion-grid">
              <div><span>True negatives</span><strong>{selected.tn}</strong></div>
              <div><span>False positives</span><strong>{selected.fp}</strong></div>
              <div><span>False negatives</span><strong>{selected.fn}</strong></div>
              <div><span>True positives</span><strong>{selected.tp}</strong></div>
            </div>
            <p className="sub-copy">Numbers come from the saved held-out evaluation; different models trade off missed anomalies and false alerts.</p>
          </article>
        </section>
      )}

      {tab === "errors" && (
        <section className="research-grid-2">
          <article className="panel-card">
            <div className="panel-header compact"><div><p className="eyebrow">ERROR ANALYSIS</p><h2>Where the model still fails</h2><select className="research-model-select" value={selectedModel} onChange={e=>setSelectedModel(e.target.value)}>{MODEL_ROWS.map(x=><option key={x.model}>{x.model}</option>)}</select></div></div>
            <div className="metric-grid metric-grid-2 inner-metrics">
              <article className="metric-card inner"><span>False positives</span><strong>{selected.fp}</strong><small>Normal segment flagged as anomaly</small></article>
              <article className="metric-card inner"><span>False negatives</span><strong>{selected.fn}</strong><small>Anomalous segment missed by model</small></article>
            </div>
            <ul className="simple-list">
              <li>False positives can trigger unnecessary operator concern and should be reviewed alongside the raw segment shape.</li>
              <li>False negatives are more critical because a real anomalous segment may remain hidden in automated screening.</li>
              <li>Channel-specific review, feature normalization checks, and threshold calibration are the next most useful refinements.</li>
            </ul>
          </article>

          <article className="panel-card">
            <div className="panel-header compact"><div><p className="eyebrow">LIMITATIONS</p><h2>Interpretation boundaries</h2></div></div>
            <ul className="simple-list">
              <li>The ESA model performs binary anomaly detection at the segment level only.</li>
              <li>It does not identify the exact hardware failure mode or physical subsystem damage.</li>
              <li>The digital twin and predictive maintenance visuals are therefore advisory simulations layered on top of this research foundation.</li>
              <li>For a production system, channel-specific calibration and richer historical mission context would be required.</li>
            </ul>
          </article>
        </section>
      )}

      {tab === "explorer" && (<div className="research-legacy-tools"><LegacyApp /></div>)}
      {tab === "workflow" && (
        <section className="research-grid-1">
          <article className="panel-card">
            <div className="panel-header compact"><div><p className="eyebrow">PROJECT WORKFLOW</p><h2>End-to-end SpaceFD story</h2></div></div>
            <div className="workflow-list">
              {STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="workflow-item">
                    <div className="workflow-icon"><Icon size={18} /></div>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
