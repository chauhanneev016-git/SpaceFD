import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const SCENARIOS = [
  { id: "nominal", name: "Nominal operations", system: "EPS" },
  { id: "solar_degradation", name: "Solar array degradation", system: "EPS" },
  { id: "battery_heating", name: "Battery thermal excursion", system: "EPS" },
  { id: "comms_fade", name: "Communications link fade", system: "COMMS" },
  { id: "wheel_fault", name: "Reaction-wheel excursion", system: "ADCS" },
  { id: "thermal_failure", name: "Thermal control degradation", system: "THERMAL" },
] as const;

export type Sensor = {
  id: string;
  name: string;
  subsystem: string;
  unit: string;
  location: string;
  low: number;
  high: number;
  description: string;
};

export type Frame = {
  step: number;
  elapsed_seconds: number;
  scenario: string;
  eclipse: boolean;
  readings: Record<string, number | null>;
  statuses: Record<string, string>;
  alerts: string[];
};

export type EvidenceRow = {
  sensor_id: string;
  scenario_value: number;
  nominal_value: number;
  delta: number;
};

export type TrendPoint = {
  step: number;
  scenario: number;
  nominal: number;
  eclipse: boolean;
};

export type Diagnosis = {
  scenario: string;
  step: number;
  scenario_name: string;
  severity: string;
  assessment: string;
  observation: string;
  source_component: string;
  propagation_path: string[];
  potential_effects: string[];
  operator_checks: string[];
  trend_sensor: string;
  trend: TrendPoint[];
  evidence: EvidenceRow[];
  fault_onset_step: number;
  disclaimer: string;
  metrics: {
    power_balance_w: number;
    power_balance_delta_w: number;
    battery_soc_pct: number;
    battery_soc_delta_pp: number;
    cumulative_solar_energy_delta_wh: number;
    battery_soc_rate_pp_per_hour: number;
    projected_hours_to_20pct: number | null;
    eclipse: boolean;
    sunlit_samples_since_onset?: number;
  };
};

const API = "http://127.0.0.1:8001";

export async function readAPI<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API}${path}`, { signal });
  if (!response.ok) throw new Error(`Simulator returned HTTP ${response.status}`);
  return await response.json() as T;
}

export function displayTime(step: number) {
  const total = step * 10;
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export type Injection = {
  sensorId: string;
  kind: "bias" | "drift" | "spike" | "stuck" | "dropout";
  intensity: number;
  onset: number;
};

export type Experiment = {
  step: number;
  scenario: string;
  sensor_id: string;
  sensor_name: string;
  kind: Injection["kind"];
  intensity: number;
  onset: number;
  applied: boolean;
  fault_active?: boolean;
  missing_signal?: boolean;
  baseline_value: number;
  modified_value: number | null;
  unit: string;
  outside_reference: boolean;
  source_system: string;
  potentially_affected_systems: string[];
  readings: Record<string, number | null>;
  statuses: Record<string, string>;
  alerts: string[];
  disclaimer: string;
};

type Store = {
  scenario: string;
  setScenario: (scenario: string) => void;
  step: number;
  setStep: (step: number) => void;
  playing: boolean;
  setPlaying: (value: boolean) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  selectedSystem: string;
  setSelectedSystem: (system: string) => void;
  sensors: Sensor[];
  injection: Injection | null;
  setInjection: (value: Injection | null) => void;
  experiment: Experiment | null;
  frame: Frame | null;
  diagnosis: Diagnosis | null;
  error: string;
  connected: boolean;
};

const Context = createContext<Store | null>(null);

export function MissionProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenarioValue] = useState("solar_degradation");
  const [step, setStepValue] = useState(560);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedSystem, setSelectedSystem] = useState("EPS");
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [injection, setInjection] = useState<Injection | null>(null);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  const setStep = (value: number) => setStepValue(Math.max(0, Math.min(719, Math.round(value))));
  const setScenario = (value: string) => {
    setScenarioValue(value);
    setInjection(null); // Experiments are scoped to their original scenario.
    setPlaying(false);
    setStepValue(0);
    setSelectedSystem(SCENARIOS.find((item) => item.id === value)?.system || "EPS");
  };

  useEffect(() => {
    const controller = new AbortController();
    readAPI<{ sensors: Sensor[] }>("/api/sim/sensors", controller.signal)
      .then((payload) => setSensors(payload.sensors))
      .catch((err) => {
        if (!controller.signal.aborted) setError(String(err));
      });
    return () => controller.abort();
  }, []);

  // Commit the baseline, diagnostics and optional experiment in one React update.
  // Clearing the experiment on every tick caused the UI to alternate between
  // baseline and injected values while the next HTTP request was pending.
  useEffect(() => {
    const controller = new AbortController();
    const frameRequest = readAPI<Frame>(
      `/api/sim/frame?scenario=${scenario}&step=${step}`, controller.signal
    );
    const diagnosisRequest = readAPI<Diagnosis>(
      `/api/diagnosis/analyze?scenario=${scenario}&step=${step}`, controller.signal
    );
    let experimentRequest: Promise<Experiment | null> = Promise.resolve(null);
    if (injection) {
      const query = new URLSearchParams({
        scenario, step: String(step), sensor_id: injection.sensorId,
        kind: injection.kind, intensity: String(injection.intensity),
        onset: String(injection.onset),
      });
      experimentRequest = readAPI<Experiment>(
        `/api/experiment/inject?${query.toString()}`, controller.signal
      );
    }
    Promise.all([frameRequest, diagnosisRequest, experimentRequest])
      .then(([frameData, diagnosisData, experimentData]) => {
        if (controller.signal.aborted) return;
        setFrame(frameData);
        setDiagnosis(diagnosisData);
        setExperiment(experimentData);
        setConnected(true);
        setError("");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setConnected(false);
        setError(String(err));
      });
    return () => controller.abort();
  }, [scenario, step, injection]);

  useEffect(() => {
    if (!playing) return;
    const handle = window.setInterval(() => {
      setStepValue((current) => Math.min(719, current + 1));
    }, Math.max(90, 650 / speed));
    return () => window.clearInterval(handle);
  }, [playing, speed]);

  useEffect(() => {
    if (step >= 719) setPlaying(false);
  }, [step]);

  const store: Store = {
    scenario,
    setScenario,
    step,
    setStep,
    playing,
    setPlaying,
    speed,
    setSpeed,
    selectedSystem,
    setSelectedSystem,
    sensors,
    injection,
    setInjection,
    experiment,
    frame,
    diagnosis,
    error,
    connected,
  };

  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useMission() {
  const value = useContext(Context);
  if (!value) throw new Error("MissionProvider required");
  return value;
}
