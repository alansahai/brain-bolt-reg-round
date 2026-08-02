import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.src.live_session import session_manager
from backend.src.twist_adapter import simulate_queue
import pandas as pd

client = TestClient(app)

def test_live_session_creation_and_reset():
    # 1. Create Session via API
    res = client.post("/api/live/session")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    session_id = data["session"]["session_id"]
    assert session_id.startswith("SESS-")
    assert data["session"]["total_packs"] == 200

    # 2. Reset Session via API
    res_reset = client.post("/api/live/reset", json={"session_id": session_id})
    assert res_reset.status_code == 200
    assert res_reset.json()["session"]["status"] == "reset"

def test_live_single_request_submission():
    # Create Session
    res_sess = client.post("/api/live/session")
    session_id = res_sess.json()["session"]["session_id"]

    # Submit Single Request against Baseline Mode
    single_req = {
        "request_id": "TEST-REQ-001",
        "arrival_time": "08:00",
        "vehicle_type": "Personal Commuter",
        "required_range_km": 45.0,
        "load_category": "Medium",
        "priority": "Critical",
        "minimum_acceptable_SOC_percent": 60.0,
        "maximum_wait_time_min": 10.0
    }

    res_req = client.post("/api/live/request", json={
        "session_id": session_id,
        "vehicle_request": single_req,
        "mode": "baseline"
    })
    assert res_req.status_code == 200
    out = res_req.json()["outcome"]
    assert out["assigned"] is True
    assert out["assignment"]["priority"] == "Critical"
    assert out["remaining_inventory"]["total_available"] == 158  # 159 initial available safe/degraded minus 1 assigned

def test_queue_simulation():
    df_bat = pd.read_csv("data/Problem_1_Battery_Fleet_200_Packs.csv")
    df_veh = pd.read_csv("data/Problem_1_Vehicle_Demand_50_Requests.csv")

    res_q = simulate_queue(df_bat, df_veh)
    assert res_q["status"] == "active"
    assert res_q["total_vehicles_simulated"] == 50
    assert len(res_q["queue_log"]) == 50
