import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

def test_api_classify():
    res = client.get("/api/classify/")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["total_packs"] == 200
    assert data["tier_counts"]["SAFE"] == 98

def test_api_allocations():
    for mode in ["baseline", "proposed", "ml-ensemble"]:
        res = client.post(f"/api/allocate/{mode}")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["kpis"]["served_vehicles"] == 50
        assert data["verification"]["all_passed"] is True

def test_api_metrics_compare():
    """Battery Intelligence Platform comparison: Highest-SoC-First (baseline)
    vs the layered pipeline (Battery Intelligence Engine -> Recommendation ->
    Graph Optimization). The Battery Intelligence Engine no longer competes
    with Graph Optimization as a separate allocator, so the comparison is 2-way."""
    res = client.get("/api/metrics/compare")
    assert res.status_code == 200
    data = res.json()
    assert "comparison" in data
    assert "baseline" in data["comparison"]
    assert "battery_intelligence" in data["comparison"]
    assert data["comparison"]["battery_intelligence"]["avg_soh_allocated"] >= data["comparison"]["baseline"]["avg_soh_allocated"]
    assert "fleet_health" in data
    assert "pipeline_stages" in data
