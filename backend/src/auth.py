import os
import time
import jwt
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
from fastapi import Header, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# backend/.env holds real secrets (gitignored); backend/.env.example documents
# the expected keys with placeholder values only.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "brain-bolt-imece-2026-secret-key-battery-poc")
ALGORITHM = "HS256"

# Demo-grade admin gate: this POC has no real user database, so "authorization"
# for the ADMIN role is a shared passcode rather than per-user credentials.
# Requester/Operator remain self-service (low-privilege, no destructive actions);
# only minting an ADMIN token requires one of these passcodes, and only a
# token minted this way is ever accepted as admin (see require_roles /
# get_current_user below). Any number of comma-separated passcodes is
# supported via ADMIN_PASSCODES in backend/.env — none are hardcoded here.
def _load_admin_passcodes() -> set:
    raw = os.getenv("ADMIN_PASSCODES", "")
    return {p.strip() for p in raw.split(",") if p.strip()}

ADMIN_PASSCODES = _load_admin_passcodes()

def is_valid_admin_passcode(code: Optional[str]) -> bool:
    return bool(code) and code in ADMIN_PASSCODES

security_bearer = HTTPBearer(auto_error=False)

ROLES = {
    "REQUESTER": "requester",
    "OPERATOR": "operator",
    "ADMIN": "admin",
}

def create_demo_token(uid: str, email: str, role: str) -> str:
    payload = {
        "uid": uid,
        "email": email,
        "role": role,
        "exp": int(time.time()) + 86400 * 7,  # 7 days validity
        "iss": "https://securetoken.google.com/battery-health-poc"
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired authentication token: {str(e)}")

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
    x_role_override: Optional[str] = Header(None, alias="X-Role-Override")
) -> Dict[str, Any]:
    """
    Verifies authentication token & custom role claim.
    Supports offline local header fallback (X-Role-Override: requester|operator|admin) for local testing.
    """
    if credentials:
        token = credentials.credentials
        user = decode_token(token)
        return user
    
    # Offline Local Testing Fallback — intentionally cannot grant admin. Without
    # this cap, X-Role-Override would be a header any caller can set to
    # self-escalate to admin with no credential at all.
    if x_role_override:
        role = x_role_override.lower()
        if role not in (ROLES["REQUESTER"], ROLES["OPERATOR"]):
            role = "operator"
        return {
            "uid": f"local-{role}-user",
            "email": f"{role}@battery-poc.local",
            "role": role,
            "offline_mode": True
        }

    # Default fallback to operator for unauthenticated local REST calls
    return {
        "uid": "local-operator-default",
        "email": "operator@battery-poc.local",
        "role": "operator",
        "offline_mode": True
    }

def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: Dict[str, Any] = Depends(get_current_user)):
        user_role = current_user.get("role", "requester")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access forbidden: Role '{user_role}' does not have required permissions ({allowed_roles})"
            )
        return current_user
    return role_checker
