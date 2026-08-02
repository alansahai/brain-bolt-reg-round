import React from "react";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";
import type { RiskIndexResult } from "../api/client";
import { ShieldAlert } from "lucide-react";

interface Props {
  risk: RiskIndexResult;
  compact?: boolean;
}

const BAND_COLORS: Record<string, string> = {
  LOW: "#10B981",
  MEDIUM: "#F59E0B",
  HIGH: "#F97316",
  CRITICAL: "#F43F5E",
};

export const RiskGauge: React.FC<Props> = ({ risk, compact }) => {
  const color = BAND_COLORS[risk.risk_band] || "#94A3B8";
  const gaugeData = [{ name: "risk", value: risk.risk_index, fill: color }];

  return (
    <div className={`bg-slate-800/80 border border-slate-700/80 rounded ${compact ? "p-3" : "p-5"}`}>
      {!compact && (
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400" /> Battery Risk Index
        </h3>
      )}
      <div className={`relative ${compact ? "h-28" : "h-44"} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={gaugeData}
            startAngle={180}
            endAngle={0}
            barSize={compact ? 10 : 16}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "#1E293B" }} dataKey="value" cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className={`font-extrabold text-white ${compact ? "text-lg" : "text-3xl"}`}>{risk.risk_index.toFixed(0)}</div>
          <div
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm mt-1"
            style={{ color, backgroundColor: `${color}22`, border: `1px solid ${color}55` }}
          >
            {risk.risk_band} RISK
          </div>
        </div>
      </div>
      {!compact && (
        <div className="text-[11px] text-slate-400 text-center mt-1">
          Dominant factor: <span className="text-slate-200 font-semibold capitalize">{risk.dominant_risk_factor.replace(/_/g, " ")}</span>
        </div>
      )}
    </div>
  );
};
