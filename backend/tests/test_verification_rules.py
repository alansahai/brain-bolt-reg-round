import pytest
import pandas as pd
from backend.src.classification import classify_fleet, load_config
from backend.src.allocators.baseline_highest_soc import BaselineHighestSoCAllocator
from backend.src.allocators.proposed_priority_score import ProposedPriorityScoreAllocator
from backend.ml.ensemble_scorer import MLEnsembleAllocator
from backend.src.metrics import verify_allocation_rules, calculate_kpis

def test_verification_rules_all_three_modes():
    df_bat = pd.read_csv("data/Problem_1_Battery_Fleet_200_Packs.csv")
    df_veh = pd.read_csv("data/Problem_1_Vehicle_Demand_50_Requests.csv")
    config = load_config("config.yaml")

    classified_bats = classify_fleet(df_bat, config)

    # 1. Test Baseline Allocator
    baseline = BaselineHighestSoCAllocator(config)
    res_base = baseline.allocate(classified_bats, df_veh)
    v_base = verify_allocation_rules(res_base, classified_bats, df_veh)

    assert v_base["rule1_no_unsafe_allocated"], "Baseline failed Rule 1"
    assert v_base["rule2_no_duplicate_battery"], "Baseline failed Rule 2"
    assert v_base["rule3_no_duplicate_vehicle"], "Baseline failed Rule 3"
    assert v_base["rule4_min_soc_satisfied"], "Baseline failed Rule 4"
    assert v_base["rule5_metrics_reproducible"], "Baseline failed Rule 5"
    assert v_base["all_passed"]

    # 2. Test Proposed Rule-Based Allocator
    proposed = ProposedPriorityScoreAllocator(config)
    res_prop = proposed.allocate(classified_bats, df_veh)
    v_prop = verify_allocation_rules(res_prop, classified_bats, df_veh)

    assert v_prop["rule1_no_unsafe_allocated"], "Proposed failed Rule 1"
    assert v_prop["rule2_no_duplicate_battery"], "Proposed failed Rule 2"
    assert v_prop["rule3_no_duplicate_vehicle"], "Proposed failed Rule 3"
    assert v_prop["rule4_min_soc_satisfied"], "Proposed failed Rule 4"
    assert v_prop["rule5_metrics_reproducible"], "Proposed failed Rule 5"
    assert v_prop["all_passed"]

    # 3. Test ML-Ensemble Allocator
    ml_alloc = MLEnsembleAllocator(config)
    res_ml = ml_alloc.allocate(classified_bats, df_veh)
    v_ml = verify_allocation_rules(res_ml, classified_bats, df_veh)

    assert v_ml["rule1_no_unsafe_allocated"], "ML-Ensemble failed Rule 1"
    assert v_ml["rule2_no_duplicate_battery"], "ML-Ensemble failed Rule 2"
    assert v_ml["rule3_no_duplicate_vehicle"], "ML-Ensemble failed Rule 3"
    assert v_ml["rule4_min_soc_satisfied"], "ML-Ensemble failed Rule 4"
    assert v_ml["rule5_metrics_reproducible"], "ML-Ensemble failed Rule 5"
    assert v_ml["all_passed"]

    # KPI Progressive Improvement Validation
    kpi_base = calculate_kpis(res_base)
    kpi_prop = calculate_kpis(res_prop)
    kpi_ml = calculate_kpis(res_ml)

    assert kpi_base["served_vehicles"] == 50
    assert kpi_prop["served_vehicles"] == 50
    assert kpi_ml["served_vehicles"] == 50

    assert kpi_base["unsafe_allocations"] == 0
    assert kpi_prop["unsafe_allocations"] == 0
    assert kpi_ml["unsafe_allocations"] == 0

    assert kpi_prop["avg_soh_allocated"] > kpi_base["avg_soh_allocated"]
    assert kpi_ml["avg_soh_allocated"] >= kpi_prop["avg_soh_allocated"]

    assert kpi_prop["avg_suitability_allocated"] > kpi_base["avg_suitability_allocated"]
    assert kpi_ml["avg_suitability_allocated"] >= kpi_prop["avg_suitability_allocated"]
