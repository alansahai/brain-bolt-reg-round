import React, { useEffect, useState } from "react";
import { Sliders, Wrench, CheckCircle2, AlertTriangle, History } from "lucide-react";
import { getAuthToken, fetchClassification } from "../api/client";

interface TwistLogEntry {
  timestamp: string;
  applied_by: string;
  requested_patch: Record<string, unknown>;
  active_state_after: Record<string, unknown>;
}

interface Props {
  /** Re-runs the parent Dashboard's own fleet data load, so pages fed by its
   * cached batteries/tierCounts state (Fleet Dashboard, Battery Explorer,
   * etc.) also pick up the patch immediately, not just this panel. */
  onPatched?: () => void;
}

export const TwistControlPanel: React.FC<Props> = ({ onPatched }) => {
  const [minSoftFlags, setMinSoftFlags] = useState<number>(2);
  const [quarantineOverride, setQuarantineOverride] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [tierCounts, setTierCounts] = useState<{ SAFE?: number; DEGRADED?: number; UNSAFE?: number } | null>(null);
  const [log, setLog] = useState<TwistLogEntry[]>([]);

  const refreshClassification = async () => {
    try {
      const data = await fetchClassification();
      setTierCounts(data.tier_counts || {});
    } catch {
      // Non-fatal — the panel still reports whether the patch itself succeeded.
    }
  };

  useEffect(() => {
    refreshClassification();
  }, []);

  const handleApplyTwist = async () => {
    setApplying(true);
    setErrorMsg(null);
    setStatusMsg(null);
    const token = getAuthToken();
    if (!token) {
      setErrorMsg("No admin session token — switch to Admin role via the sidebar first.");
      setApplying(false);
      return;
    }
    try {
      const res = await fetch("/api/twist/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          degraded_min_soft_flags: minSoftFlags,
          quarantine_override: quarantineOverride,
          timestamp: new Date().toISOString(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(body.detail || `Twist patch rejected (HTTP ${res.status}).`);
        return;
      }
      setStatusMsg(body.message || "Twist patch applied.");
      setLog((prev) => [body.log_entry, ...prev]);
      // Reflect the patch immediately: re-pull classification so the panel
      // shows the fleet's new SAFE/DEGRADED/UNSAFE distribution under the
      // patched thresholds, not the stale pre-patch counts — and tell the
      // parent Dashboard to do the same for every other page.
      await refreshClassification();
      onPatched?.();
    } catch {
      setErrorMsg("Failed to communicate with the twist endpoint.");
    } finally {
      setApplying(false);
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
            Live constraint patching — admin-only. Changes take effect fleet-wide immediately.
          </p>
        </div>
        <span className="px-3 py-1 bg-indigo-950 text-indigo-300 border border-indigo-800/60 text-xs font-bold rounded-sm">
          Admin Only
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

      {tierCounts && (
        <div className="flex items-center gap-4 text-[11px] text-slate-400 bg-slate-900/40 border border-slate-700/40 rounded-sm px-3 py-2">
          <span className="font-semibold text-slate-300">Live Fleet Classification:</span>
          <span className="text-emerald-400 font-mono">SAFE {tierCounts.SAFE ?? 0}</span>
          <span className="text-amber-400 font-mono">DEGRADED {tierCounts.DEGRADED ?? 0}</span>
          <span className="text-rose-400 font-mono">UNSAFE {tierCounts.UNSAFE ?? 0}</span>
        </div>
      )}

      <div className="flex justify-between items-center pt-2 flex-wrap gap-3">
        <button
          onClick={handleApplyTwist}
          disabled={applying}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-sm transition-all"
        >
          <Wrench className="w-4 h-4" /> {applying ? "Applying…" : "Apply Patch to Twist Adapter"}
        </button>

        {statusMsg && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-2 text-xs text-rose-400 font-medium bg-rose-950/60 border border-rose-800/60 px-3 py-1.5 rounded-sm">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            {errorMsg}
          </div>
        )}
      </div>

      {log.length > 0 && (
        <div className="pt-2 border-t border-slate-700/50 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wide">
            <History className="w-3.5 h-3.5" /> Patch Audit Log (this session)
          </div>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {log.map((entry, i) => (
              <li key={i} className="text-[11px] text-slate-400 font-mono bg-slate-900/50 rounded-sm px-2 py-1">
                {entry.timestamp} &middot; {entry.applied_by} &middot; {JSON.stringify(entry.active_state_after)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
