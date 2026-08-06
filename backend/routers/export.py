import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pandas as pd
from fastapi import APIRouter, Response, Query
from backend.src.classification import classify_fleet, load_config, PROJECT_ROOT
from backend.src.allocators.baseline_highest_soc import BaselineHighestSoCAllocator
from backend.src.allocators.proposed_priority_score import ProposedPriorityScoreAllocator
from backend.ml.ensemble_scorer import MLEnsembleAllocator
from backend.src.pipeline import run_battery_intelligence_pipeline
from backend.src.metrics import calculate_kpis, verify_allocation_rules
from backend.src.export_utils import (
    generate_csv_export,
    generate_verification_log_csv,
    generate_summary_report_pdf,
)

router = APIRouter(prefix="/api/export", tags=["Export"])

DEFAULT_BATTERY_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Battery_Fleet_200_Packs.csv")
DEFAULT_VEHICLE_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Vehicle_Demand_50_Requests.csv")


def _run_allocation(mode: str):
    """Shared by all three export endpoints below."""
    df_bat = pd.read_csv(DEFAULT_BATTERY_CSV)
    df_veh = pd.read_csv(DEFAULT_VEHICLE_CSV)
    config = load_config()
    classified_bats = classify_fleet(df_bat, config)

    if mode == "baseline":
        res = BaselineHighestSoCAllocator(config).allocate(classified_bats, df_veh)
    elif mode == "proposed":
        res = ProposedPriorityScoreAllocator(config).allocate(classified_bats, df_veh)
    elif mode == "ml-ensemble":
        res = MLEnsembleAllocator(config).allocate(classified_bats, df_veh)
    else:  # "pipeline" or legacy "graph" both resolve to the platform's final allocation
        res = run_battery_intelligence_pipeline(df_bat, df_veh, config)["result"]

    return res, classified_bats, df_veh


@router.get("/allocation-csv")
@router.post("/allocation-csv")
def export_allocation_csv(mode: str = Query("pipeline")):
    """Raw battery-to-vehicle assignment table for the chosen allocator mode."""
    res, _, _ = _run_allocation(mode)
    assignments_dict = [a.model_dump() for a in res.assignments]
    data = generate_csv_export(assignments_dict)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=battery_allocation_{mode}.csv"},
    )


@router.get("/verification-csv")
@router.post("/verification-csv")
def export_verification_csv(mode: str = Query("pipeline")):
    """The 5 Verification Rules (backend/src/metrics.py:verify_allocation_rules)
    evaluated against the chosen allocator's assignments, plus its KPIs."""
    res, classified_bats, df_veh = _run_allocation(mode)
    verification = verify_allocation_rules(res, classified_bats, df_veh)
    kpis = calculate_kpis(res)
    data = generate_verification_log_csv(verification, kpis, res.allocator_name)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=verification_log_{mode}.csv"},
    )


@router.get("/summary-report-pdf")
@router.post("/summary-report-pdf")
def export_summary_report_pdf(mode: str = Query("pipeline")):
    """Single formatted judge/management PDF: KPI summary, Verification Rules
    1-5 compliance, and a sample of the allocation table — the presentation
    layer CSV intentionally doesn't provide."""
    res, classified_bats, df_veh = _run_allocation(mode)
    assignments_dict = [a.model_dump() for a in res.assignments]
    kpis = calculate_kpis(res)
    verification = verify_allocation_rules(res, classified_bats, df_veh)
    data = generate_summary_report_pdf(assignments_dict, kpis, verification, res.allocator_name)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=battery_allocation_summary_{mode}.pdf"},
    )
