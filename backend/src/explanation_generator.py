from typing import Dict, Any, List
import pandas as pd
import numpy as np

def generate_allocation_explanation(
    assignment: Dict[str, Any],
    candidate_pool: List[Dict[str, Any]],
    weights: Dict[str, float]
) -> Dict[str, Any]:
    """
    Generates a 100% deterministic, rule-based explanation for an allocation assignment (Rule 5 Compliant).
    """
    bat_id = assignment["battery_id"]
    tier = assignment["battery_tier"]
    prio = assignment["priority"]
    req_id = assignment["request_id"]
    min_soc = assignment["minimum_acceptable_SOC_percent"]
    bat_soc = assignment["battery_soc"]
    bat_soh = assignment["battery_soh"]
    bat_suit = assignment["battery_suitability_score"]

    # 1. Score Component Weighted Readout
    # Formula weights: soh 0.35, ir 0.25, imb 0.20, temp 0.10, cyc 0.10
    score_breakdown = {
        "soh_contribution": round(bat_soh * 0.35, 1),
        "soh_pct_share": "35%",
        "electrical_thermal_share": "55%",
        "cycle_share": "10%"
    }

    # 2. Next-Best Candidate Reasoning
    # Sort candidates by suitability score to find runner-up
    sorted_cands = sorted(candidate_pool, key=lambda b: b.get("suitability_score", 0), reverse=True)
    runner_up = None
    for c in sorted_cands:
        if c["battery_id"] != bat_id:
            runner_up = c
            break

    comparison_reason = ""
    if runner_up:
        delta_soh = bat_soh - runner_up["state_of_health_percent"]
        delta_suit = bat_suit - runner_up.get("suitability_score", 0)
        comparison_reason = f"Selected over runner-up pack {runner_up['battery_id']} ({runner_up['tier']} tier) due to +{delta_soh:.1f}% higher SoH and +{delta_suit:.1f} higher Suitability Score."
    else:
        comparison_reason = "Selected as the sole optimal candidate satisfying minimum SoC requirement."

    one_line_summary = f"Assigned {tier} tier pack {bat_id} ({bat_soc:.1f}% SoC, {bat_soh:.1f}% SoH) for {prio} priority request {req_id}. {comparison_reason}"

    return {
        "request_id": req_id,
        "battery_id": bat_id,
        "battery_tier": tier,
        "priority": prio,
        "min_soc_required": min_soc,
        "battery_soc": bat_soc,
        "battery_soh": bat_soh,
        "suitability_score": bat_suit,
        "score_breakdown": score_breakdown,
        "runner_up_comparison": comparison_reason,
        "one_line_summary": one_line_summary
    }

def generate_fleet_auto_summary(classified_batteries: pd.DataFrame) -> Dict[str, Any]:
    """
    Generates a deterministic fleet-level narrative summary based on real parameter distribution.
    """
    total = len(classified_batteries)
    counts = classified_batteries["tier"].value_counts().to_dict()
    safe_cnt = int(counts.get("SAFE", 0))
    deg_cnt = int(counts.get("DEGRADED", 0))
    uns_cnt = int(counts.get("UNSAFE", 0))

    avg_soh = float(classified_batteries["state_of_health_percent"].mean())
    avg_ir = float(classified_batteries["internal_resistance_mOhm"].mean())
    quarantined = int((classified_batteries["station_status"] == "REVIEW/QUARANTINE").sum())

    narrative = (
        f"Fleet of {total} battery packs evaluated: {safe_cnt} Safe ({safe_cnt/total*100:.1f}%), "
        f"{deg_cnt} Degraded ({deg_cnt/total*100:.1f}%), and {uns_cnt} Unsafe ({uns_cnt/total*100:.1f}%). "
        f"Average fleet SoH is {avg_soh:.1f}% with mean internal resistance of {avg_ir:.1f} mΩ. "
        f"Station status quarantine hard override isolated {quarantined} packs immediately."
    )

    return {
        "total_packs": total,
        "safe_count": safe_cnt,
        "degraded_count": deg_cnt,
        "unsafe_count": uns_cnt,
        "avg_soh": round(avg_soh, 2),
        "avg_internal_resistance": round(avg_ir, 2),
        "quarantined_count": quarantined,
        "narrative": narrative
    }
