import React from "react";
import type { AllocationExplanation, AllocationFactorKey } from "../api/client";
import { Brain, ArrowRight, XCircle, CheckCircle2, XCircle as XCircleSmall, Target, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  explanation: AllocationExplanation;
}

const FACTOR_COLORS: Record<AllocationFactorKey, string> = {
  priority: "bg-amber-500",
  suitability: "bg-cyan-500",
  risk: "bg-rose-500",
  future_health: "bg-indigo-500",
  energy_match: "bg-emerald-500",
  waiting_time: "bg-sky-500",
  fair_usage: "bg-fuchsia-500",
  service_rate: "bg-orange-500",
};

const FACTOR_ORDER: AllocationFactorKey[] = [
  "priority",
  "suitability",
  "risk",
  "future_health",
  "energy_match",
  "waiting_time",
  "fair_usage",
  "service_rate",
];

function confidenceStyle(pct: number): string {
  if (pct >= 85) return "text-emerald-400 border-emerald-700/60 bg-emerald-950/40";
  if (pct >= 65) return "text-amber-400 border-amber-700/60 bg-amber-950/40";
  return "text-rose-400 border-rose-700/60 bg-rose-950/40";
}

/**
 * Allocation Explainability — generated automatically after Graph
 * Optimization for every assignment (see backend/src/graph_allocator.py::
 * _build_explainability). Every number here is one of the 8 weighted terms
 * Graph Optimization actually summed to solve this assignment — not
 * generated/approximated text — plus eligibility checks, the final edge
 * score, and full-detail runner-up alternatives.
 */
export const AllocationExplainabilityPanel: React.FC<Props> = ({ explanation }) => {
  const [expandedAlt, setExpandedAlt] = React.useState<string | null>(null);

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

      <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/50 rounded-sm p-3 text-sm flex-wrap">
        <span className="font-mono font-bold text-white">{explanation.request_id}</span>
        <ArrowRight className="w-4 h-4 text-slate-500" />
        <span className="font-mono font-bold text-cyan-300">{explanation.battery_id}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
          <Target className="w-3.5 h-3.5 text-slate-500" /> Final Edge Score:{" "}
          <span className="font-mono font-bold text-white">{explanation.final_edge_score.toFixed(2)}</span>
        </span>
        {explanation.estimated_rul_cycles !== null && (
          <span className="text-xs text-slate-400">
            Est. RUL: <span className="font-mono font-bold text-white">{explanation.estimated_rul_cycles.toFixed(0)} cycles</span>
          </span>
        )}
      </div>

      {/* Eligibility Checks */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Eligibility Checks</div>
        {explanation.eligibility_checks.map((c, i) => (
          <div key={i} className="flex items-start gap-2 text-xs bg-slate-900/40 border border-slate-700/40 rounded-sm px-2.5 py-1.5">
            {c.passed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircleSmall className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <span className="text-slate-300">{c.check}</span>
          </div>
        ))}
      </div>

      {/* Full 8-factor contribution breakdown */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Decision Factor Contributions (raw points &middot; % of final edge score)
        </div>
        {FACTOR_ORDER.map((key) => {
          const c = explanation.contributions[key];
          if (!c) return null;
          return (
            <div key={key} className="space-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-200 font-medium">{c.label}</span>
                <span className="font-mono font-bold text-slate-200">
                  {c.raw_points >= 0 ? "+" : ""}
                  {c.raw_points.toFixed(2)} pts &middot; {c.pct_of_total.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-sm overflow-hidden border border-slate-700/50">
                <div className={`h-full ${FACTOR_COLORS[key]}`} style={{ width: `${Math.max(0, Math.min(100, c.pct_of_total))}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Alternatives */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Alternative Batteries Considered</div>
        {explanation.alternatives_considered.length === 0 && (
          <div className="text-[11px] text-slate-500 italic">No feasible alternatives — this was the only viable battery.</div>
        )}
        {explanation.alternatives_considered.map((alt) => (
          <div key={alt.battery_id} className="bg-slate-900/50 border border-slate-700/40 rounded-sm overflow-hidden">
            <button
              onClick={() => setExpandedAlt(expandedAlt === alt.battery_id ? null : alt.battery_id)}
              className="w-full flex items-center gap-2 text-xs px-2.5 py-1.5 text-left"
            >
              <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="font-mono font-semibold text-slate-300">{alt.battery_id}</span>
              <span className="text-slate-500">&ndash;</span>
              <span className="text-slate-400 flex-1">{alt.reason_rejected}</span>
              <span className="font-mono text-[10px] text-slate-500">
                score {alt.final_edge_score.toFixed(2)} (
                {alt.score_gap_vs_selected >= 0 ? "-" : "+"}
                {Math.abs(alt.score_gap_vs_selected).toFixed(2)} vs. selected)
              </span>
              {expandedAlt === alt.battery_id ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
            </button>
            {expandedAlt === alt.battery_id && (
              <div className="px-2.5 pb-2.5 space-y-1.5 border-t border-slate-700/40 pt-2">
                {FACTOR_ORDER.map((key) => {
                  const winner = explanation.contributions[key];
                  const c = alt.contributions[key];
                  if (!c || !winner) return null;
                  const delta = winner.raw_points - c.raw_points;
                  return (
                    <div key={key} className="flex justify-between text-[11px]">
                      <span className="text-slate-400">{c.label}</span>
                      <span className="font-mono text-slate-300">
                        {c.raw_points.toFixed(2)} pts{" "}
                        <span className={delta > 0.001 ? "text-rose-400" : delta < -0.001 ? "text-emerald-400" : "text-slate-600"}>
                          ({delta >= 0 ? "-" : "+"}
                          {Math.abs(delta).toFixed(2)} vs. selected)
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-700/50 pt-2">{explanation.methodology}</p>
    </div>
  );
};
