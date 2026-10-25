import { useMemo } from "react";
import { Activity, AlertTriangle, ClipboardCheck, GitBranch, Wrench } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMission } from "./MissionState";

function pretty(value: number | null, suffix = "") {
  return value === null ? "Not estimated" : `${value.toFixed(2)}${suffix}`;
}

export default function DiagnosticIntelligence() {
  const mission = useMission();
  const diagnosis = mission.diagnosis;
  const frame = mission.frame;

  const outOfBandSensors = useMemo(() => {
    if (!frame) return [];
    return mission.sensors
      .filter((sensor) => frame.statuses[sensor.id] === "OUTSIDE_REFERENCE_BAND")
      .map((sensor) => ({
        ...sensor,
        reading: frame.readings[sensor.id],
      }));
  }, [frame, mission.sensors]);

  const affectedSystems = useMemo(() => {
    const systems = new Set<string>(diagnosis?.propagation_path || []);
    outOfBandSensors.forEach((sensor) => systems.add(sensor.subsystem));
    return Array.from(systems);
  }, [diagnosis, outOfBandSensors]);

  const eclipseBands = useMemo(() => {
    if (!diagnosis?.trend.length) return [] as { start: number; end: number }[];
    const bands: { start: number; end: number }[] = [];
    let start: number | null = null;
    diagnosis.trend.forEach((point) => {
      if (point.eclipse && start === null) start = point.step;
      if (!point.eclipse && start !== null) {
        bands.push({ start, end: point.step });
        start = null;
      }
    });
    if (start !== null) bands.push({ start, end: diagnosis.trend[diagnosis.trend.length - 1].step });
    return bands;
  }, [diagnosis]);

  const healthCards = diagnosis ? [
    ["Power balance", pretty(diagnosis.metrics.power_balance_w, " W")],
    ["Power Δ vs nominal", pretty(diagnosis.metrics.power_balance_delta_w, " W")],
    ["Battery SOC", pretty(diagnosis.metrics.battery_soc_pct, "%")],
    ["Battery Δ vs nominal", pretty(diagnosis.metrics.battery_soc_delta_pp, " pp")],
    ["Solar energy Δ since onset", pretty(diagnosis.metrics.cumulative_solar_energy_delta_wh, " Wh")],
    ["5‑min SOC trend", pretty(diagnosis.metrics.battery_soc_rate_pp_per_hour, " pp/h")],
    ["Time to 20%", diagnosis.metrics.projected_hours_to_20pct === null ? "Not estimated" : pretty(diagnosis.metrics.projected_hours_to_20pct, " h")],
    ["Sunlit samples since onset", String(diagnosis.metrics.sunlit_samples_since_onset ?? 0)],
  ] : [];

  return (
    <main className="ops-page diagnostics-page">
      <section className="page-title-row">
        <div>
          <p className="eyebrow">SPACEFD / ENGINEERING DECISION SUPPORT</p>
          <h1>Diagnostic Intelligence Centre</h1>
          <p className="page-intro">Same-time nominal comparison, predictive maintenance reasoning, and visual system-level fault implications.</p>
        </div>
        <span className="panel-tag">SIMULATED / RESEARCH ONLY</span>
      </section>

      <div className="mission-context-banner">
        Shared mission replay · Step {mission.step}/719 · {mission.scenario.replace(/_/g, " ")} · {mission.frame?.eclipse ? "eclipse" : "sunlit"}
      </div>

      <section className="panel-card hero-panel">
        <div className="hero-assessment">
          <div>
            <p className="eyebrow">CURRENT ENGINEERING ASSESSMENT</p>
            <h2>{diagnosis?.scenario_name || "Awaiting diagnostic output"}</h2>
            <p className="lead-copy">{diagnosis?.assessment || "When the backend is online, the shared diagnostic assessment will appear here."}</p>
            <p className="sub-copy">Observation focus: <strong>{diagnosis?.observation || "—"}</strong></p>
          </div>
          <div className="hero-side">
            <span className="severity-chip large">{diagnosis?.severity?.replace(/_/g, " ") || "PENDING"}</span>
            <small>Primary source component: {diagnosis?.source_component || "—"}</small>
          </div>
        </div>
      </section>

      <section className="metric-grid metric-grid-4 bottom-gap">
        {healthCards.map(([label, value]) => (
          <article key={label} className="metric-card"><span>{label}</span><strong>{value}</strong></article>
        ))}
      </section>

      <section className="three-column-grid bottom-gap">
        <article className="panel-card">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow"><GitBranch size={14} /> MODELED DEPENDENCY PATH</p>
              <h2>Potential propagation</h2>
            </div>
          </div>
          <div className="path-flow stacked">
            {(diagnosis?.propagation_path || []).map((node, index, array) => (
              <span key={`${node}-${index}`}>{node}{index < array.length - 1 && <em>→</em>}</span>
            ))}
          </div>
          <ul className="simple-list">
            {(diagnosis?.potential_effects || []).map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </article>

        <article className="panel-card">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow"><ClipboardCheck size={14} /> OPERATOR INVESTIGATION</p>
              <h2>Recommended checks</h2>
            </div>
          </div>
          <ol className="number-list">
            {(diagnosis?.operator_checks || []).map((item, index) => <li key={index}>{item}</li>)}
          </ol>
        </article>

        <article className="panel-card">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow"><Wrench size={14} /> PREDICTIVE MAINTENANCE</p>
              <h2>Likely impact footprint</h2>
            </div>
          </div>
          <div className="impact-badges">
            {affectedSystems.length ? affectedSystems.map((system) => <span key={system}>{system}</span>) : <span>No affected systems yet</span>}
          </div>
          <div className="context-note warning-note compact-note">
            <AlertTriangle size={16} />
            <div>
              <strong>{outOfBandSensors.length} sensor{outOfBandSensors.length !== 1 ? "s" : ""} outside reference band</strong>
              <p>The vehicle twin can highlight these systems so the user can visually inspect where local telemetry faults may cascade.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="panel-card bottom-gap">
        <div className="panel-header compact">
          <div>
            <p className="eyebrow"><Activity size={14} /> SYNCHRONIZED EVIDENCE</p>
            <h2>Scenario vs same-time nominal telemetry</h2>
          </div>
          <small>Trend sensor: {diagnosis?.trend_sensor || "—"}</small>
        </div>
        <div className="chart-shell large-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={diagnosis?.trend || []} margin={{ top: 12, right: 18, left: 16, bottom: 8 }}>
              <CartesianGrid stroke="#313b45" strokeDasharray="3 5" />
              <XAxis dataKey="step" type="number" domain={["dataMin", "dataMax"]} tick={{ fill: "#98a6b2", fontSize: 11 }} stroke="#495560" />
              <YAxis width={80} tick={{ fill: "#98a6b2", fontSize: 11 }} stroke="#495560" tickFormatter={(value) => Number(value).toPrecision(3)} />
              <Tooltip contentStyle={{ background: "#20272e", border: "1px solid #4d5a66", color: "#f3f5f7" }} />
              <Legend />
              {eclipseBands.map((band, index) => <ReferenceArea key={index} x1={band.start} x2={band.end} fill="#8997a5" fillOpacity={0.12} strokeOpacity={0} />)}
              <ReferenceLine x={diagnosis?.fault_onset_step || 270} stroke="#d3a065" strokeDasharray="4 4" label={{ value: "Onset", fill: "#d3a065", position: "insideTopRight" }} />
              <ReferenceLine x={mission.step} stroke="#93a2af" strokeDasharray="2 4" />
              <Line dataKey="scenario" stroke="#d8aa6a" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="nominal" stroke="#98c5dd" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="sub-copy">Gray bands mark eclipse intervals. The chart aligns scenario and nominal samples at the same mission timestamp.</p>
      </section>

      <section className="two-column-grid">
        <article className="panel-card">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">FLAGGED TELEMETRY</p>
              <h2>Sensor exceptions</h2>
            </div>
          </div>
          <div className="table-shell">
            <table className="clean-table">
              <thead>
                <tr><th>Sensor</th><th>Subsystem</th><th>Reading</th><th>Unit</th></tr>
              </thead>
              <tbody>
                {outOfBandSensors.length ? outOfBandSensors.map((sensor) => (
                  <tr key={sensor.id}>
                    <td>{sensor.name}</td>
                    <td>{sensor.subsystem}</td>
                    <td>{typeof sensor.reading === "number" ? sensor.reading.toFixed(3) : "—"}</td>
                    <td>{sensor.unit}</td>
                  </tr>
                )) : <tr><td colSpan={4}>No sensor is currently outside its reference band.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">SAME-TIME EVIDENCE TABLE</p>
              <h2>Scenario vs nominal values</h2>
            </div>
          </div>
          <div className="table-shell">
            <table className="clean-table">
              <thead>
                <tr><th>Sensor</th><th>Scenario</th><th>Nominal</th><th>Delta</th></tr>
              </thead>
              <tbody>
                {(diagnosis?.evidence || []).map((row) => (
                  <tr key={row.sensor_id}>
                    <td>{row.sensor_id}</td>
                    <td>{row.scenario_value}</td>
                    <td>{row.nominal_value}</td>
                    <td>{row.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {diagnosis?.disclaimer && (
        <div className="context-note warning-note bottom-gap">
          <AlertTriangle size={16} />
          <div>
            <strong>Advisory note</strong>
            <p>{diagnosis.disclaimer}</p>
          </div>
        </div>
      )}
    </main>
  );
}
