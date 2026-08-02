import React, { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { BatteryRecord } from "../api/client";
import { BarChart3 } from "lucide-react";

interface Props {
  batteries: BatteryRecord[];
}

export const VisualizationStudio: React.FC<Props> = ({ batteries }) => {
  const [xField, setXField] = useState<keyof BatteryRecord>("tier");
  const [yField, setYField] = useState<keyof BatteryRecord>("suitability_score");
  const [aggregation, setAggregation] = useState<"Mean" | "Count" | "Max" | "Min">("Mean");
  const [chartType, setChartType] = useState<"Bar" | "Line" | "Scatter" | "Area">("Bar");
  const [filterTier, setFilterTier] = useState<string>("ALL");

  const filtered = batteries.filter((b) => filterTier === "ALL" || b.tier === filterTier);

  // Group and aggregate data dynamically
  const groupMap: Record<string, number[]> = {};

  filtered.forEach((b) => {
    const key = String(b[xField]);
    const val = Number(b[yField]) || 0;
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(val);
  });

  const chartData = Object.keys(groupMap).map((key) => {
    const arr = groupMap[key];
    let aggVal = 0;
    if (aggregation === "Count") aggVal = arr.length;
    else if (aggregation === "Mean") aggVal = arr.reduce((a, b) => a + b, 0) / arr.length;
    else if (aggregation === "Max") aggVal = Math.max(...arr);
    else if (aggregation === "Min") aggVal = Math.min(...arr);

    return {
      x: key,
      y: Number(aggVal.toFixed(2)),
      count: arr.length,
    };
  });

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" /> Interactive Generic Visualization Studio
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            Data-driven dynamic chart generator driven by battery fleet metadata & attributes
          </p>
        </div>
      </div>

      {/* Control Panel Toolbar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-900/80 p-4 rounded border border-slate-700/60 text-xs">
        <div>
          <label className="text-slate-400 font-semibold block mb-1">X-Axis Dimension</label>
          <select
            value={xField}
            onChange={(e) => setXField(e.target.value as any)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500"
          >
            <option value="tier">Health Tier</option>
            <option value="chemistry">Chemistry</option>
            <option value="station_status">Station Status</option>
            <option value="state_of_health_percent">State of Health (SoH %)</option>
            <option value="cycle_count">Cycle Count</option>
          </select>
        </div>

        <div>
          <label className="text-slate-400 font-semibold block mb-1">Y-Axis Metric</label>
          <select
            value={yField}
            onChange={(e) => setYField(e.target.value as any)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500"
          >
            <option value="suitability_score">Suitability Score</option>
            <option value="state_of_health_percent">State of Health (%)</option>
            <option value="internal_resistance_mOhm">Internal Resistance (mΩ)</option>
            <option value="cell_voltage_imbalance_mV">Cell Imbalance (mV)</option>
            <option value="temperature_C">Temperature (°C)</option>
            <option value="cycle_count">Cycle Count</option>
          </select>
        </div>

        <div>
          <label className="text-slate-400 font-semibold block mb-1">Aggregation</label>
          <select
            value={aggregation}
            onChange={(e) => setAggregation(e.target.value as any)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500"
          >
            <option value="Mean">Mean (Average)</option>
            <option value="Count">Count</option>
            <option value="Max">Maximum</option>
            <option value="Min">Minimum</option>
          </select>
        </div>

        <div>
          <label className="text-slate-400 font-semibold block mb-1">Chart Type</label>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as any)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500"
          >
            <option value="Bar">Bar Chart</option>
            <option value="Line">Line Chart</option>
            <option value="Area">Area Chart</option>
            <option value="Scatter">Scatter Plot</option>
          </select>
        </div>

        <div>
          <label className="text-slate-400 font-semibold block mb-1">Filter Tier</label>
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Tiers (200 Packs)</option>
            <option value="SAFE">Safe Tier (98 Packs)</option>
            <option value="DEGRADED">Degraded Tier (61 Packs)</option>
            <option value="UNSAFE">Unsafe Tier (41 Packs)</option>
          </select>
        </div>
      </div>

      {/* Dynamic Recharts Rendering Container */}
      <div className="h-80 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "Bar" ? (
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="x" stroke="#94A3B8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94A3B8" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
              <Bar dataKey="y" fill="#06B6D4" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : chartType === "Line" ? (
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="x" stroke="#94A3B8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94A3B8" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
              <Line type="monotone" dataKey="y" stroke="#6366F1" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          ) : chartType === "Area" ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="x" stroke="#94A3B8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94A3B8" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
              <Area type="monotone" dataKey="y" stroke="#10B981" fill="#10B981" fillOpacity={0.3} />
            </AreaChart>
          ) : (
            <ScatterChart margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="x" stroke="#94A3B8" tick={{ fontSize: 12 }} />
              <YAxis dataKey="y" stroke="#94A3B8" tick={{ fontSize: 12 }} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
              <Scatter name="Data" data={chartData} fill="#F59E0B" />
            </ScatterChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
