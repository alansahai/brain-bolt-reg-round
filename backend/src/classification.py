import os
import yaml
import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple, Optional

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))

def load_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    if not os.path.isabs(config_path):
        config_path = os.path.join(PROJECT_ROOT, config_path)
    with open(config_path, "r") as f:
        return yaml.safe_load(f)

def calculate_suitability_components(row: pd.Series, config: Dict[str, Any]) -> Dict[str, float]:
    """
    Computes the 5 individual (0-100, higher-is-better) component scores that
    feed the Battery Suitability Score, without collapsing them into the final
    weighted sum. Exposed separately so the Explainable AI layer
    (backend/src/explainability.py) can attribute the total score to its parts
    without duplicating the normalization logic.
    """
    bounds = config["suitability_score"]["normalization_bounds"]

    # 1. SoH score (higher is better)
    soh_norm = np.clip((row["state_of_health_percent"] - bounds["soh_min"]) / (bounds["soh_max"] - bounds["soh_min"]), 0.0, 1.0)
    s_soh = soh_norm * 100.0

    # 2. Internal resistance score (lower is better)
    ir_norm = np.clip((row["internal_resistance_mOhm"] - bounds["ir_min"]) / (bounds["ir_max"] - bounds["ir_min"]), 0.0, 1.0)
    s_ir = (1.0 - ir_norm) * 100.0

    # 3. Voltage imbalance score (lower is better)
    imb_norm = np.clip((row["cell_voltage_imbalance_mV"] - bounds["imbalance_min"]) / (bounds["imbalance_max"] - bounds["imbalance_min"]), 0.0, 1.0)
    s_imb = (1.0 - imb_norm) * 100.0

    # 4. Temperature score (lower/optimal is better)
    temp_norm = np.clip((row["temperature_C"] - bounds["temp_min"]) / (bounds["temp_max"] - bounds["temp_min"]), 0.0, 1.0)
    s_temp = (1.0 - temp_norm) * 100.0

    # 5. Cycle count score (lower is better)
    cyc_norm = np.clip((row["cycle_count"] - bounds["cycle_min"]) / (bounds["cycle_max"] - bounds["cycle_min"]), 0.0, 1.0)
    s_cyc = (1.0 - cyc_norm) * 100.0

    return {
        "soh": float(s_soh),
        "internal_resistance": float(s_ir),
        "voltage_imbalance": float(s_imb),
        "temperature": float(s_temp),
        "cycle_count": float(s_cyc),
    }


def calculate_suitability_score(row: pd.Series, config: Dict[str, Any]) -> float:
    """
    Computes a linear Battery Suitability Score (0-100) using 5 parameters:
    1. State of Health (SoH %)
    2. Internal Resistance (mOhm)
    3. Cell Voltage Imbalance (mV)
    4. Current Temperature (°C)
    5. Cycle Count
    """
    weights = config["suitability_score"]["weights"]
    components = calculate_suitability_components(row, config)

    score = (
        weights["soh"] * components["soh"] +
        weights["internal_resistance"] * components["internal_resistance"] +
        weights["voltage_imbalance"] * components["voltage_imbalance"] +
        weights["temperature"] * components["temperature"] +
        weights["cycle_count"] * components["cycle_count"]
    )
    return float(np.round(np.clip(score, 0.0, 100.0), 2))

def classify_battery_row(row: pd.Series, config: Dict[str, Any]) -> str:
    """
    Classifies a battery pack into one of three tiers: SAFE, DEGRADED, or UNSAFE.
    
    Rule 1 (Hard Unsafe): If station_status is in quarantine OR any parameter violates hard unsafe limits, returns UNSAFE.
    Rule 2 (Count-Based Soft Flags): For non-unsafe packs, counts soft flags (failing safe upper limits).
            If soft_flags >= degraded_min_soft_flags (default: 2), returns DEGRADED.
    Rule 3 (Safe): Otherwise returns SAFE.
    """
    c_class = config["classification"]
    hard = c_class["hard_unsafe_limits"]
    safe = c_class["safe_upper_limits"]
    min_flags = c_class.get("degraded_min_soft_flags", 2)

    # Hard Unsafe Checks
    if row["station_status"] in hard["quarantine_statuses"]:
        return "UNSAFE"
    if row["state_of_health_percent"] < hard["soh_min"]:
        return "UNSAFE"
    if row["internal_resistance_mOhm"] > hard["internal_resistance_max"]:
        return "UNSAFE"
    if row["cell_voltage_imbalance_mV"] > hard["cell_voltage_imbalance_max"]:
        return "UNSAFE"
    if row["temperature_C"] > hard["temperature_max"]:
        return "UNSAFE"
    if row["max_temperature_last_24h_C"] > hard["max_temperature_24h_max"]:
        return "UNSAFE"

    # Soft Flags Count (non-unsafe packs)
    soft_flags = 0
    if row["state_of_health_percent"] < safe["soh_min"]:
        soft_flags += 1
    if row["internal_resistance_mOhm"] > safe["internal_resistance_max"]:
        soft_flags += 1
    if row["cell_voltage_imbalance_mV"] > safe["cell_voltage_imbalance_max"]:
        soft_flags += 1
    if row["temperature_C"] > safe["temperature_max"]:
        soft_flags += 1
    if row["max_temperature_last_24h_C"] > safe["max_temperature_24h_max"]:
        soft_flags += 1

    if soft_flags >= min_flags:
        return "DEGRADED"

    return "SAFE"

def classify_fleet(df: pd.DataFrame, config: Optional[Dict[str, Any]] = None) -> pd.DataFrame:
    if config is None:
        config = load_config()

    df_out = df.copy()
    df_out["tier"] = df_out.apply(lambda r: classify_battery_row(r, config), axis=1)
    df_out["suitability_score"] = df_out.apply(lambda r: calculate_suitability_score(r, config), axis=1)
    return df_out
