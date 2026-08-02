import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import json
import asyncio
import pandas as pd
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Body, Query
from fastapi.responses import StreamingResponse
from backend.src.live_session import session_manager
from backend.src.twist_adapter import simulate_queue
from backend.src.classification import classify_fleet, load_config, PROJECT_ROOT

router = APIRouter(prefix="/api/live", tags=["Real-Time Live Demo"])

@router.post("/session")
def create_live_session():
    """
    Creates a new isolated session with a 200-pack battery fleet snapshot.
    """
    res = session_manager.create_session()
    return {"status": "success", "session": res}

@router.get("/session/{session_id}")
def get_live_session_info(session_id: str):
    try:
        session_data = session_manager.get_session(session_id)
        return {"status": "success", "session": session_data}
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")

@router.post("/request")
def submit_live_request(payload: Dict[str, Any] = Body(...)):
    """
    Submits a single vehicle request against the session's remaining battery pool.
    Payload: { session_id, vehicle_request, mode: "baseline" | "proposed" | "ml-ensemble" }
    """
    session_id = payload.get("session_id")
    vehicle_req = payload.get("vehicle_request")
    mode = payload.get("mode", "ml-ensemble")

    if not session_id or not vehicle_req:
        raise HTTPException(status_code=400, detail="session_id and vehicle_request are required")

    try:
        outcome = session_manager.submit_request(session_id, vehicle_req, mode=mode)
        return {"status": "success", "outcome": outcome}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/reset")
def reset_live_session(payload: Dict[str, Any] = Body(...)):
    """
    Resets a session's pool back to the original 200-pack snapshot.
    """
    session_id = payload.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    res = session_manager.reset_session(session_id)
    return {"status": "success", "session": res}

@router.get("/queue_simulation")
def get_queue_simulation():
    df_bat = pd.read_csv(os.path.join(PROJECT_ROOT, "data/Problem_1_Battery_Fleet_200_Packs.csv"))
    df_veh = pd.read_csv(os.path.join(PROJECT_ROOT, "data/Problem_1_Vehicle_Demand_50_Requests.csv"))
    config = load_config()
    classified_bats = classify_fleet(df_bat, config)

    queue_res = simulate_queue(classified_bats, df_veh)
    return {"status": "success", "queue_simulation": queue_res}

@router.get("/stream/{session_id}")
async def sse_event_stream(session_id: str):
    """
    Server-Sent Events (SSE) stream pushing real-time session state updates to the frontend.
    """
    async def event_generator():
        last_count = -1
        while True:
            try:
                session_data = session_manager.get_session(session_id)
                current_count = session_data.get("request_count", 0)
                if current_count != last_count:
                    last_count = current_count
                    payload = json.dumps({
                        "request_count": current_count,
                        "available_count": len(session_data.get("available_battery_ids", [])),
                        "latest_assignment": session_data["assignments"][-1] if session_data.get("assignments") else None
                    })
                    yield f"data: {payload}\n\n"
            except Exception:
                pass
            await asyncio.sleep(1.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
