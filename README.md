# Battery Intelligence Platform — AI-Powered Battery Decision Support System

**Event:** Brain Bolt – The Engineers Sprint (IMECE India 2026)
**Sponsor:** Siemens Energy India
**Problem Statement:** PS2P1 - BatteryHealth Assessment and Dynamic Allocation for Light EVs
**Architecture:** Python FastAPI Backend + React (Vite + TS + Tailwind + Recharts) Frontend + Scikit-Learn ML Ensemble + Graph Optimization + Engineering-Informed Degradation/RUL/Risk Layer
**Deployment Target:** Firebase Hosting (`*.web.app`)

---

## Executive Summary

This repository is no longer just a "battery allocation system" — it is a **Battery Intelligence Platform**: an AI-powered decision support system for Industry 4.0 fleet operations, covering Battery Health Assessment, Remaining Useful Life prediction, Explainable AI, Risk Assessment, Fleet Health Monitoring, Predictive Maintenance, a Digital Twin, Graph-Based Fleet Optimization, and What-If Scenario Simulation.

The system's story is a single **layered decision pipeline**, not a set of competing methods:

```
Battery Data
    -> Engineering Rule Validation      (hard safety thresholds -> SAFE/DEGRADED/UNSAFE)
    -> Battery Intelligence Engine      (ML-refined Suitability Score, Future Health,
    |                                    Remaining Useful Life, Risk Features — enrichment,
    |                                    not an allocator)
    -> Maintenance Recommendation       (rule-based action + structured reasons)
    -> Graph Optimization               (Hungarian / Maximum-Weight Matching — the ONE final allocator)
    -> Final Allocation
```

**The Battery Intelligence Engine does not compete with Graph Optimization.** It's a single enrichment stage — built from an ML-refined Suitability Score, a Risk Index, and a Remaining Useful Life / Future Health projection — that hands every battery a richer intelligence profile; Graph Optimization is the platform's single final allocation engine and consumes that intelligence (plus priority, energy match, waiting time, fair usage, and service rate) as 8 fully configurable, live-tunable weights. See `docs/Development_Plan.md` §12 for the full architecture, §13 for the Battery Intelligence Engine rename / Fleet Digital Twin / Allocation Explainability / Sustainability Dashboard, and §11 for the underlying modules (RUL, XAI, Risk, Digital Twin) each is built from.

The dashboard's headline comparison reflects this honestly: **Highest-SoC-First (naive baseline) vs. the Battery Intelligence Platform** — not a 3- or 4-way popularity contest between methods that were never meant to compete.

---

## Key Performance Output Comparison

| Mandatory Output | Baseline (Highest-SoC-First) | Battery Intelligence Platform |
|---|---|---|
| **Vehicles Served** | **50 / 50** | **50 / 50** |
| **Unserved Vehicles** | **0 / 50** | **0 / 50** |
| **% High & Critical Served** | **100.0%** | **100.0%** |
| **Unsafe Battery Allocations** | **0** | **0** |
| **Average SoH Allocated (%)** | **82.15%** | **91.00%** |
| **Average Suitability Score (0-100)** | **60.81** | **74.61** |
| **Multi-Objective Score (0-100)** | **84.56** | **88.41** |
| **Fleet Health Score** | — | **56.5% (Moderate)** |

Both methods pass all 5 Verification Rules with zero unsafe allocations. The
Battery Intelligence Platform's improvement over the naive baseline comes from
combining ML-refined suitability, an independent safety Risk Index, and a
forward-looking RUL projection into a single globally-optimal Graph
Optimization assignment — not from any one signal "winning." See
`docs/Development_Plan.md` §12.2 for the technical justification of why ML
enriches while Graph Optimization allocates.

---

## Verification Rules Compliance

