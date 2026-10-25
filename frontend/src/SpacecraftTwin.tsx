import { useMemo, useState } from "react";
import { AlertTriangle, Focus, RotateCcw, Wrench } from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { useMission, type Sensor } from "./MissionState";

const SYSTEMS = ["ADCS", "EPS", "THERMAL", "PROPULSION", "COMMS", "OBC", "NAVIGATION", "STRUCTURE"];
const POSITIONS: Record<string, [number, number, number]> = {
  ADCS: [-0.42, 0.46, 0.92],
  EPS: [0.48, -0.33, 0.92],
  THERMAL: [0.54, 0.36, 0.92],
  PROPULSION: [0, -1.18, 0],
  COMMS: [0, 1.54, 0],
  OBC: [-0.52, -0.36, 0.92],
  NAVIGATION: [-0.96, 0.02, 0.78],
  STRUCTURE: [0.98, 0.02, 0.72],
};

function Marker({
  system,
  selected,
  impacted,
  scenario,
  onSelect,
}: {
  system: string;
  selected: boolean;
  impacted: boolean;
  scenario: boolean;
  onSelect: (system: string) => void;
}) {
  const position = POSITIONS[system];
  const color = selected ? "#d6e6ef" : scenario ? "#d9a15f" : impacted ? "#9bc2d5" : "#76808a";
  return (
    <group position={position}>
      <mesh onClick={(event) => { event.stopPropagation(); onSelect(system); }}>
        <sphereGeometry args={[selected ? 0.11 : 0.09, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.5 : 0.18} />
      </mesh>
      {selected && (
        <Text position={[0, 0.18, 0]} fontSize={0.11} color="#dfeaf2" outlineColor="#0b141c" outlineWidth={0.01} anchorX="center">
          {system}
        </Text>
      )}
    </group>
  );
}

function SatelliteModel({
  selected,
  impactedSystems,
  scenarioSystems,
  onSelect,
}: {
  selected: string;
  impactedSystems: string[];
  scenarioSystems: string[];
  onSelect: (system: string) => void;
}) {
  const busColor = "#6d737a";

  const componentColor = (system: string) => {
    if (selected === system) return "#cfd8de";
    if (scenarioSystems.includes(system)) return "#b58a54";
    if (impactedSystems.includes(system)) return "#84aabf";
    return "#464d54";
  };

  return (
    <group rotation={[0.08, -0.12, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.05, 1.8, 1.58]} />
        <meshStandardMaterial color={busColor} metalness={0.65} roughness={0.42} />
      </mesh>

      <mesh position={[0, 0, 0.83]}>
        <boxGeometry args={[1.88, 1.65, 0.06]} />
        <meshStandardMaterial color="#3f454b" metalness={0.75} roughness={0.38} />
      </mesh>

      <mesh position={[-0.5, 0.42, 0.91]} onClick={() => onSelect("ADCS")}>
        <cylinderGeometry args={[0.23, 0.23, 0.14, 24]} />
        <meshStandardMaterial color={componentColor("ADCS")} metalness={0.75} roughness={0.35} />
      </mesh>
      <mesh position={[0.5, -0.42, 0.91]} onClick={() => onSelect("EPS")}>
        <boxGeometry args={[0.62, 0.36, 0.13]} />
        <meshStandardMaterial color={componentColor("EPS")} metalness={0.7} roughness={0.36} />
      </mesh>
      <mesh position={[0.52, 0.42, 0.91]} onClick={() => onSelect("THERMAL")}>
        <boxGeometry args={[0.56, 0.44, 0.1]} />
        <meshStandardMaterial color={componentColor("THERMAL")} metalness={0.7} roughness={0.34} />
      </mesh>
      <mesh position={[-0.52, -0.42, 0.91]} onClick={() => onSelect("OBC")}>
        <boxGeometry args={[0.54, 0.39, 0.12]} />
        <meshStandardMaterial color={componentColor("OBC")} metalness={0.7} roughness={0.36} />
      </mesh>

      {[-1, 1].map((side) => (
        <group key={side} position={[side * 2.3, 0, 0]}>
          <mesh onClick={() => onSelect("EPS")}>
            <boxGeometry args={[2.55, 1.45, 0.07]} />
            <meshStandardMaterial color="#16253a" metalness={0.52} roughness={0.42} />
          </mesh>
          {[-0.85, -0.28, 0.28, 0.85].map((x) => [-0.44, 0, 0.44].map((y) => (
            <mesh key={`${side}-${x}-${y}`} position={[x, y, 0.05]} onClick={() => onSelect("EPS")}>
              <boxGeometry args={[0.48, 0.38, 0.012]} />
              <meshStandardMaterial color="#214f8a" metalness={0.35} roughness={0.3} />
            </mesh>
          )))}
          <mesh position={[-side * 1.25, 0, 0]}>
            <boxGeometry args={[0.25, 0.36, 0.28]} />
            <meshStandardMaterial color="#8a8f95" metalness={0.78} roughness={0.28} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 1.18, 0]} onClick={() => onSelect("COMMS")}>
        <cylinderGeometry args={[0.06, 0.06, 0.48, 16]} />
        <meshStandardMaterial color="#b3b8bd" metalness={0.7} />
      </mesh>
      <mesh position={[0, 1.52, 0]} rotation={[Math.PI / 2, 0, 0]} onClick={() => onSelect("COMMS")}>
        <sphereGeometry args={[0.62, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2.1]} />
        <meshStandardMaterial color="#bfc5ca" side={2} metalness={0.78} roughness={0.3} />
      </mesh>

      <mesh position={[0, -1.08, 0]} onClick={() => onSelect("PROPULSION")}>
        <cylinderGeometry args={[0.28, 0.42, 0.42, 24]} />
        <meshStandardMaterial color={componentColor("PROPULSION")} metalness={0.88} roughness={0.28} />
      </mesh>
      {[-0.62, 0.62].map((x) => (
        <mesh key={x} position={[x, -1.0, 0]} onClick={() => onSelect("PROPULSION")}>
          <coneGeometry args={[0.15, 0.34, 18]} />
          <meshStandardMaterial color="#a3a9af" metalness={0.84} roughness={0.24} />
        </mesh>
      ))}

      {SYSTEMS.map((system) => (
        <Marker
          key={system}
          system={system}
          selected={selected === system}
          impacted={impactedSystems.includes(system)}
          scenario={scenarioSystems.includes(system)}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

function severityLabel(count: number) {
  if (count >= 4) return "High";
  if (count >= 2) return "Moderate";
  if (count >= 1) return "Low";
  return "Normal";
}

export default function SpacecraftTwin() {
  const mission = useMission();
  const [selectedSystem, setSelectedSystem] = useState(mission.selectedSystem || "EPS");
  const [selectedSensor,setSelectedSensor] = useState("");

  const experiment = mission.injection && mission.experiment?.applied && mission.experiment.step === mission.step && mission.experiment.scenario === mission.scenario && mission.experiment.sensor_id === mission.injection.sensorId && mission.experiment.kind === mission.injection.kind && mission.experiment.intensity === mission.injection.intensity && mission.experiment.onset === mission.injection.onset ? mission.experiment : null;
  const effectiveReadings = experiment?.readings ?? mission.frame?.readings ?? {};
  const effectiveStatuses = experiment?.statuses ?? mission.frame?.statuses ?? {};
  const systemSensors = useMemo(() => mission.sensors.filter((sensor) => sensor.subsystem === selectedSystem), [mission.sensors, selectedSystem]);
  const flaggedSensors = useMemo(() => {
    if (!mission.frame) return [] as Sensor[];
    return mission.sensors.filter((sensor) => effectiveStatuses[sensor.id] === "OUTSIDE_REFERENCE_BAND");
  }, [mission.sensors, mission.frame, experiment]);

  const scenarioSystems = useMemo(() => {
    const map:Record<string,string>={solar_degradation:"EPS",battery_heating:"EPS",comms_fade:"COMMS",wheel_fault:"ADCS",thermal_failure:"THERMAL"};
    return map[mission.scenario]?[map[mission.scenario]]:[];
  }, [mission.scenario]);

  const impactedSystems = useMemo(() => {
    const systems = new Set<string>(mission.diagnosis?.propagation_path || []);
    flaggedSensors.forEach((sensor) => systems.add(sensor.subsystem));
    experiment?.potentially_affected_systems.forEach(s=>systems.add(s));
    return Array.from(systems);
  }, [mission.diagnosis, flaggedSensors, experiment]);

  const currentSeverity = severityLabel(flaggedSensors.filter((sensor) => sensor.subsystem === selectedSystem).length);
  const selectedReadingCount = systemSensors.filter((sensor) => effectiveStatuses[sensor.id] === "OUTSIDE_REFERENCE_BAND").length;

  return (
    <main className="twin-page">
      <section className="page-title-row twin-title-row">
        <div>
          <p className="eyebrow">VEHICLE OPERATIONS / DIGITAL TWIN</p>
          <h1>Spacecraft systems</h1>
          <p className="page-intro">Interactive subsystem inspection with scenario-linked predictive maintenance overlays and impact tracing.</p>
        </div>
        <div className="twin-heading-status">
          <span className="twin-pulse" />
          <span>SIMULATED TELEMETRY</span>
          <span className="twin-mode">NOT FLIGHT DATA</span>
        </div>
      </section>

      <div className="mission-context-banner">Mission time {mission.step}/719 · {mission.scenario.replace(/_/g, " ")} · shared across Operations, Vehicle Twin and Diagnostics</div>

      <section className="twin-grid">
        <article className="twin-viewport">
          <div className="twin-panel-top">
            <div>
              <p className="twin-eyebrow">SPACECRAFT / REPRESENTATIVE MODEL</p>
            </div>
            <button onClick={() => setSelectedSystem(mission.selectedSystem || "EPS")}>
              <RotateCcw size={14} /> Reset view
            </button>
          </div>
          <div className="twin-canvas">
            <Canvas camera={{ position: [0, 1.8, 6.2], fov: 46 }}>
              <ambientLight intensity={0.85} />
              <directionalLight position={[5, 5, 4]} intensity={1.3} />
              <directionalLight position={[-3, -2, -3]} intensity={0.35} />
              <SatelliteModel
                selected={selectedSystem}
                impactedSystems={impactedSystems}
                scenarioSystems={experiment ? [experiment.source_system] : scenarioSystems}
                onSelect={(system) => { setSelectedSystem(system); mission.setSelectedSystem(system); }}
              />
              <OrbitControls enablePan={false} minDistance={4.5} maxDistance={8.6} />
            </Canvas>
          </div>
          <div className="twin-legend">
            <span><i className="twin-dot selected" /> Selected subsystem</span>
            <span><i className="twin-dot active" /> Configured scenario location</span>
            <span><i className="twin-dot" /> Other/propagated system</span>
          </div>
          <div className="twin-viewport-note">
            <Focus size={14} />
            Drag to rotate · scroll to zoom · select subsystem markers or use the inspector. Marker placement is illustrative rather than verified OPS‑SAT geometry.
          </div>
        </article>

        <article className="twin-inspector">
          <div className="twin-panel-top"><p className="twin-eyebrow">SUBSYSTEM INSPECTOR</p><Wrench size={15} /></div>
          <div className="twin-selector">
            {SYSTEMS.map((system) => (
              <button key={system} className={selectedSystem === system ? "on" : ""} onClick={() => { setSelectedSystem(system); mission.setSelectedSystem(system); }}>{system}</button>
            ))}
          </div>

          <div className="twin-section-title">
            <h2>{selectedSystem}</h2>
            <span>{selectedReadingCount} outside reference</span>
          </div>

          <div className="twin-sensor-table">
            <div className="twin-table-head"><span>PARAMETER</span><span>VALUE / UNIT</span></div>
            {systemSensors.map((sensor) => {
              const outside = effectiveStatuses[sensor.id] === "OUTSIDE_REFERENCE_BAND" || effectiveStatuses[sensor.id] === "MISSING_SIGNAL";
              const reading = effectiveReadings[sensor.id];
              const readingText = typeof reading === "number" && Number.isFinite(reading)
                ? reading.toFixed(2)
                : "Missing signal";
              return (
                <button key={sensor.id} className={`twin-table-row sensor-button ${selectedSensor===sensor.id?"selected":""}`} onClick={()=>setSelectedSensor(sensor.id)}>
                  <div>
                    <strong>{sensor.name}</strong>
                    <small>{sensor.location}</small>
                  </div>
                  <div className={outside ? "out" : "in"}>
                    {readingText} {readingText === "Missing signal" ? "" : sensor.unit}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedSensor && <div className="twin-sensor-detail">{(() => {const s=mission.sensors.find(x=>x.id===selectedSensor);return s?<><strong>{s.name}</strong><p>{s.description}</p><small>Reference: {s.low} to {s.high} {s.unit}</small></>:null;})()}</div>}
          {experiment && <div className="twin-injection-alert"><b>Experimental sensor reading: {experiment.sensor_name}</b><p>Baseline {experiment.baseline_value.toFixed(2)} → injected {(experiment.modified_value === null ? "Missing signal" : experiment.modified_value.toFixed(2))} {experiment.unit}. {experiment.disclaimer}</p></div>}
          <div className="twin-footnote">
            Reference exceptions reflect assumed simulation bands. Independent hardware failure has not been confirmed.
          </div>
        </article>
      </section>

      <section className="twin-lower">
        <article className="twin-evidence">
          <div className="twin-panel-top"><p className="twin-eyebrow">SCENARIO ASSESSMENT</p><AlertTriangle size={15} /></div>
          <div className="twin-assessment-state">{mission.diagnosis?.severity?.replace(/_/g, " ") || "pending"}</div>
          <h3>{mission.diagnosis?.scenario_name || "Awaiting scenario assessment"}</h3>
          <p>{mission.diagnosis?.assessment || "Run the simulator to inspect scenario-linked effects."}</p>
          <div className="twin-metrics">
            <div><span>Subsystem status</span><strong>{currentSeverity}</strong></div>
            <div><span>Battery SOC</span><strong>{mission.diagnosis ? `${mission.diagnosis.metrics.battery_soc_pct.toFixed(1)}%` : "—"}</strong></div>
            <div><span>Power balance</span><strong>{mission.diagnosis ? `${mission.diagnosis.metrics.power_balance_w.toFixed(1)} W` : "—"}</strong></div>
          </div>
        </article>

        <article className="twin-propagation">
          <div className="twin-panel-top"><p className="twin-eyebrow">MODELED DEPENDENCIES</p><Wrench size={15} /></div>
          <div className="twin-path">
            {(mission.diagnosis?.propagation_path || []).map((node, index, array) => (
              <span key={`${node}-${index}`}><b>{node}</b>{index < array.length - 1 && <em>→</em>}</span>
            ))}
          </div>
          <h4>Potential operational consequences</h4>
          <ul>
            {(mission.diagnosis?.potential_effects || []).map((effect, index) => <li key={index}>{effect}</li>)}
          </ul>
          <p>Any highlighted components in the twin correspond to the configured scenario source, current sensor exceptions, or modeled downstream consequences.</p>
        </article>
      </section>
    </main>
  );
}
