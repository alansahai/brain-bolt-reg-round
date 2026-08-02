"""
Onsite Twist Adapter & Queue Simulation Engine.

Exposes four extension hook signatures:
1. apply_constraint_patch
2. apply_priority_patch
3. apply_scoring_patch
4. simulate_queue (Real implementation for live queue arrival & wait time tracking)
"""

from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

def apply_constraint_patch(
    classified_batteries: pd.DataFrame,
    patch_config: Dict[str, Any]
) -> pd.DataFrame:
    """
    Hook 1: Dynamically injects or alters battery health/safety constraints.
    Pass-through stub for pre-event build.
    """
    return classified_batteries.copy()

def apply_priority_patch(
    vehicle_requests: pd.DataFrame,
    patch_config: Dict[str, Any]
) -> pd.DataFrame:
    """
    Hook 2: Dynamically alters vehicle priority rules or queue order.
    Pass-through stub for pre-event build.
    """
    return vehicle_requests.copy()

def apply_scoring_patch(
    battery_row: pd.Series,
    patch_config: Dict[str, Any]
) -> float:
    """
    Hook 3: Dynamically modifies suitability score weights or formulas.
    Pass-through stub for pre-event build.
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
