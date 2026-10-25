import { useState } from "react";
import { Activity, Box, ChartNoAxesCombined, Database, Satellite, Play, Pause, RotateCcw } from "lucide-react";
import OperationsConsole from "./OperationsConsole";
import DiagnosticIntelligence from "./DiagnosticIntelligence";
import SpacecraftTwin from "./SpacecraftTwin";
import ResearchWorkspace from "./ResearchWorkspace";
import { MissionProvider, useMission, SCENARIOS, displayTime } from "./MissionState";
import "./ops.css";
import "./refinement.css";
import "./twin.css";

type Page = "operations" | "twin" | "diagnostics" | "research";
const PAGES = [
  { id: "operations", name: "Operations", icon: Activity },
  { id: "twin", name: "Vehicle twin", icon: Box },
  { id: "diagnostics", name: "Diagnostics", icon: ChartNoAxesCombined },
  { id: "research", name: "ESA research", icon: Database },
] as const;

function Shell() {
  const [page, setPage] = useState<Page>("operations");
  const mission = useMission();

  return (
    <div className={`spacefd-root page-${page}`}>
      <header className="spacefd-header">
        <div className="spacefd-brand">
          <div className="spacefd-brand-mark"><Satellite size={18} /></div>
          <div>
            <strong>SpaceFD</strong>
            <span>Mission systems intelligence environment</span>
          </div>
        </div>

        <nav className="spacefd-nav" aria-label="Workspace">
          {PAGES.map((pageItem) => {
            const Icon = pageItem.icon;
            return (
              <button
                key={pageItem.id}
                className={page === pageItem.id ? "active" : ""}
                onClick={() => setPage(pageItem.id)}
              >
                <Icon size={16} />
                {pageItem.name}
              </button>
            );
          })}
        </nav>

        <div className={`spacefd-status ${mission.connected ? "online" : "offline"}`}>
          <i />
          {mission.connected ? "Simulator connected" : "Simulator offline"}
        </div>
      </header>

      <section className="spacefd-toolbar">
        <div className="toolbar-block toolbar-time">
          <span className="toolbar-label">Mission replay</span>
          <strong>{displayTime(mission.step)}</strong>
          <small>Step {mission.step}/719 · simulated</small>
        </div>

        <label className="toolbar-block toolbar-select">
          <span className="toolbar-label">Scenario</span>
          <select value={mission.scenario} onChange={(e) => mission.setScenario(e.target.value)}>
            {SCENARIOS.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>

        <div className="toolbar-actions">
          <button className="solid" onClick={() => mission.setPlaying(!mission.playing)}>
            {mission.playing ? <Pause size={15} /> : <Play size={15} />}
            {mission.playing ? "Pause" : "Play"}
          </button>
          <button onClick={() => { mission.setPlaying(false); mission.setStep(270); }}>Fault onset</button>
          <button onClick={() => { mission.setPlaying(false); mission.setStep(0); }} aria-label="Reset replay">
            <RotateCcw size={15} />
          </button>
          <select className="toolbar-speed" value={mission.speed} onChange={(e) => mission.setSpeed(Number(e.target.value))}>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={5}>5×</option>
          </select>
        </div>

        <div className="toolbar-slider">
          <input
            type="range"
            min="0"
            max="719"
            value={mission.step}
            onChange={(e) => {
              mission.setPlaying(false);
              mission.setStep(Number(e.target.value));
            }}
            aria-label="Mission time"
          />
        </div>
      </section>

      {mission.error && (
        <div className="spacefd-error-banner">
          {mission.error} — confirm the FastAPI simulation backend is running on port 8001.
        </div>
      )}

      <main className="spacefd-workspace">
        {page === "operations" && <OperationsConsole />}
        {page === "twin" && <SpacecraftTwin />}
        {page === "diagnostics" && <DiagnosticIntelligence />}
        {page === "research" && <ResearchWorkspace />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <MissionProvider>
      <Shell />
    </MissionProvider>
  );
}