All 5 verification rules specified in Section 5 of the problem statement are enforced as automated `pytest` assertions:
- **Rule 1 (No Unsafe Allocated):** PASSED (0 unsafe allocations)
- **Rule 2 (No Duplicate Battery Assigned):** PASSED (Unique battery ID mapping)
- **Rule 3 (No Duplicate Vehicle Assigned):** PASSED (Unique vehicle request ID mapping)
- **Rule 4 (Min Acceptable SoC Satisfied):** PASSED (Battery SoC $\ge$ Vehicle Min SoC for all assignments)
- **Rule 5 (Metrics Reproducible):** PASSED (Recomputable directly from datasets & code)

Run the test suite:
```bash
python -m pytest backend/tests/ -s
```

---

## Fleet Tiering & Threshold Methodology

- **Station Status Override:** `station_status == "REVIEW/QUARANTINE"` is a hard override to **UNSAFE** (12 packs).
- **State of Health (SoH %):** Industry EV End-of-Life (EOL) standard (`SoH < 70.0%` = Unsafe, `70.0% <= SoH < 80.0%` = Degraded, `SoH >= 80.0%` = Safe).
- **Electrical & Thermal Parameters:** Anchored to observed 200-pack fleet distribution tail (~75th percentile marks hard unsafe limit).
- **Degraded Count-Based Logic:** Non-unsafe packs are **DEGRADED** if they fail Safe limits on $\ge 2$ parameters (`degraded_min_soft_flags: 2`).

### Fleet Breakdown:
- **SAFE:** 98 packs (49.0%)
- **DEGRADED:** 61 packs (30.5%)
- **UNSAFE:** 41 packs (20.5%)

---

## Repository Structure

```
POC/
├── backend/
│   ├── main.py                       # FastAPI server entrypoint
│   ├── requirements.txt              # Runtime dependencies (incl. scipy for Graph Optimization)
│   ├── routers/                      # /classify, /allocate, /metrics, /export, /twist, /live,
│   │                                  #  /auth, /intelligence (RUL/XAI/Risk/Twin/fleet-health/
│   │                                  #  maintenance), /simulate (What-If scenarios)
│   ├── src/
│   │   ├── schema.py                 # Pydantic schemas & CSV validation
│   │   ├── classification.py         # Stage 1: Engineering Rule Validation + Suitability Score
│   │   ├── allocators/               # Base + Baseline (Highest-SoC-First) — the sole comparator
│   │   ├── pipeline.py               # Orchestrates the layered pipeline end to end
│   │   ├── graph_allocator.py        # Final stage: Graph Optimization — the ONE final allocator
│   │   │                             #  (also builds Allocation Explainability, see §13.3)
│   │   ├── degradation_model.py      # Engineering-informed degradation/aging model
│   │   ├── explainability.py         # XAI — contribution bars + decision summary
│   │   ├── risk_index.py             # Battery Intelligence Engine: independent Risk Index
│   │   ├── recommendation_engine.py  # Maintenance action + structured reasons
│   │   ├── digital_twin.py           # Battery Digital Twin: per-battery state + lifecycle timeline
│   │   ├── fleet_digital_twin.py     # Fleet Digital Twin: station-wide rollup (see §13.2)
│   │   ├── fleet_health.py           # Fleet Health Score (0-100, Excellent..Critical)
│   │   ├── sustainability.py         # Sustainability Dashboard business KPIs (see §13.4)
│   │   ├── scenario_simulator.py     # What-If Scenario Simulation engine
│   │   ├── metrics.py                # KPIs, Verification rules, multi-objective scoring
│   │   ├── export_utils.py           # CSV, Excel, PDF report generators
│   │   └── twist_adapter.py          # Part 2 stubbed extension hooks
│   ├── ml/
│   │   ├── train_ensemble.py         # StackingRegressor training script
│   │   ├── policy_tuner.py           # Simulation-based weight search (generalizes to the
│   │   │                              #  8 Graph Optimization weights — see docs §12.3)
│   │   ├── ensemble_scorer.py        # Battery Intelligence Engine: ML-refined Suitability Score
│   │   ├── rul_predictor.py          # Battery Intelligence Engine: RUL + confidence/transparency
│   │   └── models/                   # Serialized model artifacts (.pkl, .json)
│   ├── data/sessions/                # Live-demo session state
│   ├── data/digital_twin_state.json  # Digital Twin allocation history (auto-created)
│   └── tests/                        # Pytest test suite
├── frontend/
│   ├── src/
│   │   ├── api/                      # Typed API client (pipeline, fleet health, fleet digital
│   │   │                             #  twin, optimization weights, maintenance batch, scenario
│   │   │                             #  simulation, allocation explainability, sustainability)
│   │   ├── components/               # FleetHealthScore, OptimizationSettingsPanel, RiskBadge,
│   │   │                             #  BatteryRadarChart, RULPanel, XAIPanel, RiskGauge,
│   │   │                             #  RecommendationCard, DigitalTwinView, AllocationTable,
│   │   │                             #  AllocationExplainabilityPanel
│   │   ├── pages/                    # FleetDashboard, AllocationDashboard, DigitalTwinExplorer,
│   │   │                             #  FleetDigitalTwin, MaintenanceCenter, ScenarioSimulator,
│   │   │                             #  SustainabilityDashboard, BatteryDetails, Dashboard
│   │   │                             #  (router), MethodExplainer
│   │   └── App.tsx
│   └── dist/                         # Static production build
├── data/
│   └── Problem_1_*.csv               # Battery & Vehicle datasets
├── config.yaml                       # System configuration (incl. battery_intelligence_platform
│                                      #  weights, fleet_health, fleet_digital_twin, sustainability,
│                                      #  rul_confidence, risk_index, recommendation_engine,
│                                      #  multi_objective, digital_twin)
├── docs/Development_Plan.md          # Full design doc — §11 modules, §12 pipeline architecture,
│                                      #  §13 rename/Fleet Twin/Explainability/Sustainability
├── Battery_Intelligence_Platform_User_Guide.docx  # Enterprise user manual (see docs/ folder)
├── firebase.json                     # Firebase Hosting deployment config
└── README.md
```

