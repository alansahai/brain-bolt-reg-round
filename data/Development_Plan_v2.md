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

## 10. Open items to confirm before build starts

- Exact safety thresholds for Unsafe/Degraded/Safe tiers — set against the real fleet distribution (SoH ~58–100%, resistance ~34–90 mΩ, imbalance ~6–118 mV, temperature ~18–51°C), not arbitrary numbers.
- Whether `station_status == REVIEW/QUARANTINE` is a hard override to Unsafe (recommended: yes).
- Firebase project setup — confirm you have (or will create) a Firebase project and are fine with Cloud Functions 2nd gen / Cloud Run being technically GCP resources under the Firebase umbrella (this is normal and still ends in a `*.web.app` URL).
- Reward-function weights for the policy tuner (§5.1-B, `w1..w5`) — worth a quick team discussion, since these encode what "good allocation" means and directly shape what the ML layer "learns."
