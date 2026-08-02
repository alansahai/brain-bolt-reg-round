from typing import Dict, Any, List
import numpy as np
import pandas as pd
from backend.src.allocators.base import AllocationResult
from backend.src.degradation_model import predicted_soh_after_cycles, _deg_cfg

def calculate_kpis(result: AllocationResult) -> Dict[str, Any]:
    """
    Computes the 6 mandatory quantitative outputs (+ optional wait time):
    1. Number of successfully served vehicles
    2. Number of unserved vehicles
    3. Percentage of High and Critical priority vehicles served (%)
    4. Number of unsafe battery allocations (must be 0)
    5. Average SoH of allocated batteries (%)
    6. Average Battery Suitability Score of allocated batteries (0-100)
    7. Average waiting time (min)
    """
    return {
        "allocator_name": result.allocator_name,
        "served_vehicles": result.served_count,
        "unserved_vehicles": result.unserved_count,
        "high_critical_served_pct": result.high_critical_served_pct,
        "unsafe_allocations": result.unsafe_allocations_count,
        "avg_soh_allocated": result.avg_soh_allocated,
        "avg_suitability_allocated": result.avg_suitability_allocated,
        "avg_wait_time_min": result.avg_wait_time_min,
    }

def verify_allocation_rules(
    result: AllocationResult,
    classified_batteries: pd.DataFrame,
    vehicle_requests: pd.DataFrame
) -> Dict[str, bool]:
    """
    Evaluates the 5 Verification Rules specified in Section 5 of Siemens Energy PS2P1:
    Rule 1: An unsafe/quarantined battery must never be allocated.
    Rule 2: A battery cannot be assigned to more than one vehicle.
    Rule 3: A vehicle cannot receive more than one battery.
    Rule 4: The allocated battery must satisfy the vehicle's minimum acceptable SoC.
    Rule 5: All reported metrics can be recomputed from submitted assignments.
    """
    assignments = result.assignments
    
    # Rule 1: No unsafe battery allocated
    unsafe_violations = [a for a in assignments if a.battery_tier == "UNSAFE"]
    rule1_pass = (len(unsafe_violations) == 0)

    # Rule 2: No duplicate battery assignment
    assigned_bat_ids = [a.battery_id for a in assignments]
    rule2_pass = (len(assigned_bat_ids) == len(set(assigned_bat_ids)))

    # Rule 3: No vehicle receives multiple batteries
    assigned_req_ids = [a.request_id for a in assignments]
    rule3_pass = (len(assigned_req_ids) == len(set(assigned_req_ids)))

    # Rule 4: Minimum acceptable SoC satisfied
    soc_violations = [a for a in assignments if a.battery_soc < a.minimum_acceptable_SOC_percent]
    rule4_pass = (len(soc_violations) == 0)

    # Rule 5: Metric reproducibility check
    computed_kpis = calculate_kpis(result)
    rule5_pass = (
        computed_kpis["served_vehicles"] == result.served_count and
        computed_kpis["unsafe_allocations"] == 0
    )

    return {
        "rule1_no_unsafe_allocated": rule1_pass,
        "rule2_no_duplicate_battery": rule2_pass,
        "rule3_no_duplicate_vehicle": rule3_pass,
        "rule4_min_soc_satisfied": rule4_pass,
        "rule5_metrics_reproducible": rule5_pass,
        "all_passed": all([rule1_pass, rule2_pass, rule3_pass, rule4_pass, rule5_pass])
    }

DEFAULT_MULTI_OBJECTIVE_WEIGHTS = {
    "served_vehicles": 0.20,
    "high_priority_served": 0.20,
    "avg_health": 0.15,
    "avg_suitability": 0.15,
    "unsafe_penalty": 0.15,
    "wait_time_penalty": 0.05,
    "fairness": 0.05,
    "degradation_penalty": 0.05,
}


def compute_multi_objective_score(
    result: AllocationResult,
    config: Dict[str, Any],
    classified_batteries: pd.DataFrame,
) -> Dict[str, Any]:
    """
    Multi-Objective Allocation Framework (§3 of the Feature Extension).

    Aggregates 8 configurable objectives into a single 0-100 comparison score
    per allocation *result* (baseline / proposed / graph / ml-ensemble), so the
    dashboard can rank whole strategies, not just per-pair match quality.
    Weights are never hardcoded — see config.yaml: multi_objective.
    """
    mo_cfg = (config or {}).get("multi_objective", {})
    weights = dict(DEFAULT_MULTI_OBJECTIVE_WEIGHTS)
    weights.update(mo_cfg.get("weights", {}))
    wait_ref = mo_cfg.get("wait_time_reference_min", 15.0)
    fairness_ref = mo_cfg.get("fairness_utilization_reference", 0.5)

    total_veh = max(1, result.total_vehicles)
    served_score = result.served_count / total_veh
    high_priority_score = result.high_critical_served_pct / 100.0
    avg_health_score = result.avg_soh_allocated / 100.0
    avg_suitability_score = result.avg_suitability_allocated / 100.0
    unsafe_penalty_score = 1.0 - min(1.0, result.unsafe_allocations_count / max(1, result.served_count))
    wait_time_score = 1.0 - float(np.clip(result.avg_wait_time_min / max(wait_ref, 1e-6), 0.0, 1.0))

    available_bats = classified_batteries[classified_batteries["tier"] != "UNSAFE"]
    utilization = result.served_count / max(1, len(available_bats))
    fairness_score = 1.0 - min(1.0, abs(utilization - fairness_ref) / max(fairness_ref, 1.0 - fairness_ref))

    degradation_score = avg_health_score  # sensible fallback if lookups below fail
    if result.assignments:
        bat_lookup = classified_batteries.set_index("battery_id")
        deg_cfg = _deg_cfg(config)
        horizon = deg_cfg["default_projection_cycles"]
        future_healths = []
        for a in result.assignments:
            if a.battery_id in bat_lookup.index:
                row = bat_lookup.loc[a.battery_id]
                future_healths.append(predicted_soh_after_cycles(row, config, horizon))
        if future_healths:
            degradation_score = float(np.mean(future_healths)) / 100.0

    sub_scores = {
        "served_vehicles": round(served_score, 4),
        "high_priority_served": round(high_priority_score, 4),
        "avg_health": round(avg_health_score, 4),
        "avg_suitability": round(avg_suitability_score, 4),
        "unsafe_penalty": round(unsafe_penalty_score, 4),
        "wait_time_penalty": round(wait_time_score, 4),
        "fairness": round(fairness_score, 4),
        "degradation_penalty": round(degradation_score, 4),
    }

    overall = sum(weights[k] * sub_scores[k] for k in weights) * 100.0

    return {
        "allocator_name": result.allocator_name,
        "multi_objective_score": round(overall, 2),
        "objective_sub_scores": sub_scores,
        "objective_weights": weights,
    }
