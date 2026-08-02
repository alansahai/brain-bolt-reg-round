"""
Battery Risk Index — a SAFETY-oriented score, deliberately separate from the
performance-oriented Suitability Score.

Suitability answers "how good is this battery to use right now" (SoH,
resistance, imbalance, temperature, cycle count, weighted toward performance).
Risk Index answers "how likely is this battery to cause a safety incident,"
weighted toward thermal/electrical safety margins plus the forward-looking
degradation rate from backend/src/degradation_model.py. A battery can score
high on both, or high Suitability with high Risk (e.g. strong SoH but running
hot) — which is exactly the case the allocator must not blindly reward.

0-100 scale, banded into Low / Medium / High / Critical. Weights and
normalization bounds are fully configurable (config.yaml: risk_index),
never hardcoded.
"""

from typing import Dict, Any
import numpy as np
import pandas as pd

from backend.src.degradation_model import estimate_rul_cycles, _deg_cfg

DEFAULT_WEIGHTS = {
    "temperature": 0.25,
    "internal_resistance": 0.20,
    "voltage_imbalance": 0.20,
    "cycle_count": 0.15,
    "soh": 0.10,
    "predicted_degradation": 0.10,
}

DEFAULT_BOUNDS = {
    "temp_min": 15.0, "temp_max": 55.0,
    "ir_min": 30.0, "ir_max": 90.0,
    "imbalance_min": 0.0, "imbalance_max": 120.0,
    "cycle_min": 0, "cycle_max": 2000,
    "soh_min": 50.0, "soh_max": 100.0,
    "degradation_rate_min": 0.0, "degradation_rate_max": 3.0,
}

DEFAULT_BANDS = {"low_max": 25.0, "medium_max": 50.0, "high_max": 75.0}


def _risk_cfg(config: Dict[str, Any]) -> Dict[str, Any]:
    risk_cfg = (config or {}).get("risk_index", {})
    weights = dict(DEFAULT_WEIGHTS)
    weights.update(risk_cfg.get("weights", {}))
    bounds = dict(DEFAULT_BOUNDS)
    bounds.update(risk_cfg.get("normalization_bounds", {}))
    bands = dict(DEFAULT_BANDS)
    bands.update(risk_cfg.get("bands", {}))
    return {"weights": weights, "bounds": bounds, "bands": bands}


def _norm(value: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 0.0
    return float(np.clip((value - lo) / (hi - lo), 0.0, 1.0))


def _predicted_degradation_rate_per_100_cycles(row: pd.Series, config: Dict[str, Any]) -> float:
    """% SoH lost per 100 cycles going forward, from the degradation model."""
    from backend.src.degradation_model import predicted_loss_per_cycle
    return float(predicted_loss_per_cycle(row, config) * 100.0)


def compute_risk_index(row: pd.Series, config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _risk_cfg(config)
    w = cfg["weights"]
    b = cfg["bounds"]
    bands = cfg["bands"]

    temp_C = float(row.get("temperature_C", 25.0))
    ir_mOhm = float(row.get("internal_resistance_mOhm", 45.0))
    imbalance_mV = float(row.get("cell_voltage_imbalance_mV", 30.0))
    cycle_count = float(row.get("cycle_count", 0))
    soh_percent = float(row.get("state_of_health_percent", 100.0))
    degradation_rate = _predicted_degradation_rate_per_100_cycles(row, config)

    r_temp = _norm(temp_C, b["temp_min"], b["temp_max"]) * 100.0
    r_ir = _norm(ir_mOhm, b["ir_min"], b["ir_max"]) * 100.0
    r_imb = _norm(imbalance_mV, b["imbalance_min"], b["imbalance_max"]) * 100.0
    r_cyc = _norm(cycle_count, b["cycle_min"], b["cycle_max"]) * 100.0
    r_soh = (1.0 - _norm(soh_percent, b["soh_min"], b["soh_max"])) * 100.0  # lower SoH -> higher risk
    r_deg = _norm(degradation_rate, b["degradation_rate_min"], b["degradation_rate_max"]) * 100.0

    sub_scores = {
        "temperature_risk": round(r_temp, 1),
        "internal_resistance_risk": round(r_ir, 1),
        "voltage_imbalance_risk": round(r_imb, 1),
        "cycle_count_risk": round(r_cyc, 1),
        "soh_risk": round(r_soh, 1),
        "predicted_degradation_risk": round(r_deg, 1),
    }

    risk_index = (
        w["temperature"] * r_temp +
        w["internal_resistance"] * r_ir +
        w["voltage_imbalance"] * r_imb +
        w["cycle_count"] * r_cyc +
        w["soh"] * r_soh +
        w["predicted_degradation"] * r_deg
    )
    risk_index = float(np.clip(risk_index, 0.0, 100.0))

    quarantine_override = str(row.get("station_status", "")) == "REVIEW/QUARANTINE"
    if quarantine_override:
        risk_index = max(risk_index, bands["high_max"] + 1.0)

    if risk_index <= bands["low_max"]:
        band = "LOW"
    elif risk_index <= bands["medium_max"]:
        band = "MEDIUM"
    elif risk_index <= bands["high_max"]:
        band = "HIGH"
    else:
        band = "CRITICAL"

    dominant_factor = max(sub_scores.items(), key=lambda kv: kv[1])

    return {
        "battery_id": str(row.get("battery_id", "UNKNOWN")),
        "risk_index": round(risk_index, 1),
        "risk_band": band,
        "quarantine_override_applied": quarantine_override,
        "sub_scores": sub_scores,
        "dominant_risk_factor": dominant_factor[0].replace("_risk", ""),
        "predicted_degradation_rate_pct_per_100_cycles": round(degradation_rate, 3),
        "methodology": (
            "Weighted safety score (temperature, internal resistance, cell imbalance, cycle "
            "count, inverse SoH, predicted forward degradation rate) — independent of the "
            "performance-oriented Suitability Score by design."
        ),
    }
