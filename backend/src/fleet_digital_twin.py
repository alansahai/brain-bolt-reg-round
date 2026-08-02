"""
Fleet Digital Twin.

Extends the per-battery Digital Twin (backend/src/digital_twin.py) into a
station-wide software twin. The distinction matters:

  - Battery Digital Twin  (digital_twin.py)      -> ONE pack: its own current
    state, predicted future state, lifecycle timeline, and allocation
    history. Answers "what will happen to THIS battery?"
  - Fleet Digital Twin    (this module)          -> the WHOLE station:
    aggregate health, utilization, queueing, charging capacity, and a
    fleet-wide future-capacity projection. Answers "what will happen to the
    STATION?"

The Fleet Digital Twin is built by aggregating the same enriched fleet
DataFrame (backend/src/pipeline.py::enrich_fleet()) and the same queue
simulation (backend/src/twist_adapter.py::simulate_queue()) used elsewhere in
the platform — no new data source, just a station-level rollup. Like the
per-battery twin, this is a software projection from the current static
snapshot, not a live telemetry feed.

Exposed via `GET /api/fleet-digital-twin`.
"""

from typing import Dict, Any, List
import numpy as np
import pandas as pd

from backend.src.fleet_health import compute_fleet_health
from backend.src.twist_adapter import simulate_queue

DEFAULT_CFG = {
    "swap_service_time_min": 3.0,
}


def _fleet_twin_cfg(config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(DEFAULT_CFG)
    cfg.update((config or {}).get("fleet_digital_twin", {}))
    return cfg


def _peak_concurrent_demand(queue_log: List[Dict[str, Any]], service_time_min: float) -> int:
    """Sweep-line count of the maximum number of vehicles simultaneously
    queued or being served, from the queue simulation's arrival/wait times."""
    if not queue_log:
        return 0
    events = []
    for entry in queue_log:
        start = entry["arrival_offset_min"]
        end = start + entry["wait_time_min"] + service_time_min
        events.append((start, 1))
        events.append((end, -1))
    events.sort(key=lambda e: (e[0], -e[1]))  # process arrivals before departures at the same instant

    concurrent = 0
    peak = 0
    for _, delta in events:
        concurrent += delta
        peak = max(peak, concurrent)
    return int(peak)


def compute_fleet_digital_twin(
    enriched_df: pd.DataFrame,
    vehicle_requests: pd.DataFrame,
    config: Dict[str, Any],
) -> Dict[str, Any]:
    cfg = _fleet_twin_cfg(config)
    total = len(enriched_df)

    fleet_health = compute_fleet_health(enriched_df, config)

    deployable = enriched_df[enriched_df["tier"] != "UNSAFE"]
    assigned = deployable[deployable.get("station_status", pd.Series(dtype=object)) == "ASSIGNED"]
    current_utilization_pct = round(len(assigned) / max(1, len(deployable)) * 100.0, 1)

    tier_counts = enriched_df["tier"].value_counts().to_dict()
    battery_availability = {
        "safe": int(tier_counts.get("SAFE", 0)),
        "degraded": int(tier_counts.get("DEGRADED", 0)),
        "unsafe": int(tier_counts.get("UNSAFE", 0)),
        "total": total,
        "deployable": int(len(deployable)),
    }

    theoretical_max_energy = (enriched_df["nominal_voltage_V"] * enriched_df["rated_capacity_Ah"]) / 1000.0
    charging_capacity_kwh = {
        "installed_capacity_kwh": round(float(theoretical_max_energy.sum()), 1),
        "currently_available_kwh": round(float(enriched_df["estimated_available_energy_kWh"].sum()), 1),
        "deployable_available_kwh": round(float(deployable["estimated_available_energy_kWh"].sum()), 1),
    }

    average_risk_index = round(float(enriched_df.get("risk_index", pd.Series([0.0])).mean()), 1)

    rul_series = enriched_df.get("estimated_rul_cycles")
    average_rul_cycles = round(float(rul_series.clip(upper=5000).mean()), 0) if rul_series is not None else None

    q_sim = simulate_queue(enriched_df, vehicle_requests)
    peak_demand = _peak_concurrent_demand(q_sim.get("queue_log", []), cfg["swap_service_time_min"])

    # Future Capacity Prediction: scales each battery's *currently available*
    # energy by its own predicted-future-SoH / current-SoH ratio (a
    # disclosed simplification — assumes usable energy degrades in step with
    # SoH, not a separate energy-fade model).
    future_capacity_kwh = None
    future_capacity_change_pct = None
    if "predicted_future_soh" in enriched_df.columns:
        soh = enriched_df["state_of_health_percent"].replace(0, np.nan)
        ratio = (enriched_df["predicted_future_soh"] / soh).clip(0, 1.2).fillna(1.0)
        future_energy = enriched_df["estimated_available_energy_kWh"] * ratio
        future_capacity_kwh = round(float(future_energy.sum()), 1)
        current_kwh = charging_capacity_kwh["currently_available_kwh"]
        future_capacity_change_pct = (
            round((future_capacity_kwh - current_kwh) / current_kwh * 100.0, 1) if current_kwh > 0 else 0.0
        )

    return {
        "total_packs": total,
        "fleet_health": fleet_health,
        "current_utilization_pct": current_utilization_pct,
        "battery_availability": battery_availability,
        "charging_capacity": charging_capacity_kwh,
        "charging_queue": {
            "total_vehicles_simulated": q_sim.get("total_vehicles_simulated", 0),
            "avg_wait_time_min": q_sim.get("avg_wait_time_min", 0.0),
            "max_wait_time_min": q_sim.get("max_wait_time_min", 0.0),
            "timeout_count": q_sim.get("timeout_count", 0),
        },
        "average_risk_index": average_risk_index,
        "average_rul_cycles": average_rul_cycles,
        "peak_demand_concurrent_vehicles": peak_demand,
        "future_capacity_prediction": {
            "projection_horizon_cycles": config.get("battery_intelligence_platform", {}).get(
                "future_health_projection_cycles", 50
            ),
            "predicted_available_kwh": future_capacity_kwh,
            "change_pct": future_capacity_change_pct,
        },
        "methodology": (
            "Station-wide rollup of the enriched fleet (Fleet Health, Battery Intelligence Engine outputs) and "
            "the queue simulation (backend/src/twist_adapter.py). Future Capacity Prediction scales each "
            "battery's currently-available energy by its own predicted-future-SoH ratio — a disclosed "
            "simplification, not a separate energy-fade model. See backend/src/digital_twin.py for the "
            "per-battery twin this aggregates."
        ),
    }
