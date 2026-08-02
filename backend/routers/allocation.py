import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from typing import Dict, Any, Optional
import pandas as pd
from fastapi import APIRouter, HTTPException, Body
from backend.src.classification import classify_fleet, load_config, PROJECT_ROOT
from backend.src.allocators.baseline_highest_soc import BaselineHighestSoCAllocator
from backend.src.allocators.proposed_priority_score import ProposedPriorityScoreAllocator
from backend.ml.ensemble_scorer import MLEnsembleAllocator
from backend.src.pipeline import run_battery_intelligence_pipeline
from backend.src.metrics import calculate_kpis, verify_allocation_rules, compute_multi_objective_score
from backend.src.digital_twin import record_allocation

router = APIRouter(prefix="/api/allocate", tags=["Allocation"])


def _record_twin_updates(res) -> None:
    """Digital Twin state is updated after every allocation run so
    `current_allocation_status` / `last_allocated_timestamp` reflect real
    system activity rather than only the static CSV snapshot."""
    for a in res.assignments:
        record_allocation(a.battery_id, a.request_id)

DEFAULT_BATTERY_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Battery_Fleet_200_Packs.csv")
DEFAULT_VEHICLE_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Vehicle_Demand_50_Requests.csv")

from backend.src.twist_adapter import simulate_queue

def _load_data():
    if not os.path.exists(DEFAULT_BATTERY_CSV) or not os.path.exists(DEFAULT_VEHICLE_CSV):
        raise HTTPException(status_code=404, detail="Default datasets not found")
    df_bat = pd.read_csv(DEFAULT_BATTERY_CSV)
    df_veh = pd.read_csv(DEFAULT_VEHICLE_CSV)
    config = load_config()
    classified_bats = classify_fleet(df_bat, config)
    return classified_bats, df_veh, config

@router.post("/baseline")
def allocate_baseline():
    classified_bats, df_veh, config = _load_data()
    allocator = BaselineHighestSoCAllocator(config)
    res = allocator.allocate(classified_bats, df_veh)
    q_sim = simulate_queue(classified_bats, df_veh)
    res.avg_wait_time_min = q_sim["avg_wait_time_min"]
    kpis = calculate_kpis(res)
    verif = verify_allocation_rules(res, classified_bats, df_veh)
    _record_twin_updates(res)
    return {
        "status": "success",
        "result": res.model_dump(),
        "kpis": kpis,
        "verification": verif,
        "multi_objective": compute_multi_objective_score(res, config, classified_bats),
    }

@router.post("/proposed")
def allocate_proposed():
    classified_bats, df_veh, config = _load_data()
    allocator = ProposedPriorityScoreAllocator(config)
    res = allocator.allocate(classified_bats, df_veh)
    q_sim = simulate_queue(classified_bats, df_veh)
    res.avg_wait_time_min = q_sim["avg_wait_time_min"]
    kpis = calculate_kpis(res)
    verif = verify_allocation_rules(res, classified_bats, df_veh)
    _record_twin_updates(res)
    return {
        "status": "success",
        "result": res.model_dump(),
        "kpis": kpis,
        "verification": verif,
        "multi_objective": compute_multi_objective_score(res, config, classified_bats),
    }

def _run_pipeline_endpoint(payload: Optional[Dict[str, Any]]):
    """
    Battery Intelligence Platform — the full layered pipeline:
    Engineering Rule Validation -> Battery Intelligence Engine (Suitability,
    Future Health, RUL, Risk Features) -> Maintenance Recommendation
    -> Graph Optimization -> Final Allocation.

    Accepts an optional `weight_overrides` dict (Priority/Suitability/Risk/
    Future Health/Waiting Time/Energy Match/Fair Usage/Service Rate) so the
    frontend Optimization Settings Panel can rerun the allocation live
    without touching config.yaml.
    """
    if not os.path.exists(DEFAULT_BATTERY_CSV) or not os.path.exists(DEFAULT_VEHICLE_CSV):
        raise HTTPException(status_code=404, detail="Default datasets not found")
    df_bat = pd.read_csv(DEFAULT_BATTERY_CSV)
    df_veh = pd.read_csv(DEFAULT_VEHICLE_CSV)
    config = load_config()

    weight_overrides = (payload or {}).get("weight_overrides")
    pipeline_out = run_battery_intelligence_pipeline(df_bat, df_veh, config, weight_overrides=weight_overrides)
    res = pipeline_out["result"]
    enriched = pipeline_out["enriched_fleet"]

    q_sim = simulate_queue(enriched, df_veh)
    res.avg_wait_time_min = q_sim["avg_wait_time_min"]
    kpis = calculate_kpis(res)
    verif = verify_allocation_rules(res, enriched, df_veh)
    _record_twin_updates(res)

    return {
        "status": "success",
        "result": res.model_dump(),
        "kpis": kpis,
        "verification": verif,
        "explainability": pipeline_out.get("explainability", {}),
        "multi_objective": compute_multi_objective_score(res, config, enriched),
    }


@router.post("/graph")
def allocate_graph(payload: Dict[str, Any] = Body(None)):
    """Kept as an alias of /api/allocate/pipeline (the name predates the
    pipeline restructuring): Graph Optimization is the pipeline's final
    stage, so this now IS the full Battery Intelligence Platform result."""
    return _run_pipeline_endpoint(payload)


@router.post("/pipeline")
def allocate_pipeline(payload: Dict[str, Any] = Body(None)):
    """Battery Intelligence Platform — primary allocation endpoint."""
    return _run_pipeline_endpoint(payload)

@router.post("/ml-ensemble")
def allocate_ml_ensemble():
    classified_bats, df_veh, config = _load_data()
    allocator = MLEnsembleAllocator(config)
    res = allocator.allocate(classified_bats, df_veh)
    q_sim = simulate_queue(classified_bats, df_veh)
    res.avg_wait_time_min = q_sim["avg_wait_time_min"]
    kpis = calculate_kpis(res)
    verif = verify_allocation_rules(res, classified_bats, df_veh)
    _record_twin_updates(res)
    return {
        "status": "success",
        "result": res.model_dump(),
        "kpis": kpis,
        "verification": verif,
        "multi_objective": compute_multi_objective_score(res, config, classified_bats),
    }
