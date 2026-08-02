import React from "react";
import type { FleetHealthResult } from "../api/client";
import { FleetHealthScore } from "../components/FleetHealthScore";
import { ShieldCheck, AlertTriangle, XCircle, Sparkles } from "lucide-react";

interface Props {
  tierCounts: { SAFE?: number; DEGRADED?: number; UNSAFE?: number };
  totalPacks: number;
  autoSummary: string | null;
  fleetHealth: FleetHealthResult | null;
}

/**
 * Fleet Dashboard — the single screen answering "how healthy is the entire
 * station?" without inspecting individual packs. Detailed per-battery
 * browsing lives in Battery Explorer; per-battery intelligence lives in
 * Battery Details.
 */
export const FleetDashboard: React.FC<Props> = ({ tierCounts, totalPacks, autoSummary, fleetHealth }) => {
  return (
    <div className="space-y-6 pb-12">
      {autoSummary && (
        <div className="bg-slate-900 border border-slate-800 border-l-2 border-l-cyan-500 p-5 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-1">
              Deterministic Fleet Health Auto-Summary
            </div>
            <p className="text-xs text-slate-200 leading-relaxed font-medium">{autoSummary}</p>
          </div>
        </div>
      )}

      {fleetHealth && <FleetHealthScore fleetHealth={fleetHealth} />}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Fleet Size</div>
          <div className="text-3xl font-extrabold text-white mt-2">{totalPacks} Packs</div>
          <div className="text-slate-400 text-xs mt-1">200-pack Light EV Fleet</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="flex justify-between items-center">
            <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">Safe & Available</span>
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 mt-2">{tierCounts.SAFE || 0}</div>
          <div className="text-slate-400 text-xs mt-1">{totalPacks > 0 ? ((tierCounts.SAFE || 0) / totalPacks * 100).toFixed(1) : 0}% of fleet</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="flex justify-between items-center">
            <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Degraded but Usable</span>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-amber-400 mt-2">{tierCounts.DEGRADED || 0}</div>
          <div className="text-slate-400 text-xs mt-1">{totalPacks > 0 ? ((tierCounts.DEGRADED || 0) / totalPacks * 100).toFixed(1) : 0}% of fleet</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="flex justify-between items-center">
            <span className="text-rose-400 text-xs font-semibold uppercase tracking-wider">Unsafe / Quarantined</span>
            <XCircle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="text-3xl font-extrabold text-rose-400 mt-2">{tierCounts.UNSAFE || 0}</div>
          <div className="text-slate-400 text-xs mt-1">{totalPacks > 0 ? ((tierCounts.UNSAFE || 0) / totalPacks * 100).toFixed(1) : 0}% of fleet</div>
        </div>
      </div>
    </div>
  );
};
