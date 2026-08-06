import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from fastapi import APIRouter, Body, Depends, HTTPException
from typing import Dict, Any
from backend.src.auth import require_roles, get_current_user
from backend.src.twist_adapter import (
    apply_constraint_patch,
    apply_priority_patch,
    apply_scoring_patch,
    simulate_queue,
    get_active_twist_state,
    record_twist_patch,
    get_twist_log,
)

router = APIRouter(prefix="/api/twist", tags=["Twist Controls"])

@router.post("/apply", dependencies=[Depends(require_roles(["admin"]))])
def apply_twist_config(
    patch_payload: Dict[str, Any] = Body(...),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Onsite Twist Endpoint — validates and activates a live constraint patch
    (backend/src/twist_adapter.py:apply_constraint_patch). The patch takes
    effect on every request from this point on (classification.load_config()
    overlays it), and every application is appended to an in-memory audit log
    retrievable via GET /api/twist/log.
    """
    try:
        active_state = apply_constraint_patch(patch_payload)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    log_entry = record_twist_patch(patch_payload, active_state, applied_by=user.get("email", "unknown"))

    return {
        "status": "success",
        "message": "Twist patch validated and applied — active fleet-wide as of this request.",
        "active_state": active_state,
        "log_entry": log_entry,
    }


@router.get("/state", dependencies=[Depends(require_roles(["admin"]))])
def get_twist_state():
    """Returns the currently-active twist patch state (empty if none applied)."""
    return {"status": "success", "active_state": get_active_twist_state()}


@router.get("/log", dependencies=[Depends(require_roles(["admin"]))])
def get_twist_patch_log():
    """Returns the audit log of every twist patch applied this server session."""
    return {"status": "success", "log": get_twist_log()}
