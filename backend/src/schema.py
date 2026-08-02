import pandas as pd
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class BatteryRecord(BaseModel):
    battery_id: str
    chemistry: str
    nominal_voltage_V: int
    rated_capacity_Ah: int
    state_of_charge_percent: float = Field(..., ge=0.0, le=100.0)
    state_of_health_percent: float = Field(..., ge=0.0, le=100.0)
    temperature_C: float
    internal_resistance_mOhm: float = Field(..., ge=0.0)
    cycle_count: int = Field(..., ge=0)
    age_years: float = Field(..., ge=0.0)
    cell_voltage_imbalance_mV: float = Field(..., ge=0.0)
    max_temperature_last_24h_C: float
    estimated_available_energy_kWh: float = Field(..., ge=0.0)
    station_status: str

class VehicleRequest(BaseModel):
    request_id: str
    arrival_time: str
    vehicle_type: str
    required_range_km: float = Field(..., gt=0.0)
    load_category: str
    priority: str
    minimum_acceptable_SOC_percent: float = Field(..., ge=0.0, le=100.0)
    maximum_wait_time_min: float = Field(..., ge=0.0)

REQUIRED_BATTERY_COLUMNS = [
    "battery_id",
    "chemistry",
    "nominal_voltage_V",
    "rated_capacity_Ah",
    "state_of_charge_percent",
    "state_of_health_percent",
    "temperature_C",
    "internal_resistance_mOhm",
    "cycle_count",
    "age_years",
    "cell_voltage_imbalance_mV",
    "max_temperature_last_24h_C",
    "estimated_available_energy_kWh",
    "station_status",
]

REQUIRED_VEHICLE_COLUMNS = [
    "request_id",
    "arrival_time",
    "vehicle_type",
    "required_range_km",
    "load_category",
    "priority",
    "minimum_acceptable_SOC_percent",
    "maximum_wait_time_min",
]

def validate_battery_df(df: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in REQUIRED_BATTERY_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Battery DataFrame missing required columns: {missing}")
    return df

def validate_vehicle_df(df: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in REQUIRED_VEHICLE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Vehicle DataFrame missing required columns: {missing}")
    return df
