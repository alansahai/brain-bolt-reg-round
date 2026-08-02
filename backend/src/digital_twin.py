"""
Battery Digital Twin.

A lightweight, entirely software-side virtual state per battery pack. Two
parts:

1. A *computed* projection (stateless, re-derived every request from the
   current snapshot via the degradation model / risk index / RUL predictor) —
   remaining cycles, predicted future SoH, expected maintenance date, future
   availability.
2. A *persisted* allocation history slice (last allocated timestamp, last
   assigned request, allocation count) — the one piece of real state that
   genuinely changes over time as the system runs. Stored the same way
   `backend/src/live_session.py` stores session state: a small JSON file
   under `backend/data/`, updated by `record_allocation()` whenever any
   allocator (baseline/proposed/ml-ensemble/graph) produces an assignment.

No claim is made that this is a physics simulation or a connected IoT twin —
it is a decision-support projection built from the same static snapshot used
everywhere else in this system.
"""

import os
import json
import threading
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import pandas as pd

from backend.src.classification import PROJECT_ROOT
from backend.src.degradation_model import (
    predicted_soh_after_cycles,
    estimate_rul_cycles,
    generate_degradation_trend,
    _deg_cfg,
)
from backend.src.risk_index import compute_risk_index

STATE_PATH = os.path.join(PROJECT_ROOT, "backend/data/digital_twin_state.json")

DEFAULT_CFG = {
    "assumed_cycles_per_day": 2.5,
    "maintenance_trigger_rul_cycles": 150,
}

_lock = threading.Lock()


