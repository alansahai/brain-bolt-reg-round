import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pandas as pd
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, Optional

from backend.src.classification import classify_fleet, load_config, PROJECT_ROOT
from backend.ml.rul_predictor import predict_rul
from backend.src.explainability import generate_suitability_explanation
from backend.src.risk_index import compute_risk_index
from backend.src.recommendation_engine import generate_recommendation
from backend.src.digital_twin import build_twin, build_all_twins
from backend.src.pipeline import enrich_fleet
from backend.src.fleet_health import compute_fleet_health
from backend.src.fleet_digital_twin import compute_fleet_digital_twin

DEFAULT_VEHICLE_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Vehicle_Demand_50_Requests.csv")

router = APIRouter(prefix="/api", tags=["Battery Intelligence"])

DEFAULT_BATTERY_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Battery_Fleet_200_Packs.csv")


def _load_classified_fleet() -> pd.DataFrame:
    if not os.path.exists(DEFAULT_BATTERY_CSV):
        raise HTTPException(status_code=404, detail="Default battery dataset not found")
    df_bat = pd.read_csv(DEFAULT_BATTERY_CSV)
    config = load_config()
    return classify_fleet(df_bat, config), config


def _get_battery_row(battery_id: str):
    classified, config = _load_classified_fleet()
    match = classified[classified["battery_id"] == battery_id]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"Battery {battery_id} not found")
    return match.iloc[0], config


@router.get("/predict-rul/{battery_id}")
def get_predict_rul(battery_id: str, cycles_ahead: Optional[int] = None):
    row, config = _get_battery_row(battery_id)
    result = predict_rul(row, config, cycles_ahead=cycles_ahead)
    return {"status": "success", "rul_prediction": result}


@router.post("/predict-rul")
def post_predict_rul(payload: Dict[str, Any] = Body(...)):
    battery_id = payload.get("battery_id")
    if not battery_id:
        raise HTTPException(status_code=400, detail="battery_id is required")
    row, config = _get_battery_row(battery_id)
    result = predict_rul(row, config, cycles_ahead=payload.get("cycles_ahead"))
    return {"status": "success", "rul_prediction": result}


@router.get("/explain/{battery_id}")
def get_explain(battery_id: str):
    row, config = _get_battery_row(battery_id)
    result = generate_suitability_explanation(row, config)
    return {"status": "success", "explanation": result}


@router.get("/risk/{battery_id}")
def get_risk(battery_id: str):
    row, config = _get_battery_row(battery_id)
    result = compute_risk_index(row, config)
    return {"status": "success", "risk": result}


@router.get("/risk")
def get_risk_fleet():
    classified, config = _load_classified_fleet()
    results = [compute_risk_index(row, config) for _, row in classified.iterrows()]
    band_counts = pd.Series([r["risk_band"] for r in results]).value_counts().to_dict()
    return {"status": "success", "band_counts": band_counts, "risk_scores": results}


@router.get("/recommend/{battery_id}")
def get_recommend(battery_id: str):
    row, config = _get_battery_row(battery_id)
    result = generate_recommendation(row, config, tier=row.get("tier"))
    return {"status": "success", "recommendation": result}


@router.get("/digital-twin/{battery_id}")
def get_digital_twin(battery_id: str):
    row, config = _get_battery_row(battery_id)
    result = build_twin(row, config, tier=row.get("tier"))
    return {"status": "success", "digital_twin": result}


@router.get("/digital-twin")
def get_digital_twin_fleet():
    classified, config = _load_classified_fleet()
    results = build_all_twins(classified, config)
    return {"status": "success", "count": len(results), "digital_twins": results}


@router.get("/fleet-health")
def get_fleet_health():
    """
    Fleet Health Score — single 0-100 station-wide indicator (Excellent/Good/
    Moderate/Poor/Critical) combining average SoH, average Risk Index,
    unsafe%, utilization, average RUL, average Battery Intelligence Engine
    Suitability Score, available energy%, and healthy(SAFE)%. See
    config.yaml: fleet_health.
    """
    classified, config = _load_classified_fleet()
    enriched = enrich_fleet(classified, config)  # classify_fleet() is idempotent on an already-tiered df
    result = compute_fleet_health(enriched, config)
    return {"status": "success", "fleet_health": result}


@router.get("/fleet-digital-twin")
def get_fleet_digital_twin():
    """
    Fleet Digital Twin — station-wide software twin (Fleet Health, Current
    Utilization, Charging Queue, Battery Availability, Charging Capacity,
    Average Risk, Average RUL, Peak Demand, Future Capacity Prediction).
    Distinct from the per-battery Digital Twin at `/api/digital-twin/{id}` —
    see backend/src/fleet_digital_twin.py's module docstring.
    """
    classified, config = _load_classified_fleet()
    enriched = enrich_fleet(classified, config)
    df_veh = pd.read_csv(DEFAULT_VEHICLE_CSV) if os.path.exists(DEFAULT_VEHICLE_CSV) else pd.DataFrame()
    result = compute_fleet_digital_twin(enriched, df_veh, config)
    return {"status": "success", "fleet_digital_twin": result}


@router.get("/config/optimization-weights")
def get_optimization_weights():
    """
    Battery Intelligence Platform — the 8 configurable Graph Optimization
    weights (Priority/Suitability/Risk/Future Health/Waiting Time/Energy
    Match/Fair Usage/Service Rate), each with a human-readable explanation.
    Powers the frontend Optimization Settings Panel. Every weight can be
    overridden per-request via `weight_overrides` on
    `/api/allocate/pipeline` without ever touching config.yaml.
    """
    config = load_config()
    weights = config.get("battery_intelligence_platform", {}).get("weights", {})
    return {"status": "success", "weights": weights}


@router.get("/maintenance/recommendations")
def get_maintenance_recommendations():
    """
    Maintenance Center — fleet-wide maintenance recommendations, sorted by
    priority (Critical > High > Medium > Low) then by Risk Index descending,
    so the most urgent packs surface first.
    """
    classified, config = _load_classified_fleet()
    priority_rank = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    recommendations = [
        generate_recommendation(row, config, tier=row.get("tier")) for _, row in classified.iterrows()
    ]
    recommendations.sort(key=lambda r: (priority_rank.get(r["priority"], 9), -r["risk_index"]))
    action_counts = pd.Series([r["recommended_action"] for r in recommendations]).value_counts().to_dict()
    return {
        "status": "success",
        "count": len(recommendations),
        "action_counts": action_counts,
        "recommendations": recommendations,
    }


@router.get("/battery/{battery_id}/detail")
def get_battery_detail(battery_id: str):
    """
    Combined Battery Details bundle for the frontend Battery Details page:
    classification + RUL prediction + XAI explanation + risk index +
    maintenance recommendation + digital twin, in a single call.
    """
    row, config = _get_battery_row(battery_id)
    tier = row.get("tier")

    return {
        "status": "success",
        "battery": row.to_dict(),
        "rul_prediction": predict_rul(row, config),
        "explanation": generate_suitability_explanation(row, config),
        "risk": compute_risk_index(row, config),
        "recommendation": generate_recommendation(row, config, tier=tier),
        "digital_twin": build_twin(row, config, tier=tier),
    }
