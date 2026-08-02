from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import pandas as pd
from pydantic import BaseModel, Field

class AllocationAssignment(BaseModel):
    request_id: str
    battery_id: str
    vehicle_type: str
    priority: str
    required_range_km: float
    minimum_acceptable_SOC_percent: float
    battery_soc: float
    battery_soh: float
    battery_suitability_score: float
    battery_tier: str
    match_score: Optional[float] = None
    assigned_at_step: int
    # Battery Intelligence Platform enrichment (populated by pipeline.py /
    # graph_allocator.py; None for the legacy baseline/rule-based allocators)
    risk_index: Optional[float] = None
    risk_band: Optional[str] = None
    estimated_rul_cycles: Optional[float] = None
    recommended_action: Optional[str] = None

class UnservedVehicle(BaseModel):
    request_id: str
    vehicle_type: str
    priority: str
    required_range_km: float
    minimum_acceptable_SOC_percent: float
    reason: str

class AllocationResult(BaseModel):
    allocator_name: str
    assignments: List[AllocationAssignment]
    unserved: List[UnservedVehicle]
    total_vehicles: int
    served_count: int
    unserved_count: int
    high_critical_served_pct: float
    unsafe_allocations_count: int
    avg_soh_allocated: float
    avg_suitability_allocated: float
    avg_wait_time_min: float

class BaseAllocator(ABC):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}

    @abstractmethod
    def allocate(
        self,
        classified_batteries: pd.DataFrame,
        vehicle_requests: pd.DataFrame
    ) -> AllocationResult:
        """
        Executes allocation logic returning structured AllocationResult.
        """
        pass
