import React, { useState } from "react";
import { Sliders, Wrench, CheckCircle2 } from "lucide-react";
import { API_BASE } from "../api/client";

export const TwistControlPanel: React.FC = () => {
  const [minSoftFlags, setMinSoftFlags] = useState<number>(2);
  const [quarantineOverride, setQuarantineOverride] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleApplyTwist = async () => {
    try {
      const res = await fetch(`${API_BASE}/twist/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          degraded_min_soft_flags: minSoftFlags,
          quarantine_override: quarantineOverride,
          timestamp: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setStatusMsg(`Twist patch payload submitted to ${API_BASE}/twist/apply`);
      }
    } catch {
      setStatusMsg("Failed to communicate with twist endpoint");
    }
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-md font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" /> Onsite Twist Control Panel (Part 2 Adapter Hooks)
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            Pre-built extension hooks for live 30% onsite challenge parameter patching and policy re-tuning
          </p>
        </div>
        <span className="px-3 py-1 bg-indigo-950 text-indigo-300 border border-indigo-800/60 text-xs font-bold rounded-sm">
          Part 2 Twist Ready
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/60 p-4 rounded-sm border border-slate-700/50">
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Degraded Min Soft Flags Threshold: <span className="text-cyan-400 font-mono font-bold">{minSoftFlags}</span>
          </label>
          <input
            type="range"
            min="1"
            max="4"
            value={minSoftFlags}
            onChange={(e) => setMinSoftFlags(parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-sm appearance-none cursor-pointer accent-cyan-400"
          />
          <span className="text-[11px] text-slate-400 mt-1 block">
            {minSoftFlags === 1 ? "1 soft flag demotes to Degraded (Strict)" : `${minSoftFlags} soft flags demotes to Degraded (Default Count-Based)`}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-300 block">Quarantine Hard Override</span>
            <span className="text-[11px] text-slate-400">Strictly classify REVIEW/QUARANTINE as UNSAFE</span>
          </div>
          <input
            type="checkbox"
            checked={quarantineOverride}
            onChange={(e) => setQuarantineOverride(e.target.checked)}
            className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 bg-slate-700 border-slate-600"
          />
        </div>
      </div>

      <div className="flex justify-between items-center pt-2">
        <button
          onClick={handleApplyTwist}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-sm transition-all"
        >
          <Wrench className="w-4 h-4" /> Apply Patch to Twist Adapter
        </button>

        {statusMsg && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  );
};
