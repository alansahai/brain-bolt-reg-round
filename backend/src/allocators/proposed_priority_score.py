import pandas as pd
from typing import Dict, Any, Optional
from backend.src.allocators.base import (
    BaseAllocator,
    AllocationResult,
    AllocationAssignment,
    UnservedVehicle,
)

class ProposedPriorityScoreAllocator(BaseAllocator):
    """
    Proposed Rule-Based Allocator (Priority & Health-Score Aware):
    1. Sorts vehicle requests by Priority rank (Critical > High > Normal).
    2. Excludes UNSAFE and quarantined batteries.
    3. Matches vehicles to batteries by optimizing a multi-objective score:
       - Tier matching: SAFE batteries prioritized for Critical/High vehicles.
       - Composite match score combining SoC, SoH, and Suitability Score.
    4. Satisfies vehicle minimum SoC requirements and prevents duplicate assignments.
    """
    PRIORITY_RANK = {
        "Critical": 1,
        "High": 2,
        "Normal": 3
    }

    def allocate(
        self,
        classified_batteries: pd.DataFrame,
        vehicle_requests: pd.DataFrame
    ) -> AllocationResult:
        df_bat = classified_batteries.copy()
        df_veh = vehicle_requests.copy()

        # Add priority rank column for sorting
        df_veh["p_rank"] = df_veh["priority"].map(lambda p: self.PRIORITY_RANK.get(p, 99))
        df_veh = df_veh.sort_values(by=["p_rank", "arrival_time", "request_id"])

        # Available candidate pool: Exclude UNSAFE/quarantined packs
        available_bats = df_bat[df_bat["tier"] != "UNSAFE"].copy()
        used_battery_ids = set()

        assignments = []
        unserved = []
        step = 0

        # Weights from config or defaults
        soc_w = self.config.get("allocator_policy", {}).get("soc_weight", 0.3)
        soh_w = self.config.get("allocator_policy", {}).get("soh_weight", 0.35)
        suit_w = self.config.get("allocator_policy", {}).get("suitability_weight", 0.35)

        for _, veh in df_veh.iterrows():
            step += 1
            min_soc = veh["minimum_acceptable_SOC_percent"]
            prio = veh["priority"]

            # Filter valid candidates
            candidates = available_bats[
                (~available_bats["battery_id"].isin(used_battery_ids)) &
                (available_bats["state_of_charge_percent"] >= min_soc)
            ].copy()

            if not candidates.empty:
                # Compute composite match score for candidates
                # Base score: weighted sum of SoC, SoH, and Suitability
                scores = (
                    soc_w * candidates["state_of_charge_percent"] +
                    soh_w * candidates["state_of_health_percent"] +
                    suit_w * candidates["suitability_score"]
                )

                # Tier preference: Add bonus for SAFE packs if vehicle is Critical or High
                if prio in ["Critical", "High"]:
                    tier_bonus = candidates["tier"].apply(lambda t: 25.0 if t == "SAFE" else 0.0)
                    scores = scores + tier_bonus

                candidates["match_score"] = scores

                # Pick candidate with highest match score
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
                        battery_suitability_score=float(best_bat["suitability_score"]),
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

        # Compute summary metrics
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
            allocator_name="Proposed (Priority & Suitability Score)",
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
