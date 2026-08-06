"""
AI Maintenance Recommendation Engine.

Turns the Risk Index, health tier, and RUL projection into a concrete
maintenance action instead of a bare Safe/Degraded/Unsafe label. Entirely
rule-based (if/elif over already-computed, explainable signals) — no black
box, so every recommendation traces back to a specific threshold crossing,
and every recommendation explains WHY as a structured list of reasons
(not a single opaque sentence).

Exposed via `GET /api/recommend/{battery_id}` and bundled into the
`GET /api/battery/{battery_id}/detail` response, the Maintenance Center
(`GET /api/maintenance/recommendations`), and every allocation assignment.
"""

from typing import Dict, Any, List
import pandas as pd

from backend.src.risk_index import compute_risk_index
from backend.src.degradation_model import estimate_rul_cycles

DEFAULT_CFG = {
    "low_rul_cycles_threshold": 150,
    "critical_rul_cycles_threshold": 40,
    "inspection_interval_days": {"Critical": 1, "High": 7, "Medium": 30, "Low": 90},
}

ACTIONS = {
    "QUARANTINE": "Immediate Quarantine / Replace Battery",
    "INSPECTION": "Immediate Inspection",
    "COOLING": "Cooling Inspection",
    "REBALANCE": "Rebalance Cells",
    "PREVENTIVE": "Schedule Preventive Maintenance",
    "REPLACE": "Replace Battery Soon",
    "CONTINUE": "Continue Service",
}


def _rec_cfg(config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(DEFAULT_CFG)
    cfg.update((config or {}).get("recommendation_engine", {}))
    return cfg


def _fmt(factor: str) -> str:
    return factor.replace("_", " ")


def generate_recommendation(row: pd.Series, config: Dict[str, Any], tier: str = None) -> Dict[str, Any]:
    cfg = _rec_cfg(config)
    tier = tier or row.get("tier", "SAFE")
    risk = compute_risk_index(row, config)
    rul_cycles = estimate_rul_cycles(row, config)
    dominant = risk["dominant_risk_factor"]
    eol_threshold = config.get("degradation_model", {}).get("eol_soh_threshold", 70.0)
    soh_percent = float(row.get("state_of_health_percent", 100.0))

    action = ACTIONS["CONTINUE"]
    priority = "Low"
    reasons: List[str] = []

    if tier == "UNSAFE" or risk["risk_band"] == "CRITICAL" or risk["quarantine_override_applied"]:
        action = ACTIONS["QUARANTINE"]
        priority = "Critical"
        reasons.append(f"Risk Index {risk['risk_index']:.0f} is in the {risk['risk_band']} band.")
        if risk["quarantine_override_applied"]:
            reasons.append("Station status is flagged REVIEW/QUARANTINE (hard safety override).")
        else:
            reasons.append(f"Dominant risk driver: {_fmt(dominant)}.")
        if tier == "UNSAFE":
            reasons.append("Engineering rule validation classified this pack UNSAFE.")

    elif risk["risk_band"] == "HIGH":
        priority = "High"
        action = ACTIONS["INSPECTION"]
        if dominant == "temperature":
            reasons.append(f"Average operating temperature ({row.get('temperature_C', 0):.1f}°C) exceeded the safe threshold.")
            reasons.append(f"Elevated temperature is the dominant Risk Index driver (Risk Index {risk['risk_index']:.0f}).")
        elif dominant == "voltage_imbalance":
            reasons.append(f"Cell voltage imbalance ({row.get('cell_voltage_imbalance_mV', 0):.1f} mV) is elevated.")
            reasons.append(f"Cell imbalance is the dominant Risk Index driver (Risk Index {risk['risk_index']:.0f}).")
        else:
            reasons.append(f"High Risk Index ({risk['risk_index']:.0f}); dominant factor: {_fmt(dominant)}.")
        if risk["predicted_degradation_rate_pct_per_100_cycles"] > 0.4:
            reasons.append(
                f"Predicted degradation is accelerating "
                f"({risk['predicted_degradation_rate_pct_per_100_cycles']:.2f}% SoH loss per 100 cycles)."
            )

    elif rul_cycles < cfg["critical_rul_cycles_threshold"]:
        action = ACTIONS["REPLACE"]
        priority = "High"
        reasons.append(f"Predicted RUL ({rul_cycles:.0f} cycles) is below the critical threshold ({cfg['critical_rul_cycles_threshold']} cycles).")
        reasons.append(f"Current SoH ({soh_percent:.1f}%) is approaching the {eol_threshold:.0f}% end-of-life line.")
        if risk["risk_band"] in ("MEDIUM", "HIGH"):
            reasons.append(f"Risk Index ({risk['risk_index']:.0f}, {risk['risk_band']}) compounds the urgency.")

    elif rul_cycles < cfg["low_rul_cycles_threshold"]:
        action = ACTIONS["REPLACE"]
        priority = "Medium"
        reasons.append(f"Predicted RUL ({rul_cycles:.0f} cycles) is approaching end-of-life (threshold: {cfg['low_rul_cycles_threshold']} cycles).")
        reasons.append(f"Current SoH is {soh_percent:.1f}%.")

    elif risk["risk_band"] == "MEDIUM" or tier == "DEGRADED":
        priority = "Medium"
        if dominant == "voltage_imbalance":
            action = ACTIONS["REBALANCE"]
        elif dominant == "temperature":
            action = ACTIONS["COOLING"]
        else:
            action = ACTIONS["PREVENTIVE"]
        reasons.append(f"Medium Risk Index ({risk['risk_index']:.0f}) / {tier} tier.")
        reasons.append(f"Dominant factor: {_fmt(dominant)}.")

    else:
        reasons.append(f"Low Risk Index ({risk['risk_index']:.0f}), {tier} tier.")
        reasons.append(f"Healthy predicted RUL ({rul_cycles:.0f} cycles).")

    inspection_interval_days = cfg["inspection_interval_days"].get(priority, 30)
    cycles_per_day = config.get("digital_twin", {}).get("assumed_cycles_per_day", 2.5)
    estimated_remaining_service_time_days = (
        round(rul_cycles / cycles_per_day, 1) if rul_cycles < 999999.0 else None
    )

    return {
        "battery_id": str(row.get("battery_id", "UNKNOWN")),
        "recommended_action": action,
        "priority": priority,
        "reasons": reasons,
        "reason": " ".join(reasons),  # backward-compatible single-string form
        "recommended_inspection_interval_days": inspection_interval_days,
        "estimated_remaining_service_time_days": estimated_remaining_service_time_days,
        "risk_index": risk["risk_index"],
        "risk_band": risk["risk_band"],
        "estimated_rul_cycles": round(rul_cycles, 1) if rul_cycles < 999999.0 else None,
    }
