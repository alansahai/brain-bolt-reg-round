import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.src.auth import create_demo_token

client = TestClient(app)

def test_token_generation_endpoint():
    res = client.post("/api/auth/token", json={"email": "operator@test.com", "role": "operator"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["user"]["role"] == "operator"
    assert "access_token" in data

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

    # 3. Admin should be allowed (200)
    res_admin = client.post(
        "/api/twist/apply",
        json={"test": "payload"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_admin.status_code == 200
    assert res_admin.json()["status"] == "success"
