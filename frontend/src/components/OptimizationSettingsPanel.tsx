import React, { useEffect, useRef, useState } from "react";
import { fetchOptimizationWeights } from "../api/client";
import type { OptimizationWeightsMap } from "../api/client";
import { Sliders, RotateCcw, Loader2 } from "lucide-react";

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
              <span className="font-mono font-bold text-cyan-400">{((values[key] ?? w.value) * 100).toFixed(1)}%</span>
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
        <span className="text-slate-500">Raw weights auto-normalize server-side to sum to 100%.</span>
        <span className={`font-mono font-bold ${Math.abs(total - 1) < 0.03 ? "text-emerald-400" : "text-amber-400"}`}>
          Raw sum: {(total * 100).toFixed(0)}%
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rerunning Graph Optimization...
        </div>
      )}
    </div>
  );
};
