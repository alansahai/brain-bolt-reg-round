import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any
from backend.src.auth import create_demo_token, decode_token, ROLES, is_valid_admin_passcode

router = APIRouter(prefix="/api/auth", tags=["Authentication & RBAC"])

@router.post("/token")
def generate_role_token(payload: Dict[str, Any] = Body(...)):
    """
    Generates a signed JWT authentication token with custom role claims.
    Payload: { email, role: "requester" | "operator" | "admin", admin_access_code? }

    Requester/Operator are self-service. Admin additionally requires
    `admin_access_code` to match one of the server-configured ADMIN_PASSCODES
    (backend/.env) — this is the privilege-escalation gate: without a valid
    code, a caller cannot mint an admin token no matter what role they ask for.
    """
    email = payload.get("email", "demo@battery-poc.com")
    role = payload.get("role", "operator").lower()

    if role not in ROLES.values():
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {list(ROLES.values())}")

    if role == ROLES["ADMIN"] and not is_valid_admin_passcode(payload.get("admin_access_code")):
        raise HTTPException(status_code=403, detail="Invalid admin access code.")

    uid = f"uid-{role}-{hash(email) % 10000}"
    token = create_demo_token(uid=uid, email=email, role=role)

    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "uid": uid,
            "email": email,
            "role": role
        }
    }

@router.get("/me")
def get_user_profile(user: Dict[str, Any] = Body(None)):
    return {"status": "success", "roles": ROLES}