---

## Battery Intelligence Platform — Feature Modules

Every battery pack exposes a full decision-support bundle in one call —
`GET /api/battery/{battery_id}/detail` — combining:

- **Remaining Useful Life (RUL):** current SoH, predicted SoH after N cycles, predicted remaining cycles, an uncertainty band, and an explicit **Confidence Level / Confidence % / reliability reasons** (e.g. "no historical usage data," "DoD estimated") — transparency over false precision (`/api/predict-rul/{battery_id}`).
- **Explainable AI (XAI):** the Suitability Score decomposed into feature-contribution bars, Top Positive/Negative factors, and a plain-English Decision Summary (`/api/explain/{battery_id}`).
- **Battery Risk Index:** an independent 0-100 safety score (Low/Medium/High/Critical — green/yellow/orange/red), shown side-by-side with — never merged into — the performance-oriented Suitability Score, everywhere: Fleet Dashboard, Battery Details, Allocation Table, Recommendation Card (`/api/risk/{battery_id}`).
- **AI Maintenance Recommendation:** a concrete action with **structured reasons** (not one sentence), inspection interval, priority, and estimated remaining service time (`/api/recommend/{battery_id}`, fleet-wide batch at `/api/maintenance/recommendations`).
- **Digital Twin:** current state -> predicted future state -> a 6-stage lifecycle timeline (Today / Allocated / +100 Cycles / Maintenance Due / Predicted End of Life / Replacement), maintenance window, and expected retirement date (`/api/digital-twin/{battery_id}`).
- **Fleet Health Score:** a single 0-100 station-wide indicator (Excellent/Good/Moderate/Poor/Critical) combining SoH, Risk, unsafe%, utilization, RUL, suitability, available energy, and healthy% (`/api/fleet-health`).
- **Optimization Settings Panel:** all 8 Graph Optimization weights (Priority/Suitability/Risk/Future Health/Waiting Time/Energy Match/Fair Usage/Service Rate) are configurable in `config.yaml`, explained in-app, and live-editable — the allocation reruns automatically as weights change (`GET /api/config/optimization-weights`, `POST /api/allocate/pipeline`).
- **What-If Scenario Simulator:** simulate battery failures, demand surges, temperature spikes, accelerated degradation, doubled critical demand, a shifted safety threshold, or custom weights, and see a full before/after comparison of the re-run pipeline (`POST /api/simulate`).
- **Health Radar:** a 7-axis radar chart (SoC, SoH, Internal Resistance, Temperature, Cell Balance, Cycle Life, Available Energy), plus a Battery Comparison Radar for up to 4 packs.
- **Fleet Digital Twin:** the station-wide counterpart to the per-battery Digital Twin — Fleet Health, Current Utilization, Charging Queue, Battery Availability, Charging Capacity, Average Risk, Average RUL, Peak Demand, and a Future Capacity Prediction, all rolled up from the same enriched fleet (`GET /api/fleet-digital-twin`). See `docs/Development_Plan.md` §13.2 for how it differs from the per-battery twin.
- **Allocation Explainability:** every Graph Optimization assignment is explained automatically — Vehicle -> Assigned Battery, a heuristic Allocation Confidence score, a Priority/Suitability/Risk/Energy Match/Future Health decision-factor breakdown, and the alternative batteries considered with why each lost out (`explainability` field on `POST /api/allocate/pipeline`; click "Explain" on any row in the Allocation Dashboard).
- **Sustainability Dashboard:** business KPIs comparing the platform's allocation against the naive baseline — Estimated Battery Life Extended, Unsafe Allocations Prevented, Energy Utilization Efficiency, Estimated Battery Replacements Avoided, Estimated Maintenance Savings, Estimated Fleet Utilization Improvement, and an Estimated CO2 Reduction always shown with its full derivation and an "Estimate — Not a Certified LCA" disclaimer (`GET /api/metrics/sustainability`).

