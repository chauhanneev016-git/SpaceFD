
import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  ChevronRight,
  Clock3,
  Cpu,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Satellite,
  ShieldCheck,
  Waves,
  Zap
} from "lucide-react";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const API = "http://127.0.0.1:8001";
const MAX_STEP = 719;
const FAULT_START = 270;

type Sensor = {
  id: string;
  name: string;
  subsystem: string;
  unit: string;
  low: number;
  high: number;
  location: string;
  description: string;
  source: string;
};

type Scenario = {
  id: string;
  name: string;
};

type Frame = {
  step: number;
  elapsed_seconds: number;
  scenario: string;
  mode: string;
  eclipse: boolean;
  readings: Record<string, number>;
  statuses: Record<string, string>;
  alerts: string[];
};

type HistoryPoint = {
  step: number;
  elapsed_seconds: number;
  value: number;
  status: string;
};

const subsystemNames: Record<string, string> = {
  ADCS: "Attitude Determination & Control",
  EPS: "Electrical Power",
  THERMAL: "Thermal Control",
  PROPULSION: "Propulsion",
  COMMS: "Communications",
  OBC: "Onboard Computer",
  NAVIGATION: "Navigation",
  STRUCTURE: "Structures & Mechanisms"
};

const subsystemOrder = [
  "ADCS",
  "EPS",
  "THERMAL",
  "PROPULSION",
  "COMMS",
  "OBC",
  "NAVIGATION",
  "STRUCTURE"
];

const impactInfo: Record<string, string[]> = {
  ADCS: [
    "Attitude estimation may degrade",
    "Antenna or solar-array pointing may be affected"
  ],
  EPS: [
    "Reduced electrical power margin",
    "Possible load shedding or battery depletion"
  ],
  THERMAL: [
    "Component temperature may move outside operating limits",
    "Payload availability could be affected"
  ],
  PROPULSION: [
    "Maneuver performance may be affected",
    "Review tank, valve and thrust measurements"
  ],
  COMMS: [
    "Reduced link reliability",
    "Possible telemetry packet loss"
  ],
  OBC: [
    "Reduced processing or data-handling availability",
    "Potential mission task interruptions"
  ],
  NAVIGATION: [
    "Reduced position or velocity estimate quality",
    "Potential pointing or maneuver-planning impact"
  ],
  STRUCTURE: [
    "Mechanism or deployment status needs verification",
    "Potential disturbance to attached assemblies"
  ]
};

