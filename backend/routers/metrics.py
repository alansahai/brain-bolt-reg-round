import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pandas as pd
from fastapi import APIRouter
from backend.src.classification import classify_fleet, load_config, PROJECT_ROOT
from backend.src.allocators.baseline_highest_soc import BaselineHighestSoCAllocator
from backend.src.allocators.proposed_priority_score import ProposedPriorityScoreAllocator
from backend.ml.ensemble_scorer import MLEnsembleAllocator
from backend.src.graph_allocator import GraphOptimizationAllocator
from backend.src.pipeline import run_battery_intelligence_pipeline, PIPELINE_STAGE_LABELS
from backend.src.fleet_health import compute_fleet_health
from backend.src.sustainability import compute_sustainability_kpis
from backend.src.metrics import calculate_kpis, verify_allocation_rules, compute_multi_objective_score

router = APIRouter(prefix="/api/metrics", tags=["Metrics"])

DEFAULT_BATTERY_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Battery_Fleet_200_Packs.csv")
DEFAULT_VEHICLE_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Vehicle_Demand_50_Requests.csv")

from backend.src.twist_adapter import simulate_queue


@router.get("/compare")
@router.post("/compare")
def compare_all_metrics():
    """
    Method Comparison — Highest-SoC-First (naive baseline) vs the Battery
    Intelligence Platform (Engineering Rule Validation -> Battery
    Intelligence Engine -> Maintenance Recommendation -> Graph Optimization).

    Earlier revisions of this endpoint compared four *competing* allocators
    (Baseline / Rule-Based / Graph / ML) side by side, implying they were
    alternatives to pick from. They are not: the Battery Intelligence Engine
    (ML Suitability + Risk + RUL) enriches every battery and feeds Graph
    Optimization, which is the platform's single final allocator. This
    endpoint reflects that — see backend/src/pipeline.py.
    The legacy rule-based (`/api/allocate/proposed`) and standalone ML
    (`/api/allocate/ml-ensemble`) allocators remain callable directly for API
    completeness/tests but are no longer part of the platform's headline
    comparison.
    """
    df_bat = pd.read_csv(DEFAULT_BATTERY_CSV)
    df_veh = pd.read_csv(DEFAULT_VEHICLE_CSV)
    config = load_config()

    classified_bats = classify_fleet(df_bat, config)
    q_sim = simulate_queue(classified_bats, df_veh)

    res_base = BaselineHighestSoCAllocator(config).allocate(classified_bats, df_veh)
    res_base.avg_wait_time_min = q_sim["avg_wait_time_min"]

    pipeline_out = run_battery_intelligence_pipeline(df_bat, df_veh, config)
    res_platform = pipeline_out["result"]
    enriched = pipeline_out["enriched_fleet"]
    q_sim_platform = simulate_queue(enriched, df_veh)
    res_platform.avg_wait_time_min = q_sim_platform["avg_wait_time_min"]

    kpi_base = calculate_kpis(res_base)
    kpi_platform = calculate_kpis(res_platform)

    v_base = verify_allocation_rules(res_base, classified_bats, df_veh)
    v_platform = verify_allocation_rules(res_platform, enriched, df_veh)

    mo_base = compute_multi_objective_score(res_base, config, classified_bats)
    mo_platform = compute_multi_objective_score(res_platform, config, enriched)

    fleet_health_platform = compute_fleet_health(enriched, config)

    return {
        "status": "success",
        "comparison": {
            "baseline": kpi_base,
            "battery_intelligence": kpi_platform,
        },
        "multi_objective_comparison": {
            "baseline": mo_base,
            "battery_intelligence": mo_platform,
        },
        "verification_summary": {
            "baseline_passed": v_base["all_passed"],
            "battery_intelligence_passed": v_platform["all_passed"],
        },
        "fleet_health": fleet_health_platform,
        "pipeline_stages": PIPELINE_STAGE_LABELS,
    }


@router.get("/sustainability")
def get_sustainability_kpis():
    """
    Sustainability Dashboard — business-level KPIs comparing the Battery
    Intelligence Platform's allocation against the naive baseline: extended
    battery life, prevented unsafe allocations, energy utilization
    efficiency, avoided replacements, maintenance savings, fleet utilization
    improvement, and an illustrative CO2 reduction estimate (clearly marked).
    """
    df_bat = pd.read_csv(DEFAULT_BATTERY_CSV)
    df_veh = pd.read_csv(DEFAULT_VEHICLE_CSV)
    config = load_config()

    classified_bats = classify_fleet(df_bat, config)
    res_base = BaselineHighestSoCAllocator(config).allocate(classified_bats, df_veh)

    pipeline_out = run_battery_intelligence_pipeline(df_bat, df_veh, config)
    res_platform = pipeline_out["result"]
    enriched = pipeline_out["enriched_fleet"]

    kpis = compute_sustainability_kpis(res_base, res_platform, enriched, config)
    return {"status": "success", "sustainability": kpis}


@router.get("/compare/legacy")
def compare_all_metrics_legacy():
    """
    Retained for backward compatibility / internal debugging only: the
    original 4-way comparison (Baseline / Proposed-Rule-Based / Graph /
    ML-Ensemble treated as competing allocators). Not surfaced in the
    dashboard — see /api/metrics/compare for the current platform framing.
    """
    df_bat = pd.read_csv(DEFAULT_BATTERY_CSV)
    df_veh = pd.read_csv(DEFAULT_VEHICLE_CSV)
    config = load_config()

    classified_bats = classify_fleet(df_bat, config)
    q_sim = simulate_queue(classified_bats, df_veh)

    res_base = BaselineHighestSoCAllocator(config).allocate(classified_bats, df_veh)
    res_prop = ProposedPriorityScoreAllocator(config).allocate(classified_bats, df_veh)
    res_graph = GraphOptimizationAllocator(config).allocate(classified_bats, df_veh)
    res_ml = MLEnsembleAllocator(config).allocate(classified_bats, df_veh)

    for res in (res_base, res_prop, res_graph, res_ml):
        res.avg_wait_time_min = q_sim["avg_wait_time_min"]

    return {
        "status": "success",
        "comparison": {
            "baseline": calculate_kpis(res_base),
            "proposed": calculate_kpis(res_prop),
            "graph_optimization": calculate_kpis(res_graph),
            "ml_ensemble": calculate_kpis(res_ml),
        },
    }
