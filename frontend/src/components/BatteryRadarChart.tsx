import React from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import type { BatteryRecord } from "../api/client";
import { Radar as RadarIcon } from "lucide-react";

// Normalization bounds mirror config.yaml (suitability_score.normalization_bounds / risk_index bounds)
// so the radar reads consistently with the rest of the platform's scoring.
const BOUNDS = {
  ir_min: 30.0, ir_max: 90.0,
  imbalance_min: 0.0, imbalance_max: 120.0,
  temp_min: 15.0, temp_max: 55.0,
  cycle_min: 0, cycle_max: 2000,
};

function clip(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** All axes normalized 0-100 where HIGHER always means BETTER, for readable overlay comparison. */
function toRadarAxes(b: BatteryRecord) {
  const theoreticalMaxEnergy = (b.nominal_voltage_V * b.rated_capacity_Ah) / 1000;
  const energyScore = theoreticalMaxEnergy > 0
    ? clip((b.estimated_available_energy_kWh / theoreticalMaxEnergy) * 100, 0, 100)
    : 0;

  return [
    { axis: "State of Charge", value: clip(b.state_of_charge_percent, 0, 100) },
    { axis: "State of Health", value: clip(b.state_of_health_percent, 0, 100) },
    {
      axis: "Internal Resistance",
      value: (1 - clip((b.internal_resistance_mOhm - BOUNDS.ir_min) / (BOUNDS.ir_max - BOUNDS.ir_min), 0, 1)) * 100,
    },
    {
      axis: "Temperature",
      value: (1 - clip((b.temperature_C - BOUNDS.temp_min) / (BOUNDS.temp_max - BOUNDS.temp_min), 0, 1)) * 100,
    },
    {
      axis: "Cell Balance",
      value: (1 - clip((b.cell_voltage_imbalance_mV - BOUNDS.imbalance_min) / (BOUNDS.imbalance_max - BOUNDS.imbalance_min), 0, 1)) * 100,
    },
    {
      axis: "Cycle Life Remaining",
      value: (1 - clip((b.cycle_count - BOUNDS.cycle_min) / (BOUNDS.cycle_max - BOUNDS.cycle_min), 0, 1)) * 100,
    },
    { axis: "Available Energy", value: energyScore },
  ];
}

interface Props {
  battery: BatteryRecord;
  compareBatteries?: BatteryRecord[];
  title?: string;
}

const COMPARE_COLORS = ["#06B6D4", "#F59E0B", "#EC4899", "#10B981"];

export const BatteryRadarChart: React.FC<Props> = ({ battery, compareBatteries, title }) => {
  const primaryAxes = toRadarAxes(battery);
  const others = compareBatteries?.filter((b) => b.battery_id !== battery.battery_id) ?? [];

  const merged = primaryAxes.map((row, idx) => {
    const merged: Record<string, string | number> = { axis: row.axis, [battery.battery_id]: Math.round(row.value * 10) / 10 };
    others.forEach((b) => {
      merged[b.battery_id] = Math.round(toRadarAxes(b)[idx].value * 10) / 10;
    });
    return merged;
  });

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
      <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
        <RadarIcon className="w-4 h-4 text-cyan-400" /> {title || "Battery Health Radar"}
      </h3>
      <p className="text-slate-400 text-xs mb-3">
        All axes normalized 0-100, higher = better, so shape area directly reads as overall health.
      </p>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={merged} outerRadius="75%">
            <PolarGrid stroke="#334155" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: "#94A3B8" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748B" }} />
            <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
            <Radar
              name={battery.battery_id}
              dataKey={battery.battery_id}
              stroke="#6366F1"
              fill="#6366F1"
              fillOpacity={0.35}
            />
            {others.map((b, i) => (
              <Radar
                key={b.battery_id}
                name={b.battery_id}
                dataKey={b.battery_id}
                stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                fill={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                fillOpacity={0.15}
              />
            ))}
            {others.length > 0 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
