import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, Wrench, TriangleAlert } from "lucide-react";
import SensorFaultWorkbench from "./SensorFaultWorkbench";
import { readAPI, useMission } from "./MissionState";

type Point = { step: number; value: number };
type OverlayPoint = { step: number; baseline: number; injected: number | null; missing: boolean };
const SYSTEMS = ["EPS", "ADCS", "THERMAL", "COMMS", "OBC", "PROPULSION", "NAVIGATION", "STRUCTURE"];

function formatReading(value: number | null | undefined, unit: string) {
  if (value === null) return "Missing signal";
  if (value === undefined) return "—";
  if (unit === "%") return `${value.toFixed(2)}%`;
  if (Math.abs(value) < 0.01 && value !== 0) return `${value.toExponential(2)} ${unit}`.trim();
  return `${value.toFixed(2)} ${unit}`.trim();
}

// This chart is isolated from the replay clock. Updating the replay cursor must
// NOT cause Recharts to perform a 720-point layout/reconciliation pass.
type GraphDatum = { step: number; baseline: number; injected: number | null; missing: boolean };
let totalPlotMounts = 0;
const FixedTelemetryPlot = memo(function FixedTelemetryPlot({
  graph, yDomain, unit, showInjected, injectionOnset,
}: {
  graph: GraphDatum[];
  yDomain: [number, number];
  unit: string;
  showInjected: boolean;
  injectionOnset: number | null;
}) {
  const [mountId] = useState(() => ++totalPlotMounts);
  const renderCounter = useRef(0);
  renderCounter.current += 1;
  // Fixed coordinate system: no ResponsiveContainer, ResizeObserver, animation,
  // or live chart-library reconciliation during mission replay.
  const left = 70, right = 18, top = 20, bottom = 40;
  const width = 1000, height = 360;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const ySpan = Math.max(0.000001, yDomain[1] - yDomain[0]);
  const xOf = (step: number) => left + Math.max(0, Math.min(719, step)) / 719 * plotWidth;
  const yOf = (v: number) => top + (yDomain[1] - v) / ySpan * plotHeight;
  const makePaths = (field: "baseline" | "injected") => {
    const paths: string[] = [];
    let current = "";
    for (const point of graph) {
      const value = point[field];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        if (current) paths.push(current);
        current = "";
        continue;
      }
      const coords = `${xOf(point.step).toFixed(2)},${yOf(value).toFixed(2)}`;
      current += (current ? " L" : "M") + coords;
    }
    if (current) paths.push(current);
    return paths;
  };
  const baselinePaths = makePaths("baseline");
  const injectedPaths = showInjected ? makePaths("injected") : [];
  const yTicks = Array.from({ length: 5 }, (_, i) => yDomain[0] + (ySpan * i / 4));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%"
      preserveAspectRatio="none" role="img"
      aria-label={`Fixed telemetry plot showing baseline${showInjected ? " and injected" : ""} readings in ${unit || "sensor units"}`}>
      <rect x={0} y={0} width={width} height={height} fill="transparent" />
      <rect x="340" y="2" width="350" height="20" rx="5" fill="#243744" />
      <text x="350" y="16" fill="#e4eff7" fontSize="12">Chart mount #{mountId} · renders {renderCounter.current}</text>
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={left} y1={yOf(tick)} x2={width - right} y2={yOf(tick)}
            stroke="#34414d" strokeDasharray="4 6" strokeWidth={1} />
          <text x={left - 10} y={yOf(tick) + 4} fill="#9bacba" fontSize="13" textAnchor="end">
            {Math.abs(tick) < 0.0001 ? "0" : Number(tick.toPrecision(3)).toString()}
          </text>
        </g>
      ))}
      {[0, 120, 240, 360, 480, 600, 719].map(step => (
        <g key={step}>
          <line x1={xOf(step)} y1={height - bottom} x2={xOf(step)} y2={height - bottom + 6} stroke="#607180" />
          <text x={xOf(step)} y={height - 12} fill="#9bacba" fontSize="13" textAnchor="middle">{step}</text>
        </g>
      ))}
      <line x1={left} y1={top} x2={left} y2={height - bottom} stroke="#52616d" />
      <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="#52616d" />
      {injectionOnset !== null && (
        <line x1={xOf(injectionOnset)} y1={top} x2={xOf(injectionOnset)} y2={height - bottom}
          stroke="#d3a065" strokeDasharray="6 5" strokeWidth={1.5} />
      )}
      {baselinePaths.map((path, i) => (
        <path key={`base-${i}`} d={path} fill="none" stroke="#9ec7de" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      ))}
      {injectedPaths.map((path, i) => (
        <path key={`inj-${i}`} d={path} fill="none" stroke="#e5aa71" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
});

export default function OperationsConsole() {
  const mission = useMission();
  const [sensorId, setSensorId] = useState("battery_soc");
  const [series, setSeries] = useState<Point[]>([]);
  const [overlay, setOverlay] = useState<OverlayPoint[]>([]);

  const currentSensor = mission.sensors.find((item) => item.id === sensorId);
  const activeSensors = mission.sensors.filter((item) => item.subsystem === mission.selectedSystem);
  const experiment = mission.injection && mission.experiment?.applied && mission.experiment.step === mission.step && mission.experiment.scenario === mission.scenario && mission.experiment.sensor_id === mission.injection.sensorId && mission.experiment.kind === mission.injection.kind && mission.experiment.intensity === mission.injection.intensity && mission.experiment.onset === mission.injection.onset ? mission.experiment : null;
  const effectiveReadings: Record<string, number | null> = experiment?.readings ?? mission.frame?.readings ?? {};
  const effectiveStatuses = experiment?.statuses ?? mission.frame?.statuses ?? {};
  const alerts = experiment?.alerts.length ?? mission.frame?.alerts.length ?? 0;
  const flaggedSensorIds = Object.entries(effectiveStatuses)
    .filter(([, value]) => value !== "IN_REFERENCE_BAND")
    .map(([key]) => key);

  useEffect(() => {
    if (!mission.sensors.some((item) => item.id === sensorId) && mission.sensors.length) {
      setSensorId(mission.sensors[0].id);
    }
  }, [mission.sensors, sensorId]);

  useEffect(() => {
    const controller = new AbortController();
    readAPI<{ points: Point[] }>(`/api/sim/history/${sensorId}?scenario=${mission.scenario}&start=0&limit=720`, controller.signal)
      .then((payload) => setSeries(payload.points))
      .catch(() => undefined);
    return () => controller.abort();
  }, [sensorId, mission.scenario]);

  useEffect(() => {
    if (!mission.injection || mission.injection.sensorId !== sensorId) {
      setOverlay([]);
      return;
    }
    const controller = new AbortController();
    const input = mission.injection;
    const query = new URLSearchParams({
      scenario: mission.scenario, sensor_id: sensorId, kind: input.kind,
      intensity: String(input.intensity), onset: String(input.onset),
      start: "0", limit: "720",
    });
    readAPI<{ points: OverlayPoint[] }>(`/api/experiment/history?${query.toString()}`, controller.signal)
      .then((payload) => { if (!controller.signal.aborted) setOverlay(payload.points); })
      .catch(() => { if (!controller.signal.aborted) setOverlay([]); });
    return () => controller.abort();
  }, [mission.injection, mission.scenario, sensorId]);

  // Lock the plotted time window and vertical scale for each 120-step replay
  // block. Previously both axes changed at every tick, causing visual flicker.
  const windowStart = 0;
  const windowEnd = 719; // Full-run fixed axes and full-run fixed data.
  const injectedSeries = mission.injection?.sensorId === sensorId && overlay.length > 0;
  // Render an invariant dataset for the entire selected history. The replay
  // cursor is the ONLY chart element that changes on each clock tick.
  // Rebuilding the plotted lines each tick makes Recharts redraw paths and
  // looks like flickering even with animation disabled.
  const graph = useMemo(() => {
    if (injectedSeries) {
      return overlay.map(p => ({ ...p, injected: p.missing ? null : p.injected }));
    }
    return series.map(p => ({
      step: p.step, baseline: p.value,
      injected: null as number | null, missing: false,
    }));
  }, [series, overlay, injectedSeries]);

  const yDomain = useMemo<[number, number]>(() => {
    const source = injectedSeries ? overlay : series.map(p => ({ baseline: p.value, injected: null as number | null, step: p.step }));
    const values: number[] = [];
    for (const point of source) {
      if (point.step < windowStart || point.step > windowEnd) continue;
      if (Number.isFinite(point.baseline)) values.push(point.baseline);
      if (typeof point.injected === "number" && Number.isFinite(point.injected)) values.push(point.injected);
    }
    if (currentSensor) {
      values.push(currentSensor.low, currentSensor.high);
    }
    if (!values.length) return [0, 1];
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = Math.max((high - low) * 0.1, 0.001);
    return [low - padding, high + padding];
  }, [overlay, series, injectedSeries, windowStart, windowEnd, currentSensor?.id, currentSensor?.low, currentSensor?.high]);

  const maintenanceAdvice = mission.diagnosis?.potential_effects.slice(0, 3) ?? [];
  const shownValue = effectiveReadings[sensorId];
  const selectedMissing = shownValue === null || effectiveStatuses[sensorId] === "MISSING_SIGNAL";
  const selectedOutOfBand = !selectedMissing && effectiveStatuses[sensorId] === "OUTSIDE_REFERENCE_BAND";
  const isInjectedSelection = Boolean(experiment && experiment.sensor_id === sensorId);

  return (
    <main className="ops-page">
      <section className="page-title-row">
        <div>
          <p className="eyebrow">SPACECRAFT HEALTH INTELLIGENCE</p>
          <h1>Operations overview</h1>
          <p className="page-intro">Representative telemetry across eight spacecraft subsystems with scenario-driven replay and predictive maintenance context.</p>
        </div>
        <span className="panel-tag">SIMULATED TELEMETRY</span>
      </section>

      <section className="metric-grid metric-grid-4">
        <article className="metric-card"><span>Orbital lighting</span><strong>{mission.frame ? (mission.frame.eclipse ? "Eclipse" : "Sunlit") : "—"}</strong><small>Model environment</small></article>
        <article className="metric-card"><span>Battery state of charge</span><strong>{mission.diagnosis ? `${mission.diagnosis.metrics.battery_soc_pct.toFixed(2)}%` : "—"}</strong><small>EPS energy reserve</small></article>
        <article className="metric-card"><span>Power margin</span><strong>{mission.diagnosis ? `${mission.diagnosis.metrics.power_balance_w.toFixed(1)} W` : "—"}</strong><small>Generation − demand</small></article>
        <article className="metric-card"><span>Reference exceptions</span><strong>{alerts}</strong><small>{alerts ? "Requires operator review" : "All channels within band"}</small></article>
      </section>

      <section className="two-column-grid">
        <article className="panel-card">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">VEHICLE SYSTEMS</p>
              <h2>Subsystem inventory</h2>
            </div>
            <small>Select a subsystem to inspect its channels</small>
          </div>

          <div className="subsystem-grid">
            {SYSTEMS.map((system) => {
              const count = mission.sensors.filter((sensor) => sensor.subsystem === system && effectiveStatuses[sensor.id] !== "IN_REFERENCE_BAND").length;
              return (
                <button
                  key={system}
                  className={mission.selectedSystem === system ? "active" : ""}
                  onClick={() => {
                    mission.setSelectedSystem(system);
                    const firstSensor = mission.sensors.find((sensor) => sensor.subsystem === system);
                    if (firstSensor) setSensorId(firstSensor.id);
                  }}
                >
                  <strong>{system}</strong>
                  <span className={count ? "warn" : "ok"}>{count ? `${count} exception${count > 1 ? "s" : ""}` : "Within band"}</span>
                </button>
              );
            })}
          </div>

          <div className="mini-section-title">
            <h3>{mission.selectedSystem}</h3>
            <span>{activeSensors.length} channels</span>
          </div>

          <div className="sensor-list">
            {activeSensors.map((sensor) => (
              <button key={sensor.id} className={sensorId === sensor.id ? "active" : ""} onClick={() => setSensorId(sensor.id)}>
                <div>
                  <strong>{sensor.name}</strong>
                  <small>{sensor.location}</small>
                </div>
                <div className="sensor-reading">
                  <i className={effectiveStatuses[sensor.id] !== "IN_REFERENCE_BAND" ? "warn" : "ok"} />
                  <span>{formatReading(effectiveReadings[sensor.id], sensor.unit)}{experiment?.sensor_id === sensor.id && <small> (test)</small>}</span>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">SELECTED TELEMETRY</p>
              <h2>{currentSensor?.name || "Telemetry channel"}</h2>
            </div>
            <small>{currentSensor?.location} · {currentSensor?.subsystem}</small>
          </div>

          <div className="metric-grid metric-grid-3 inner-metrics">
            <article className="metric-card inner"><span>Current reading</span><strong>{formatReading(shownValue, currentSensor?.unit || "")}</strong>{isInjectedSelection && <small>Experimental overlay · baseline {formatReading(experiment!.baseline_value, currentSensor?.unit || "")}</small>}</article>
            <article className="metric-card inner"><span>Reference band</span><strong>{currentSensor ? `${currentSensor.low} to ${currentSensor.high}` : "—"}</strong></article>
            <article className="metric-card inner"><span>Status</span><strong className={selectedMissing || selectedOutOfBand ? "text-warn" : "text-ok"}>{selectedMissing ? "Missing signal" : selectedOutOfBand ? "Outside band" : "Within band"}</strong></article>
          </div>

          <div className="chart-shell" style={{ position: "relative", height: 360, minHeight: 360, overflow: "hidden", contain: "layout paint" }}>
            <FixedTelemetryPlot
              graph={graph}
              yDomain={yDomain}
              unit={currentSensor?.unit || ""}
              showInjected={Boolean(mission.injection?.sensorId === sensorId)}
              injectionOnset={mission.injection?.sensorId === sensorId ? mission.injection.onset : null}
            />
            {/* Lightweight replay cursor: kept OUTSIDE Recharts to prevent
                redrawing chart paths on every simulation step. */}
            <div aria-hidden="true" style={{
              position: "absolute", top: "5.56%", bottom: "11.11%",
              left: `${7 + (Math.max(0, Math.min(719, mission.step)) / 719) * 91.2}%`,
              borderLeft: "1px dashed #e5aa71", pointerEvents: "none",
              opacity: 0.9, transition: "none",
            }} />
          </div>
          <p className="sub-copy">Full 720-step history is shown for visual stability; the moving vertical line indicates the current replay step. Future samples are displayed for diagnostic review, not as data already observed by the live mission.</p>
          {isInjectedSelection && <p className="sub-copy">Experimental reading at step {mission.step}: <strong>{formatReading(experiment!.modified_value, currentSensor?.unit || "")}</strong>. The chart compares original and time-dependent injected telemetry. Other sensors and physical spacecraft dynamics remain unchanged.</p>}

          <div className="context-note">
            <ShieldCheck size={16} />
            <div>
              <strong>Engineering interpretation</strong>
              <p>{currentSensor?.description || "Select a telemetry channel to view its context."} {sensorId==="battery_soc"&&mission.diagnosis?`Battery charge is ${mission.diagnosis.metrics.battery_soc_pct.toFixed(1)}%; its five-minute trend is ${mission.diagnosis.metrics.battery_soc_rate_pp_per_hour.toFixed(1)} percentage points per hour, with a ${mission.diagnosis.metrics.power_balance_w.toFixed(1)} W power balance. Interpret the trend against the nominal case and current eclipse/sunlit conditions.`:"Interpret this parameter alongside related subsystem telemetry and mission phase."} {isInjectedSelection?`The test substitutes ${(experiment!.modified_value === null ? "Missing signal" : experiment!.modified_value.toFixed(2))} ${currentSensor?.unit||""} for the baseline ${experiment!.baseline_value.toFixed(2)} ${currentSensor?.unit||""}. Other simulated components are not recalculated.`:""}</p>
            </div>
          </div>
        </article>
      </section>

      <SensorFaultWorkbench />
      <section className="two-column-grid bottom-gap">
        <article className="panel-card">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">SCENARIO ASSESSMENT</p>
              <h2>{mission.diagnosis?.scenario_name || "Awaiting diagnosis"}</h2>
            </div>
            <span className="severity-chip">{mission.diagnosis?.severity?.replace(/_/g, " ") || "PENDING"}</span>
          </div>
          <p className="lead-copy">{mission.diagnosis?.assessment || "Diagnostic engine assessment will appear here when the simulation backend is running."}</p>
          <div className="metric-grid metric-grid-2 inner-metrics">
            <article className="metric-card inner"><span>Primary source component</span><strong>{mission.diagnosis?.source_component || "—"}</strong></article>
            <article className="metric-card inner"><span>Observed trend sensor</span><strong>{mission.diagnosis?.trend_sensor || "—"}</strong></article>
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">PREDICTIVE MAINTENANCE</p>
              <h2>Likely downstream consequences</h2>
            </div>
            <Wrench size={16} />
          </div>

          <div className="path-flow">
            {(mission.diagnosis?.propagation_path || []).map((node, index, array) => (
              <span key={`${node}-${index}`}>{node}{index < array.length - 1 && <em>→</em>}</span>
            ))}
          </div>

          <ul className="simple-list">
            {maintenanceAdvice.map((item, index) => <li key={index}>{item}</li>)}
            {!maintenanceAdvice.length && <li>No modeled downstream impact available.</li>}
          </ul>

          <div className="context-note warning-note">
            <TriangleAlert size={16} />
            <div>
              <strong>Flagged sensors right now: {flaggedSensorIds.length}</strong>
              <p>{flaggedSensorIds.length ? "Use Diagnostics and Vehicle Twin to trace how a local telemetry exception could propagate to adjacent systems." : "No current sensor exceptions. The maintenance predictor will become more informative once a subsystem starts deviating from its reference band."}</p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
