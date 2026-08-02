import pandas as pd
from typing import Dict, Any, Optional
from backend.src.allocators.base import (
    BaseAllocator,
    AllocationResult,
    AllocationAssignment,
    UnservedVehicle,
)

class BaselineHighestSoCAllocator(BaseAllocator):
    """
    Baseline Allocator (Highest-SoC-First):
    - Processes vehicle requests in arrival order.
    - Selects the unassigned safe/degraded battery with the highest SoC
      satisfying battery.SoC >= vehicle.min_acceptable_SoC.
    - Never allocates UNSAFE or quarantined batteries.
    """
    def allocate(
        self,
        classified_batteries: pd.DataFrame,
        vehicle_requests: pd.DataFrame
    ) -> AllocationResult:
        df_bat = classified_batteries.copy()
        df_veh = vehicle_requests.copy()

        # Sort vehicle requests by arrival_time / original sequence
        if "arrival_time" in df_veh.columns:
            df_veh = df_veh.sort_values("arrival_time")

        # Available candidate pool: Exclude UNSAFE/quarantined packs per Verification Rule 1
        available_bats = df_bat[df_bat["tier"] != "UNSAFE"].copy()
        used_battery_ids = set()

        assignments = []
        unserved = []
        step = 0

        for _, veh in df_veh.iterrows():
            step += 1
            min_soc = veh["minimum_acceptable_SOC_percent"]
            
            # Candidates that are unassigned and satisfy SoC requirement
            candidates = available_bats[
                (~available_bats["battery_id"].isin(used_battery_ids)) &
                (available_bats["state_of_charge_percent"] >= min_soc)
            ]

            if not candidates.empty:
                # Pick candidate with highest SoC (break ties deterministically by battery_id)
                best_bat = candidates.sort_values(
                    by=["state_of_charge_percent", "battery_id"],
                    ascending=[False, True]
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
            allocator_name="Baseline (Highest-SoC-First)",
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
