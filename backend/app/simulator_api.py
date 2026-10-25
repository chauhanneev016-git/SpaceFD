"""Standalone simulator and diagnostic APIs, served together on port 8001."""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from .registry import registry_payload, SENSORS, SENSOR_MAP
from .simulator import SCENARIOS, DT_SECONDS, STEPS, get_frame, get_history
from .diagnosis_api import router as diagnosis_router

app = FastAPI(title="SpaceFD Spacecraft Simulator", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"], allow_headers=["*"],
)
app.include_router(diagnosis_router)


@app.get("/api/sim/status")
def status():
    return {
        "status": "ok", "mode": "SIMULATED", "sensor_count": len(SENSORS),
        "subsystem_count": len({s.subsystem for s in SENSORS}),
        "sample_interval_seconds": DT_SECONDS, "total_steps": STEPS,
    }


@app.get("/api/sim/sensors")
def sensors():
    return {"data_source": "SIMULATED", "sensors": registry_payload()}


@app.get("/api/sim/scenarios")
def scenarios():
    return {
        "scenarios": [{"id": key, "name": value} for key, value in SCENARIOS.items()],
        "fault_start_step": 270,
    }


@app.get("/api/sim/frame")
def frame(step: int = Query(0, ge=0, lt=STEPS), scenario: str = "nominal"):
    try:
        return get_frame(step, scenario)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/sim/history/{sensor_id}")
def history(
    sensor_id: str, scenario: str = "nominal",
    start: int = Query(0, ge=0, lt=STEPS),
    limit: int = Query(120, ge=1, le=STEPS),
):
    if sensor_id not in SENSOR_MAP:
        raise HTTPException(status_code=404, detail="Unknown sensor")
    try:
        points = get_history(sensor_id, scenario, start, limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "sensor_id": sensor_id, "scenario": scenario, "mode": "SIMULATED",
        "unit": SENSOR_MAP[sensor_id].unit, "points": points,
    }

# Optional, non-destructive sensor malfunction experiment.
from .fault_experiment_api import router as experiment_router
app.include_router(experiment_router)
