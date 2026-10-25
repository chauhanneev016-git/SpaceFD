"""Deterministic, time-dependent synthetic sensor corruption; no physical propagation."""
from math import sin, pi
from .simulator import get_frame, SCENARIOS, STEPS
from .registry import SENSOR_MAP

IMPACTS = {
    'EPS': ['THERMAL','OBC','COMMS'], 'ADCS': ['EPS','COMMS','NAVIGATION'],
    'THERMAL': ['EPS','OBC'], 'PROPULSION': ['NAVIGATION','ADCS'],
    'COMMS': ['OBC'], 'OBC': ['COMMS','ADCS','EPS'],
    'NAVIGATION': ['ADCS','COMMS'], 'STRUCTURE': ['EPS','ADCS'],
}
KINDS = {'bias','drift','spike','stuck','dropout'}
SPIKE_DURATION = 3  # Three consecutive frames, one 30-second event
DROPOUT_DURATION = 12  # Twelve frames, one 2-minute event


def validate(scenario, step, sensor_id, kind, intensity, onset):
    if scenario not in SCENARIOS or not 0 <= step < STEPS:
        raise ValueError('Invalid scenario or simulation step')
    if sensor_id not in SENSOR_MAP: raise ValueError('Unknown sensor')
    if kind not in KINDS or not 1 <= intensity <= 100 or not 0 <= onset < STEPS:
        raise ValueError('Invalid injection settings')


def injected_sample(scenario, step, sensor_id, kind, intensity, onset=270):
    validate(scenario, step, sensor_id, kind, intensity, onset)
    sensor = SENSOR_MAP[sensor_id]
    baseline = float(get_frame(step, scenario)['readings'][sensor_id])
    active = step >= onset
    elapsed = step-onset
    span = max(abs(sensor.high-sensor.low), 1.0)
    strength = intensity/100.0
    value = baseline
    missing = False
    if active:
        if kind == 'bias': value = baseline + strength*span
        elif kind == 'drift': value = baseline + strength*span*max(0,elapsed)/180.0
        elif kind == 'spike':
            if elapsed < SPIKE_DURATION: value = baseline + strength*span*2
        elif kind == 'stuck': value = float(get_frame(onset, scenario)['readings'][sensor_id])
        elif kind == 'dropout':
            # Missing telemetry, not the physical value zero.
            missing = elapsed < DROPOUT_DURATION
            if missing: value = None
    return baseline, value, active, missing


def inject_sensor(scenario: str, step: int, sensor_id: str, kind: str, intensity: int, onset: int=270):
    baseline, modified, applied, missing = injected_sample(scenario,step,sensor_id,kind,intensity,onset)
    sensor = SENSOR_MAP[sensor_id]
    frame = get_frame(step,scenario)
    readings = frame['readings'].copy()
    statuses = frame['statuses'].copy()
    readings[sensor_id] = None if missing else round(modified,6)
    # A missing sample is a data-quality failure, not a numeric out-of-band value.
    outside = modified is not None and (modified < sensor.low or modified > sensor.high)
    fault_active = applied and (kind in ('bias','drift','stuck') or
        (kind == 'spike' and step-onset < SPIKE_DURATION) or
        (kind == 'dropout' and step-onset < DROPOUT_DURATION))
    statuses[sensor_id] = 'MISSING_SIGNAL' if missing else ('OUTSIDE_REFERENCE_BAND' if outside else 'IN_REFERENCE_BAND')
    alerts = [k for k,v in statuses.items() if v != 'IN_REFERENCE_BAND']
    return {
        'step':step, 'scenario':scenario, 'sensor_id':sensor_id, 'sensor_name':sensor.name,
        'kind':kind, 'intensity':intensity, 'onset':onset, 'applied':applied, 'fault_active':fault_active,
        'baseline_value':baseline, 'modified_value':modified, 'missing_signal':missing,
        'unit':sensor.unit, 'outside_reference':outside, 'source_system':sensor.subsystem,
        'potentially_affected_systems':IMPACTS.get(sensor.subsystem,[]),
        'readings':readings, 'statuses':statuses, 'alerts':alerts,
        'disclaimer':'Only the selected sensor telemetry is altered. Other sensors and physical spacecraft dynamics remain unchanged. Highlighted downstream systems are rule-based possible dependencies.',
    }


def experiment_history(scenario: str, sensor_id: str, kind: str, intensity: int, onset=270, start=0, limit=720):
    if start < 0 or limit < 1 or start >= STEPS or limit > STEPS:
        raise ValueError('Invalid history interval')
    validate(scenario,start,sensor_id,kind,intensity,onset)
    result=[]
    sensor=SENSOR_MAP[sensor_id]
    for step in range(start,min(start+limit,STEPS)):
        original, value, applied, missing = injected_sample(scenario,step,sensor_id,kind,intensity,onset)
        result.append({
            'step':step, 'baseline':original, 'injected':value, 'applied':applied,
            'missing':missing, 'outside_reference': value is not None and (value < sensor.low or value > sensor.high),
        })
    return {'sensor_id':sensor_id,'kind':kind,'onset':onset,'scenario':scenario,'unit':sensor.unit,
            'points':result,'mode':'SYNTHETIC_EXPERIMENT'}
