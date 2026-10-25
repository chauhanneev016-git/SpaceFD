"""Hypothesized functional dependencies for the educational spacecraft twin.
Not evidence of observed hardware damage.
"""

RULES = {
    "nominal": {
        "title": "Nominal spacecraft operations",
        "source": "Orbital illumination and scheduled loads",
        "checks": [
            "Check that solar output varies with orbital illumination.",
            "Compare battery charging/discharging with net electrical demand.",
            "Check for isolated reference-band exceptions without treating them as confirmed faults.",
        ],
        "path": ["Orbital illumination", "Electrical generation and loads", "Battery energy balance"],
        "potential_effects": ["Expected eclipse discharge", "Expected thermal cycling"],
    },
    "solar_degradation": {
        "title": "Solar generation degradation",
        "source": "Solar array power production",
        "checks": [
            "Compare solar output against a nominal orbit at the same simulated time.",
            "Assess net power and battery state-of-charge slope over multiple samples.",
            "Review whether essential loads could be sustained under persistent deficit.",
        ],
        "path": ["Solar array", "Electrical power margin", "Battery charge", "Payload availability"],
        "potential_effects": ["Reduced charging opportunity", "Lower energy reserve", "Potential nonessential load curtailment"],
    },
    "battery_heating": {
        "title": "Battery thermal excursion",
        "source": "Battery bay",
        "checks": [
            "Compare battery temperature to the nominal run at the same timestamp.",
            "Inspect battery current and charge/discharge loading.",
            "Check whether the modeled thermal rise persists after load changes.",
        ],
        "path": ["Battery bay heat", "Battery thermal margin", "Power availability", "Payload uptime"],
        "potential_effects": ["Reduced battery thermal margin", "Possible power restrictions if heating persists"],
    },
    "comms_fade": {
        "title": "Communications link fade",
        "source": "RF link and antenna assembly",
        "checks": [
            "Compare received signal strength and link margin with nominal.",
            "Inspect modeled packet-loss and bit-error changes.",
            "Separate link fade from pointing-related hypotheses; this simulator does not prove either cause.",
        ],
        "path": ["RF link", "Link margin", "Packet delivery", "Telemetry availability"],
        "potential_effects": ["Reduced downlink quality", "Interrupted command/telemetry exchange"],
    },
    "wheel_fault": {
        "title": "Reaction-wheel excursion",
        "source": "Reaction wheel / attitude control",
        "checks": [
            "Compare wheel RPM and angular-rate proxy against nominal.",
            "Examine whether body-rate deviations coincide with wheel behavior.",
            "Evaluate pointing implications using a higher-fidelity attitude model before making physical claims.",
        ],
        "path": ["Reaction wheel", "Body angular rate", "Attitude estimation / pointing", "Communications and solar alignment"],
        "potential_effects": ["Reduced pointing stability", "Potential antenna or solar orientation degradation"],
    },
    "thermal_failure": {
        "title": "Thermal rejection degradation",
        "source": "Thermal control surfaces",
        "checks": [
            "Compare structure and radiator temperatures with nominal at the same timestamp.",
            "Inspect sustained warming rather than a single threshold crossing.",
            "Review payload and avionics thermal assumptions independently.",
        ],
        "path": ["Thermal rejection", "Structure / radiator temperature", "Component thermal margin", "Payload availability"],
        "potential_effects": ["Reduced thermal margin", "Potential operational derating if component limits are reached"],
    },
}
