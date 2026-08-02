"""
Graph Optimization — the Battery Intelligence Platform's FINAL allocation engine.

Vehicles and batteries are modeled as a weighted bipartite graph and matched
with the Hungarian algorithm (`scipy.optimize.linear_sum_assignment`) to find
a single globally-optimal assignment. This is the last stage of the layered
pipeline in backend/src/pipeline.py:

    Battery Data -> Engineering Rule Validation -> Battery Intelligence Engine
    -> Maintenance Recommendation -> GRAPH OPTIMIZATION (this module) -> Final Allocation

The Battery Intelligence Engine (ML Suitability + Risk + RUL) does NOT
compete with Graph Optimization as a separate allocator — it enriches every
battery with intelligence signals (`ml_suitability_score`, `risk_index`,
`predicted_future_soh`, `estimated_rul_cycles`) that this module consumes as
configurable, fully explained per-edge weights (config.yaml:
battery_intelligence_platform.weights). Nothing here is hardcoded: every
weight can be overridden per-request (the frontend Optimization Settings
Panel does exactly this) without touching config.yaml, so judges can rerun
the allocation live.

After solving, this module also builds `self.explainability` — a per-vehicle
Allocation Explainability record (decision-factor breakdown for the chosen
battery + rejected alternatives with reasons) — consumed by
`GET /api/allocate/pipeline`'s `explainability` field and the frontend
Allocation Explainability panel. See `_build_explainability()` below.

`baseline_highest_soc.py` remains the sole comparison point ("Highest SoC
First") — see backend/src/pipeline.py and backend/routers/allocation.py.
"""

from typing import Dict, Any, Optional
import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment

from backend.src.allocators.base import (
    BaseAllocator,
    AllocationResult,
    AllocationAssignment,
    UnservedVehicle,
)
from backend.src.digital_twin import get_allocation_counts

DEFAULT_WEIGHTS = {
    "priority": 0.20,
    "suitability": 0.20,
    "risk": 0.15,
    "future_health": 0.10,
    "waiting_time": 0.10,
    "energy_match": 0.10,
    "fair_usage": 0.075,
    "service_rate": 0.075,
}

INFEASIBLE_COST = 1.0e5
FEASIBLE_COST_CEILING = 1.0e4  # anything at/above this in the solved cost is treated as "no real match"


