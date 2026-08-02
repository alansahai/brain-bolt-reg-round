"""
What-If Scenario Simulation Engine.

Lets an operator or judge simulate a fleet/demand event and immediately see
its effect on the full Battery Intelligence Platform pipeline — without
touching the live dataset or config.yaml. Every scenario is a pure, in-memory
transformation (of the battery dataframe, the vehicle dataframe, or a copied
config override); nothing here mutates persistent state.

Each scenario reruns backend/src/pipeline.py end to end for both a "before"
(unmodified) and "after" (scenario-applied) run, so the comparison always
reflects the complete layered pipeline (engineering validation -> ML
suitability -> Risk -> RUL -> recommendation -> Graph Optimization), not a
shortcut approximation.

Exposed via `POST /api/simulate`.
"""

from typing import Dict, Any, Optional, List, Tuple
import copy
import numpy as np
import pandas as pd

from backend.src.pipeline import run_battery_intelligence_pipeline
from backend.src.fleet_health import compute_fleet_health
from backend.src.metrics import calculate_kpis, compute_multi_objective_score

SCENARIO_DESCRIPTIONS = {
    "battery_failure": "N batteries suddenly fail and are quarantined mid-operation.",
    "demand_surge": "N additional vehicle requests arrive unexpectedly.",
    "temperature_spike": "Ambient temperature rises fleet-wide (e.g. a depot heatwave).",
    "degradation_increase": "The degradation model's base fade rate is scaled up, simulating harsher real-world wear than assumed.",
    "critical_demand_double": "Critical-priority vehicle demand doubles (e.g. an emergency-fleet surge).",
    "lower_soh_threshold": "The Unsafe SoH cutoff is shifted, simulating a stricter (or looser) safety policy.",
    "custom_weights": "Only the Graph Optimization weights change; fleet and demand are untouched.",
}


