"""
Battery Fleet Health Score.

A single 0-100 number answering the question a station manager actually asks
first: "how healthy is the entire station, without inspecting individual
packs?" Combines 8 already-computed signals (engineering tiering, Battery
Intelligence Engine outputs, fleet composition) into one weighted score,
banded into Excellent / Good / Moderate / Poor / Critical.

Intended to run on the *enriched* fleet DataFrame produced by
backend/src/pipeline.py::enrich_fleet() (so Risk Index / RUL / the Battery
Intelligence Engine's Suitability Score are computed once and reused), but
falls back to the rule-based Suitability Score and a neutral Risk Index if
called on a plain classified DataFrame.

Exposed via `GET /api/fleet-health`.
"""

from typing import Dict, Any
import numpy as np
import pandas as pd

DEFAULT_WEIGHTS = {
    "avg_soh": 0.20,
    "avg_risk_inverted": 0.15,
    "unsafe_pct_inverted": 0.15,
    "utilization": 0.10,
    "avg_rul_normalized": 0.15,
    "avg_suitability": 0.10,
    "available_energy_pct": 0.05,
    "healthy_pct": 0.10,
}

DEFAULT_BANDS = {"excellent_min": 85.0, "good_min": 70.0, "moderate_min": 50.0, "poor_min": 30.0}


def _fh_cfg(config: Dict[str, Any]) -> Dict[str, Any]:
    fh_cfg = (config or {}).get("fleet_health", {})
    weights = dict(DEFAULT_WEIGHTS)
    weights.update(fh_cfg.get("weights", {}))
    bands = dict(DEFAULT_BANDS)
    bands.update(fh_cfg.get("bands", {}))
    return {
        "weights": weights,
        "bands": bands,
        "rul_normalization_cycles": fh_cfg.get("rul_normalization_cycles", 1500.0),
    }


def _band_for(score: float, bands: Dict[str, float]) -> str:
    if score >= bands["excellent_min"]:
        return "Excellent"
    if score >= bands["good_min"]:
        return "Good"
    if score >= bands["moderate_min"]:
        return "Moderate"
    if score >= bands["poor_min"]:
        return "Poor"
    return "Critical"


def compute_fleet_health(df: pd.DataFrame, config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _fh_cfg(config)
    w = cfg["weights"]
    total = len(df)
    if total == 0:
        return {
            "fleet_health_score": 0.0, "band": "Critical", "total_packs": 0,
            "components": {}, "methodology": "No batteries in fleet."
        }

    avg_soh = float(df["state_of_health_percent"].mean())

    risk_series = df["risk_index"] if "risk_index" in df.columns else pd.Series([30.0] * total)
    avg_risk = float(risk_series.mean())
    avg_risk_inverted = 100.0 - avg_risk

    unsafe_pct = float((df["tier"] == "UNSAFE").sum()) / total * 100.0
    unsafe_pct_inverted = 100.0 - unsafe_pct

    deployable = df[df["tier"] != "UNSAFE"]
    assigned_count = float((deployable.get("station_status", pd.Series(dtype=object)) == "ASSIGNED").sum())
    utilization = (assigned_count / max(1, len(deployable))) * 100.0

    if "estimated_rul_cycles" in df.columns:
        rul_capped = df["estimated_rul_cycles"].clip(upper=cfg["rul_normalization_cycles"])
        avg_rul_normalized = float(rul_capped.mean() / cfg["rul_normalization_cycles"] * 100.0)
    else:
        avg_rul_normalized = 50.0  # neutral fallback if RUL wasn't computed upstream

    suitability_series = df["ml_suitability_score"] if "ml_suitability_score" in df.columns else df["suitability_score"]
    avg_suitability = float(suitability_series.mean())

    theoretical_max_energy = (df["nominal_voltage_V"] * df["rated_capacity_Ah"]) / 1000.0
    energy_pct_series = np.clip(df["estimated_available_energy_kWh"] / theoretical_max_energy.replace(0, np.nan), 0, 1) * 100.0
    available_energy_pct = float(energy_pct_series.fillna(0).mean())

    healthy_pct = float((df["tier"] == "SAFE").sum()) / total * 100.0

    components = {
        "avg_soh": round(avg_soh, 2),
        "avg_risk_inverted": round(avg_risk_inverted, 2),
        "unsafe_pct_inverted": round(unsafe_pct_inverted, 2),
        "utilization": round(utilization, 2),
        "avg_rul_normalized": round(np.clip(avg_rul_normalized, 0, 100), 2),
        "avg_suitability": round(avg_suitability, 2),
        "available_energy_pct": round(available_energy_pct, 2),
        "healthy_pct": round(healthy_pct, 2),
    }

    score = sum(w[k] * components[k] for k in w)
    score = float(np.clip(score, 0.0, 100.0))
    band = _band_for(score, cfg["bands"])

    return {
        "fleet_health_score": round(score, 1),
        "band": band,
        "total_packs": total,
        "components": components,
        "component_weights": w,
        "methodology": (
            "Weighted combination of average SoH, inverse average Risk Index, inverse unsafe%, "
            "fleet utilization, normalized average RUL, average Battery Intelligence Engine Suitability Score, available "
            "energy%, and healthy(SAFE)% — see config.yaml: fleet_health."
        ),
    }
