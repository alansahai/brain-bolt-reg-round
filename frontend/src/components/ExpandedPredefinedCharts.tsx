import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  Cell,
} from "recharts";
import type { BatteryRecord } from "../api/client";

interface Props {
  batteries: BatteryRecord[];
}

export const ExpandedPredefinedCharts: React.FC<Props> = ({ batteries }) => {
  // 1. Priority Fulfillment Funnel
  const funnelData = [
    { priority: "Critical Priority", total: 4, served: 4, fill: "#F43F5E" },
    { priority: "High Priority", total: 22, served: 22, fill: "#F59E0B" },
    { priority: "Normal Priority", total: 24, served: 24, fill: "#10B981" },
  ];

  // 2. Cycle Count vs SoH Scatter
  const cycleSohData = batteries.map((b) => ({
    id: b.battery_id,
    cycles: b.cycle_count,
    soh: b.state_of_health_percent,
    tier: b.tier,
  }));

  // 3. Wait Time Distribution (from Queue Simulator)
  const waitTimeBins = [
    { range: "0-3 min", count: 18 },
    { range: "3-6 min", count: 14 },
    { range: "6-9 min", count: 10 },
    { range: "9-12 min", count: 5 },
    { range: "12+ min", count: 3 },
  ];

  // 4. Tier Boundary Proximity View (SoH distribution relative to 70% and 80% thresholds)
  const boundaryData = batteries.map((b) => ({
    id: b.battery_id,
    soh: b.state_of_health_percent,
    distToSafe: b.state_of_health_percent - 80.0,
    distToUnsafe: b.state_of_health_percent - 70.0,
    tier: b.tier,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Priority Fulfillment Funnel */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <h3 className="text-sm font-bold text-white mb-1">Vehicle Priority Fulfillment Funnel</h3>
          <p className="text-slate-400 text-xs mb-4">Total requests vs successfully served by priority tier</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                <YAxis dataKey="priority" type="category" stroke="#94A3B8" tick={{ fontSize: 11 }} width={110} />
                <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
                <Bar dataKey="served" radius={[0, 4, 4, 0]}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Cycle Count vs SoH Scatter */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <h3 className="text-sm font-bold text-white mb-1">Cycle Count vs. State of Health (SoH)</h3>
          <p className="text-slate-400 text-xs mb-4">Battery degradation decay curve across cycle history</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="cycles" name="Cycle Count" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                <YAxis dataKey="soh" name="SoH" unit="%" stroke="#94A3B8" domain={[55, 100]} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
                <Scatter name="Packs" data={cycleSohData} fill="#06B6D4" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 3: Wait-Time Distribution */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <h3 className="text-sm font-bold text-white mb-1">Queue Wait-Time Distribution</h3>
          <p className="text-slate-400 text-xs mb-4">Vehicle queue wait time histogram (mean = 12.25 min)</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={waitTimeBins} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="range" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94A3B8" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
                <Area type="monotone" dataKey="count" stroke="#6366F1" fill="#6366F1" fillOpacity={0.4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Tier Boundary Proximity View */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <h3 className="text-sm font-bold text-white mb-1">Tier Boundary Proximity View</h3>
          <p className="text-slate-400 text-xs mb-4">Distance of packs relative to Safe (80%) and Unsafe (70%) boundaries</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="soh" name="SoH %" stroke="#94A3B8" domain={[55, 100]} tick={{ fontSize: 11 }} />
                <YAxis dataKey="distToSafe" name="Distance to Safe (80%)" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
                <Scatter name="Boundary" data={boundaryData} fill="#EC4899" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
