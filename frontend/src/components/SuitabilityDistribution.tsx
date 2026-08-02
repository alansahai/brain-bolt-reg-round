import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { BatteryRecord } from "../api/client";

interface Props {
  batteries: BatteryRecord[];
}

export const SuitabilityDistribution: React.FC<Props> = ({ batteries }) => {
  const bins = [
    { range: "0-20", count: 0 },
    { range: "20-40", count: 0 },
    { range: "40-60", count: 0 },
    { range: "60-80", count: 0 },
    { range: "80-100", count: 0 },
  ];

  batteries.forEach((b) => {
    const s = b.suitability_score;
    if (s < 20) bins[0].count++;
    else if (s < 40) bins[1].count++;
    else if (s < 60) bins[2].count++;
    else if (s < 80) bins[3].count++;
    else bins[4].count++;
  });

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-md font-bold text-white">Battery Suitability Score Distribution</h3>
          <p className="text-slate-400 text-xs mt-0.5">Fleet-wide score distribution across all 200 battery packs</p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bins} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="range" stroke="#94A3B8" tick={{ fontSize: 11 }} />
            <YAxis stroke="#94A3B8" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", borderRadius: "8px", color: "#F8FAFC" }}
            />
            <Area type="monotone" dataKey="count" stroke="#06B6D4" fillOpacity={1} fill="url(#scoreColor)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
