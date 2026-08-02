import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import io
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Dict, Any, List
from backend.src.classification import classify_fleet, load_config, PROJECT_ROOT
from backend.src.schema import validate_battery_df
from backend.src.explanation_generator import generate_fleet_auto_summary

router = APIRouter(prefix="/api/classify", tags=["Classification"])

DEFAULT_BATTERY_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Battery_Fleet_200_Packs.csv")

@router.get("/")
def get_default_classification():
    if not os.path.exists(DEFAULT_BATTERY_CSV):
        raise HTTPException(status_code=404, detail="Default battery dataset not found")
    df_bat = pd.read_csv(DEFAULT_BATTERY_CSV)
    config = load_config()
    df_classified = classify_fleet(df_bat, config)
    
    counts = df_classified["tier"].value_counts().to_dict()
    records = df_classified.to_dict(orient="records")
    return {
        "status": "success",
        "total_packs": len(df_classified),
        "tier_counts": counts,
        "batteries": records
    }

@router.post("/upload")
def classify_uploaded_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files allowed")
    
    contents = file.file.read()
    try:
        df_bat = pd.read_csv(io.BytesIO(contents))
        validate_battery_df(df_bat)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid battery CSV schema: {str(e)}")

    config = load_config()
    df_classified = classify_fleet(df_bat, config)
    counts = df_classified["tier"].value_counts().to_dict()
    return {
        "status": "success",
        "total_packs": len(df_classified),
        "tier_counts": counts,
        "batteries": df_classified.to_dict(orient="records")
    }

@router.get("/auto_summary")
def get_auto_summary():
    df_bat = pd.read_csv(DEFAULT_BATTERY_CSV)
    config = load_config()
    df_classified = classify_fleet(df_bat, config)
    summary = generate_fleet_auto_summary(df_classified)
    return {"status": "success", "auto_summary": summary}
