import pytest
import pandas as pd
from backend.src.classification import classify_fleet, load_config
from backend.src.allocators.baseline_highest_soc import BaselineHighestSoCAllocator
from backend.src.allocators.proposed_priority_score import ProposedPriorityScoreAllocator

def test_allocators_on_real_data():
    df_bat = pd.read_csv("data/Problem_1_Battery_Fleet_200_Packs.csv")
    df_veh = pd.read_csv("data/Problem_1_Vehicle_Demand_50_Requests.csv")
    config = load_config("config.yaml")

    classified_bats = classify_fleet(df_bat, config)

    # 1. Baseline
    baseline = BaselineHighestSoCAllocator(config)
    res_base = baseline.allocate(classified_bats, df_veh)
    
    assert res_base.served_count == 50
    assert res_base.unsafe_allocations_count == 0
    assert len(res_base.assignments) == 50
    
    # 2. Proposed
    proposed = ProposedPriorityScoreAllocator(config)
    res_prop = proposed.allocate(classified_bats, df_veh)

    assert res_prop.served_count == 50
    assert res_prop.unsafe_allocations_count == 0
    assert len(res_prop.assignments) == 50

    # Proposed allocator must achieve higher average SoH and Suitability Score than Baseline
    assert res_prop.avg_soh_allocated > res_base.avg_soh_allocated
    assert res_prop.avg_suitability_allocated > res_base.avg_suitability_allocated