def _apply_battery_failure(df_bat: pd.DataFrame, params: Dict[str, Any]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    count = int(params.get("count", 10))
    rng = np.random.RandomState(int(params.get("seed", 42)))
    eligible = list(df_bat[df_bat["station_status"] != "REVIEW/QUARANTINE"].index)
    n = min(count, len(eligible))
    chosen = rng.choice(eligible, size=n, replace=False) if n > 0 else []
    df_bat = df_bat.copy()
    df_bat.loc[chosen, "station_status"] = "REVIEW/QUARANTINE"
    return df_bat, {"batteries_failed": int(n)}


def _apply_demand_surge(df_veh: pd.DataFrame, params: Dict[str, Any]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    count = int(params.get("count", 20))
    rng = np.random.RandomState(int(params.get("seed", 42)))
    base_n = len(df_veh)
    last_arrival = df_veh["arrival_time"].iloc[-1] if "arrival_time" in df_veh.columns and len(df_veh) else "00:00:00"
    new_rows = []
    for i in range(count):
        new_rows.append({
            "request_id": f"SIM-SURGE-{base_n + i + 1:03d}",
            "arrival_time": last_arrival,
            "vehicle_type": rng.choice(["Personal Commuter", "Delivery Cargo", "Fleet Taxi", "Micro Transit"]),
            "required_range_km": float(rng.randint(20, 90)),
            "load_category": rng.choice(["Light", "Medium", "Heavy"]),
            "priority": rng.choice(["Critical", "High", "Normal"], p=[0.15, 0.35, 0.50]),
            "minimum_acceptable_SOC_percent": float(rng.randint(35, 80)),
            "maximum_wait_time_min": float(rng.randint(5, 20)),
        })
    df_veh = pd.concat([df_veh, pd.DataFrame(new_rows)], ignore_index=True)
    return df_veh, {"new_requests": count}


def _apply_temperature_spike(df_bat: pd.DataFrame, params: Dict[str, Any]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    df_bat = df_bat.copy()
    if "target_c" in params:
        target = float(params["target_c"])
        df_bat["temperature_C"] = target
        meta = {"temperature_target_c": target}
    else:
        delta = float(params.get("delta_c", 10.0))
        df_bat["temperature_C"] = df_bat["temperature_C"] + delta
        meta = {"temperature_delta_c": delta}
    return df_bat, meta


def _apply_degradation_increase(config: Dict[str, Any], params: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    pct = float(params.get("increase_pct", 10.0))
    config = copy.deepcopy(config)
    deg_cfg = config.setdefault("degradation_model", {})
    base = deg_cfg.get("base_soh_loss_per_1000_cycles", 6.0)
    deg_cfg["base_soh_loss_per_1000_cycles"] = base * (1.0 + pct / 100.0)
    return config, {"degradation_rate_increase_pct": pct}


def _apply_critical_demand_double(df_veh: pd.DataFrame, params: Dict[str, Any]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    critical = df_veh[df_veh["priority"] == "Critical"].copy()
    if critical.empty:
        return df_veh, {"critical_requests_added": 0}
    critical["request_id"] = critical["request_id"].astype(str) + "-SURGE"
    df_veh = pd.concat([df_veh, critical], ignore_index=True)
    return df_veh, {"critical_requests_added": int(len(critical))}


def _apply_lower_soh_threshold(config: Dict[str, Any], params: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    delta = float(params.get("delta", -10.0))
    config = copy.deepcopy(config)
    hard = config.setdefault("classification", {}).setdefault("hard_unsafe_limits", {})
    hard["soh_min"] = max(0.0, hard.get("soh_min", 70.0) + delta)
    return config, {"new_soh_min_threshold": hard["soh_min"]}


SCENARIO_HANDLERS = {
    "battery_failure": ("battery", _apply_battery_failure),
    "demand_surge": ("vehicle", _apply_demand_surge),
    "temperature_spike": ("battery", _apply_temperature_spike),
    "degradation_increase": ("config", _apply_degradation_increase),
    "critical_demand_double": ("vehicle", _apply_critical_demand_double),
    "lower_soh_threshold": ("config", _apply_lower_soh_threshold),
    "custom_weights": (None, None),
}


def run_scenario(
    df_bat: pd.DataFrame,
    df_veh: pd.DataFrame,
    config: Dict[str, Any],
    scenario_type: str,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if scenario_type not in SCENARIO_HANDLERS:
        raise ValueError(
            f"Unknown scenario_type '{scenario_type}'. Must be one of: {list(SCENARIO_HANDLERS.keys())}"
        )
    params = params or {}
    weight_overrides = params.get("weight_overrides")

    # --- BEFORE: unmodified pipeline run ---
    before_out = run_battery_intelligence_pipeline(df_bat, df_veh, config)
    before_res = before_out["result"]

    # --- Apply scenario transformation (pure, in-memory) ---
    sim_df_bat, sim_df_veh, sim_config = df_bat, df_veh, config
    scenario_meta: Dict[str, Any] = {}
    target, handler = SCENARIO_HANDLERS[scenario_type]
    if target == "battery":
        sim_df_bat, scenario_meta = handler(df_bat, params)
    elif target == "vehicle":
        sim_df_veh, scenario_meta = handler(df_veh, params)
    elif target == "config":
        sim_config, scenario_meta = handler(config, params)

    # --- AFTER: scenario-applied pipeline run ---
    after_out = run_battery_intelligence_pipeline(sim_df_bat, sim_df_veh, sim_config, weight_overrides=weight_overrides)
    after_res = after_out["result"]

    def _snapshot(res, enriched, cfg) -> Dict[str, Any]:
        return {
            "kpis": calculate_kpis(res),
            "fleet_health": compute_fleet_health(enriched, cfg),
            "multi_objective": compute_multi_objective_score(res, cfg, enriched),
        }

    before_assignments = {a.request_id: a.battery_id for a in before_res.assignments}
    after_assignments = {a.request_id: a.battery_id for a in after_res.assignments}

    newly_served = [rid for rid in after_assignments if rid not in before_assignments]
    newly_unserved = [rid for rid in before_assignments if rid not in after_assignments]
    reassigned = [
        rid for rid in after_assignments
        if rid in before_assignments and before_assignments[rid] != after_assignments[rid]
    ]

    return {
        "scenario_type": scenario_type,
        "scenario_description": SCENARIO_DESCRIPTIONS.get(scenario_type, ""),
        "scenario_params": params,
        "scenario_meta": scenario_meta,
        "before": _snapshot(before_res, before_out["enriched_fleet"], config),
        "after": _snapshot(after_res, after_out["enriched_fleet"], sim_config),
        "allocation_changes": {
            "newly_served": newly_served,
            "newly_unserved": newly_unserved,
            "reassigned": reassigned,
            "newly_served_count": len(newly_served),
            "newly_unserved_count": len(newly_unserved),
            "reassigned_count": len(reassigned),
        },
    }
