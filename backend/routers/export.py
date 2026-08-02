import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pandas as pd
from fastapi import APIRouter, Response, HTTPException, Query
from backend.src.classification import classify_fleet, load_config, PROJECT_ROOT
from backend.src.allocators.baseline_highest_soc import BaselineHighestSoCAllocator
from backend.src.allocators.proposed_priority_score import ProposedPriorityScoreAllocator
from backend.ml.ensemble_scorer import MLEnsembleAllocator
from backend.src.pipeline import run_battery_intelligence_pipeline
from backend.src.metrics import calculate_kpis
from backend.src.export_utils import generate_csv_export, generate_excel_export, generate_pdf_export

router = APIRouter(prefix="/api/export", tags=["Export"])

DEFAULT_BATTERY_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Battery_Fleet_200_Packs.csv")
DEFAULT_VEHICLE_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Vehicle_Demand_50_Requests.csv")

@router.get("/{export_format}")
@router.post("/{export_format}")
def export_results(export_format: str, mode: str = Query("pipeline")):
    """Default mode is `pipeline` — the Battery Intelligence Platform's final
    allocation (Engineering Validation -> ML -> Risk -> RUL -> Recommendation
    -> Graph Optimization). `baseline`, `proposed`, and `ml-ensemble` remain
    available for legacy/API-completeness exports."""
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

    assignments_dict = [a.model_dump() for a in res.assignments]
    kpis = calculate_kpis(res)

    if export_format.lower() == "csv":
        data = generate_csv_export(assignments_dict)
        return Response(content=data, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=battery_allocation_{mode}.csv"})
    elif export_format.lower() in ["xlsx", "excel"]:
        data = generate_excel_export(assignments_dict, kpis, res.allocator_name)
        return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=battery_allocation_{mode}.xlsx"})
    elif export_format.lower() == "pdf":
        data = generate_pdf_export(assignments_dict, kpis, res.allocator_name)
        return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=battery_allocation_{mode}.pdf"})
    else:
        raise HTTPException(status_code=400, detail="Format must be one of: csv, xlsx, pdf")
