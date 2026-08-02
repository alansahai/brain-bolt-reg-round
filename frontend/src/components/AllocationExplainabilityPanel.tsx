import React from "react";
import type { AllocationExplanation } from "../api/client";
import { Brain, ArrowRight, XCircle } from "lucide-react";

interface Props {
  explanation: AllocationExplanation;
}

const FACTOR_LABELS: Record<string, string> = {
  priority: "Priority",
  suitability: "Suitability",
  risk: "Risk",
  energy_match: "Energy Match",
  future_health: "Future Health",
};

const FACTOR_COLORS: Record<string, string> = {
  priority: "bg-amber-500",
  suitability: "bg-cyan-500",
  risk: "bg-rose-500",
  energy_match: "bg-emerald-500",
  future_health: "bg-indigo-500",
};

function confidenceStyle(pct: number): string {
  if (pct >= 85) return "text-emerald-400 border-emerald-700/60 bg-emerald-950/40";
  if (pct >= 65) return "text-amber-400 border-amber-700/60 bg-amber-950/40";
  return "text-rose-400 border-rose-700/60 bg-rose-950/40";
}

/**
 * Allocation Explainability — generated automatically after Graph
 * Optimization for every assignment (see backend/src/graph_allocator.py::
 * _build_explainability). Shows the winning battery's decision-factor
 * breakdown, a heuristic Allocation Confidence, and the alternative
 * batteries that were considered and why each lost out.
 */
export const AllocationExplainabilityPanel: React.FC<Props> = ({ explanation }) => {
  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-400" /> Allocation Explainability
        </h3>
        <div className={`px-3 py-1 rounded-sm border text-xs font-bold ${confidenceStyle(explanation.allocation_confidence_pct)}`}>
          Confidence: {explanation.allocation_confidence_pct.toFixed(0)}%
        </div>
      </div>

      <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/50 rounded-sm p-3 text-sm">
        <span className="font-mono font-bold text-white">{explanation.request_id}</span>
        <ArrowRight className="w-4 h-4 text-slate-500" />
        <span className="font-mono font-bold text-cyan-300">{explanation.battery_id}</span>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Decision Factors</div>
        {Object.entries(explanation.decision_factors_pct).map(([key, pct]) => (
          <div key={key} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-200 font-medium">{FACTOR_LABELS[key] || key}</span>
              <span className="font-mono font-bold text-slate-200">{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-sm overflow-hidden border border-slate-700/50">
              <div className={`h-full ${FACTOR_COLORS[key] || "bg-slate-500"}`} style={{ width: `${Math.max(0, pct)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Alternative Batteries Considered</div>
        {explanation.alternatives_considered.length === 0 && (
          <div className="text-[11px] text-slate-500 italic">No feasible alternatives — this was the only viable battery.</div>
        )}
        {explanation.alternatives_considered.map((alt) => (
          <div key={alt.battery_id} className="flex items-center gap-2 text-xs bg-slate-900/50 border border-slate-700/40 rounded-sm px-2.5 py-1.5">
            <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="font-mono font-semibold text-slate-300">{alt.battery_id}</span>
            <span className="text-slate-500">&ndash;</span>
            <span className="text-slate-400">{alt.reason_rejected}</span>
            <span className="ml-auto font-mono text-[10px] text-slate-500">score {alt.match_score.toFixed(1)}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-700/50 pt-2">{explanation.methodology}</p>
    </div>
  );
};
