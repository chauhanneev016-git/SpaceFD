
"""Representative spacecraft telemetry simulator.

ALL generated values are synthetic.
This simulator is for academic demonstration,
not flight qualification or flight control.
"""

from functools import lru_cache
from math import cos, pi, sin, sqrt

import numpy as np

from .registry import SENSORS, SENSOR_MAP


DT_SECONDS = 10
STEPS = 720

SCENARIOS = {
    "nominal": "Nominal operations",
    "solar_degradation": "Reduced solar array generation",
    "battery_heating": "Battery thermal excursion",
    "comms_fade": "Communication link fade",
    "wheel_fault": "Reaction wheel speed excursion",
    "thermal_failure": "Reduced thermal rejection",
}


def bound(value, low, high):
    return float(min(high, max(low, value)))


def satellite_timeline(scenario):
    if scenario not in SCENARIOS:
        raise ValueError("Unsupported scenario")

    rng = np.random.default_rng(2026)
    frames = []

    soc = 82.0
    battery_temp = 23.0
    obc_temp = 30.0
    structure_temp = 12.0
    fuel = 88.0

    for step in range(STEPS):
        t = step * DT_SECONDS

        orbit_phase = (t / 5400) * 2 * pi
        sun_factor = max(0.0, sin(orbit_phase + 0.7))
        in_sun = sun_factor > 0.08

        payload_on = step % 90 < 65
        thrust = 400 <= step < 420
        degraded = step >= 270

        def rand(scale=1):
            return float(rng.normal(0, scale))

        solar_eff = (
            0.25
            if scenario == "solar_degradation" and degraded
            else 1.0
        )

        solar_power = 150 * sun_factor * solar_eff

        cpu_load = bound(
            31 + 14 * sin(t / 145)
            + (23 if payload_on else 0)
            + rand(2),
            4,
            100
        )

        load = (
            48
            + (26 if payload_on else 0)
            + cpu_load * 0.22
            + (12 if thrust else 0)
        )

        heater = 12.0 if structure_temp < 1 else 0.0
        load += heater

        # Positive battery power = discharge.
        battery_watts = load - solar_power

        # Simplified 28 V / 200 Wh battery.
        soc = bound(
            soc - battery_watts * DT_SECONDS
            / (200 * 3600) * 100,
            0,
            100
        )

        battery_current = battery_watts / 28.0

        voltage = (
            25.0
            + 8.0 * soc / 100
            - 0.05 * max(battery_current, 0)
        )

        heat_extra = (
            0.11
            if scenario == "battery_heating" and degraded
            else 0.0
        )

        battery_temp += (
            0.012 * (
                17
                + 0.07 * abs(battery_watts)
                - battery_temp
            )
            + heat_extra
        )

        obc_temp += 0.045 * (
            23 + cpu_load * 0.20 - obc_temp
        )

        thermal_effect = (
            11.0
            if scenario == "thermal_failure" and degraded
            else 0.0
        )

        structure_temp += 0.022 * (
            (8 if in_sun else -12)
            + thermal_effect
            - structure_temp
        )

        wheel = 1400 * sin(t / 350) + rand(18)

        if scenario == "wheel_fault" and degraded:
            wheel += 3800 * min(
                (step - 270) / 65, 1
            )

        drift = (
            14
            if scenario == "wheel_fault" and degraded
            else 0
        )

        rssi = -76 + 6 * cos(t / 240) + rand(1.4)

        if scenario == "comms_fade" and degraded:
            rssi -= 36

        margin = (rssi + 115) * 0.42 - 1

        packet_loss = bound(
            0.08
            + max(0, 6 - margin) * 2.0
            + abs(rand(0.09)),
            0,
            100
        )

        if thrust:
            fuel = max(0, fuel - 0.004)

        radius_km = (
            6371 + 525 + 3 * sin(t / 630)
        )

        orbit_speed = sqrt(
            398600.4418 / radius_km
        )

        readings = {
            "mag_x": 27 * sin(orbit_phase) + rand(0.12),
            "mag_y": -18 * cos(orbit_phase) + rand(0.12),
            "mag_z": 34 * sin(orbit_phase + 0.9) + rand(0.12),

            "gyro_x": 0.13 * sin(t / 230) + rand(0.008),
            "gyro_y": 0.11 * cos(t / 260) + rand(0.008),
            "gyro_z": 0.18 * sin(t / 300)
                      + rand(0.008) + drift * 0.15,
            "wheel_rpm": wheel,

            "battery_soc": soc,
            "battery_voltage": voltage,
            "battery_current": battery_current,
            "bus_voltage": (
                28.0 + rand(0.06)
                - (0.9 if soc < 15 else 0)
            ),
            "solar_power": solar_power,
            "load_power": load,
            "battery_temp": battery_temp,

            "obc_temp": obc_temp,
            "payload_temp": (
                22 + (15 if payload_on else 0)
                + 1.5 * sin(t / 250)
            ),
            "panel_temp": -25 + 100 * sun_factor,
            "radiator_temp": (
                structure_temp - 9
                + thermal_effect * 0.4
            ),
            "thermal_heater": heater,
            "structure_temp": structure_temp,

            "tank_pressure": (
                13.2 - 0.7 * (88 - fuel) / 88
                + rand(0.03)
            ),
            "tank_temp": 18 + 2 * sin(t / 330),
            "valve_open": int(thrust),
            "thruster_pressure": 4.8 if thrust else 0,
            "propellant_pct": fuel,

            "rssi": rssi,
            "packet_loss": packet_loss,
            "tx_power": 12 if in_sun else 8,
            "bit_error_rate": bound(
                1e-6 + packet_loss / 100 * 0.008,
                0,
                1
            ),
            "link_margin": margin,

            "cpu_load": cpu_load,
            "memory_use": 43 + 5 * sin(t / 440),
            "storage_use": 37 + step * 0.017,
            "bus_errors": (
                1 if step % 173 == 0 and step > 0
                else 0
            ),
            "watchdog": 0,

            "altitude": radius_km - 6371,
            "orbital_speed": orbit_speed,
            "latitude": 52 * sin(orbit_phase),
            "longitude": (
                (step * 0.58 + 14 + 180) % 360
            ) - 180,
            "position_error": (
                8 + 3 * abs(sin(t / 190))
                + abs(rand(0.8))
            ),

            "vibration": (
                0.012
                + 0.003 * abs(sin(t / 38))
                + (0.013 if thrust else 0)
            ),
            "deployment_a": 1,
            "deployment_b": 1,
            "actuator_current": (
                0.48 if thrust else 0.05
            ),
            "strain": (
                38 * sin(t / 270) + rand(2)
            ),
        }

        if set(readings) != set(SENSOR_MAP):
            raise RuntimeError(
                "Simulator and sensor registry do not match"
            )

        statuses = {}

        for item in SENSORS:
            value = float(readings[item.id])

            statuses[item.id] = (
                "OUTSIDE_REFERENCE_BAND"
                if value < item.low or value > item.high
                else "IN_REFERENCE_BAND"
            )

            readings[item.id] = round(value, 6)

        frames.append({
            "step": step,
            "elapsed_seconds": t,
            "scenario": scenario,
            "mode": "SIMULATED",
            "eclipse": not in_sun,
            "readings": readings,
            "statuses": statuses,
            "alerts": [
                key for key, status in statuses.items()
                if status != "IN_REFERENCE_BAND"
            ],
        })

    return frames


@lru_cache(maxsize=8)
def get_timeline(scenario="nominal"):
    return satellite_timeline(scenario)


def get_frame(step=0, scenario="nominal"):
    if step < 0 or step >= STEPS:
        raise ValueError(
            f"step must be between 0 and {STEPS - 1}"
        )

    return get_timeline(scenario)[step]


def get_history(
    channel,
    scenario="nominal",
    start=0,
    limit=120
):
    if channel not in SENSOR_MAP:
        raise ValueError("Unknown channel")

    if (
        start < 0 or start >= STEPS
        or limit < 1 or limit > STEPS
    ):
        raise ValueError("Invalid history window")

    timeline = get_timeline(scenario)

    return [
        {
            "step": frame["step"],
            "elapsed_seconds": frame["elapsed_seconds"],
            "value": frame["readings"][channel],
            "status": frame["statuses"][channel],
        }
        for frame in timeline[start:start + limit]
    ]
