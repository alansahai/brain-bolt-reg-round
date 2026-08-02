import React from "react";
import { Info, Award, CheckCircle2, ShieldAlert } from "lucide-react";

interface Props {
  explanation: {
    request_id: string;
    battery_id: string;
    battery_tier: string;
    priority: string;
    minimum_acceptable_SOC_percent?: number;
    battery_soc: number;
    battery_soh: number;
    suitability_score: number;
    score_breakdown: {
      soh_contribution: number;
      soh_pct_share: string;
      electrical_thermal_share: string;
      cycle_share: string;
    };
    runner_up_comparison: string;
    one_line_summary: string;
  } | null;
  unservedReason?: string | null;
}

export const ExplanationPanel: React.FC<Props> = ({ explanation, unservedReason }) => {
  if (unservedReason) {
    return (
      <div className="bg-rose-950/40 border border-rose-800/60 rounded p-4 text-xs space-y-2">
        <div className="flex items-center gap-2 text-rose-300 font-bold">
          <ShieldAlert className="w-4 h-4 text-rose-400" /> Unserved Fallback Reason
        </div>
        <p className="text-slate-300 leading-relaxed">{unservedReason}</p>
      </div>
    );
  }

  if (!explanation) return null;

  return (
    <div className="bg-slate-900/90 border border-slate-700/80 rounded p-4 text-xs space-y-3">
      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white">Deterministic Assignment Explanation</span>
        </div>
        <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-mono text-[10px] font-bold rounded">
          {explanation.battery_tier} TIER
        </span>
      </div>

      {/* One Line Summary */}
      <p className="text-slate-200 font-medium leading-relaxed bg-slate-800/60 p-2.5 rounded-sm border border-slate-700/50">
        {explanation.one_line_summary}
      </p>

      {/* Score Component Contribution Readout */}
      <div className="space-y-1.5 pt-1">
        <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-indigo-400" /> Suitability Score Component Breakdown:
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px] text-center font-mono">
          <div className="bg-slate-800 p-2 rounded border border-slate-700">
            <span className="text-slate-400 block">SoH (35%):</span>
            <span className="text-emerald-400 font-bold">+{explanation.score_breakdown.soh_contribution} pts</span>
          </div>
          <div className="bg-slate-800 p-2 rounded border border-slate-700">
            <span className="text-slate-400 block">Elec/Thermal (55%):</span>
            <span className="text-cyan-400 font-bold">Weighted</span>
          </div>
          <div className="bg-slate-800 p-2 rounded border border-slate-700">
            <span className="text-slate-400 block">Cycles (10%):</span>
            <span className="text-indigo-400 font-bold">Normalized</span>
          </div>
        </div>
      </div>

      {/* Runner Up Comparison */}
      <div className="text-[11px] text-slate-300 flex items-start gap-1.5 bg-indigo-950/40 p-2.5 rounded-sm border border-indigo-800/50">
        <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <span><strong>Selection Rationale:</strong> {explanation.runner_up_comparison}</span>
      </div>
    </div>
  );
};
