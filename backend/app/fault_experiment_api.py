from fastapi import APIRouter, HTTPException, Query
from .fault_experiment import inject_sensor, experiment_history
from .simulator import STEPS

router=APIRouter(prefix='/api/experiment',tags=['Sensor malfunction experiments'])

@router.get('/inject')
def inject(scenario: str='nominal',step: int=Query(0,ge=0,lt=STEPS),sensor_id: str='battery_soc',kind: str='bias',intensity: int=Query(25,ge=1,le=100),onset: int=Query(270,ge=0,lt=STEPS)):
    try: return inject_sensor(scenario,step,sensor_id,kind,intensity,onset)
    except ValueError as exc: raise HTTPException(status_code=422,detail=str(exc)) from exc

@router.get('/history')
def history(scenario: str='nominal', sensor_id: str='battery_soc', kind: str='bias',intensity: int=Query(25,ge=1,le=100),onset: int=Query(270,ge=0,lt=STEPS), start: int=Query(0,ge=0,lt=STEPS),limit: int=Query(720,ge=1,le=STEPS)):
    try: return experiment_history(scenario,sensor_id,kind,intensity,onset,start,limit)
    except ValueError as exc: raise HTTPException(status_code=422,detail=str(exc)) from exc
