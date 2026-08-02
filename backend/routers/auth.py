import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any
from backend.src.auth import create_demo_token, decode_token, ROLES

router = APIRouter(prefix="/api/auth", tags=["Authentication & RBAC"])

@router.post("/token")
def generate_role_token(payload: Dict[str, Any] = Body(...)):
    """
    Generates a signed JWT authentication token with custom role claims.
    Payload: { email, role: "requester" | "operator" | "admin" }
    """
    email = payload.get("email", "demo@battery-poc.com")
    role = payload.get("role", "operator").lower()
    
    if role not in ROLES.values():
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {list(ROLES.values())}")

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
