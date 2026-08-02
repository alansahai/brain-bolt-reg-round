import React from "react";
import type { SuitabilityExplanation } from "../api/client";
import { Brain, PlusCircle, MinusCircle } from "lucide-react";

interface Props {
  explanation: SuitabilityExplanation;
}

export const XAIPanel: React.FC<Props> = ({ explanation }) => {
  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-400" /> Explainable AI — Suitability Reasoning
        </h3>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-white leading-none">
            {explanation.suitability_score.toFixed(1)}
            <span className="text-sm text-slate-400 font-medium"> &plusmn;{explanation.suitability_uncertainty_pts.toFixed(1)}</span>
          </div>
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Suitability Score</div>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-3 text-xs text-slate-200 leading-relaxed">
        {explanation.decision_summary.summary_text}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Feature Contribution</div>
        {explanation.feature_contribution_bars.map((b) => (
          <div key={b.feature} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-200 font-medium">{b.feature}</span>
              <span className="font-mono font-bold text-cyan-400">{b.weight_pct.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2.5 rounded-sm overflow-hidden border border-slate-700/50">
              <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400" style={{ width: `${b.weight_pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Top Positive Factors</div>
          {explanation.positive_reasons.length === 0 && (
            <div className="text-[11px] text-slate-500 italic">No strong positive factors</div>
          )}
          {explanation.positive_reasons.map((r) => (
            <div key={r.feature} className="flex items-center gap-2 text-xs bg-emerald-950/30 border border-emerald-800/40 rounded-sm px-2.5 py-1.5">
              <PlusCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-emerald-200 font-medium">{r.label}</span>
              <span className="ml-auto font-mono text-[10px] text-emerald-400">+{r.weighted_deviation.toFixed(1)}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Top Negative Factors</div>
          {explanation.negative_reasons.length === 0 && (
            <div className="text-[11px] text-slate-500 italic">No significant negative factors</div>
          )}
          {explanation.negative_reasons.map((r) => (
            <div key={r.feature} className="flex items-center gap-2 text-xs bg-rose-950/30 border border-rose-800/40 rounded-sm px-2.5 py-1.5">
              <MinusCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="text-rose-200 font-medium">{r.label}</span>
              <span className="ml-auto font-mono text-[10px] text-rose-400">{r.weighted_deviation.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-1">
        <div className="text-[11px] font-semibold text-slate-400 mb-1.5">Full Component Breakdown:</div>
        <div className="space-y-1">
          {explanation.component_breakdown.map((c) => (
            <div key={c.feature} className="flex items-center gap-2 text-[11px]">
              <span className="w-32 shrink-0 text-slate-300">{c.feature}</span>
              <div className="flex-1 bg-slate-900 h-1.5 rounded-sm overflow-hidden">
                <div
                  className={`h-full ${c.component_score >= 60 ? "bg-emerald-400" : "bg-rose-400"}`}
                  style={{ width: `${c.component_score}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-slate-400">{c.component_score.toFixed(0)}</span>
              <span className="w-14 text-right font-mono text-slate-500">w={c.weight}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
