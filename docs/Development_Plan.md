# Development Plan (v2) — BatteryHealth Assessment & Dynamic Allocation POC
**Event:** Brain Bolt – The Engineers Sprint (IMECE India 2026) | **Sponsor:** Siemens Energy India
**Build agent:** Claude Opus via Antigravity
**Deployment target:** Firebase (Hosting + Cloud Functions/Cloud Run), live URL for judges
**Revision notes:** Streamlit dropped in favor of a real frontend; adds an ensemble-learning allocation track; formalizes the 70% (pre-event) / 30% (onsite twist) split.

---

## 1. What changed from v1 and why

- **No Streamlit.** The industry brief cares about the interface, not just the charts inside it. Streamlit is fast but reads as a data-science notebook, not a product. Replaced with a real frontend (React) talking to a real backend API — this is also what makes a Firebase deployment natural (Streamlit doesn't deploy cleanly to Firebase; a static frontend + Cloud Function/Cloud Run API does).
- **Added an ML/ensemble track.** Alongside the rule-based Suitability Score, the system now trains and serves an ensemble model that refines battery scoring and — because there's no historical "which swap worked out well" label in the dataset — learns allocation *policy weights* via simulation rather than pretending to have supervised ground truth it doesn't have. This is described honestly in §5 so it's defensible under judge questioning.
- **Explicit 70/30 time-boxing.** Everything in §7 is buildable now, ahead of the event. Everything in §8 is deliberately left as a live exercise, because that's literally 30% of the grading.
- **Deployment is now a first-class deliverable**, not an afterthought — a shareable `*.web.app` URL the judges can open on their own laptop during Q&A.

---

## 2. High-level architecture

```
┌────────────────────────────┐
│   Frontend (React + Vite)   │   Firebase Hosting (static)
│   - Upload/select datasets  │
│   - Classification view     │
│   - Allocation results view │
│   - Baseline vs Proposed    │
│     vs ML-Ensemble compare  │
│   - Charts (Recharts)       │
│   - Export buttons          │
│   - Twist control panel     │
└──────────────┬───────────────┘
               │ REST/JSON  (fetch via /api/**)
               ▼
┌────────────────────────────┐
│   Backend API (FastAPI)     │   Firebase Cloud Functions (2nd gen, Python)
│                              │   — or Cloud Run if payload/runtime needs grow
│  /classify                  │
│  /allocate/baseline         │
│  /allocate/proposed         │
│  /allocate/ml-ensemble      │
│  /metrics/compare            │
│  /export/{csv,xlsx,pdf}      │
│  /twist/apply                │
└──────────────┬───────────────┘
               ▼
┌────────────────────────────┐
│   Core Logic (shared lib)   │
│   classification.py         │
│   allocators/                │
│   twist_adapter.py           │
│   metrics.py                 │
└──────────────┬───────────────┘
               ▼
┌────────────────────────────┐
│   ML Layer                   │
│   ensemble_scorer.py         │  (RF + GBR + Ridge → stacked score)
│   policy_tuner.py            │  (simulation-based weight learning)
│   models/ (serialized .pkl)  │  trained offline, loaded at cold start
└────────────────────────────┘
```

**Why FastAPI behind Firebase, not Node:** all the classification/allocation/ML logic is naturally Python (pandas, scikit-learn). Firebase Cloud Functions 2nd gen supports a Python runtime directly, and Firebase Hosting can rewrite `/api/**` to that function — so the whole thing still deploys with `firebase deploy`, no separate hosting bill or account needed. If model load time or dependency size becomes an issue, the same container moves to Cloud Run behind the identical Hosting rewrite with one config change — noted as a fallback, not a requirement.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript, Tailwind CSS | Fast build, clean component structure, deploys as static files — ideal for Firebase Hosting |
| Charts | Recharts (or Chart.js) | React-native charting, interactive, no iframe/embedding hacks |
| Backend API | FastAPI (Python 3.11) | Async, typed, auto-generates OpenAPI docs judges can poke at directly |
| Deployment | Firebase Hosting (frontend) + Cloud Functions 2nd gen or Cloud Run (backend) | Matches your `*.web.app` requirement, single CLI (`firebase deploy`), free tier is enough for a POC demo |
| Core allocation logic | pandas, numpy, plain rule-based greedy | Same reasoning as v1 — explainable, traceable, defensible live |
| ML ensemble | scikit-learn: RandomForestRegressor + GradientBoostingRegressor + Ridge, combined via `StackingRegressor` | Small, fast to train on 200 rows, no GPU/heavy infra needed, still a legitimate "ensemble learning" claim |
| Policy learning | Simulation-based weight search (see §5.2) | Substitute for reinforcement learning where no real reward signal/history exists — same self-improving story, honestly scoped |
| Export | `openpyxl` (Excel), `reportlab` (PDF), native CSV | Unchanged from v1 |
| Config | `config.yaml`, versioned alongside code | Twist changes are config diffs, not rewrites |
| Testing | `pytest` on verification rules + API endpoints | Same green-checkmark story as v1, now also covers the API layer |

---

## 4. Repository structure

```
battery-poc/
├── frontend/
│   ├── src/
│   │   ├── api/               # typed client for the FastAPI backend
│   │   ├── components/
│   │   │   ├── ClassificationView.tsx
│   │   │   ├── AllocationTable.tsx
│   │   │   ├── ComparisonCharts.tsx     # Baseline vs Proposed vs ML-Ensemble
│   │   │   ├── SuitabilityDistribution.tsx
│   │   │   ├── UnsafeBatteryScatter.tsx
│   │   │   ├── ExportPanel.tsx
│   │   │   └── TwistControlPanel.tsx    # exposes config knobs live
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   └── MethodExplainer.tsx      # short "how it works" page for judges
│   │   └── App.tsx
│   ├── firebase.json
│   ├── .firebaserc
│   └── vite.config.ts
├── backend/
│   ├── main.py                          # FastAPI app entrypoint
│   ├── routers/
│   │   ├── classification.py
│   │   ├── allocation.py
│   │   ├── metrics.py
│   │   ├── export.py
│   │   └── twist.py
│   ├── src/
│   │   ├── schema.py
│   │   ├── classification.py
│   │   ├── allocators/
│   │   │   ├── base.py
│   │   │   ├── baseline_highest_soc.py
│   │   │   └── proposed_priority_score.py
│   │   ├── twist_adapter.py
│   │   └── metrics.py
│   ├── ml/
│   │   ├── train_ensemble.py            # offline training script, run pre-event
│   │   ├── ensemble_scorer.py           # loads trained models, scores at request time
│   │   ├── policy_tuner.py              # simulation-based weight search
│   │   └── models/                      # rf.pkl, gbr.pkl, ridge.pkl, stack.pkl
│   ├── requirements.txt
│   └── Procfile / functions entrypoint
├── data/
│   ├── raw/
│   │   ├── Problem_1_Battery_Fleet_200_Packs.csv
│   │   └── Problem_1_Vehicle_Demand_50_Requests.csv
│   └── processed/
├── config.yaml
├── tests/
│   ├── test_classification.py
│   ├── test_allocators.py
│   ├── test_verification_rules.py
│   └── test_api.py
├── docs/
│   └── Development_Plan.md
├── firebase.json                        # top-level, wires Hosting → Functions/Run
└── README.md
```

---

## 5. The ML / ensemble learning track

This is the part most worth being precise about, because a hackathon judge will immediately ask "what is it actually learning, and from what."

### 5.1 Honest framing of the data constraint
Neither dataset contains a ground-truth outcome label — there's no "this swap succeeded / this battery later failed" column. So a claim like "we trained a classifier to predict battery failure" would be overselling what 200 static snapshot rows can support. The plan instead does two things that *are* legitimately supportable:

**A — Ensemble-refined Suitability Score (supervised on a defensible proxy label).**
Use the rule-based classification from v1 (hard safety thresholds) to generate a *weak label* — not "this battery will fail," but "this battery falls in the unsafe/degraded/safe band by domain-defined physical rules." Train an ensemble (RandomForestRegressor + GradientBoostingRegressor + Ridge, combined via `StackingRegressor`) to reproduce and smooth that scoring function across all health parameters simultaneously, instead of the linear weighted sum from v1. Benefit over the linear formula: the ensemble can pick up non-linear interactions (e.g., a battery with borderline SoH but excellent resistance and low imbalance may deserve a higher score than a pure weighted average gives it) — and it's presented correctly as "a learned, smoothed version of our own domain rules," not as a black box trained on unavailable ground truth.

**B — Simulation-trained allocation policy (self-improving, not supervised).**
This is the "ensemble learning approach to make the application learn on its own for good battery allocation" piece. Since there's no historical reward signal, the reward has to be simulated:
1. Define a reward function from the mandatory KPIs: `reward = w1*(%Critical/High served) + w2*(avg SoH allocated) + w3*(avg Suitability Score) − w4*(unsafe allocations, hard-zeroed) − w5*(avg wait time)`.
2. Run many simulated allocation episodes over the same 200/50 dataset, each with the requests shuffled and/or the allocator's internal matching weights (priority weight, energy-match weight, score weight — the tunables in `proposed_priority_score.py`) perturbed.
3. Score each episode with the reward function, and use a lightweight search (random search / small genetic algorithm — no need for full RL infrastructure at POC scale) to converge on the matching-weight vector that maximizes expected reward across episodes.
4. The result is a policy that has "learned" its own weighting of priority vs. energy-match vs. health score from simulated experience, rather than the analyst hand-tuning it — which is the genuinely defensible version of "self-learning" here, and it can be re-run any time new data (or the onsite twist) changes what "good" means.

Both A and B are exposed as a third allocation mode (`/allocate/ml-ensemble`) that the frontend can toggle alongside Baseline and Proposed-Rule-Based, so the dashboard's comparison view becomes a three-way chart, not two — a stronger demo than v1's baseline-vs-proposed alone.

### 5.2 Where this lives in the timeline
Both A and B are trained **offline, before the event** (`ml/train_ensemble.py`, `ml/policy_tuner.py`), with the resulting model artifacts committed to `ml/models/` and loaded at API cold start. This keeps the live demo fast (no training at request time) and keeps the onsite 30% window free for the actual twist rather than model babysitting. If the twist changes what "good" means (e.g., a new priority tier, a new safety constraint), `policy_tuner.py` can be re-run in a couple of minutes onsite to re-converge the policy weights against the new reward definition — that re-run is itself a good live demo of the "self-learning" claim.

---

## 6. Deployment plan (Firebase)

1. **Frontend:** `cd frontend && npm run build` → static output in `frontend/dist`. `firebase init hosting` (public dir = `frontend/dist`), `firebase deploy --only hosting`. Gives you the `*.web.app` URL immediately.
2. **Backend:** `firebase init functions` with Python runtime (2nd gen), wrap the FastAPI app with the ASGI adapter Firebase Functions expects, deploy with `firebase deploy --only functions`.
3. **Wire them together:** in `firebase.json`, add a Hosting rewrite so `/api/**` routes to the function — the frontend never hardcodes a separate backend URL, it just calls `/api/...` and Firebase Hosting handles the routing. This also sidesteps CORS entirely.
4. **Fallback if function cold-starts or model size becomes a problem:** switch the same container to Cloud Run (`firebase init hosting:frameworks` or a manual Cloud Run rewrite) — same Hosting rewrite pattern, just pointed at a Cloud Run service instead of a Function. Keep this as a documented Plan B, only execute it if the Functions deploy actually struggles with the scikit-learn dependency size.
5. **Environment separation:** a `dev` Firebase project (or emulator suite — `firebase emulators:start`) for local iteration, a `prod`/demo project for the judge-facing URL, so a live re-deploy during the twist window doesn't risk breaking the working link mid-demo.
6. **Pre-event checklist:** deploy once, confirm the live URL works end-to-end (upload data → classify → allocate all three modes → export all three formats) at least a day before the event, not the morning of.

---

## 7. Part 1 — build now (the 70%)

Do this fully ahead of the event, in Antigravity:

1. `backend/src/schema.py` — validate both CSVs against the real column sets already confirmed from the sample data.
2. `backend/src/classification.py` — tiering + v1's linear Suitability Score (kept as the interpretable baseline score, always shown alongside the ML-refined one).
3. `backend/src/allocators/` — `base.py` interface, then `baseline_highest_soc.py`, then `proposed_priority_score.py` (rule-based version from v1).
4. `backend/src/metrics.py` — mandatory KPIs + the 5 verification rules as assertions, run against baseline + rule-based proposed first (two known-good comparison points before ML enters the picture).
5. `backend/ml/train_ensemble.py` — train and serialize the stacked regressor (§5.1-A) against the 200-row fleet.
6. `backend/ml/policy_tuner.py` — run the simulation-based weight search (§5.1-B), serialize the converged policy weights into `config.yaml` or a dedicated `policy.json`.
7. `backend/ml/ensemble_scorer.py` — loads both artifacts, exposes a `score()` and `allocate_ml_ensemble()` function matching the shared allocator interface from step 3.
8. `backend/routers/` + `backend/main.py` — FastAPI endpoints wrapping all of the above; auto-generated `/docs` becomes a free API reference for the judges.
9. `backend/src/twist_adapter.py` — same four hooks as v1 (constraint patch, priority patch, scoring patch, queue simulation), now also able to trigger a `policy_tuner.py` re-run.
10. `backend/tests/` — pytest for classification, allocators, verification rules, and the API endpoints.
11. `frontend/` — full React app: classification view, three-way allocation comparison (Baseline / Proposed-Rule / ML-Ensemble), the ≥3 mandatory charts (Suitability distribution, allocation-by-priority, method comparison, unsafe-battery scatter), export panel, and the twist control panel wired to `/twist/apply`.
12. Deploy to Firebase per §6, confirm the live URL end-to-end.
13. README + a short "Method Explainer" page in the app itself (judges reading it standalone should understand the classifier, the two allocators, and the honest scope of the ML component without you narrating it).

---

## 8. Part 2 — reserved for onsite (the 30% twist)

Deliberately **not** pre-built, because guessing it defeats the purpose of the exercise. What *is* pre-built is the machinery to absorb it fast:

- The `twist_adapter.py` hooks (constraint/priority/scoring patch, queue simulation) from v1, now also wired to the ML layer.
- A one-command re-run of `policy_tuner.py` so the "self-learning" allocator can re-converge against a changed reward definition live.
- A staging Firebase project so a redeploy during the event doesn't touch the working demo link until it's confirmed good.
- Practice runs beforehand against 2–3 self-invented "fake twists" (e.g., "a 4th battery tier," "Critical vehicles may accept Degraded batteries," "swap time becomes a hard constraint") purely to rehearse the mechanism, not to pre-solve the real one.

---

## 9. Definition of done (Part 1)

- [ ] Every battery classified into exactly one tier; Suitability Score uses ≥4 parameters.
- [ ] Baseline, rule-based proposed, and ML-ensemble allocators all implemented behind one shared interface.
- [ ] All 5 verification rules pass as automated tests, for all three allocation modes.
- [ ] All 6 mandatory quantitative outputs computed and comparable across all three methods.
- [ ] ≥3 visualizations live in the frontend (not just static images).
- [ ] CSV/Excel/PDF export working from the UI.
- [ ] ML ensemble scorer and policy tuner trained, serialized, and served without retraining at request time.
- [ ] Twist adapter hooks smoke-tested against ≥2 invented twists, including one that triggers a policy re-tune.
- [ ] Frontend + backend deployed and reachable at a live `*.web.app` URL, verified end-to-end at least a day ahead of the event.
- [ ] README + in-app Method Explainer accurately describe what the ML layer does and does not claim to learn from.

---

## 11. Extension — Battery Intelligence Platform (RUL, XAI, Digital Twin, Graph/Multi-Objective Allocation, Risk)

> **Superseded framing, kept for history — see §12.** This section documents
> the *modules* (RUL, XAI, Risk, Digital Twin, Graph Optimization) largely as
> they still exist today, and its engineering assumptions/limitations are
> still accurate. But its *architecture* framed Rule-Based, Graph
> Optimization, and ML-Ensemble as three **competing** allocation methods
> compared side by side ("4-way comparison"), and implied Graph Optimization
> "beat" the ML track. That framing has been replaced: §12 below restructures
> these same modules into a single **layered pipeline** where ML/Risk/RUL
> enrich every battery and Graph Optimization is the one final allocator.
> Read this section for individual-module detail (degradation model math,
> RUL/XAI/twin field semantics), and §12 for the current end-to-end
> architecture, API surface, and dashboard structure.

This section documents a second build pass that extends the Part 1 system above
into a decision-support platform, without rewriting anything in §1-§10. The
existing React + FastAPI + Firebase architecture, project structure, the three
original allocators, the ML ensemble pipeline, and all mandatory KPIs/verification
rules are unchanged and still the source of truth for "does this system meet the
base problem statement." Everything below is additive.

### 11.1 Why this extension, and the one constraint that shapes all of it

The dataset is still exactly what it was in §5.1: **a single static snapshot of
200 battery packs and 50 vehicle requests, with no historical cycling or
lifecycle data.** Every new module is designed around that constraint honestly:
where the brief asks for "prediction," the answer is an **engineering-informed
heuristic model** (citable rules of thumb from Li-ion aging literature), never
a model trained on data that doesn't exist. Where it asks for "AI," the answer
is either the existing supervised ensemble (§5.1-A, unchanged) or a transparent
rule-based system — explicitly not SHAP/LIME/deep learning, because those would
add weight and false authority without more data to justify them.

### 11.2 New modules (backend)

| Module | Purpose | Nature |
|---|---|---|
| `backend/src/degradation_model.py` | Projects future SoH from current snapshot using Arrhenius-style thermal aging (+10C ~ 2x aging rate), internal-resistance/imbalance stress multipliers (linearly scaled against the fleet's existing distribution bounds), a disclosed depth-of-discharge proxy (from current SoC), and calendar age. | Engineering heuristic, not trained |
| `backend/ml/rul_predictor.py` | Wraps the degradation model into "current SoH / predicted SoH after N cycles / estimated RUL in cycles to the 70% EOL threshold," with an uncertainty band and ranked stress-driver explanations. | Heuristic projection (lives under `ml/` for API/route symmetry with the ensemble scorer, not because it's trained) |
| `backend/src/explainability.py` | Rule-based XAI for the Suitability Score: decomposes the existing weighted formula into its 5 components, ranks the largest positive/negative contributors against a neutral pivot, and renders short human-readable reasons. | Deliberately not SHAP — the underlying model is already a transparent linear formula, so attribution is exact and free |
| `backend/src/risk_index.py` | A second, independent 0-100 **safety**-oriented score (temperature, internal resistance, imbalance, cycle count, inverse SoH, predicted degradation rate) banded into Low/Medium/High/Critical, with a quarantine hard-override. | Rule-based, weights in `config.yaml` |
| `backend/src/recommendation_engine.py` | Turns tier + Risk Index + RUL into a concrete maintenance action (Continue Service / Rebalance Cells / Cooling Inspection / Schedule Preventive Maintenance / Replace Battery Soon / Immediate Quarantine), an inspection interval, and a priority. | Rule-based decision table |
| `backend/src/digital_twin.py` | Per-battery virtual state: a stateless computed projection (current + predicted future state, via the modules above) plus a small JSON-backed allocation history (`backend/data/digital_twin_state.json`, same pattern as `live_session.py`) updated every time any allocator produces an assignment. | Computed projection + genuine persisted activity log |
| `backend/src/graph_allocator.py` | A 4th allocation mode: vehicles and batteries as a weighted bipartite graph, solved with `scipy.optimize.linear_sum_assignment` (Hungarian algorithm) for a globally-optimal match, vs. the greedy vehicle-by-vehicle matching in the other three allocators. | Exact combinatorial optimization (not heuristic) |
| `backend/src/metrics.py: compute_multi_objective_score()` | Aggregates 8 configurable objectives (served vehicles, priority coverage, avg health, avg suitability, unsafe/wait-time/fairness penalties, forward degradation) into one 0-100 comparison score per allocator, for the 4-way dashboard comparison. | Configurable weighted sum |

None of these modules modify `classification.py`'s tiering/Suitability Score logic
or the three original allocators — `calculate_suitability_components()` was
added to `classification.py` as a pure refactor (same formula, now exposing its
parts) so `explainability.py` can attribute the score without recomputing it.

### 11.3 Feature-to-module map

1. **Battery Aging Prediction (RUL)** — `degradation_model.py` + `rul_predictor.py`, `GET/POST /api/predict-rul/{battery_id}`, `RULPanel.tsx` (current SoH, predicted SoH after N cycles, RUL, degradation trend line chart with EOL reference line).
2. **Explainable AI (XAI)** — `explainability.py`, `GET /api/explain/{battery_id}`, `XAIPanel.tsx` (+/- reasons, full component breakdown bars).
3. **Multi-Objective Optimization** — `config.yaml: multi_objective`, `metrics.compute_multi_objective_score()`, surfaced in `/api/metrics/compare` and the Comparison Charts' "Multi-Objective Allocation Score" panel.
4. **Battery Digital Twin** — `digital_twin.py`, `GET /api/digital-twin/{battery_id}` (+ fleet batch), `DigitalTwinView.tsx` (current state -> predicted future state, allocation history, timeline chart).
5. **Battery Degradation Model** — `degradation_model.py`, consumed by RUL, Digital Twin, Risk Index, and the Graph Allocator's "predicted future health" edge term.
6. **Graph-Based Allocation** — `graph_allocator.py` (`GraphOptimizationAllocator`), `POST /api/allocate/graph`, added as the 3rd of 4 methods in every comparison view; the original 3 allocators are untouched baselines.
7. **Uncertainty Score** — `estimate_uncertainty_pct()` (degradation model) and `estimate_suitability_uncertainty()` (explainability), surfaced as `+/-` throughout the RUL panel and XAI panel (e.g. `Suitability = 91 +/- 2`, `RUL = 420 +/- 30 cycles`).
8. **Battery Health Visualization** — `BatteryRadarChart.tsx` (7-axis radar: SoC, SoH, Internal Resistance, Temperature, Cell Imbalance, Cycle Count, Available Energy — all normalized 0-100, higher-is-better, using the same bounds as the Suitability Score/Risk Index), plus a Battery Comparison Radar overlay for up to 4 packs.
9. **AI Maintenance Recommendation Engine** — `recommendation_engine.py`, `GET /api/recommend/{battery_id}`, `RecommendationCard.tsx`.
10. **Battery Risk Index** — `risk_index.py`, `GET /api/risk/{battery_id}` (+ fleet batch), `RiskGauge.tsx`, and a `Risk Index` column shown next to `Suitability Score` in the Fleet Explorer table (safety vs. performance, side-by-side, deliberately never merged into one number).

### 11.4 New API surface

All new routes live in `backend/routers/intelligence.py` (registered in `main.py`
alongside the existing routers) plus two additions to the existing allocation
and metrics routers:

```
GET   /api/predict-rul/{battery_id}       Current/predicted SoH, RUL, stress drivers, trend
POST  /api/predict-rul                    Same, body: { battery_id, cycles_ahead? }
GET   /api/explain/{battery_id}           XAI suitability breakdown + +/- reasons
GET   /api/risk/{battery_id}              Single-battery Risk Index
GET   /api/risk                           Fleet-wide Risk Index + band counts
GET   /api/recommend/{battery_id}         Maintenance recommendation
GET   /api/digital-twin/{battery_id}      Single-battery Digital Twin
GET   /api/digital-twin                   Fleet-wide Digital Twins
GET   /api/battery/{battery_id}/detail    Combined bundle (all of the above, 1 call)
POST  /api/allocate/graph                 4th allocator: Graph Optimization (Hungarian)
GET   /api/metrics/compare                Now 4-way (+ multi_objective_comparison block)
```

`export` (`/api/export/{format}?mode=...`) and the live-session ticker
(`/api/live/request`, mode field) both also accept `mode=graph` for parity with
the other three.

### 11.5 Updated architecture diagram

```
┌──────────────────────────────┐
│   Frontend (React + Vite)     │   Firebase Hosting (static)
│   - Classification / Fleet    │
│   - Battery Details page:     │
│     RUL, XAI, Risk, Twin,     │
│     Recommendation, Radar     │
│   - 4-Way Allocation Compare  │
│     (Baseline/Proposed/Graph/ │
│      ML-Ensemble) + Multi-Obj │
│   - Charts (Recharts)         │
└──────────────┬────────────────┘
               │ REST/JSON  (fetch via /api/**)
               ▼
┌──────────────────────────────┐
│   Backend API (FastAPI)       │   Firebase Cloud Functions / Cloud Run
│  /classify  /allocate/*       │
│  /metrics/compare  /export/*  │
│  /predict-rul  /explain       │
│  /risk  /recommend            │
│  /digital-twin  /battery/*    │
│  /twist  /live  /auth         │
└──────────────┬────────────────┘
               ▼
┌──────────────────────────────┐
│   Core Logic (shared lib)     │
│   classification.py           │
│   allocators/ (baseline,      │
│     proposed) + graph_        │
│     allocator.py              │
│   degradation_model.py        │
│   explainability.py           │
│   risk_index.py                │
│   recommendation_engine.py    │
│   digital_twin.py              │
│   metrics.py (+ multi-obj)    │
│   twist_adapter.py             │
└──────────────┬────────────────┘
               ▼
┌──────────────────────────────┐
│   ML Layer                    │
│   ensemble_scorer.py          │  (RF + GBR + Ridge -> stacked score, unchanged)
│   rul_predictor.py            │  (heuristic, not trained — see §11.1)
│   policy_tuner.py              │
│   models/ (serialized .pkl)   │
└────────────────────────────────┘
```

### 11.6 Updated repository structure (new/changed paths only)

```
battery-poc/
├── backend/
│   ├── requirements.txt              # NEW — pins fastapi/pandas/sklearn/... + scipy
│   ├── requirements-dev.txt          # NEW — + pytest/httpx for backend/tests/
│   ├── routers/
│   │   └── intelligence.py           # NEW — RUL/XAI/risk/recommend/twin/detail routes
│   ├── src/
│   │   ├── classification.py         # + calculate_suitability_components() (pure refactor)
│   │   ├── degradation_model.py      # NEW
│   │   ├── explainability.py         # NEW
│   │   ├── risk_index.py             # NEW
│   │   ├── recommendation_engine.py  # NEW
│   │   ├── digital_twin.py           # NEW
│   │   ├── graph_allocator.py        # NEW — 4th allocator (Hungarian matching)
│   │   ├── metrics.py                # + compute_multi_objective_score()
│   │   └── live_session.py           # + graph mode, digital twin recording
│   ├── ml/
│   │   └── rul_predictor.py          # NEW
│   └── data/
│       └── digital_twin_state.json   # NEW — small JSON store, allocation history only
├── frontend/src/
│   ├── api/client.ts                 # + RUL/XAI/Risk/Recommendation/Twin/4-way types & fetchers
│   ├── components/
│   │   ├── BatteryRadarChart.tsx     # NEW
│   │   ├── RULPanel.tsx              # NEW
│   │   ├── XAIPanel.tsx              # NEW
│   │   ├── RiskGauge.tsx             # NEW
│   │   ├── RecommendationCard.tsx    # NEW
│   │   ├── DigitalTwinView.tsx       # NEW
│   │   ├── ClassificationView.tsx    # + Risk Index column, "View Details" action
│   │   ├── AllocationTable.tsx       # + Graph Optimization as 4th mode
│   │   └── ComparisonCharts.tsx      # + 4-way + Multi-Objective Score panel
│   └── pages/
│       ├── BatteryDetails.tsx        # NEW — combines all of the above per battery
│       └── Dashboard.tsx             # + "details" tab, risk map, graph-mode plumbing
└── config.yaml                       # + degradation_model, explainability, risk_index,
                                       #   recommendation_engine, multi_objective,
                                       #   digital_twin, graph_allocator sections
```

### 11.7 Engineering assumptions (disclosed, not hidden)

- **Depth-of-Discharge** and **charge rate** are not present in either CSV. DoD is
  weakly proxied from current SoC (lower SoC -> assumed deeper typical discharge);
  charge rate is held at a disclosed constant default (1C). Both are documented
  limitations, not fabricated telemetry — see `degradation_model.py` docstring.
- **Thermal aging** uses the common Li-ion rule of thumb that degradation rate
  roughly doubles per +10C above a 25C reference (Arrhenius-style), not a
  battery-chemistry-specific fitted curve (no cycling data to fit one to).
- **Energy-per-km** (used by the Graph Allocator's energy-match term) is a
  disclosed constant assumption (`config.yaml: graph_allocator.energy_per_km_kwh`)
  for a generic light EV, since neither dataset states vehicle efficiency.
- **RUL/uncertainty bands** are heuristic confidence widths (wider when a
  battery's operating conditions are further from the model's reference/"typical"
  conditions) — explicitly not a statistically fitted prediction interval.
- **Digital Twin "allocation history"** is real (it accumulates from actual
  allocation runs in this session/deployment), but the "current state" and
  "predicted future state" are recomputed from the same static CSV snapshot
  every time — there is no live telemetry feed.

### 11.8 Limitations & future improvements

- All heuristic models (degradation, RUL, risk) would benefit enormously from
  even a small amount of real historical cycling data — the natural next step
  is replacing the engineering multipliers with fitted curves once that exists.
- The Multi-Objective framework here is a configurable **weighted sum**, not a
  full Pareto-frontier / NSGA-II style multi-objective search; that's a
  reasonable and honestly-scoped upgrade path if the onsite twist calls for
  exploring trade-off frontiers rather than a single scalarized ranking.
- The Graph Allocator computes weights per (vehicle, battery) pair on a small
  dense matrix (correct and fast at this fleet's scale); a sparse formulation
  would be the next step for a much larger fleet.
- The Digital Twin's persisted allocation history is a single shared JSON file,
  matching `live_session.py`'s existing pattern — fine for a POC/demo, but a
  real deployment would move this to Firestore alongside session state.

---

## 12. Architectural Restructuring — The Layered Battery Intelligence Pipeline

This section supersedes §11's "competing allocators" framing. Nothing in §11's
individual modules was thrown away — degradation_model.py, rul_predictor.py,
explainability.py, risk_index.py, recommendation_engine.py, digital_twin.py,
and graph_allocator.py all still exist, largely unchanged in their internal
math. What changed is how they're **wired together**.

### 12.1 Decision Pipeline

```
Battery Data
    |
    v
Engineering Rule Validation      backend/src/classification.py
    |                             (hard safety thresholds -> SAFE / DEGRADED / UNSAFE
    |                              + the rule-based linear Suitability Score, unchanged)
    v
ML Suitability Prediction        backend/ml/ensemble_scorer.py :: compute_ml_suitability_scores()
    |                             (StackingRegressor smooths the rule-based score
    |                              non-linearly — an ENRICHMENT signal, not an allocator)
    v
Risk Index                       backend/src/risk_index.py :: compute_risk_index()
    |                             (independent 0-100 safety score, banded Low..Critical)
    v
Remaining Useful Life            backend/src/degradation_model.py, backend/ml/rul_predictor.py
    |                             (engineering-heuristic projection + confidence/reliability reasons)
    v
Maintenance Recommendation       backend/src/recommendation_engine.py :: generate_recommendation()
    |                             (rule-based action + structured "why" reasons)
    v
Graph Optimization               backend/src/graph_allocator.py :: GraphOptimizationAllocator
    |                             (Hungarian / Maximum-Weight Bipartite Matching — the platform's
    |                              ONE final allocator, consuming every signal above as a
    |                              configurable, live-tunable weight)
    v
Final Allocation
```

`backend/src/pipeline.py` is the single file that wires these stages together:
`enrich_fleet()` runs stages 1-5 and attaches their outputs as columns on the
battery DataFrame (`ml_suitability_score`, `risk_index`, `risk_band`,
`estimated_rul_cycles`, `predicted_future_soh`, `recommended_action`,
`maintenance_priority`); `run_battery_intelligence_pipeline()` then hands that
enriched DataFrame to `GraphOptimizationAllocator` for stage 6-7.

### 12.2 Technical justification: why ML enriches, Graph Optimization allocates

**Why not let the ML score allocate directly (as the old `ml-ensemble` mode
did)?** A regression score is a property of a *single battery in isolation* —
it says nothing about which vehicle should get which battery when 50 requests
compete for 159 eligible packs simultaneously. Turning a per-battery score
into an allocation greedily (highest score first, vehicle by vehicle) can lock
in a locally-good match early that turns out globally suboptimal — a classic
greedy-algorithm failure mode.

**Why Graph Optimization?** Modeling vehicles and batteries as a weighted
bipartite graph and solving with the Hungarian algorithm
(`scipy.optimize.linear_sum_assignment`) finds the assignment that maximizes
*total* edge weight across the *entire* graph simultaneously — the
mathematically optimal matching given the edge weights, not a sequence of
locally-optimal choices. This is a stronger guarantee than any greedy
allocator (rule-based or ML-driven) can offer, independent of how good any
single battery's score is.

**Why do ML/Risk/RUL matter at all, then, if Graph Optimization is exact?**
Because "exact" only means optimal *with respect to the edge weights it's
given*. An edge weight built only from raw SoC/SoH would optimize a shallow
objective. Feeding it ML-refined suitability (non-linear feature
interactions), Risk Index (safety independent of performance), and RUL
(forward-looking degradation) makes the *objective itself* smarter — Graph
Optimization is only as good as the intelligence it's asked to optimize over.
This is the actual division of labor: **ML predicts battery intelligence;
Graph Optimization performs optimal fleet-wide assignment** against that
intelligence.

### 12.3 Multi-Objective Optimization — live, configurable, explained

Every Graph Optimization edge weight is defined in `config.yaml:
battery_intelligence_platform.weights` as `{value, label, description}` —
never a bare hardcoded float:

| Weight | Default | What it does |
|---|---|---|
| Priority | 0.20 | Favors Critical/High priority vehicle requests over Normal |
| Suitability | 0.20 | Weight on the ML-refined Suitability Score |
| Risk | 0.15 | Penalizes high Risk Index batteries even if Suitability is strong |
| Future Health | 0.10 | Rewards batteries projected to stay healthy after this usage |
| Waiting Time | 0.10 | Urgency credit for vehicles queued longer |
| Energy Match | 0.10 | Rewards batteries whose energy comfortably covers the required range |
| Fair Usage | 0.075 | Spreads wear: batteries allocated less often (Digital Twin history) get a boost |
| Service Rate | 0.075 | Right-sizing bonus: prefers *just-sufficient* energy margin over excess, preserving high-capacity packs for other vehicles |

The frontend **Optimization Settings Panel** (Allocation Dashboard page)
renders all 8 sliders with their `description` text pulled live from `GET
/api/config/optimization-weights`, and every change POSTs a
`weight_overrides` object to `/api/allocate/pipeline` — the allocation reruns
and the dashboard updates within roughly half a second, with **no write back
to config.yaml** (session-only, safe to experiment with). Weights are
re-normalized server-side so they always form a proper weighted average even
if the raw slider values don't sum to 1.0.

**Future direction — automatic weight learning.** `backend/ml/policy_tuner.py`
already implements a simulation-based weight search for the original
rule-based allocator's tunables (§5.1-B): perturb weights across many
simulated episodes, score each with a reward function, converge on the
best-performing vector. That exact mechanism generalizes to these 8 weights
with no new infrastructure — replace the tunable vector with
`battery_intelligence_platform.weights`, and use
`metrics.compute_multi_objective_score()`'s 8-objective reward (already
implemented, see §11.3 in the historical section) as the fitness function.
This is the natural next step to replace hand-tuning via the UI sliders with
data-driven convergence, and is deliberately *not* built now — it's flagged
here so it's a scoped, obviously-next feature rather than a surprise.

### 12.4 System Flow / Workflow Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Vite)                     │
│                                                                       │
│  Fleet Dashboard      -> Fleet Health Score, tier summary, auto-summary
│  Battery Explorer     -> searchable/filterable raw fleet table (+Risk col)
│  Battery Details      -> RUL+confidence, XAI+bars, Risk, Twin, Radar
│  Allocation Dashboard -> Optimization Settings Panel + live final allocation
│  Analytics            -> Visualization Studio + predefined charts
│  Maintenance Center   -> fleet-wide recommendations, sorted by priority
│  Digital Twin         -> dedicated per-battery lifecycle timeline browser
│  Method Comparison    -> Baseline vs Battery Intelligence Platform (2-way)
│  Scenario Simulator   -> What-If before/after analysis
│  Live Requests Ticker -> single-request interactive allocation demo
│  Reports & Export     -> CSV / Excel / PDF                          │
└──────────────────────────────┬────────────────────────────────────┘
                                │ REST/JSON (fetch via /api/**)
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                       Backend API (FastAPI)                          │
│  /classify  /allocate/{baseline,pipeline,graph,...legacy}            │
│  /metrics/compare  /fleet-health  /config/optimization-weights       │
│  /predict-rul  /explain  /risk  /recommend  /digital-twin            │
│  /maintenance/recommendations  /simulate  /export  /twist /live /auth│
└──────────────────────────────┬────────────────────────────────────┘
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                    pipeline.py (orchestration)                       │
│   enrich_fleet() ──► classification ──► ML ──► Risk ──► RUL ──► Rec │
│   run_battery_intelligence_pipeline() ──► GraphOptimizationAllocator │
└──────────────────────────────┬────────────────────────────────────┘
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  fleet_health.py   scenario_simulator.py   metrics.py                │
│  (station-wide score)  (before/after What-If)  (KPIs + multi-obj.)   │
└────────────────────────────────────────────────────────────────────┘
```

### 12.5 Updated API Documentation

```
GET/POST /api/predict-rul[/{battery_id}]   RUL + confidence level/%/reasons
GET      /api/explain/{battery_id}         XAI: contribution bars + decision summary
GET      /api/risk[/{battery_id}]          Risk Index (single or fleet-wide)
GET      /api/recommend/{battery_id}       Maintenance recommendation (structured reasons)
GET      /api/maintenance/recommendations  Fleet-wide recommendations, priority-sorted
GET      /api/digital-twin[/{battery_id}]  Digital Twin incl. lifecycle timeline_stages
GET      /api/battery/{battery_id}/detail  Combined bundle (all of the above, 1 call)
GET      /api/fleet-health                 Fleet Health Score (0-100, Excellent..Critical)
GET      /api/config/optimization-weights  The 8 Graph Optimization weights + descriptions
POST     /api/allocate/pipeline            Final allocation; body: { weight_overrides? }
POST     /api/allocate/graph               Alias of /pipeline (name predates the restructuring)
POST     /api/allocate/baseline            Highest-SoC-First — the sole comparison baseline
GET      /api/simulate/scenarios           List of What-If scenario types + descriptions
POST     /api/simulate                     Run a scenario; returns before/after + allocation diff
GET      /api/metrics/compare              2-way: baseline vs battery_intelligence (+ fleet_health,
                                            + pipeline_stages, + multi_objective_comparison)
GET      /api/metrics/compare/legacy       Retained for debugging: the old 4-way comparison
POST     /api/allocate/proposed            Legacy rule-based allocator (API completeness only)
POST     /api/allocate/ml-ensemble         Legacy standalone ML allocator (API completeness only)
```

`proposed` and `ml-ensemble` are kept callable (and their code untouched) so
nothing that depended on them breaks, but neither is part of the platform's
headline story or default dashboard views anymore.

### 12.6 Dashboard Screens (frontend/src/pages)

| Page | Purpose |
|---|---|
| `FleetDashboard.tsx` | Fleet Health Score + tier summary — "how healthy is the station" at a glance |
| `ClassificationView` (Battery Explorer tab) | Searchable/filterable raw fleet table with Risk Index column |
| `BatteryDetails.tsx` | Full per-battery bundle: Radar, RUL+confidence, XAI+bars, Risk gauge, Recommendation, Digital Twin, Comparison Radar |
| `AllocationDashboard.tsx` | Optimization Settings Panel + the live final allocation table |
| Analytics tab | `VisualizationStudio` + `ExpandedPredefinedCharts` + distribution/scatter charts |
| `MaintenanceCenter.tsx` | Fleet-wide recommendations table, priority-filterable |
| `DigitalTwinExplorer.tsx` | Dedicated per-battery lifecycle-twin browser |
| `ComparisonCharts.tsx` (Method Comparison tab) | Pipeline diagram + Fleet Health + Baseline vs Platform charts/table |
| `ScenarioSimulator.tsx` | Scenario picker + before/after comparison + allocation-change diff |
| `LiveDemo.tsx` | Interactive single-request allocation ticker |
| Reports & Export tab | CSV/Excel/PDF export with mode selector (defaults to `pipeline`) |
| `MethodExplainer.tsx` | Judge-facing "how it works" narrative |

Each page has one focused purpose — the earlier single "Overview" tab that
mixed fleet summary, 4-way comparison, and raw table has been split
accordingly.

### 12.7 What changed vs. §11's Definition of Done

- The 4-way comparison (Baseline / Proposed / Graph / ML-Ensemble) is no
  longer the primary comparison surface. `/api/metrics/compare` now returns
  `{baseline, battery_intelligence}`; the old shape is preserved at
  `/api/metrics/compare/legacy` for anyone still depending on it.
- `graph_allocator.py`'s edge-weight formula grew from 6 factors
  (priority/suitability/energy_match/soh/predicted_future_health/waiting_time)
  to 8 (adding Risk and splitting Fair Usage / Service Rate out as their own
  weights), and now consumes the *enriched* DataFrame from `pipeline.py`
  rather than computing everything inline.
- New modules: `pipeline.py`, `fleet_health.py`, `scenario_simulator.py`.
- New config sections: `battery_intelligence_platform.weights` (replaces
  `graph_allocator.edge_weights`), `fleet_health`, `rul_confidence`.
- `AllocationAssignment` gained optional `risk_index` / `risk_band` /
  `estimated_rul_cycles` / `recommended_action` fields so Risk and
  Recommendation appear directly in the allocation table, side-by-side with
  Suitability, without a second round-trip.

---

## 13. Battery Intelligence Engine Rename, Fleet Digital Twin, Allocation Explainability, Sustainability

This section documents the third build pass: a rename of the enrichment
layer plus four additive modules. Nothing in §12's pipeline architecture
changed — Graph Optimization is still the sole final allocator, the layered
pipeline still runs Engineering Rule Validation -> enrichment ->
Recommendation -> Graph Optimization -> Final Allocation. What's new:

### 13.1 The Battery Intelligence Engine (rename)

"ML Suitability Prediction" is now named the **Battery Intelligence Engine**
everywhere — API `pipeline_stages`, docstrings, the Method Explainer, and
this document. It's still built from the same three modules
(`ensemble_scorer.py`, `risk_index.py`, `degradation_model.py`/
`rul_predictor.py`), but is now presented as one conceptual layer that
generates four things per battery:

- **ML-refined Suitability Score** (`ensemble_scorer.compute_ml_suitability_scores`)
- **Future Health** (`degradation_model.predicted_soh_after_cycles`)
- **Remaining Useful Life** (`degradation_model.estimate_rul_cycles`)
- **Risk Features** (`risk_index.compute_risk_index`)

The consolidated pipeline-stage list (`backend/src/pipeline.py::
PIPELINE_STAGE_LABELS`, single source of truth) is now 5 stages instead of 7:

```
Engineering Rule Validation -> Battery Intelligence Engine
  -> Maintenance Recommendation -> Graph Optimization (Hungarian Matching)
  -> Final Allocation
```

### 13.2 Fleet Digital Twin vs. Battery Digital Twin

| | Battery Digital Twin | Fleet Digital Twin |
|---|---|---|
| Module | `backend/src/digital_twin.py` | `backend/src/fleet_digital_twin.py` |
| Endpoint | `GET /api/digital-twin/{battery_id}` | `GET /api/fleet-digital-twin` |
| Scope | ONE pack | The WHOLE station |
| Answers | "What will happen to THIS battery?" | "What will happen to the STATION?" |
| Shows | Current/predicted state, 6-stage lifecycle timeline, allocation history | Fleet Health, Current Utilization, Charging Queue, Battery Availability, Charging Capacity, Average Risk, Average RUL, Peak Demand, Future Capacity Prediction |

The Fleet Digital Twin is a **rollup**, not a new data source: it aggregates
the same enriched fleet DataFrame and the same queue simulation
(`twist_adapter.simulate_queue`) used everywhere else in the platform.
`peak_demand_concurrent_vehicles` is computed with a sweep-line over the
queue simulation's arrival/wait/service-time windows. `future_capacity_prediction`
scales each battery's currently-available energy by its own
predicted-future-SoH ratio — a disclosed simplification, not a separate
energy-fade model.

### 13.3 Allocation Explainability

Generated automatically after every Graph Optimization run —
`GraphOptimizationAllocator._build_explainability()` — and returned as the
`explainability` field on `POST /api/allocate/pipeline` (keyed by
`request_id`), without changing `AllocationResult`'s shape (fully additive,
stored as `self.explainability` on the allocator instance).

For each served vehicle:
- **Decision Factors**: the winning battery's Priority/Suitability/Risk/Energy
  Match/Future Health edge-weight contributions, renormalized to 100% (Waiting
  Time, Fair Usage, and Service Rate still count in the real Graph Optimization
  score but are folded out of this 5-factor summary for the reason the spec's
  example uses exactly 5 factors — readability).
- **Allocation Confidence**: a heuristic 0-100 score from the margin between
  the winning edge weight and the best feasible alternative's — explicitly
  documented as a margin heuristic, not a statistical probability.
- **Alternatives Considered**: up to 3 runner-up feasible batteries, each with
  the single dominant reason it lost (`Lower Suitability`, `Higher Risk`,
  `Lower Future Health`, `Insufficient Energy Match`, or — if the batteries
  compared favorably on all 4 headline factors but still weren't chosen —
  `Reserved for another vehicle in the global-optimum match`).

Surfaced in the frontend as the **Allocation Explainability panel**
(`AllocationExplainabilityPanel.tsx`) on the Allocation Dashboard: click
"Explain" on any assignment row.

### 13.4 Sustainability Dashboard

`backend/src/sustainability.py::compute_sustainability_kpis()` compares the
Battery Intelligence Platform's allocation against the Highest-SoC-First
baseline on the *same* fleet/demand snapshot and translates the difference
into business KPIs: Estimated Battery Life Extended, Unsafe Allocations
Prevented, Energy Utilization Efficiency, Estimated Battery Replacements
Avoided, Estimated Maintenance Savings, Estimated Fleet Utilization
Improvement, and an Estimated CO2 Reduction.

Every dollar/CO2 figure traces back to disclosed constants in `config.yaml:
sustainability` (`avg_maintenance_event_cost_usd`,
`assumed_cycle_life_per_battery`, `co2_kg_per_kwh_manufactured`) — echoed back
in the API response's `assumptions` field so nothing is a hidden multiplier.
The CO2 figure is always rendered with `is_estimate: true` and a full
derivation string; the frontend Sustainability Dashboard pins an "Estimate —
Not a Certified LCA" badge next to it. `co2_kg_per_kwh_manufactured` is a
generic, published Li-ion manufacturing-emissions order-of-magnitude figure,
not measured for this fleet's actual (undisclosed) chemistry.

Exposed via `GET /api/metrics/sustainability`.

### 13.5 Battery Chemistry Awareness — Future Work

The provided fleet dataset (`data/Problem_1_Battery_Fleet_200_Packs.csv`)
contains **no chemistry column** — every pack is treated identically by the
degradation model, RUL predictor, and recommendation engine regardless of
whether it's physically LFP, NMC, or LTO. This is a disclosed limitation, not
an oversight, and nothing in this codebase fabricates or infers a chemistry
label that isn't in the data.

**What chemistry-aware support would require, if chemistry metadata became
available:**

| Concern | Why it's chemistry-dependent |
|---|---|
| **Degradation model** (`degradation_model.py`) | LFP typically has flatter, more linear capacity fade and higher cycle-life tolerance; NMC fades faster at high SoC/temperature; LTO has very high cycle life but different thermal behavior. The current single `base_soh_loss_per_1000_cycles` constant would need to become chemistry-keyed. |
| **Charging behavior** | Safe C-rates, optimal charge windows, and fast-charge tolerance differ substantially by chemistry (LTO tolerates aggressive fast-charging; NMC is more sensitive). |
| **Thermal characteristics** | Thermal runaway risk profiles and safe operating temperature bands differ (LFP is generally more thermally stable than NMC), which would change `risk_index.py`'s temperature-risk weighting. |
| **RUL prediction** | The Arrhenius thermal-doubling constant and stress multipliers in `degradation_model.py` are Li-ion generalizations; chemistry-specific aging literature would replace them with per-chemistry curves. |
| **Maintenance policy** | `recommendation_engine.py`'s thresholds (e.g. when to recommend Cooling Inspection vs. Replace Battery Soon) would reasonably differ by chemistry's known failure modes. |

The natural integration point is additive: a `chemistry` column on the
battery schema (`backend/src/schema.py`), a `chemistry_profiles` section in
`config.yaml` keyed by chemistry type, and each engine module looking up its
constants by `row["chemistry"]` instead of a single global default — no
architectural change required, just parameterizing what's currently a flat
constant. This is intentionally left unbuilt until real chemistry-labeled
data is available, rather than inventing plausible-looking per-chemistry
numbers this dataset can't support.

---

## 14. Open items to confirm before build starts

- Exact safety thresholds for Unsafe/Degraded/Safe tiers — set against the real fleet distribution (SoH ~58–100%, resistance ~34–90 mΩ, imbalance ~6–118 mV, temperature ~18–51°C), not arbitrary numbers.
- Whether `station_status == REVIEW/QUARANTINE` is a hard override to Unsafe (recommended: yes).
- Firebase project setup — confirm you have (or will create) a Firebase project and are fine with Cloud Functions 2nd gen / Cloud Run being technically GCP resources under the Firebase umbrella (this is normal and still ends in a `*.web.app` URL).
- Reward-function weights for the policy tuner (§5.1-B, `w1..w5`) — worth a quick team discussion, since these encode what "good allocation" means and directly shape what the ML layer "learns."
