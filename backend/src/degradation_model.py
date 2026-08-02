"""
Lightweight, engineering-informed Battery Degradation Model.

HONEST FRAMING: the provided fleet CSV is a single static snapshot with no
historical cycling/lifecycle data. Nothing here is "trained" or "learned" from
data. Instead this module projects each battery's future trajectory from its
current snapshot using standard, citable Li-ion aging heuristics:

  - Arrhenius-style thermal aging: degradation rate roughly doubles for every
    +10C above a 25C reference (a widely used Li-ion rule of thumb).
  - Internal resistance and cell voltage imbalance are treated as proxies for
    internal heat generation / cell-level stress, scaled linearly against the
    fleet's already-established distribution bounds (config.yaml).
  - Depth-of-Discharge (DoD) and charge-rate are NOT present in the dataset.
    DoD is weakly estimated from current SoC (a documented, disclosed proxy);
    charge-rate is held at a disclosed constant default. Both limitations are
    called out explicitly rather than fabricating precision the data can't
    support.

This model feeds RUL prediction (backend/ml/rul_predictor.py), the Digital
Twin (backend/src/digital_twin.py), the Risk Index (backend/src/risk_index.py)
and the Graph Allocator's "predicted future health" edge term.
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd

DEFAULTS = {
    "eol_soh_threshold": 70.0,
    "base_soh_loss_per_1000_cycles": 6.0,
    "reference_temperature_C": 25.0,
    "thermal_doubling_delta_C": 10.0,
    "ir_stress_reference_mOhm": 45.0,
    "ir_stress_max_multiplier": 1.6,
    "imbalance_stress_reference_mV": 30.0,
    "imbalance_stress_max_multiplier": 1.5,
    "dod_default_fraction": 0.8,
    "dod_stress_exponent": 0.5,
    "charge_rate_default_c": 1.0,
    "charge_rate_stress_exponent": 0.3,
    "age_stress_weight_per_year": 0.02,
    "default_projection_cycles": 100,
    "trend_chart_points": 12,
    "uncertainty_base_pct": 12.0,
    "uncertainty_stress_scaling": 0.5,
}


def _deg_cfg(config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(DEFAULTS)
    cfg.update((config or {}).get("degradation_model", {}))
    return cfg


def _linear_stress_multiplier(value: float, reference: float, ceiling: float, max_multiplier: float) -> float:
    """Linear stress multiplier: 1.0 at `reference`, `max_multiplier` at `ceiling`.
    Below reference the multiplier relaxes below 1.0 (better-than-typical conditions),
    floored so it never implies negative aging."""
    if ceiling <= reference:
        return 1.0
    ratio = (value - reference) / (ceiling - reference)
    mult = 1.0 + ratio * (max_multiplier - 1.0)
    return float(np.clip(mult, 0.6, max_multiplier * 1.25))


def compute_stress_factors(row: pd.Series, config: Dict[str, Any]) -> Dict[str, float]:
    """Decomposes the row into individually explainable stress multipliers."""
    cfg = _deg_cfg(config)
    bounds = (config or {}).get("suitability_score", {}).get("normalization_bounds", {})
    ir_ceiling = bounds.get("ir_max", 90.0)
    imb_ceiling = bounds.get("imbalance_max", 120.0)

    temp_C = float(row.get("temperature_C", cfg["reference_temperature_C"]))
    ir_mOhm = float(row.get("internal_resistance_mOhm", cfg["ir_stress_reference_mOhm"]))
    imbalance_mV = float(row.get("cell_voltage_imbalance_mV", cfg["imbalance_stress_reference_mV"]))
    age_years = float(row.get("age_years", 0.0))
    soc_percent = float(row.get("state_of_charge_percent", 50.0))

    thermal_mult = 2.0 ** ((temp_C - cfg["reference_temperature_C"]) / cfg["thermal_doubling_delta_C"])
    thermal_mult = float(np.clip(thermal_mult, 0.4, 4.0))

    ir_mult = _linear_stress_multiplier(
        ir_mOhm, cfg["ir_stress_reference_mOhm"], ir_ceiling, cfg["ir_stress_max_multiplier"]
    )
    imbalance_mult = _linear_stress_multiplier(
        imbalance_mV, cfg["imbalance_stress_reference_mV"], imb_ceiling, cfg["imbalance_stress_max_multiplier"]
    )

    # DoD is not in the dataset. Weakly proxied from current SoC (lower SoC packs are
    # assumed, on average, to be operated on deeper discharge cycles) then normalized
    # against the disclosed default so the fleet mean multiplier stays close to 1.0.
    dod_estimate = float(np.clip(cfg["dod_default_fraction"] + (50.0 - soc_percent) / 250.0, 0.4, 1.0))
    dod_mult = float((dod_estimate / cfg["dod_default_fraction"]) ** cfg["dod_stress_exponent"])

    # Charge rate is not in the dataset at all; held at a disclosed constant default,
    # so by construction it does not differentiate packs (documented limitation).
    charge_rate_mult = float(cfg["charge_rate_default_c"] ** cfg["charge_rate_stress_exponent"])

    age_mult = float(1.0 + age_years * cfg["age_stress_weight_per_year"])

    overall = thermal_mult * ir_mult * imbalance_mult * dod_mult * charge_rate_mult * age_mult

    return {
        "thermal_multiplier": round(thermal_mult, 4),
        "internal_resistance_multiplier": round(ir_mult, 4),
        "imbalance_multiplier": round(imbalance_mult, 4),
        "depth_of_discharge_multiplier": round(dod_mult, 4),
        "charge_rate_multiplier": round(charge_rate_mult, 4),
        "age_multiplier": round(age_mult, 4),
        "overall_stress_multiplier": round(overall, 4),
        "depth_of_discharge_estimate": round(dod_estimate, 3),
    }


def predicted_loss_per_cycle(row: pd.Series, config: Dict[str, Any]) -> float:
    cfg = _deg_cfg(config)
    stress = compute_stress_factors(row, config)
    base_loss = cfg["base_soh_loss_per_1000_cycles"] / 1000.0
    return float(base_loss * stress["overall_stress_multiplier"])


def predicted_soh_after_cycles(row: pd.Series, config: Dict[str, Any], n_cycles: float) -> float:
    current_soh = float(row.get("state_of_health_percent", 100.0))
    loss_per_cycle = predicted_loss_per_cycle(row, config)
    projected = current_soh - loss_per_cycle * n_cycles
    return float(np.clip(projected, 0.0, 100.0))


def estimate_rul_cycles(row: pd.Series, config: Dict[str, Any]) -> float:
    """Cycles remaining until predicted SoH crosses the industry EOL threshold."""
    cfg = _deg_cfg(config)
    current_soh = float(row.get("state_of_health_percent", 100.0))
    loss_per_cycle = predicted_loss_per_cycle(row, config)
    eol = cfg["eol_soh_threshold"]

    if current_soh <= eol:
        return 0.0
    if loss_per_cycle <= 1e-9:
        return 999999.0

    rul = (current_soh - eol) / loss_per_cycle
    return float(max(0.0, rul))


def estimate_uncertainty_pct(row: pd.Series, config: Dict[str, Any]) -> float:
    """Heuristic confidence band width (%): wider when stress inputs are far from
    the 'reference' conditions this heuristic model was anchored on (i.e. we are
    extrapolating further from calm/typical operating conditions)."""
    cfg = _deg_cfg(config)
    stress = compute_stress_factors(row, config)
    stress_deviation = abs(stress["overall_stress_multiplier"] - 1.0)
    uncertainty = cfg["uncertainty_base_pct"] * (1.0 + cfg["uncertainty_stress_scaling"] * stress_deviation)
    return float(round(uncertainty, 2))


def generate_degradation_trend(
    row: pd.Series,
    config: Dict[str, Any],
    max_cycles: Optional[float] = None,
    points: Optional[int] = None,
) -> List[Dict[str, float]]:
    """Sampled (cycle_offset, predicted_soh) series for charting, from now out to
    either the estimated RUL (capped) or a supplied horizon."""
    cfg = _deg_cfg(config)
    n_points = points or cfg["trend_chart_points"]

    if max_cycles is None:
        rul = estimate_rul_cycles(row, config)
        max_cycles = min(rul * 1.15, 3000.0) if rul < 999999.0 else cfg["default_projection_cycles"] * 5

    max_cycles = max(max_cycles, cfg["default_projection_cycles"])
    step = max_cycles / (n_points - 1) if n_points > 1 else max_cycles

    trend = []
    for i in range(n_points):
        cycle_offset = round(step * i, 1)
        soh = predicted_soh_after_cycles(row, config, cycle_offset)
        trend.append({"cycle_offset": cycle_offset, "predicted_soh_percent": round(soh, 2)})
    return trend