All of this is **engineering-informed heuristics disclosed as such** — the
dataset is a static snapshot with no historical lifecycle data, so nothing here
claims to be a trained predictive model. Full methodology, assumptions, and
limitations: `docs/Development_Plan.md` §11-§13.

**Battery Chemistry:** the dataset carries no chemistry column, so every
pack is modeled identically regardless of whether it is physically LFP, NMC,
or LTO — no chemistry label is fabricated or inferred. `docs/Development_Plan.md`
§13.5 documents, without inventing numbers, what chemistry-aware degradation
models, charging behavior, thermal characteristics, RUL prediction, and
maintenance policies would require if chemistry metadata becomes available.

---

## User Guide

For a complete, page-by-page enterprise user manual (Executive Summary,
Architecture, End-to-End Workflow, Feature Explanations, Business Value, and
Future Enhancements) — suitable for Siemens Energy engineers and hackathon
judges unfamiliar with the codebase — see
[`Battery_Intelligence_Platform_User_Guide.docx`](./Battery_Intelligence_Platform_User_Guide.docx).

---

## Local Run Instructions

1. **Install backend dependencies & start the API:**
   ```bash
   pip install -r backend/requirements.txt
   python backend/main.py
   ```
   API runs at `http://localhost:8000`. Auto-generated OpenAPI docs available at `http://localhost:8000/docs`.

2. **Start Frontend Dev Server:**
   ```bash
   cd frontend
   npm run dev
   ```
   App runs at `http://localhost:5173`.

---

## Deployment (Firebase)

Deployed to Firebase Hosting (`*.web.app`):
```bash
cd frontend && npm run build
firebase deploy --only hosting
```
Live URL: `https://battery-health-poc.web.app`
