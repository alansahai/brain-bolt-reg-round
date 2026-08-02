import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pandas as pd
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any

from backend.src.classification import load_config, PROJECT_ROOT
from backend.src.scenario_simulator import run_scenario, SCENARIO_DESCRIPTIONS

router = APIRouter(prefix="/api", tags=["Scenario Simulation"])

DEFAULT_BATTERY_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Battery_Fleet_200_Packs.csv")
DEFAULT_VEHICLE_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Vehicle_Demand_50_Requests.csv")


@router.get("/simulate/scenarios")
def list_scenarios():
    """Lists every supported What-If scenario type and its description, so
    the frontend Scenario Simulator page can render the picker without
    hardcoding scenario copy twice."""
    return {"status": "success", "scenarios": SCENARIO_DESCRIPTIONS}


@router.post("/simulate")
def simulate_scenario(payload: Dict[str, Any] = Body(...)):
    """
    What-If Scenario Simulation — reruns the full Battery Intelligence
    Platform pipeline before/after a simulated event (battery failures,
    demand surges, temperature spikes, accelerated degradation, doubled
    critical demand, a shifted safety threshold, or custom optimization
    weights) and returns a before/after comparison plus the resulting
    allocation changes. Nothing here mutates the live dataset or config.yaml.
    """
    scenario_type = payload.get("scenario_type")
    params = payload.get("params", {})
    if not scenario_type:
        raise HTTPException(status_code=400, detail="scenario_type is required")

    if not os.path.exists(DEFAULT_BATTERY_CSV) or not os.path.exists(DEFAULT_VEHICLE_CSV):
        raise HTTPException(status_code=404, detail="Default datasets not found")

    df_bat = pd.read_csv(DEFAULT_BATTERY_CSV)
    df_veh = pd.read_csv(DEFAULT_VEHICLE_CSV)
    config = load_config()

    try:
        result = run_scenario(df_bat, df_veh, config, scenario_type, params)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": "success", **result}
