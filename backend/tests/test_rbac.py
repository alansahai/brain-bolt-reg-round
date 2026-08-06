import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.src.auth import create_demo_token, ADMIN_PASSCODES

client = TestClient(app)

def test_token_generation_endpoint():
    res = client.post("/api/auth/token", json={"email": "operator@test.com", "role": "operator"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["user"]["role"] == "operator"
    assert "access_token" in data

def test_admin_token_requires_access_code():
    # No code / wrong code -> rejected, cannot self-escalate to admin.
    res_no_code = client.post("/api/auth/token", json={"email": "x@test.com", "role": "admin"})
    assert res_no_code.status_code == 403

    res_wrong_code = client.post(
        "/api/auth/token",
        json={"email": "x@test.com", "role": "admin", "admin_access_code": "wrong"},
    )
    assert res_wrong_code.status_code == 403

def test_every_configured_admin_passcode_works():
    # ADMIN_PASSCODES is loaded from backend/.env (ADMIN_PASSCODES=a,b,c,...).
    # Every one of them must independently grant admin — not just the first.
    assert len(ADMIN_PASSCODES) >= 1, "backend/.env must define at least one ADMIN_PASSCODES entry for this test to be meaningful"
    for code in ADMIN_PASSCODES:
        res = client.post(
            "/api/auth/token",
            json={"email": "x@test.com", "role": "admin", "admin_access_code": code},
        )
        assert res.status_code == 200, f"passcode {code!r} was rejected"
        assert res.json()["user"]["role"] == "admin"

def test_role_override_header_cannot_grant_admin():
    # The offline X-Role-Override header must never be able to mint admin —
    # otherwise it's an unauthenticated privilege-escalation path.
    res = client.post(
        "/api/twist/apply",
        json={"degraded_min_soft_flags": 2},
        headers={"X-Role-Override": "admin"},
    )
    assert res.status_code == 403

def test_admin_only_twist_endpoint_rbac():
    req_token = create_demo_token("u1", "req@test.com", "requester")
    op_token = create_demo_token("u2", "op@test.com", "operator")
    admin_token = create_demo_token("u3", "admin@test.com", "admin")

    # 1. Requester should be denied (403)
    res_req = client.post(
        "/api/twist/apply",
        json={"test": "payload"},
        headers={"Authorization": f"Bearer {req_token}"}
    )
    assert res_req.status_code == 403

    # 2. Operator should be denied (403)
    res_op = client.post(
        "/api/twist/apply",
        json={"test": "payload"},
        headers={"Authorization": f"Bearer {op_token}"}
    )
    assert res_op.status_code == 403

    # 3. Admin should be allowed (200) with a valid patch payload
    res_admin = client.post(
        "/api/twist/apply",
        json={"degraded_min_soft_flags": 2, "quarantine_override": True},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_admin.status_code == 200
    assert res_admin.json()["status"] == "success"

    # 4. An invalid patch payload is rejected even for admin (validated, not
    # blindly applied)
    res_invalid = client.post(
        "/api/twist/apply",
        json={"degraded_min_soft_flags": 99},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_invalid.status_code == 422
