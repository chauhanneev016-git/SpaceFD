"""Scenario-aware educational diagnostics. No flight-safety claims."""
from math import isfinite
from .simulator import SCENARIOS, STEPS, DT_SECONDS, get_frame, get_timeline
from .propagation_rules import RULES

ONSET = 270
PRIMARY = {
    'nominal': ['solar_power', 'load_power', 'battery_soc'],
    'solar_degradation': ['solar_power', 'battery_soc', 'battery_current', 'load_power'],
    'battery_heating': ['battery_temp', 'battery_current', 'battery_soc'],
    'comms_fade': ['rssi', 'link_margin', 'packet_loss'],
    'wheel_fault': ['wheel_rpm', 'gyro_z', 'mag_x'],
    'thermal_failure': ['structure_temp', 'radiator_temp', 'obc_temp'],
}

def r(value, n=4):
    return round(float(value), n)


def build_diagnosis(scenario: str, step: int):
    if scenario not in SCENARIOS:
        raise ValueError('Unknown scenario')
    if not 0 <= step < STEPS:
        raise ValueError('Invalid step')

    sim_series = get_timeline(scenario)
    base_series = get_timeline('nominal')
    current = sim_series[step]
    nominal = base_series[step]
    v = current['readings']
    b = nominal['readings']
    active = scenario != 'nominal' and step >= ONSET
    rule = RULES[scenario]
    keys = PRIMARY[scenario]

    evidence = [{
        'sensor_id': name,
        'scenario_value': r(v[name], 6),
        'nominal_value': r(b[name], 6),
        'delta': r(float(v[name]) - float(b[name]), 6),
    } for name in keys]

    lookback = max(0, step - 30)
    dt_hours = (step - lookback) * DT_SECONDS / 3600
    soc_rate = ((v['battery_soc'] - sim_series[lookback]['readings']['battery_soc']) / dt_hours) if dt_hours > 0 else 0.0
    power = float(v['solar_power']) - float(v['load_power'])
    nominal_power = float(b['solar_power']) - float(b['load_power'])
    soc_delta = float(v['battery_soc']) - float(b['battery_soc'])

    # Rectangular integration in Wh: sampled generation differences between
    # the two trajectories from configured onset through current step inclusive.
    # Separately report the generation shortfall, independent of battery SOC.
    cumulative_energy_wh = sum(
        (sim_series[i]['readings']['solar_power'] - base_series[i]['readings']['solar_power'])
        * DT_SECONDS / 3600.0 for i in range(ONSET, step + 1)
    ) if active else 0.0
    sunlit_since_onset = sum(
        not base_series[i]['eclipse'] for i in range(ONSET, step + 1)
    ) if active else 0
    is_eclipse = bool(current['eclipse'])

    time_to_20 = None
    if soc_rate < -0.05 and v['battery_soc'] > 20:
        estimate = (float(v['battery_soc']) - 20) / -soc_rate
        if isfinite(estimate):
            time_to_20 = r(estimate, 2)

    if scenario == 'nominal':
        severity = 'BASELINE'
        assessment = 'Nominal reference simulation. Eclipse discharge and thermal cycling are expected operating conditions, not automatically faults.'
        observation = 'Reference trajectory; no injected scenario.'
    elif not active:
        severity = 'PRE-ONSET'
        assessment = 'Selected scenario has not started. This timestamp is before the configured onset at step 270.'
        observation = 'No injected effect expected yet.'
    elif scenario == 'solar_degradation' and is_eclipse:
        severity = 'NOT DIRECTLY OBSERVABLE'
        assessment = (
            'Solar generation is zero in eclipse in both runs, so instantaneous solar-power readings cannot establish array degradation. '
            'Inspect the preceding sunlit intervals, accumulated generation shortfall, and battery charge relative to the nominal run.'
        )
        observation = 'Direct solar-power comparison masked by eclipse; history and accumulated effects remain informative.'
    else:
        largest = evidence[0]
        severity = 'REFERENCE EXCEPTION' if current['alerts'] else 'MODELED DEVIATION'
        assessment = (
            f"Configured scenario active. The simulated {largest['sensor_id']} differs from nominal at this same step "
            f"by {largest['delta']:+g} in its native unit. This is a modeled observation, not an independently inferred fault cause."
        )
        observation = 'Scenario-versus-nominal telemetry comparison.'

    # An expanded window is essential for faults whose instantaneous output is
    # masked (eclipse). Chart shows actual current step, fault onset, and phases.
    window_start = max(0, min(step - 90, ONSET - 30))
    timeline = []
    for i in range(window_start, step + 1):
        sv = sim_series[i]['readings'][keys[0]]
        bv = base_series[i]['readings'][keys[0]]
        timeline.append({
            'step': i,
            'scenario': r(sv, 8),
            'nominal': r(bv, 8),
            'delta': r(sv - bv, 8),
            'eclipse': bool(base_series[i]['eclipse']),
        })

    metrics = {
        'power_balance_w': r(power, 3),
        'nominal_power_balance_w': r(nominal_power, 3),
        'power_balance_delta_w': r(power - nominal_power, 3),
        'battery_soc_pct': r(v['battery_soc'], 3),
        'nominal_battery_soc_pct': r(b['battery_soc'], 3),
        'battery_soc_delta_pp': r(soc_delta, 3),
        'battery_soc_rate_pp_per_hour': r(soc_rate, 3),
        'projected_hours_to_20pct': time_to_20,
        'eclipse': is_eclipse,
        'active_reference_exceptions': len(current['alerts']),
        'cumulative_solar_energy_delta_wh': r(cumulative_energy_wh, 4),
        'sunlit_samples_since_onset': sunlit_since_onset,
    }
    return {
        'mode': 'SIMULATED', 'scenario': scenario,
        'scenario_name': SCENARIOS[scenario], 'step': step,
        'elapsed_seconds': step * DT_SECONDS,
        'scenario_active': active, 'severity': severity,
        'assessment': assessment, 'observation': observation,
        'source_component': rule['source'],
        'propagation_path': rule['path'],
        'potential_effects': rule['potential_effects'],
        'operator_checks': rule['checks'],
        'evidence': evidence, 'metrics': metrics,
        'trend_sensor': keys[0], 'trend': timeline,
        'fault_onset_step': ONSET,
        'disclaimer': (
            'This is an educational synthetic digital twin. Reference bands are assumed. '
            'Potential downstream consequences do not establish physical damage. '
            'Time to 20% is a five-minute constant-slope extrapolation, not a validated endurance forecast. '
            'Cumulative energy difference is calculated from discrete simulated solar-power samples.'
        ),
    }
