from fastapi import APIRouter, HTTPException, Query
from .diagnosis_engine import build_diagnosis
from .simulator import STEPS

router = APIRouter(prefix="/api/diagnosis", tags=["Diagnostic Intelligence"])


@router.get("/analyze")
def analyze(
    scenario: str = "nominal",
    step: int = Query(default=0, ge=0, lt=STEPS),
):
    try:
        return build_diagnosis(scenario, step)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