class GraphOptimizationAllocator(BaseAllocator):
    """
    Battery Intelligence Platform — Graph Optimization stage.

    Builds a complete vehicle x battery weighted graph and solves for the
    assignment that maximizes total edge weight globally (Maximum Weight
    Bipartite Matching / Hungarian Algorithm), rather than the best choice
    for each vehicle taken one at a time. Still enforces: UNSAFE/quarantined
    batteries excluded, minimum SoC satisfied, no duplicate battery/vehicle
    assignment (guaranteed by construction of a bipartite matching).

    Expects `classified_batteries` to already carry the enrichment columns
    produced by backend/src/pipeline.py::enrich_fleet() —
    `ml_suitability_score`, `risk_index`, `predicted_future_soh`,
    `estimated_rul_cycles`, `recommended_action`. Falls back to the
    rule-based `suitability_score`/neutral defaults if called standalone
    without enrichment (e.g. direct unit tests), so it remains usable in
    isolation, but the intended entry point is always the pipeline.
    """

    PRIORITY_RANK = {"Critical": 1, "High": 2, "Normal": 3}

    def __init__(self, config: Optional[Dict[str, Any]] = None, weight_overrides: Optional[Dict[str, float]] = None):
        super().__init__(config)
        self.weight_overrides = weight_overrides or {}
        # Allocation Explainability: {request_id: {...}}, built fresh by every
        # allocate() call — see _build_explainability().
        self.explainability: Dict[str, Any] = {}
        self._factor_cache: Dict[int, Dict[str, Any]] = {}

    def _graph_cfg(self) -> Dict[str, Any]:
        bip_cfg = self.config.get("battery_intelligence_platform", {})
        raw_weights = bip_cfg.get("weights", {})

        weights = dict(DEFAULT_WEIGHTS)
        for key, spec in raw_weights.items():
            weights[key] = spec.get("value", weights.get(key, 0.0)) if isinstance(spec, dict) else spec
        for key, val in self.weight_overrides.items():
            if key in weights:
                weights[key] = float(val)

        total = sum(weights.values()) or 1.0
        weights = {k: v / total for k, v in weights.items()}  # always a proper weighted average

        return {
            "weights": weights,
            "energy_per_km_kwh": bip_cfg.get("energy_per_km_kwh", 0.15),
            "energy_match_cap": bip_cfg.get("energy_match_cap", 1.5),
            "fair_usage_reference": bip_cfg.get("fair_usage_reference_allocation_count", 5),
        }

    def allocate(
        self,
        classified_batteries: pd.DataFrame,
        vehicle_requests: pd.DataFrame,
    ) -> AllocationResult:
        gcfg = self._graph_cfg()
        w = gcfg["weights"]
        priority_weights = self.config.get("allocator_policy", {}).get(
            "priority_weights", {"Critical": 100.0, "High": 50.0, "Normal": 10.0}
        )

        df_veh = vehicle_requests.copy()
        if "arrival_time" in df_veh.columns:
            df_veh = df_veh.sort_values("arrival_time").reset_index(drop=True)
        else:
            df_veh = df_veh.reset_index(drop=True)

        available_bats = classified_batteries[classified_batteries["tier"] != "UNSAFE"].copy().reset_index(drop=True)

        n_veh = len(df_veh)
        n_bat = len(available_bats)

        if n_veh == 0 or n_bat == 0:
            return self._empty_result(df_veh)

        # --- Battery Intelligence signals (from pipeline enrichment, with safe fallbacks) ---
        bat_suitability = available_bats.get("ml_suitability_score", available_bats["suitability_score"]).to_numpy()
        bat_risk = available_bats.get("risk_index", pd.Series([30.0] * n_bat)).to_numpy()
        bat_future_health = available_bats.get(
            "predicted_future_soh", available_bats["state_of_health_percent"]
        ).to_numpy()
        bat_soh = available_bats["state_of_health_percent"].to_numpy()
        bat_soc = available_bats["state_of_charge_percent"].to_numpy()
        bat_energy = available_bats["estimated_available_energy_kWh"].to_numpy()

        risk_score = 100.0 - np.clip(bat_risk, 0.0, 100.0)  # lower risk -> higher desirability

        alloc_counts = get_allocation_counts(available_bats["battery_id"].tolist())
        ref = max(1, gcfg["fair_usage_reference"])
        fair_usage_score = 100.0 - np.clip(
            np.array([alloc_counts.get(bid, 0) for bid in available_bats["battery_id"]]) / ref, 0.0, 1.0
        ) * 100.0

        # Waiting-time urgency: earlier arrival => higher urgency (0-100).
        urgency = np.linspace(100.0, 0.0, n_veh) if n_veh > 1 else np.array([100.0])

        cost_matrix = np.full((n_veh, n_bat), INFEASIBLE_COST, dtype=float)
        weight_matrix = np.zeros((n_veh, n_bat), dtype=float)

        for i, veh in df_veh.iterrows():
            min_soc = float(veh["minimum_acceptable_SOC_percent"])
            priority_score = priority_weights.get(veh["priority"], 10.0)
            needed_energy = max(1e-6, float(veh["required_range_km"]) * gcfg["energy_per_km_kwh"])

            feasible_mask = bat_soc >= min_soc
            if not feasible_mask.any():
                continue

            energy_ratio = bat_energy / needed_energy
            energy_match_score = (np.clip(energy_ratio, 0.0, gcfg["energy_match_cap"]) / gcfg["energy_match_cap"]) * 100.0
            excess = np.abs(energy_ratio - 1.0)
            service_rate_score = 100.0 * (1.0 - np.clip(excess / max(gcfg["energy_match_cap"] - 1.0, 1e-6), 0.0, 1.0))

            edge_weight = (
                w["priority"] * priority_score +
                w["suitability"] * bat_suitability +
                w["risk"] * risk_score +
                w["future_health"] * bat_future_health +
                w["waiting_time"] * urgency[i] +
                w["energy_match"] * energy_match_score +
                w["fair_usage"] * fair_usage_score +
                w["service_rate"] * service_rate_score
            )

            weight_matrix[i, :] = edge_weight
            cost_row = -edge_weight
            cost_row[~feasible_mask] = INFEASIBLE_COST
            cost_matrix[i, :] = cost_row

            self._factor_cache[i] = {
                "priority_score": priority_score,
                "energy_match_score": energy_match_score,
            }

        row_ind, col_ind = linear_sum_assignment(cost_matrix)

        assignments = []
        served_veh_idx = set()

        for step, (r, c) in enumerate(sorted(zip(row_ind, col_ind), key=lambda rc: rc[0]), start=1):
            veh = df_veh.iloc[r]
            if cost_matrix[r, c] >= FEASIBLE_COST_CEILING:
                continue  # no feasible battery for this vehicle in the global optimum
            bat = available_bats.iloc[c]
            served_veh_idx.add(r)
            assignments.append(
                AllocationAssignment(
                    request_id=veh["request_id"],
                    battery_id=bat["battery_id"],
                    vehicle_type=veh["vehicle_type"],
                    priority=veh["priority"],
                    required_range_km=float(veh["required_range_km"]),
                    minimum_acceptable_SOC_percent=float(veh["minimum_acceptable_SOC_percent"]),
                    battery_soc=float(bat["state_of_charge_percent"]),
                    battery_soh=float(bat["state_of_health_percent"]),
                    battery_suitability_score=float(bat_suitability[c]),
                    battery_tier=str(bat["tier"]),
                    match_score=round(float(weight_matrix[r, c]), 2),
                    assigned_at_step=step,
                    risk_index=float(bat_risk[c]) if "risk_index" in available_bats.columns else None,
                    risk_band=str(bat["risk_band"]) if "risk_band" in available_bats.columns else None,
                    estimated_rul_cycles=(
                        float(bat["estimated_rul_cycles"]) if "estimated_rul_cycles" in available_bats.columns else None
                    ),
                    recommended_action=(
                        str(bat["recommended_action"]) if "recommended_action" in available_bats.columns else None
                    ),
                )
            )

        self.explainability = self._build_explainability(
            row_ind, col_ind, cost_matrix, weight_matrix, w,
            available_bats, bat_suitability, risk_score, bat_future_health, df_veh,
        )

        unserved = []
        for i, veh in df_veh.iterrows():
            if i not in served_veh_idx:
                unserved.append(
                    UnservedVehicle(
                        request_id=veh["request_id"],
                        vehicle_type=veh["vehicle_type"],
                        priority=veh["priority"],
                        required_range_km=float(veh["required_range_km"]),
                        minimum_acceptable_SOC_percent=float(veh["minimum_acceptable_SOC_percent"]),
                        reason="No available safe battery satisfying minimum SoC within the global-optimum matching",
                    )
                )

        return self._build_result(assignments, unserved, df_veh)

    def _build_explainability(
        self,
        row_ind: np.ndarray,
        col_ind: np.ndarray,
        cost_matrix: np.ndarray,
        weight_matrix: np.ndarray,
        weights: Dict[str, float],
        available_bats: pd.DataFrame,
        bat_suitability: np.ndarray,
        risk_score: np.ndarray,
        bat_future_health: np.ndarray,
        df_veh: pd.DataFrame,
        max_alternatives: int = 3,
    ) -> Dict[str, Any]:
        """
        Allocation Explainability — for every served vehicle, explains WHY its
        assigned battery was chosen: the 5 headline decision factors (Priority,
        Suitability, Risk, Energy Match, Future Health) as a percentage
        breakdown of that assignment's edge weight, a heuristic Allocation
        Confidence score, and up to `max_alternatives` runner-up batteries with
        the single most significant reason each lost out.
        """
        battery_ids = available_bats["battery_id"].to_numpy()
        assigned_elsewhere = {
            battery_ids[c] for r, c in zip(row_ind, col_ind) if cost_matrix[r, c] < FEASIBLE_COST_CEILING
        }

        explain: Dict[str, Any] = {}
        for r, c in zip(row_ind, col_ind):
            if cost_matrix[r, c] >= FEASIBLE_COST_CEILING:
                continue
            veh = df_veh.iloc[r]
            fc = self._factor_cache.get(int(r), {})
            priority_score = fc.get("priority_score", 0.0)
            energy_match_score = fc.get("energy_match_score", np.zeros(len(battery_ids)))

            # --- Decision factors for the WINNING battery (normalized to 100%) ---
            raw = {
                "priority": weights["priority"] * priority_score,
                "suitability": weights["suitability"] * bat_suitability[c],
                "risk": weights["risk"] * risk_score[c],
                "energy_match": weights["energy_match"] * energy_match_score[c],
                "future_health": weights["future_health"] * bat_future_health[c],
            }
            total_raw = sum(raw.values()) or 1e-9
            decision_factors = {k: round(v / total_raw * 100.0, 1) for k, v in raw.items()}

            # --- Allocation Confidence: how much this battery beat the best alternative ---
            row_weights = weight_matrix[r, :]
            row_cost = cost_matrix[r, :]
            feasible_idx = np.where(row_cost < FEASIBLE_COST_CEILING)[0]
            feasible_idx = feasible_idx[feasible_idx != c]
            winner_weight = float(row_weights[c])

            if feasible_idx.size == 0:
                confidence = 99.0
            else:
                best_alt_weight = float(row_weights[feasible_idx].max())
                margin_ratio = (winner_weight - best_alt_weight) / max(winner_weight, 1e-6)
                confidence = round(60.0 + 40.0 * float(np.clip(margin_ratio, 0.0, 1.0)), 1)

            # --- Alternatives considered: top runner-ups + why each lost ---
            ranked_alt = sorted(feasible_idx.tolist(), key=lambda j: row_weights[j], reverse=True)[:max_alternatives]
            alternatives = []
            for j in ranked_alt:
                factor_gaps = {
                    "Lower Suitability": weights["suitability"] * (bat_suitability[c] - bat_suitability[j]),
                    "Higher Risk": weights["risk"] * (risk_score[c] - risk_score[j]),
                    "Lower Future Health": weights["future_health"] * (bat_future_health[c] - bat_future_health[j]),
                    "Insufficient Energy Match": weights["energy_match"] * (energy_match_score[c] - energy_match_score[j]),
                }
                dominant_reason, dominant_gap = max(factor_gaps.items(), key=lambda kv: kv[1])
                if dominant_gap <= 0:
                    dominant_reason = (
                        "Reserved for another vehicle in the global-optimum match"
                        if battery_ids[j] in assigned_elsewhere
                        else "Marginally lower overall match score"
                    )
                alternatives.append({
                    "battery_id": str(battery_ids[j]),
                    "match_score": round(float(row_weights[j]), 2),
                    "reason_rejected": dominant_reason,
                })

            explain[str(veh["request_id"])] = {
                "request_id": str(veh["request_id"]),
                "battery_id": str(battery_ids[c]),
                "allocation_confidence_pct": confidence,
                "decision_factors_pct": decision_factors,
                "alternatives_considered": alternatives,
                "methodology": (
                    "Decision factors are this assignment's Priority/Suitability/Risk/Energy Match/Future "
                    "Health edge-weight contributions renormalized to 100% (Waiting Time, Fair Usage, and "
                    "Service Rate also contribute to the underlying Graph Optimization edge weight but are "
                    "omitted from this 5-factor summary for readability). Confidence reflects how much this "
                    "battery's total edge weight exceeded the best feasible alternative's — a heuristic "
                    "margin, not a statistical probability."
                ),
            }

        return explain

    def _empty_result(self, df_veh: pd.DataFrame) -> AllocationResult:
        unserved = [
            UnservedVehicle(
                request_id=veh["request_id"],
                vehicle_type=veh["vehicle_type"],
                priority=veh["priority"],
                required_range_km=float(veh["required_range_km"]),
                minimum_acceptable_SOC_percent=float(veh["minimum_acceptable_SOC_percent"]),
                reason="No available (non-UNSAFE) batteries in the fleet",
            )
            for _, veh in df_veh.iterrows()
        ]
        return self._build_result([], unserved, df_veh)

    def _build_result(self, assignments, unserved, df_veh) -> AllocationResult:
        total_veh = len(df_veh)
        served_count = len(assignments)
        unserved_count = len(unserved)

        high_crit_total = len(df_veh[df_veh["priority"].isin(["High", "Critical"])])
        high_crit_served = sum(1 for a in assignments if a.priority in ["High", "Critical"])
        high_crit_pct = (high_crit_served / high_crit_total * 100.0) if high_crit_total > 0 else 0.0

        unsafe_allocs = sum(1 for a in assignments if a.battery_tier == "UNSAFE")
        avg_soh = sum(a.battery_soh for a in assignments) / served_count if served_count > 0 else 0.0
        avg_suit = sum(a.battery_suitability_score for a in assignments) / served_count if served_count > 0 else 0.0

        return AllocationResult(
            allocator_name="Battery Intelligence Platform (ML + Risk + RUL -> Graph Optimization)",
            assignments=assignments,
            unserved=unserved,
            total_vehicles=total_veh,
            served_count=served_count,
            unserved_count=unserved_count,
            high_critical_served_pct=round(high_crit_pct, 2),
            unsafe_allocations_count=unsafe_allocs,
            avg_soh_allocated=round(avg_soh, 2),
            avg_suitability_allocated=round(avg_suit, 2),
            avg_wait_time_min=0.0,
        )