def _twin_cfg(config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(DEFAULT_CFG)
    cfg.update((config or {}).get("digital_twin", {}))
    return cfg


def _load_state() -> Dict[str, Any]:
    if not os.path.exists(STATE_PATH):
        return {}
    try:
        with open(STATE_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save_state(state: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with _lock:
        with open(STATE_PATH, "w") as f:
            json.dump(state, f, indent=2)


def record_allocation(battery_id: str, request_id: str, timestamp: Optional[str] = None) -> None:
    """Called by the allocation routers after any allocator assigns a battery,
    so the Digital Twin's allocation history reflects real system activity."""
    state = _load_state()
    ts = timestamp or datetime.utcnow().isoformat()
    entry = state.get(battery_id, {"allocation_count": 0})
    entry["last_allocated_timestamp"] = ts
    entry["last_assigned_request_id"] = request_id
    entry["allocation_count"] = entry.get("allocation_count", 0) + 1
    state[battery_id] = entry
    _save_state(state)


def reset_twin_state() -> None:
    _save_state({})


def get_allocation_counts(battery_ids: List[str]) -> Dict[str, int]:
    """Battery Intelligence Platform — Fair Usage signal: how many times each
    battery has been allocated so far this session/deployment, so the Graph
    Optimization allocator can spread wear across the fleet rather than
    always picking the same 'best' packs."""
    state = _load_state()
    return {bid: state.get(bid, {}).get("allocation_count", 0) for bid in battery_ids}


def _current_allocation_status(row: pd.Series, tier: str) -> str:
    station_status = str(row.get("station_status", "AVAILABLE"))
    if station_status == "REVIEW/QUARANTINE" or tier == "UNSAFE":
        return "QUARANTINED"
    if station_status == "ASSIGNED":
        return "ASSIGNED"
    return "AVAILABLE"


def build_twin(row: pd.Series, config: Dict[str, Any], tier: str = None) -> Dict[str, Any]:
    cfg = _twin_cfg(config)
    deg_cfg = _deg_cfg(config)
    tier = tier or row.get("tier", "SAFE")

    horizon = deg_cfg["default_projection_cycles"]
    predicted_soh = predicted_soh_after_cycles(row, config, horizon)
    rul_cycles = estimate_rul_cycles(row, config)
    risk = compute_risk_index(row, config)

    # Cycles remaining until the RUL crosses the maintenance-trigger threshold.
    cycles_until_trigger = None
    if rul_cycles < 999999.0:
        cycles_until_trigger = max(0.0, rul_cycles - cfg["maintenance_trigger_rul_cycles"])
    days_until_maintenance = (
        round(cycles_until_trigger / cfg["assumed_cycles_per_day"], 1)
        if cycles_until_trigger is not None else None
    )
    expected_maintenance_date = (
        (datetime.utcnow() + timedelta(days=days_until_maintenance)).date().isoformat()
        if days_until_maintenance is not None else None
    )

    allocation_state = _load_state().get(str(row.get("battery_id", "")), {})
    cycles_per_day = cfg["assumed_cycles_per_day"]
    today = datetime.utcnow().date()
    current_soh = float(row.get("state_of_health_percent", 0.0))

    def _date_after_cycles(n_cycles: float) -> str:
        return (today + timedelta(days=round(n_cycles / cycles_per_day, 1))).isoformat()

    expected_retirement_date = _date_after_cycles(rul_cycles) if rul_cycles < 999999.0 else None
    maintenance_window = (
        {
            "trigger_date": expected_maintenance_date,
            "recommended_by_date": (
                datetime.fromisoformat(expected_maintenance_date) + timedelta(days=14)
            ).date().isoformat(),
        }
        if expected_maintenance_date
        else None
    )

    allocation_count = allocation_state.get("allocation_count", 0)
    last_allocated_timestamp = allocation_state.get("last_allocated_timestamp")

    # Battery Digital Twin lifecycle timeline: Today -> Allocated -> +100 Cycles
    # -> Maintenance Due -> Predicted End of Life -> Replacement. Purely a
    # projection from the current snapshot (see module docstring) plus the
    # one genuinely-persisted fact: whether/when this pack has been allocated.
    timeline_stages = [
        {
            "stage": "Today",
            "cycle_offset": 0,
            "date": today.isoformat(),
            "predicted_soh_percent": round(current_soh, 2),
            "status": "Current",
        },
        {
            "stage": "Allocated",
            "cycle_offset": 0,
            "date": last_allocated_timestamp.split("T")[0] if last_allocated_timestamp else None,
            "predicted_soh_percent": round(current_soh, 2),
            "status": "Assigned" if allocation_count > 0 else "Not Yet Allocated",
        },
        {
            "stage": "+100 Cycles",
            "cycle_offset": 100,
            "date": _date_after_cycles(100),
            "predicted_soh_percent": round(predicted_soh_after_cycles(row, config, 100), 2),
            "status": "Projected",
        },
        {
            "stage": "Maintenance Due",
            "cycle_offset": round(cycles_until_trigger, 1) if cycles_until_trigger is not None else None,
            "date": expected_maintenance_date,
            "predicted_soh_percent": (
                round(predicted_soh_after_cycles(row, config, cycles_until_trigger), 2)
                if cycles_until_trigger is not None else None
            ),
            "status": "Maintenance",
        },
        {
            "stage": "Predicted End of Life",
            "cycle_offset": round(rul_cycles, 1) if rul_cycles < 999999.0 else None,
            "date": expected_retirement_date,
            "predicted_soh_percent": deg_cfg["eol_soh_threshold"],
            "status": "End of Life",
        },
        {
            "stage": "Replacement",
            "cycle_offset": round(rul_cycles, 1) if rul_cycles < 999999.0 else None,
            "date": expected_retirement_date,
            "predicted_soh_percent": None,
            "status": "Replace",
        },
    ]

    return {
        "battery_id": str(row.get("battery_id", "UNKNOWN")),
        "current_state": {
            "state_of_charge_percent": float(row.get("state_of_charge_percent", 0.0)),
            "state_of_health_percent": float(row.get("state_of_health_percent", 0.0)),
            "cycle_count": int(row.get("cycle_count", 0)),
            "temperature_C": float(row.get("temperature_C", 0.0)),
            "internal_resistance_mOhm": float(row.get("internal_resistance_mOhm", 0.0)),
            "cell_voltage_imbalance_mV": float(row.get("cell_voltage_imbalance_mV", 0.0)),
            "tier": tier,
            "risk_band": risk["risk_band"],
            "station_status": str(row.get("station_status", "AVAILABLE")),
        },
        "predicted_future_state": {
            "projection_horizon_cycles": horizon,
            "predicted_soh_percent": round(predicted_soh, 2),
            "estimated_rul_cycles": round(rul_cycles, 1) if rul_cycles < 999999.0 else None,
            "remaining_life_cycles": round(rul_cycles, 1) if rul_cycles < 999999.0 else None,
            "future_availability": bool(predicted_soh >= deg_cfg["eol_soh_threshold"]),
            "expected_maintenance_date": expected_maintenance_date,
            "days_until_maintenance_trigger": days_until_maintenance,
            "maintenance_window": maintenance_window,
            "expected_retirement_date": expected_retirement_date,
        },
        "allocation": {
            "current_allocation_status": _current_allocation_status(row, tier),
            "last_allocated_timestamp": last_allocated_timestamp,
            "last_assigned_request_id": allocation_state.get("last_assigned_request_id"),
            "allocation_count": allocation_count,
        },
        "timeline": generate_degradation_trend(row, config),
        "timeline_stages": timeline_stages,
    }


def build_all_twins(df: pd.DataFrame, config: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [build_twin(row, config, tier=row.get("tier")) for _, row in df.iterrows()]
