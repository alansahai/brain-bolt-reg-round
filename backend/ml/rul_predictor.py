"""
Remaining Useful Life (RUL) Prediction Module.

Despite living under `backend/ml/`, this is NOT a trained ML model — the
provided fleet CSV is a single static snapshot with no historical cycling
data, so there is nothing to fit a predictive model against. Training a
regressor here would be an unsupported claim of "predictive learning."

Instead this module wraps `backend/src/degradation_model.py`'s engineering
heuristics into an explainable RUL estimate:
  - Current SoH (measured, direct from the snapshot)
  - Predicted SoH after N cycles (projected, via the degradation model)
  - Estimated Remaining Useful Life in cycles (projected, to the industry
    70% SoH end-of-life threshold)
  - An uncertainty band (+/-) reflecting how far the battery's operating
    conditions sit from the heuristic's reference/"typical" conditions
  - A ranked list of the dominant stress drivers, so the number is never a
    black box

Exposed via `POST/GET /api/predict-rul/{battery_id}`.
"""

from typing import Dict, Any
import numpy as np
import pandas as pd

from backend.src.degradation_model import (
    compute_stress_factors,
    predicted_soh_after_cycles,
    estimate_rul_cycles,
    estimate_uncertainty_pct,
    generate_degradation_trend,
    _deg_cfg,
)

DEFAULT_CONFIDENCE_CFG = {
    "high_max_uncertainty_pct": 15.0,
    "medium_max_uncertainty_pct": 30.0,
    "base_reliability_reasons": [
        "No historical battery usage/cycling data is available (single static snapshot).",
        "Depth-of-Discharge is estimated from current SoC, not measured directly.",
        "Charge rate and thermal variation over time are assumed at disclosed defaults.",
        "Projection is an engineering heuristic, not a model trained on this battery's own history.",
    ],
}


def _confidence_cfg(config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(DEFAULT_CONFIDENCE_CFG)
    cfg.update((config or {}).get("rul_confidence", {}))
    return cfg


def _assess_confidence(uncertainty_pct: float, stress: Dict[str, float], config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Battery Aging Prediction — Confidence & Transparency.

    Confidence is deliberately never reported as a bare percentage without
    reasons: every RUL prediction discloses *why* its confidence is what it
    is, because the dataset is a static snapshot with no lifecycle history.
    """
    cfg = _confidence_cfg(config)

    if uncertainty_pct <= cfg["high_max_uncertainty_pct"]:
        level = "High"
    elif uncertainty_pct <= cfg["medium_max_uncertainty_pct"]:
        level = "Medium"
    else:
        level = "Low"

    confidence_pct = round(float(np.clip(100.0 - uncertainty_pct * 2.0, 30.0, 95.0)), 1)

    reasons = list(cfg["base_reliability_reasons"])
    overall_stress = stress.get("overall_stress_multiplier", 1.0)
    if overall_stress >= 1.5:
        reasons.append(
            f"This battery's stress multiplier ({overall_stress:.2f}x) is well above reference conditions, "
            "widening the extrapolation range."
        )
    elif overall_stress <= 0.7:
        reasons.append(
            f"This battery's stress multiplier ({overall_stress:.2f}x) is well below reference conditions, "
            "which is also outside the heuristic's most-validated middle range."
        )

    return {
        "confidence_level": level,
        "confidence_pct": confidence_pct,
        "reliability_reasons": reasons,
    }


STRESS_FACTOR_LABELS = {
    "thermal_multiplier": "Operating temperature",
    "internal_resistance_multiplier": "Internal resistance",
    "imbalance_multiplier": "Cell voltage imbalance",
    "depth_of_discharge_multiplier": "Estimated depth-of-discharge",
    "charge_rate_multiplier": "Assumed charge rate",
    "age_multiplier": "Calendar age",
}


def _rank_stress_drivers(stress: Dict[str, float]) -> list:
    ranked = []
    for key, label in STRESS_FACTOR_LABELS.items():
        mult = stress.get(key, 1.0)
        deviation = mult - 1.0
        ranked.append({
            "factor": label,
            "multiplier": round(mult, 3),
            "deviation_pct": round(deviation * 100.0, 1),
            "impact": "accelerates aging" if deviation > 0.02 else ("slows aging" if deviation < -0.02 else "neutral"),
        })
    ranked.sort(key=lambda d: abs(d["deviation_pct"]), reverse=True)
    return ranked


def predict_rul(
    battery_row: pd.Series,
    config: Dict[str, Any],
    cycles_ahead: int = None,
) -> Dict[str, Any]:
    cfg = _deg_cfg(config)
    horizon = cycles_ahead or cfg["default_projection_cycles"]

    current_soh = float(battery_row.get("state_of_health_percent", 100.0))
    predicted_soh = predicted_soh_after_cycles(battery_row, config, horizon)
    rul_cycles = estimate_rul_cycles(battery_row, config)
    uncertainty_pct = estimate_uncertainty_pct(battery_row, config)
    stress = compute_stress_factors(battery_row, config)
    trend = generate_degradation_trend(battery_row, config)

    soh_uncertainty_abs = round(predicted_soh * uncertainty_pct / 100.0, 2)
    rul_uncertainty_abs = round(min(rul_cycles, 999999.0) * uncertainty_pct / 100.0, 1) if rul_cycles < 999999.0 else None
    confidence = _assess_confidence(uncertainty_pct, stress, config)

    return {
        "battery_id": str(battery_row.get("battery_id", "UNKNOWN")),
        "current_soh_percent": round(current_soh, 2),
        "projection_horizon_cycles": horizon,
        "predicted_soh_after_horizon_percent": round(predicted_soh, 2),
        "predicted_soh_uncertainty_pct_points": soh_uncertainty_abs,
        "estimated_rul_cycles": round(rul_cycles, 1) if rul_cycles < 999999.0 else None,
        "predicted_remaining_cycles": round(rul_cycles, 1) if rul_cycles < 999999.0 else None,
        "estimated_rul_uncertainty_cycles": rul_uncertainty_abs,
        "eol_soh_threshold_percent": cfg["eol_soh_threshold"],
        "confidence_level": confidence["confidence_level"],
        "confidence_pct": confidence["confidence_pct"],
        "reliability_reasons": confidence["reliability_reasons"],
        "confidence_note": (
            f"Heuristic engineering projection, not a trained forecast (no historical "
            f"lifecycle data available). Uncertainty band: +/-{uncertainty_pct:.1f}%."
        ),
        "stress_drivers": _rank_stress_drivers(stress),
        "degradation_trend": trend,
        "methodology": (
            "Projects Arrhenius-style thermal aging plus internal-resistance, cell-imbalance, "
            "estimated depth-of-discharge, and calendar-age stress multipliers onto a base "
            "cycle-life fade rate. See backend/src/degradation_model.py."
        ),
    }
