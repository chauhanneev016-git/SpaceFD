import { useRef, useState } from "react";
import { Wrench, RotateCcw, AlertTriangle } from "lucide-react";
import { useMission, type Injection } from "./MissionState";
const KINDS=[{id:"bias",name:"Bias / offset"},{id:"drift",name:"Slow drift"},{id:"spike",name:"Transient spike"},{id:"stuck",name:"Stuck reading"},{id:"dropout",name:"Signal dropout"}] as const;
let totalWorkbenchMounts = 0;
export default function SensorFaultWorkbench(){
 const [mountId] = useState(() => ++totalWorkbenchMounts);
 const renderCounter = useRef(0);
 renderCounter.current += 1;
 const m=useMission();
 const [sensorId,setSensorId]=useState("battery_soc");
 const [kind,setKind]=useState<Injection["kind"]>("bias");
 const [intensity,setIntensity]=useState(50);
 const sensor=m.sensors.find(s=>s.id===sensorId);
 // Keep the last committed experiment visible while the next replay frame is loading.
 // Do not briefly replace it with READY or the selected sensor's placeholder.
 const matchingExperiment = m.experiment && m.injection &&
   m.experiment.scenario === m.scenario &&
   m.experiment.sensor_id === m.injection.sensorId &&
   m.experiment.kind === m.injection.kind &&
   m.experiment.intensity === m.injection.intensity &&
   m.experiment.onset === m.injection.onset ? m.experiment : null;
 const result = matchingExperiment;
 const awaitingFrame = !!m.injection && (!result || result.step !== m.step);
 const inForce=!!m.injection;
 const faultCurrentlyActive = result ? (result.fault_active ?? (result.applied &&
   (result.kind === "bias" || result.kind === "drift" || result.kind === "stuck" ||
   (result.kind === "spike" && m.step - result.onset < 3) ||
   (result.kind === "dropout" && m.step - result.onset < 12)))) : false;
 return <section className="panel-card fault-workbench">
 <div className="panel-header compact"><div><p className="eyebrow"><Wrench size={14}/> CONTROLLED EXPERIMENT</p><h2>Inject a sensor malfunction</h2><small style={{display:"block",color:"#a9d4f0",marginTop:5}}>Workbench mount #{mountId} · renders {renderCounter.current}</small></div><span className="panel-tag">Synthetic overlay</span></div>
 <p className="sub-copy">Modify one telemetry channel and see which systems might depend on it. The overlay never changes recorded ESA data or other sensor measurements.</p>
 <div className="fault-controls">
 <label>Sensor<select value={sensorId} onChange={e=>setSensorId(e.target.value)}>{m.sensors.map(s=><option key={s.id} value={s.id}>{s.name} · {s.subsystem}</option>)}</select></label>
 <label>Failure behavior<select value={kind} onChange={e=>setKind(e.target.value as Injection["kind"])}>{KINDS.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
 <label>Intensity: {intensity}%<input type="range" min="1" max="100" value={intensity} onChange={e=>setIntensity(Number(e.target.value))}/></label>
 <div className="fault-buttons"><button onClick={()=>m.setInjection({sensorId,kind,intensity,onset:270})}><Wrench size={15}/> Apply</button><button onClick={()=>m.setInjection(null)}><RotateCcw size={15}/> Clear</button></div>
 </div>
 <div className="fault-result" aria-live="off">{inForce&&result?<><span>{faultCurrentlyActive ? "ACTIVE MALFUNCTION" : result.applied ? "FAULT WINDOW COMPLETE / CONFIGURED" : "AWAITING FAULT ONSET"} — {result.sensor_name}{awaitingFrame ? " · Updating telemetry…" : ""}</span><strong>{result.applied?`${result.baseline_value.toFixed(2)} → ${(result.modified_value === null ? "Missing signal" : result.modified_value.toFixed(2))} ${result.unit}`:"Before fault onset"}</strong><p>Potentially affected: {result.potentially_affected_systems.join(", ")||"None mapped"}</p><p>{result.disclaimer}</p></>:<><span>{inForce ? "LOADING EXPERIMENT" : "READY"}</span><strong>{inForce ? "Loading sensor data…" : sensor?.name||"Choose a sensor"}</strong><p>{inForce ? "Waiting for the first synchronized reading." : "No custom fault applied. Scenario-based telemetry continues normally."}</p></>}</div>
 <div className="context-note warning-note"><AlertTriangle size={16}/><div><strong>Interpretation</strong><p>These are rule-based dependencies, not measured failure propagation or remaining-useful-life predictions.</p></div></div>
 </section>;
}
