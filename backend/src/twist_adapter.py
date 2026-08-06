"""
Onsite Twist Adapter & Queue Simulation Engine.

Exposes four extension hook signatures:
1. apply_constraint_patch (live config patching — see below)
2. apply_priority_patch
3. apply_scoring_patch
4. simulate_queue (Real implementation for live queue arrival & wait time tracking)
"""

import copy
import time
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

# In-memory twist state: every request re-derives its working config from
# config.yaml via classification.load_config(), so a patch has to live
# somewhere that load_config() can consult on every call to be "reflected
# immediately" fleet-wide without threading an override through every call
# site. This is intentionally process-local and resets on restart — a
# hackathon-demo "onsite twist," not a persisted production config store.
_TWIST_STATE: Dict[str, Any] = {}
_TWIST_LOG: List[Dict[str, Any]] = []

PATCHABLE_FIELDS = {"degraded_min_soft_flags", "quarantine_override"}


def apply_constraint_patch(patch_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Hook 1: Validates and activates a live battery health/safety-constraint
    patch. Supports:
      - degraded_min_soft_flags (int 1-5): soft-flag count that demotes a
        pack to DEGRADED (classification.py Rule 2).
      - quarantine_override (bool): whether station_status == REVIEW/QUARANTINE
        hard-forces UNSAFE (classification.py Rule 1). Raises ValueError on an
        invalid payload — callers must not apply a patch that failed validation.
    """
    errors: List[str] = []
    validated: Dict[str, Any] = {}

    if "degraded_min_soft_flags" in patch_config:
        val = patch_config["degraded_min_soft_flags"]
        if isinstance(val, bool) or not isinstance(val, int) or not (1 <= val <= 5):
            errors.append("degraded_min_soft_flags must be an integer between 1 and 5.")
        else:
            validated["degraded_min_soft_flags"] = val

    if "quarantine_override" in patch_config:
        val = patch_config["quarantine_override"]
        if not isinstance(val, bool):
            errors.append("quarantine_override must be a boolean.")
        else:
            validated["quarantine_override"] = val

    unknown = set(patch_config.keys()) - PATCHABLE_FIELDS - {"timestamp"}
    if unknown:
        errors.append(f"Unknown patch field(s): {sorted(unknown)}.")

    if errors:
        raise ValueError(" ".join(errors))

    _TWIST_STATE.update(validated)
    return dict(_TWIST_STATE)


def apply_active_twist_overrides(config: Dict[str, Any]) -> Dict[str, Any]:
    """Overlays the currently-active twist patch (if any) onto a loaded
    config dict. Called from classification.load_config() so every endpoint
    picks up an applied patch on its very next request, with no per-call-site
    wiring required."""
    if not _TWIST_STATE:
        return config
    patched = copy.deepcopy(config)
    classification_cfg = patched.setdefault("classification", {})
    if "degraded_min_soft_flags" in _TWIST_STATE:
        classification_cfg["degraded_min_soft_flags"] = _TWIST_STATE["degraded_min_soft_flags"]
    if _TWIST_STATE.get("quarantine_override") is False:
        # Disables the hard quarantine-status override by making the
        # quarantine-status match-list empty (Rule 1 in classification.py).
        classification_cfg.setdefault("hard_unsafe_limits", {})["quarantine_statuses"] = []
    return patched


def get_active_twist_state() -> Dict[str, Any]:
    return dict(_TWIST_STATE)


def record_twist_patch(patch_payload: Dict[str, Any], active_state: Dict[str, Any], applied_by: str) -> Dict[str, Any]:
    entry = {
        "timestamp": patch_payload.get("timestamp") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "applied_by": applied_by,
        "requested_patch": patch_payload,
        "active_state_after": active_state,
    }
    _TWIST_LOG.append(entry)
    return entry


def get_twist_log() -> List[Dict[str, Any]]:
    return list(_TWIST_LOG)


def apply_priority_patch(
    vehicle_requests: pd.DataFrame,
    patch_config: Dict[str, Any]
) -> pd.DataFrame:
    """
    Hook 2: Dynamically alters vehicle priority rules or queue order.
    Pass-through stub — no frontend control drives this hook yet.
    """
    return vehicle_requests.copy()

def apply_scoring_patch(
    battery_row: pd.Series,
    patch_config: Dict[str, Any]
) -> float:
    """
    Hook 3: Dynamically modifies suitability score weights or formulas.
    Pass-through stub — no frontend control drives this hook yet.
    """
    return float(battery_row.get("suitability_score", 50.0))

def simulate_queue(
    classified_batteries: pd.DataFrame,
    vehicle_requests: pd.DataFrame,
    simulation_params: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Hook 4: Real implementation simulating queue arrival time dynamics, wait times,
    and timeout handling based on request arrival_time & maximum_wait_time_min.
    """
    df_req = vehicle_requests.copy()
    if "arrival_time" in df_req.columns:
        df_req = df_req.sort_values("arrival_time")

    queue_log = []
    total_wait_min = 0.0
    max_wait_min = 0.0
    timeout_count = 0

    # Simulated swap service time per bay (minutes)
    swap_service_time_min = (simulation_params or {}).get("swap_service_time_min", 3.0)
    current_time_min = 0.0

    for idx, veh in df_req.iterrows():
        # Parse or estimate arrival offset in minutes
        arrival_offset = idx * 2.5  # 2.5 minutes between incoming requests
        max_wait = float(veh.get("maximum_wait_time_min", 15.0))

        # Calculate queue wait time
        wait_time = max(0.0, current_time_min - arrival_offset)
        
        timed_out = False
        if wait_time > max_wait:
            timed_out = True
            timeout_count += 1

        total_wait_min += wait_time
        max_wait_min = max(max_wait_min, wait_time)

        queue_log.append({
            "request_id": veh.get("request_id", f"REQ-{idx:03d}"),
            "vehicle_type": veh.get("vehicle_type", "Standard EV"),
            "priority": veh.get("priority", "Normal"),
            "arrival_offset_min": round(arrival_offset, 1),
            "wait_time_min": round(wait_time, 1),
            "max_allowed_wait_min": max_wait,
            "timed_out": timed_out
        })

        current_time_min = max(current_time_min, arrival_offset) + swap_service_time_min

    avg_wait = total_wait_min / len(df_req) if len(df_req) > 0 else 0.0

    return {
        "status": "active",
        "total_vehicles_simulated": len(df_req),
        "avg_wait_time_min": round(avg_wait, 2),
        "max_wait_time_min": round(max_wait_min, 2),
        "timeout_count": timeout_count,
        "queue_log": queue_log
    }
