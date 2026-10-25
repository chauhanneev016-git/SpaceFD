
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Sensor:
    id: str
    name: str
    subsystem: str
    unit: str
    low: float
    high: float
    location: str
    description: str
    source: str = "SIMULATED"


def s(id, name, sub, unit, lo, hi, loc, description):
    return Sensor(id, name, sub, unit, lo, hi, loc, description)


SENSORS = [
    # ADCS (7)
    s("mag_x", "Magnetometer X", "ADCS", "uT", -60, 60, "Attitude sensor bay", "Body-frame magnetic field X"),
    s("mag_y", "Magnetometer Y", "ADCS", "uT", -60, 60, "Attitude sensor bay", "Body-frame magnetic field Y"),
    s("mag_z", "Magnetometer Z", "ADCS", "uT", -60, 60, "Attitude sensor bay", "Body-frame magnetic field Z"),
    s("gyro_x", "Gyroscope X", "ADCS", "deg/s", -2, 2, "Attitude sensor bay", "Body rotation rate X"),
    s("gyro_y", "Gyroscope Y", "ADCS", "deg/s", -2, 2, "Attitude sensor bay", "Body rotation rate Y"),
    s("gyro_z", "Gyroscope Z", "ADCS", "deg/s", -2, 2, "Attitude sensor bay", "Body rotation rate Z"),
    s("wheel_rpm", "Reaction wheel speed", "ADCS", "rpm", -4500, 4500, "Reaction wheel assembly", "Wheel rotation speed"),

    # Electrical power (7)
    s("battery_soc", "Battery state of charge", "EPS", "%", 20, 100, "Battery bay", "Stored battery energy"),
    s("battery_voltage", "Battery voltage", "EPS", "V", 24, 33.6, "Battery bay", "Pack terminal voltage"),
    s("battery_current", "Battery current", "EPS", "A", -8, 8, "Battery bay", "Positive means discharging"),
    s("bus_voltage", "Power bus voltage", "EPS", "V", 26, 29, "Power distribution unit", "Regulated bus voltage"),
    s("solar_power", "Solar array generation", "EPS", "W", 0, 170, "Solar array wings", "Generated electrical power"),
    s("load_power", "Electrical load", "EPS", "W", 30, 125, "Power distribution unit", "Spacecraft electrical demand"),
    s("battery_temp", "Battery temperature", "EPS", "C", 0, 45, "Battery bay", "Cell temperature"),

    # Thermal (6)
    s("obc_temp", "Computer temperature", "THERMAL", "C", -10, 65, "Avionics bay", "Flight computer temperature"),
    s("payload_temp", "Payload temperature", "THERMAL", "C", -10, 55, "Payload enclosure", "Payload sensor temperature"),
    s("panel_temp", "Solar panel temperature", "THERMAL", "C", -45, 95, "Solar array wings", "Array temperature"),
    s("radiator_temp", "Radiator temperature", "THERMAL", "C", -50, 55, "Radiator panel", "Heat rejection surface"),
    s("thermal_heater", "Heater power", "THERMAL", "W", 0, 30, "Thermal bay", "Power commanded to heaters"),
    s("structure_temp", "Structure temperature", "THERMAL", "C", -30, 65, "Spacecraft bus", "Primary structure temperature"),

    # Propulsion (5)
    s("tank_pressure", "Tank pressure", "PROPULSION", "bar", 7, 20, "Propellant tank", "Propellant tank pressure"),
    s("tank_temp", "Tank temperature", "PROPULSION", "C", -10, 45, "Propellant tank", "Tank temperature"),
    s("valve_open", "Propulsion valve", "PROPULSION", "bool", 0, 1, "Valve manifold", "1=open, 0=closed"),
    s("thruster_pressure", "Thruster chamber pressure", "PROPULSION", "bar", 0, 6, "Thruster assembly", "Pressure while firing"),
    s("propellant_pct", "Propellant remaining", "PROPULSION", "%", 10, 100, "Propellant tank", "Estimated propellant remaining"),

    # Communications (5)
    s("rssi", "Received signal strength", "COMMS", "dBm", -115, -55, "Radio/antenna", "Illustrative received power"),
    s("packet_loss", "Packet loss", "COMMS", "%", 0, 5, "Radio/antenna", "Fraction of lost packets"),
    s("tx_power", "Transmitter power", "COMMS", "W", 0, 18, "Radio/antenna", "RF subsystem power use"),
    s("bit_error_rate", "Bit error rate", "COMMS", "ratio", 0, 0.001, "Radio/antenna", "Estimated demodulation errors"),
    s("link_margin", "Link margin", "COMMS", "dB", 3, 25, "Radio/antenna", "Simplified downlink link margin"),

    # Onboard computer (5)
    s("cpu_load", "CPU utilization", "OBC", "%", 0, 85, "Avionics bay", "Processor duty cycle"),
    s("memory_use", "Memory utilization", "OBC", "%", 0, 90, "Avionics bay", "Occupied memory"),
    s("storage_use", "Storage utilization", "OBC", "%", 0, 95, "Avionics bay", "Occupied persistent storage"),
    s("bus_errors", "Data bus errors", "OBC", "count", 0, 3, "Avionics bay", "Bus errors in last simulation interval"),
    s("watchdog", "Watchdog events", "OBC", "count", 0, 0, "Avionics bay", "Watchdog resets in last interval"),

    # Navigation (5)
    s("altitude", "Orbit altitude", "NAVIGATION", "km", 400, 650, "Navigation computer", "Assumed low Earth orbit altitude"),
    s("orbital_speed", "Orbital speed", "NAVIGATION", "km/s", 7.3, 7.9, "Navigation computer", "Estimated orbital velocity"),
    s("latitude", "Subsatellite latitude", "NAVIGATION", "deg", -90, 90, "Navigation computer", "Illustrative ground track latitude"),
    s("longitude", "Subsatellite longitude", "NAVIGATION", "deg", -180, 180, "Navigation computer", "Illustrative ground track longitude"),
    s("position_error", "Position estimate error", "NAVIGATION", "m", 0, 60, "Navigation computer", "Navigation solution residual"),

    # Structure and mechanisms (5)
    s("vibration", "Structural vibration RMS", "STRUCTURE", "g", 0, 0.08, "Spacecraft bus", "Modeled bus vibration"),
    s("deployment_a", "Solar wing A latch", "STRUCTURE", "bool", 1, 1, "Solar wing A hinge", "1=deployed"),
    s("deployment_b", "Solar wing B latch", "STRUCTURE", "bool", 1, 1, "Solar wing B hinge", "1=deployed"),
    s("actuator_current", "Mechanism current", "STRUCTURE", "A", 0, 0.7, "Mechanism bay", "Mechanism drive current"),
    s("strain", "Structural strain", "STRUCTURE", "microstrain", -150, 150, "Spacecraft bus", "Simulated strain measurement"),
]

SENSOR_MAP = {item.id: item for item in SENSORS}
assert len(SENSOR_MAP) == len(SENSORS)


def registry_payload():
    return [asdict(item) for item in SENSORS]
