import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { RulPrediction } from "../api/client";
import { TrendingDown, Info, ShieldQuestion } from "lucide-react";

const CONFIDENCE_STYLES: Record<string, string> = {
  High: "text-emerald-400 border-emerald-700/60 bg-emerald-950/40",
  Medium: "text-amber-400 border-amber-700/60 bg-amber-950/40",
  Low: "text-rose-400 border-rose-700/60 bg-rose-950/40",
};

interface Props {
  rul: RulPrediction;
}

export const RULPanel: React.FC<Props> = ({ rul }) => {
  const chartData = rul.degradation_trend.map((p) => ({
    cycle: p.cycle_offset,
    predictedSoH: p.predicted_soh_percent,
  }));

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-amber-400" /> Remaining Useful Life (RUL) Prediction
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-slate-900/60 p-3 rounded-sm border border-slate-700/50">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Current SoH</div>
          <div className="text-xl font-extrabold text-white mt-1">{rul.current_soh_percent.toFixed(1)}%</div>
        </div>
        <div className="bg-slate-900/60 p-3 rounded-sm border border-slate-700/50">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">
            SoH after {rul.projection_horizon_cycles} cycles
          </div>
          <div className="text-xl font-extrabold text-amber-400 mt-1">
            {rul.predicted_soh_after_horizon_percent.toFixed(1)}%
            <span className="text-xs text-slate-400 font-medium"> &plusmn;{rul.predicted_soh_uncertainty_pct_points.toFixed(1)}</span>
          </div>
        </div>
        <div className="bg-slate-900/60 p-3 rounded-sm border border-slate-700/50">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Estimated RUL</div>
          <div className="text-xl font-extrabold text-cyan-400 mt-1">
            {rul.estimated_rul_cycles !== null ? Math.round(rul.estimated_rul_cycles) : "—"}
            {rul.estimated_rul_uncertainty_cycles !== null && (
              <span className="text-xs text-slate-400 font-medium"> &plusmn;{Math.round(rul.estimated_rul_uncertainty_cycles)}</span>
            )}
            <span className="text-xs text-slate-400 font-medium ml-1">cycles</span>
          </div>
        </div>
      </div>

      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="cycle" stroke="#94A3B8" tick={{ fontSize: 10 }} label={{ value: "Cycle Count", position: "insideBottom", offset: -3, fontSize: 10, fill: "#64748B" }} />
            <YAxis stroke="#94A3B8" tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
            <ReferenceLine
              y={rul.eol_soh_threshold_percent}
              stroke="#F43F5E"
              strokeDasharray="4 4"
              label={{ value: "EOL Threshold", position: "insideTopRight", fontSize: 10, fill: "#F43F5E" }}
            />
            <Line type="monotone" dataKey="predictedSoH" stroke="#F59E0B" strokeWidth={2.5} dot={false} name="Predicted SoH" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={`rounded-sm border p-3 space-y-2 ${CONFIDENCE_STYLES[rul.confidence_level] || CONFIDENCE_STYLES.Medium}`}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
            <ShieldQuestion className="w-4 h-4" /> Prediction Reliability: {rul.confidence_level}
          </span>
          <span className="font-mono font-extrabold text-lg">{rul.confidence_pct.toFixed(0)}%</span>
        </div>
        <ul className="space-y-1 text-[11px] text-slate-300">
          {rul.reliability_reasons.map((reason, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="shrink-0">&bull;</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="text-[11px] text-slate-300 flex items-start gap-1.5 bg-indigo-950/40 p-2.5 rounded-sm border border-indigo-800/50">
        <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
        <span>{rul.confidence_note}</span>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-slate-400">Dominant Stress Drivers:</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {rul.stress_drivers.slice(0, 4).map((d) => (
            <div key={d.factor} className="flex justify-between items-center text-[11px] bg-slate-900/60 px-2.5 py-1.5 rounded border border-slate-700/50">
              <span className="text-slate-300">{d.factor}</span>
              <span className={`font-mono font-bold ${d.impact === "accelerates aging" ? "text-rose-400" : d.impact === "slows aging" ? "text-emerald-400" : "text-slate-400"}`}>
                {d.multiplier.toFixed(2)}x
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
