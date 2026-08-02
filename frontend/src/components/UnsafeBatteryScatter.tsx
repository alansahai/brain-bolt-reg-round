import React from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { BatteryRecord } from "../api/client";

interface Props {
  batteries: BatteryRecord[];
}

export const UnsafeBatteryScatter: React.FC<Props> = ({ batteries }) => {
  const data = batteries.map((b) => ({
    id: b.battery_id,
    soh: b.state_of_health_percent,
    ir: b.internal_resistance_mOhm,
    tier: b.tier,
    status: b.station_status,
  }));

  const getColor = (tier: string) => {
    if (tier === "UNSAFE") return "#F43F5E";
    if (tier === "DEGRADED") return "#F59E0B";
    return "#10B981";
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-md font-bold text-white">Unsafe & Quarantined Battery Parameter Scatter</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Internal Resistance (mΩ) vs State of Health (%) — highlighting unsafe tail & quarantine overrides
          </p>
        </div>
        <div className="flex gap-3 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block" /> Safe (98)
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2.5 h-2.5 bg-amber-500 rounded-full inline-block" /> Degraded (61)
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-full inline-block" /> Unsafe (41)
          </span>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="soh" name="State of Health" unit="%" stroke="#94A3B8" domain={[55, 100]} tick={{ fontSize: 11 }} />
            <YAxis dataKey="ir" name="Internal Resistance" unit="mΩ" stroke="#94A3B8" domain={[30, 95]} tick={{ fontSize: 11 }} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ payload }) => {
                if (payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-sm text-xs space-y-1">
                      <div className="font-bold text-white font-mono">{d.id}</div>
                      <div className="text-slate-300">Tier: <span className="font-semibold text-amber-400">{d.tier}</span></div>
                      <div className="text-slate-300">SoH: <span className="font-mono text-cyan-300">{d.soh}%</span></div>
                      <div className="text-slate-300">Internal Resistance: <span className="font-mono text-cyan-300">{d.ir} mΩ</span></div>
                      <div className="text-slate-400 text-[10px]">Status: {d.status}</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter name="Batteries" data={data}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(entry.tier)} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
