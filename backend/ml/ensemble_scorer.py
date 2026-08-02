import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
import json
import joblib
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional
from backend.src.classification import PROJECT_ROOT
from backend.src.allocators.base import (
    BaseAllocator,
    AllocationResult,
    AllocationAssignment,
    UnservedVehicle,
)

DEFAULT_MODELS_DIR = os.path.join(PROJECT_ROOT, "backend/ml/models")

FEATURE_COLS = [
    "state_of_health_percent",
    "internal_resistance_mOhm",
    "cell_voltage_imbalance_mV",
    "temperature_C",
    "max_temperature_last_24h_C",
    "cycle_count",
    "age_years",
]

_shared_model_cache: Dict[str, Any] = {}


def _load_ml_model(models_dir: str = DEFAULT_MODELS_DIR):
    """Loads (and caches) the offline-trained StackingRegressor artifact."""
    if models_dir not in _shared_model_cache:
        model_path = os.path.join(models_dir, "stack.pkl")
        _shared_model_cache[models_dir] = joblib.load(model_path) if os.path.exists(model_path) else None
    return _shared_model_cache[models_dir]


def compute_ml_suitability_scores(
    df_bat: pd.DataFrame,
    models_dir: str = DEFAULT_MODELS_DIR,
) -> np.ndarray:
    """
    Battery Intelligence Engine — ML-refined Suitability Score component.

    Standalone enrichment function (no allocation logic): scores every battery
    with the offline-trained StackingRegressor (RandomForest + GradientBoosting
    + Ridge over SoH/resistance/imbalance/temperature/cycles/age), smoothing the
    rule-based linear Suitability Score non-linearly. This is one of four
    outputs the Battery Intelligence Engine hands to Graph Optimization
    (alongside Future Health, RUL, and Risk Features — see
    backend/src/pipeline.py::enrich_fleet()) — it does not perform allocation
    itself.
    """
    model = _load_ml_model(models_dir)
    if model is not None and all(c in df_bat.columns for c in FEATURE_COLS):
        scores = model.predict(df_bat[FEATURE_COLS])
        return np.clip(scores, 0.0, 100.0)
    return df_bat["suitability_score"].to_numpy()


class MLEnsembleAllocator(BaseAllocator):
    """
    Legacy standalone ML-Ensemble Allocator, retained for backward
    compatibility (API/tests). Superseded as the "final" allocation method by
    the layered pipeline in backend/src/pipeline.py, where the ML suitability
    score above is one of several signals consumed by Graph Optimization
    rather than a competing allocator in its own right.
    """
    PRIORITY_RANK = {"Critical": 1, "High": 2, "Normal": 3}

    def __init__(
        self,
        config: Optional[Dict[str, Any]] = None,
        models_dir: str = DEFAULT_MODELS_DIR
    ):
        super().__init__(config)
        self.models_dir = models_dir
        self.model = None
        self.policy_weights = {}
        self._load_artifacts()

    def _load_artifacts(self):
        self.model = _load_ml_model(self.models_dir)
        policy_path = os.path.join(self.models_dir, "policy_weights.json")

        if os.path.exists(policy_path):
            with open(policy_path, "r") as f:
                self.policy_weights = json.load(f)
        else:
            self.policy_weights = {
                "soc_weight": 0.3,
                "soh_weight": 0.35,
                "suitability_weight": 0.35
            }

    def allocate(
        self,
        classified_batteries: pd.DataFrame,
        vehicle_requests: pd.DataFrame
    ) -> AllocationResult:
        df_bat = classified_batteries.copy()
        df_veh = vehicle_requests.copy()

        # Compute ML Ensemble Suitability Score
        if self.model is not None and all(c in df_bat.columns for c in FEATURE_COLS):
            X = df_bat[FEATURE_COLS]
            ml_scores = self.model.predict(X)
            df_bat["ml_suitability_score"] = np.clip(ml_scores, 0.0, 100.0)
        else:
            df_bat["ml_suitability_score"] = df_bat["suitability_score"]

        # Priority sorting
        df_veh["p_rank"] = df_veh["priority"].map(lambda p: self.PRIORITY_RANK.get(p, 99))
        df_veh = df_veh.sort_values(by=["p_rank", "arrival_time", "request_id"])

        available_bats = df_bat[df_bat["tier"] != "UNSAFE"].copy()
        used_battery_ids = set()

        assignments = []
        unserved = []
        step = 0

        soc_w = self.policy_weights.get("soc_weight", 0.3)
        soh_w = self.policy_weights.get("soh_weight", 0.35)
        suit_w = self.policy_weights.get("suitability_weight", 0.35)

        for _, veh in df_veh.iterrows():
            step += 1
            min_soc = veh["minimum_acceptable_SOC_percent"]
            prio = veh["priority"]

            candidates = available_bats[
                (~available_bats["battery_id"].isin(used_battery_ids)) &
                (available_bats["state_of_charge_percent"] >= min_soc)
            ].copy()

            if not candidates.empty:
                # Composite ML score
                scores = (
                    soc_w * candidates["state_of_charge_percent"] +
                    soh_w * candidates["state_of_health_percent"] +
                    suit_w * candidates["ml_suitability_score"]
                )

                if prio in ["Critical", "High"]:
                    tier_bonus = candidates["tier"].apply(lambda t: 25.0 if t == "SAFE" else 0.0)
                    scores = scores + tier_bonus

                candidates["match_score"] = scores

                best_bat = candidates.sort_values(
                    by=["match_score", "state_of_health_percent", "battery_id"],
                    ascending=[False, False, True]
                ).iloc[0]

                used_battery_ids.add(best_bat["battery_id"])
                assignments.append(
                    AllocationAssignment(
                        request_id=veh["request_id"],
                        battery_id=best_bat["battery_id"],
                        vehicle_type=veh["vehicle_type"],
                        priority=veh["priority"],
                        required_range_km=float(veh["required_range_km"]),
                        minimum_acceptable_SOC_percent=float(min_soc),
                        battery_soc=float(best_bat["state_of_charge_percent"]),
                        battery_soh=float(best_bat["state_of_health_percent"]),
                        battery_suitability_score=float(best_bat["ml_suitability_score"]),
                        battery_tier=str(best_bat["tier"]),
                        match_score=round(float(best_bat["match_score"]), 2),
                        assigned_at_step=step,
                    )
                )
            else:
                unserved.append(
                    UnservedVehicle(
                        request_id=veh["request_id"],
                        vehicle_type=veh["vehicle_type"],
                        priority=veh["priority"],
                        required_range_km=float(veh["required_range_km"]),
                        minimum_acceptable_SOC_percent=float(min_soc),
                        reason="No available safe battery satisfying minimum SoC",
                    )
                )

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
            allocator_name="ML-Ensemble (Stacking Regressor & Learned Policy)",
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
