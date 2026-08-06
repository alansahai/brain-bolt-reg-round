import React, { useEffect, useRef, useState } from "react";
import { fetchOptimizationWeights } from "../api/client";
import type { OptimizationWeightsMap } from "../api/client";
import { Sliders, RotateCcw, Loader2, Info, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  onRerun: (weightOverrides: Record<string, number>) => void;
  loading?: boolean;
}

/**
 * Battery Intelligence Platform — Optimization Settings Panel.
 *
 * Every Graph Optimization weight (Priority/Suitability/Risk/Future Health/
 * Waiting Time/Energy Match/Fair Usage/Service Rate) is configurable here,
 * with its config.yaml-sourced explanation shown inline. Changing a slider
 * debounces a live rerun of the full allocation — nothing is written back to
 * config.yaml, so this is a safe, per-session "what if I weighed X more"
 * control, not a permanent policy change.
 *
 * Future direction: backend/ml/policy_tuner.py's simulation-based weight
 * search generalizes directly to these 8 weights — instead of hand-tuning
 * via these sliders, the same tuner could re-converge them automatically
 * against a reward function (see docs/Development_Plan.md).
 */
export const OptimizationSettingsPanel: React.FC<Props> = ({ onRerun, loading }) => {
  const [weights, setWeights] = useState<OptimizationWeightsMap | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [showHelp, setShowHelp] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    fetchOptimizationWeights().then((d) => {
      setWeights(d.weights);
      const initial: Record<string, number> = {};
      Object.entries(d.weights).forEach(([k, w]) => {
        initial[k] = w.value;
      });
      setValues(initial);
    });
  }, []);

  const handleChange = (key: string, val: number) => {
    const next = { ...values, [key]: val };
    setValues(next);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => onRerun(next), 450);
  };

  const handleReset = () => {
    if (!weights) return;
    const defaults: Record<string, number> = {};
    Object.entries(weights).forEach(([k, w]) => {
      defaults[k] = w.value;
    });
    setValues(defaults);
    onRerun(defaults);
  };

  if (!weights) {
    return <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 text-slate-400 text-xs">Loading optimization settings...</div>;
  }

  const total = Object.values(values).reduce((a, b) => a + b, 0);
  const defaultTotal = Object.values(weights).reduce((a, w) => a + w.value, 0) || 1;

  // Every slider's raw value gets divided by `total` server-side
  // (backend/src/graph_allocator.py:_graph_cfg) before it ever reaches Graph
  // Optimization — so what actually drives the allocation is each weight's
  // SHARE of the sum, not its absolute value. Compare each weight's current
  // normalized share against its default normalized share to flag drift.
  const normalizedShare = (key: string) => (total > 0 ? (values[key] ?? 0) / total : 0);
  const defaultShare = (key: string) => ((weights as Record<string, { value: number }>)[key]?.value ?? 0) / defaultTotal;

  const warnings = Object.entries(weights)
    .map(([key, w]) => {
      const cur = normalizedShare(key);
      const base = defaultShare(key);
      if (base <= 0) return null;
      const ratio = cur / base;
      if (ratio >= 1.5) {
        return { key, label: w.label, type: "up" as const, pct: cur * 100, text: `${w.label} dominates allocation — now ${(cur * 100).toFixed(0)}% of the objective (vs. ${(base * 100).toFixed(0)}% by default).` };
      }
      if (ratio <= 0.6) {
        return { key, label: w.label, type: "down" as const, pct: cur * 100, text: `${w.label} influence reduced to ${(cur * 100).toFixed(0)}% of the objective (vs. ${(base * 100).toFixed(0)}% by default).` };
      }
      return null;
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" /> Optimization Settings — Graph Allocation Weights
        </h3>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-bold rounded-sm transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>
      <p className="text-[11px] text-slate-400">
        Adjust how the final Graph Optimization stage weighs each battery-intelligence signal. The allocation
        reruns automatically — nothing here is written back to config.yaml.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {Object.entries(weights).map(([key, w]) => (
          <div key={key}>
            <div className="flex justify-between items-baseline text-xs mb-1">
              <span className="font-semibold text-slate-200">{w.label}</span>
              <span className="font-mono text-[10px] text-slate-500">
                raw {((values[key] ?? w.value) * 100).toFixed(0)}% &rarr;{" "}
                <span className="font-bold text-cyan-400">{(normalizedShare(key) * 100).toFixed(0)}% effective</span>
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={values[key] ?? w.value}
              onChange={(e) => handleChange(key, parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-sm appearance-none cursor-pointer accent-cyan-500"
            />
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">{w.description}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-slate-700/50 pt-2.5 text-[11px]">
        <span className="text-slate-500">Raw weights auto-normalize server-side to sum to 100% — only the ratio between sliders matters.</span>
        <span className="font-mono font-bold text-slate-400">
          Raw sum: {(total * 100).toFixed(0)}%
        </span>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((w) => (
            <div
              key={w.key}
              className={`flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-sm border ${
                w.type === "up"
                  ? "bg-amber-950/40 border-amber-800/50 text-amber-300"
                  : "bg-slate-900/60 border-slate-700/50 text-slate-400"
              }`}
            >
              {w.type === "up" ? <TrendingUp className="w-3.5 h-3.5 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 shrink-0" />}
              {w.text}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-slate-700/50 pt-2.5">
        <button
          onClick={() => setShowHelp((s) => !s)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
        >
          <Info className="w-3.5 h-3.5" /> How does weight normalization work?
          {showHelp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showHelp && (
          <div className="mt-2 space-y-2 text-[11px] text-slate-400 leading-relaxed bg-slate-900/50 border border-slate-700/40 rounded-sm p-3">
            <p>
              <strong className="text-slate-200">Sliders don't have to sum to 100% — nothing here blocks you from pushing the
              total above or below it.</strong> Every raw value is divided by the sum of all 8 weights before it reaches
              Graph Optimization (<code>backend/src/graph_allocator.py:_graph_cfg</code>), so the normalized weights
              always sum to exactly 100% no matter what you enter.
            </p>
            <p>
              <strong className="text-slate-200">What exceeding 100% actually does:</strong> pushing every slider up
              equally is a no-op — the ratios between them don't change, so normalization divides them all back down
              to the same effective weights. Only the size of one slider <em>relative to the others</em> changes the
              outcome, not the raw sum.
            </p>
            <p>
              <strong className="text-slate-200">How Graph Optimization interprets these weights:</strong> the
              normalized weights become the coefficients of a linear weighted-sum edge score between every
              vehicle/battery pair, and the Hungarian algorithm finds the assignment that maximizes the total edge
              score across the whole fleet at once.
            </p>
            <p>
              <strong className="text-slate-200">Effect of bias:</strong> raising one slider relative to the others
              increases that signal's effective share and proportionally shrinks every other signal's share — e.g.
              doubling Priority while leaving the rest untouched doesn't just add more weight to Priority, it also
              dilutes Risk, Suitability, Energy Match, and Future Health's influence on the final assignment.
            </p>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rerunning Graph Optimization...
        </div>
      )}
    </div>
  );
};
