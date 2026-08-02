import os
import time
import jwt
from typing import Dict, Any, List, Optional
from fastapi import Header, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "brain-bolt-imece-2026-secret-key-battery-poc")
ALGORITHM = "HS256"

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
    
    # Offline Local Testing Fallback
    if x_role_override:
        role = x_role_override.lower()
        if role not in ROLES.values():
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