async function apiGet<T>(
  path: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`${API}${path}`, { signal });

  if (!response.ok) {
    throw new Error(
      `Simulator API returned ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}

function formatValue(value: number, unit: string) {
  if (!Number.isFinite(value)) return "—";

  if (unit === "bool" || unit === "count") {
    return value.toFixed(0);
  }

  if (unit === "ratio") {
    return value.toExponential(2);
  }

  if (Math.abs(value) < 0.01 && value !== 0) {
    return value.toExponential(2);
  }

  if (Math.abs(value) >= 100) {
    return value.toFixed(1);
  }

  return value.toFixed(3);
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return [hours, minutes, secs]
    .map((x) => String(x).padStart(2, "0"))
    .join(":");
}

export default function SimulationMissionControl() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState("nominal");
  const [selectedId, setSelectedId] = useState("battery_soc");

  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);

  const [frame, setFrame] = useState<Frame | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      apiGet<{ sensors: Sensor[] }>("/api/sim/sensors"),
      apiGet<{ scenarios: Scenario[] }>("/api/sim/scenarios")
    ])
      .then(([sensorResult, scenarioResult]) => {
        if (!active) return;
        setSensors(sensorResult.sensors);
        setScenarios(scenarioResult.scenarios);
        setOnline(true);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setOnline(false);
        setError(String(err));
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    apiGet<Frame>(
      `/api/sim/frame?step=${step}&scenario=${scenario}`,
      controller.signal
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setFrame(data);
        setOnline(true);
        setError("");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setOnline(false);
        setError(String(err));
      });

    return () => controller.abort();
  }, [step, scenario]);

  useEffect(() => {
    const controller = new AbortController();

    apiGet<{ points: HistoryPoint[] }>(
      `/api/sim/history/${selectedId}?scenario=${scenario}&start=0&limit=720`,
      controller.signal
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setHistory(data.points);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(String(err));
        }
      });

    return () => controller.abort();
  }, [selectedId, scenario]);

  useEffect(() => {
    if (!playing) return;

    const timer = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, MAX_STEP));
    }, 900 / speed);

    return () => window.clearInterval(timer);
  }, [playing, speed]);

  useEffect(() => {
    if (step >= MAX_STEP) {
      setPlaying(false);
    }
  }, [step]);

  const selected = useMemo(
    () => sensors.find((sensor) => sensor.id === selectedId),
    [sensors, selectedId]
  );

  const grouped = useMemo(() => {
    return subsystemOrder.map((subsystem) => ({
      subsystem,
      sensors: sensors.filter(
        (sensor) => sensor.subsystem === subsystem
      )
    }));
  }, [sensors]);

  const visibleHistory = useMemo(() => {
    return history.filter(
      (point) =>
        point.step >= Math.max(0, step - 90) &&
        point.step <= Math.min(MAX_STEP, step + 8)
    );
  }, [history, step]);

  const statusCount = frame
    ? frame.alerts.length
    : 0;

  const selectedValue =
    frame && selected
      ? frame.readings[selected.id]
      : null;

  const selectedAlert =
    frame && selected
      ? frame.statuses[selected.id] !== "IN_REFERENCE_BAND"
      : false;

  const subsystemAlerts = (subsystem: string) => {
    if (!frame) return 0;

    return sensors.filter(
      (sensor) =>
        sensor.subsystem === subsystem &&
        frame.statuses[sensor.id] === "OUTSIDE_REFERENCE_BAND"
    ).length;
  };

  function changeScenario(value: string) {
    setPlaying(false);
    setScenario(value);
    setStep(0);
    setHistory([]);
  }

  function resetReplay() {
    setPlaying(false);
    setStep(0);
  }

  const selectedScenario =
    scenarios.find((s) => s.id === scenario)?.name ?? scenario;

  return (
    <div className="mc">
      <header className="mc-header">
        <div className="mc-header-left">
          <div className="mc-logo">
            <Satellite size={25} />
          </div>
          <div>
            <span className="mc-kicker">
              SPACEFD / SPACECRAFT HEALTH MANAGEMENT
            </span>
            <h1>Mission Simulation Control</h1>
          </div>
        </div>

        <div className="mc-header-right">
          <span className="mc-source">
            SYNTHETIC TELEMETRY
          </span>
          <span className={online ? "mc-online" : "mc-offline"}>
            <span className="mc-status-dot" />
            {online ? "SIMULATOR CONNECTED" : "SIMULATOR OFFLINE"}
          </span>
        </div>
      </header>

      {error && (
        <div className="mc-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <section className="mc-stat-row">
        <div className="mc-stat">
          <span>OPERATING MODE</span>
          <strong>{frame?.eclipse ? "ECLIPSE" : "SUNLIT / ACTIVE"}</strong>
          <small>Simulated orbital conditions</small>
        </div>
        <div className="mc-stat">
          <span>TELEMETRY PARAMETERS</span>
          <strong>{sensors.length || "—"}</strong>
          <small>Across 8 subsystem groups</small>
        </div>
        <div className="mc-stat">
          <span>REFERENCE BAND EXCEPTIONS</span>
          <strong className={statusCount ? "mc-amber" : "mc-green"}>
            {frame ? statusCount : "—"}
          </strong>
          <small>Not confirmed hardware failures</small>
        </div>
        <div className="mc-stat">
          <span>SIMULATED MISSION TIME</span>
          <strong>{formatTime(frame?.elapsed_seconds ?? step * 10)}</strong>
          <small>10 seconds per telemetry frame</small>
        </div>
      </section>

      <section className="mc-control">
        <div className="mc-control-heading">
          <div>
            <span className="mc-kicker">MISSION PLAYBACK</span>
            <h2>Scenario & Timeline Controls</h2>
          </div>
          <span className="mc-muted">{selectedScenario}</span>
        </div>

        <div className="mc-controls-grid">
          <label className="mc-field">
            Operating scenario
            <select
              value={scenario}
              onChange={(e) => changeScenario(e.target.value)}
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <div className="mc-playback-buttons">
            <button
              className="mc-primary"
              onClick={() => {
                if (step >= MAX_STEP) setStep(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
              {playing ? "Pause" : "Play"}
            </button>

            <button onClick={resetReplay}>
              <RotateCcw size={16} /> Reset
            </button>

            <button
              onClick={() => {
                setPlaying(false);
                setStep(FAULT_START);
              }}
              title="Jump to the scenario's fault onset"
            >
              <Zap size={16} /> Fault onset
            </button>
          </div>

          <label className="mc-field">
            Replay speed
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={5}>5×</option>
            </select>
          </label>
        </div>

        <div className="mc-timeline">
          <input
            type="range"
            min={0}
            max={MAX_STEP}
            value={step}
            onChange={(e) => {
              setPlaying(false);
              setStep(Number(e.target.value));
            }}
          />
          <div>
            <span>00:00:00</span>
            <span>STEP {step} / {MAX_STEP}</span>
            <span>01:59:50</span>
          </div>
        </div>
      </section>

      <div className="mc-main-grid">
        <section className="mc-panel mc-inventory">
          <div className="mc-panel-heading">
            <div>
              <span className="mc-kicker">VEHICLE SYSTEMS</span>
              <h2>Subsystem Health Inventory</h2>
            </div>
            <Gauge size={19} />
          </div>

          <div className="mc-subsystems">
            {grouped.map((group) => {
              const count = subsystemAlerts(group.subsystem);

              return (
                <div className="mc-subsystem" key={group.subsystem}>
                  <div className="mc-subsystem-heading">
                    <div>
                      <strong>{group.subsystem}</strong>
                      <small>
                        {subsystemNames[group.subsystem]}
                      </small>
                    </div>
                    <span className={
                      count ? "mc-count-alert" : "mc-count-ok"
                    }>
                      {count ? `${count} OUT` : "WITHIN"}
                    </span>
                  </div>

                  <div className="mc-sensor-list">
                    {group.sensors.map((sensor) => {
                      const value = frame?.readings[sensor.id];
                      const outside = frame?.statuses[sensor.id] ===
                        "OUTSIDE_REFERENCE_BAND";

                      return (
                        <button
                          className={
                            "mc-sensor " +
                            (selectedId === sensor.id ? "active " : "") +
                            (outside ? "out" : "")
                          }
                          key={sensor.id}
                          onClick={() => setSelectedId(sensor.id)}
                        >
                          <span className="mc-sensor-name">
                            <span className={
                              outside ? "mc-led amber" : "mc-led"
                            } />
                            {sensor.name}
                          </span>
                          <span className="mc-sensor-reading">
                            {value === undefined
                              ? "—"
                              : formatValue(value, sensor.unit)}
                            <small>{sensor.unit === "bool" ? "" : sensor.unit}</small>
                            <ChevronRight size={13} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="mc-details">
          <section className="mc-panel">
            <div className="mc-panel-heading">
              <div>
                <span className="mc-kicker">SELECTED TELEMETRY</span>
                <h2>{selected?.name ?? "Select a Sensor"}</h2>
              </div>
              <Activity size={19} />
            </div>

            <div className="mc-selected-grid">
              <div>
                <span>CURRENT READING</span>
                <strong>
                  {selectedValue === null || !selected
                    ? "—"
                    : formatValue(selectedValue, selected.unit)}
                </strong>
                <small>{selected?.unit}</small>
              </div>
              <div>
                <span>REFERENCE BAND</span>
                <strong className="mc-small-value">
                  {selected
                    ? `${selected.low} to ${selected.high}`
                    : "—"}
                </strong>
                <small>{selected?.unit}</small>
              </div>
              <div>
                <span>STATUS</span>
                <strong className={
                  selectedAlert ? "mc-amber" : "mc-green"
                }>
                  {selectedAlert ? "OUTSIDE BAND" : "WITHIN BAND"}
                </strong>
                <small>Assumed simulation limits</small>
              </div>
            </div>

            <div className="mc-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={visibleHistory}
                  margin={{ top: 15, right: 25, left: 15, bottom: 5 }}
                >
                  <CartesianGrid
                    stroke="#273a50"
                    strokeDasharray="3 5"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="step"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    stroke="#8da5be"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    width={76}
                    stroke="#8da5be"
                    tick={{ fontSize: 10 }}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => Number(v).toPrecision(3)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#14273a",
                      border: "1px solid #35506b",
                      borderRadius: 9,
                      color: "#f0f5ff"
                    }}
                    formatter={(v) => [
                      Number(v).toPrecision(6),
                      selected?.unit ?? "Value"
                    ]}
                  />
                  <Legend />
                  {selected && selected.low < selected.high && (
                    <ReferenceArea
                      y1={selected.low}
                      y2={selected.high}
                      fill="#1b997e"
                      fillOpacity={0.07}
                    />
                  )}
                  <ReferenceLine
                    x={step}
                    stroke="#f9ba62"
                    strokeDasharray="4 4"
                  />
                  <Line
                    dataKey="value"
                    name="Simulated reading"
                    stroke="#42c7f5"
                    strokeWidth={2.3}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mc-sensor-info">
              <div>
                <span>LOCATION</span>
                <strong>{selected?.location ?? "—"}</strong>
              </div>
              <div>
                <span>SUBSYSTEM</span>
                <strong>{selected?.subsystem ?? "—"}</strong>
              </div>
              <div>
                <span>SOURCE</span>
                <strong>SIMULATED</strong>
              </div>
            </div>
            <p className="mc-description">{selected?.description}</p>
          </section>

          <section className="mc-panel">
            <div className="mc-panel-heading">
              <div>
                <span className="mc-kicker">VEHICLE DIGITAL TWIN</span>
                <h2>Subsystem Location Overview</h2>
              </div>
              <Satellite size={19} />
            </div>

            <div className="mc-twin-layout">
              <div className="mc-spacecraft-diagram">
                <div className="mc-wing left-wing">SOLAR ARRAY A</div>
                <div className="mc-bus">
                  <div className="mc-bus-title">SPACECRAFT BUS</div>
                  <div className="mc-bus-grid">
                    {["ADCS", "EPS", "OBC", "THERMAL"].map((id) => (
                      <div
                        key={id}
                        className={
                          "mc-module " +
                          (selected?.subsystem === id ? "highlight" : "")
                        }
                      >
                        {id}
                      </div>
                    ))}
                  </div>
                  <div className="mc-bus-footer">
                    <span>PROPULSION</span>
                    <span>COMMS</span>
                  </div>
                </div>
                <div className="mc-wing right-wing">SOLAR ARRAY B</div>
              </div>

              <div className="mc-impact">
                <span className="mc-kicker">FUNCTIONAL IMPACT ADVISORY</span>
                <h3>{selected?.subsystem ?? "Subsystem"}</h3>
                <p>
                  The schematic is representative. It does not show
                  verified flight-hardware positions.
                </p>
                {(
                  impactInfo[selected?.subsystem ?? ""] ?? []
                ).map((item) => (
                  <div className="mc-impact-item" key={item}>
                    <AlertTriangle size={14} />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mc-panel">
            <div className="mc-panel-heading">
              <div>
                <span className="mc-kicker">SYSTEM ENGINEERING</span>
                <h2>Mission Simulation Notes</h2>
              </div>
              <ShieldCheck size={19} />
            </div>

            <div className="mc-notes">
              <div>
                <BatteryCharging size={17} />
                Solar generation and electrical demand influence
                battery state of charge.
              </div>
              <div>
                <Waves size={17} />
                Communication signal strength influences link margin
                and packet-loss estimates.
              </div>
              <div>
                <Cpu size={17} />
                Temperature and processor loading follow simplified
                simulation relationships.
              </div>
              <div>
                <Clock3 size={17} />
                Replay does not represent an active satellite connection.
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer className="mc-footer">
        SPACEFD • EDUCATIONAL SPACECRAFT DIGITAL TWIN
        <span>
          GENERATED TELEMETRY / NOT FLIGHT-QUALIFIED
        </span>
      </footer>
    </div>
  );
}
