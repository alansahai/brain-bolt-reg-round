import os
import json
import uuid
import threading
import pandas as pd
from typing import Dict, Any, List, Optional
from backend.src.classification import classify_fleet, load_config, PROJECT_ROOT
from backend.src.allocators.base import BaseAllocator, AllocationAssignment
from backend.src.allocators.baseline_highest_soc import BaselineHighestSoCAllocator
from backend.src.allocators.proposed_priority_score import ProposedPriorityScoreAllocator
from backend.ml.ensemble_scorer import MLEnsembleAllocator
from backend.src.graph_allocator import GraphOptimizationAllocator
from backend.src.explanation_generator import generate_allocation_explanation
from backend.src.digital_twin import record_allocation

DEFAULT_BATTERY_CSV = os.path.join(PROJECT_ROOT, "data/Problem_1_Battery_Fleet_200_Packs.csv")
SESSIONS_DIR = os.path.join(PROJECT_ROOT, "backend/data/sessions")

class LiveSessionManager:
    _lock = threading.Lock()

    def __init__(self, sessions_dir: str = SESSIONS_DIR):
        self.sessions_dir = sessions_dir
        os.makedirs(self.sessions_dir, exist_ok=True)
        self.config = load_config()

    def _get_session_path(self, session_id: str) -> str:
        return os.path.join(self.sessions_dir, f"{session_id}.json")

    def create_session(self, battery_csv: str = DEFAULT_BATTERY_CSV) -> Dict[str, Any]:
        session_id = f"SESS-{uuid.uuid4().hex[:8].upper()}"
        df_bat = pd.read_csv(battery_csv)
        classified_bats = classify_fleet(df_bat, self.config)

        session_data = {
          "session_id": session_id,
          "created_at": pd.Timestamp.now().isoformat(),
          "batteries": classified_bats.to_dict(orient="records"),
          "available_battery_ids": classified_bats[classified_bats["tier"] != "UNSAFE"]["battery_id"].tolist(),
          "assignments": [],
          "unserved": [],
          "request_count": 0
        }

        with self._lock:
            with open(self._get_session_path(session_id), "w") as f:
                json.dump(session_data, f, indent=2)

        return {
            "session_id": session_id,
            "total_packs": len(classified_bats),
            "tier_counts": classified_bats["tier"].value_counts().to_dict(),
            "available_count": len(session_data["available_battery_ids"])
        }

    def get_session(self, session_id: str) -> Dict[str, Any]:
        path = self._get_session_path(session_id)
        if not os.path.exists(path):
            raise KeyError(f"Session {session_id} not found")
        with open(path, "r") as f:
            return json.load(f)

    def reset_session(self, session_id: str, battery_csv: str = DEFAULT_BATTERY_CSV) -> Dict[str, Any]:
        path = self._get_session_path(session_id)
        if not os.path.exists(path):
            return self.create_session(battery_csv)

        df_bat = pd.read_csv(battery_csv)
        classified_bats = classify_fleet(df_bat, self.config)

        session_data = {
          "session_id": session_id,
          "reset_at": pd.Timestamp.now().isoformat(),
          "batteries": classified_bats.to_dict(orient="records"),
          "available_battery_ids": classified_bats[classified_bats["tier"] != "UNSAFE"]["battery_id"].tolist(),
          "assignments": [],
          "unserved": [],
          "request_count": 0
        }

        with self._lock:
            with open(path, "w") as f:
                json.dump(session_data, f, indent=2)

        return {
            "session_id": session_id,
            "status": "reset",
            "total_packs": len(classified_bats),
            "tier_counts": classified_bats["tier"].value_counts().to_dict(),
            "available_count": len(session_data["available_battery_ids"])
        }

    def submit_request(
        self,
        session_id: str,
        vehicle_request: Dict[str, Any],
        mode: str = "ml-ensemble"
    ) -> Dict[str, Any]:
        session_data = self.get_session(session_id)
        
        # Load currently available batteries DataFrame
        df_bats = pd.DataFrame(session_data["batteries"])
        df_veh = pd.DataFrame([vehicle_request])

        # Select Allocator
        if mode == "baseline":
            allocator = BaselineHighestSoCAllocator(self.config)
        elif mode == "proposed":
            allocator = ProposedPriorityScoreAllocator(self.config)
        elif mode == "graph":
            allocator = GraphOptimizationAllocator(self.config)
        else:
            allocator = MLEnsembleAllocator(self.config)

        # Run allocation for single request against current remaining pool
        res = allocator.allocate(df_bats, df_veh)

        assigned = False
        assignment_dict = None
        unserved_reason = None
        one_line_why = ""

        explanation_obj = None
        if res.assignments:
            assigned = True
            a = res.assignments[0]
            assignment_dict = a.model_dump()

            # Generate structured deterministic explanation
            cand_pool = [b for b in session_data["batteries"] if b["battery_id"] in session_data["available_battery_ids"]]
            weights = self.config.get("suitability_score", {}).get("weights", {})
            explanation_obj = generate_allocation_explanation(assignment_dict, cand_pool, weights)

            # Remove allocated battery from pool
            assigned_bat_id = a.battery_id
            session_data["available_battery_ids"] = [
                b_id for b_id in session_data["available_battery_ids"] if b_id != assigned_bat_id
            ]

            # Update battery record status in session
            for b in session_data["batteries"]:
                if b["battery_id"] == assigned_bat_id:
                    b["station_status"] = "ASSIGNED"

            session_data["assignments"].append(assignment_dict)
            one_line_why = explanation_obj["one_line_summary"]
            record_allocation(assigned_bat_id, vehicle_request["request_id"])
        else:
            unserved_reason = res.unserved[0].reason if res.unserved else "No available safe battery satisfying SoC requirements"
            session_data["unserved"].append({
                "request_id": vehicle_request["request_id"],
                "reason": unserved_reason
            })
            one_line_why = f"Unserved: {unserved_reason}"

        session_data["request_count"] += 1

        # Save session state
        with self._lock:
            with open(self._get_session_path(session_id), "w") as f:
                json.dump(session_data, f, indent=2)

        # Compute rolling KPIs
        total_requests = session_data["request_count"]
        total_assigned = len(session_data["assignments"])
        high_crit_reqs = sum(1 for a in session_data["assignments"] if a["priority"] in ["High", "Critical"])
        avg_soh = sum(a["battery_soh"] for a in session_data["assignments"]) / total_assigned if total_assigned > 0 else 0.0
        avg_suit = sum(a["battery_suitability_score"] for a in session_data["assignments"]) / total_assigned if total_assigned > 0 else 0.0

        # Remaining available counts
        remaining_bats = [b for b in session_data["batteries"] if b["battery_id"] in session_data["available_battery_ids"]]
        df_rem = pd.DataFrame(remaining_bats) if remaining_bats else pd.DataFrame(columns=["tier"])
        remaining_tiers = df_rem["tier"].value_counts().to_dict() if not df_rem.empty else {"SAFE": 0, "DEGRADED": 0}

        return {
            "session_id": session_id,
            "mode_used": mode,
            "assigned": assigned,
            "assignment": assignment_dict,
            "explanation": explanation_obj,
            "unserved_reason": unserved_reason,
            "one_line_why": one_line_why,
            "rolling_kpis": {
                "total_requests": total_requests,
                "total_served": total_assigned,
                "total_unserved": total_requests - total_assigned,
                "high_critical_served": high_crit_reqs,
                "avg_soh_allocated": round(avg_soh, 2),
                "avg_suitability_allocated": round(avg_suit, 2)
            },
            "remaining_inventory": {
                "total_available": len(session_data["available_battery_ids"]),
                "tier_counts": remaining_tiers
            }
        }

session_manager = LiveSessionManager()
