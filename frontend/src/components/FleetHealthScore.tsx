import React from "react";
import type { FleetHealthResult } from "../api/client";
import { Activity } from "lucide-react";

interface Props {
  fleetHealth: FleetHealthResult;
}

const BAND_STYLES: Record<string, { text: string; bg: string; border: string }> = {
  Excellent: { text: "text-emerald-400", bg: "bg-emerald-950/40", border: "border-emerald-700/60" },
  Good: { text: "text-cyan-400", bg: "bg-cyan-950/40", border: "border-cyan-700/60" },
  Moderate: { text: "text-amber-400", bg: "bg-amber-950/40", border: "border-amber-700/60" },
  Poor: { text: "text-orange-400", bg: "bg-orange-950/40", border: "border-orange-700/60" },
  Critical: { text: "text-rose-400", bg: "bg-rose-950/40", border: "border-rose-700/60" },
};

const COMPONENT_LABELS: Record<string, string> = {
  avg_soh: "Average SoH",
  avg_risk_inverted: "Safety (Inverse Risk)",
  unsafe_pct_inverted: "Safe Fleet %",
  utilization: "Fleet Utilization",
  avg_rul_normalized: "Average RUL",
  avg_suitability: "Average Suitability",
  available_energy_pct: "Available Energy",
  healthy_pct: "Healthy (SAFE) %",
};

export const FleetHealthScore: React.FC<Props> = ({ fleetHealth }) => {
  const style = BAND_STYLES[fleetHealth.band] || BAND_STYLES.Moderate;

  return (
    <div className={`bg-slate-800/80 border ${style.border} rounded p-6 space-y-4`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" /> Fleet Health Score
        </h3>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{fleetHealth.total_packs} packs</span>
      </div>

      <div className="flex items-center gap-6">
        <div className={`${style.bg} border ${style.border} rounded px-6 py-4 text-center shrink-0`}>
          <div className={`text-5xl font-extrabold ${style.text} font-mono leading-none`}>
            {fleetHealth.fleet_health_score.toFixed(0)}%
          </div>
          <div className={`text-xs font-bold uppercase tracking-wider mt-2 ${style.text}`}>{fleetHealth.band}</div>
        </div>

        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(fleetHealth.components).map(([key, value]) => (
            <div key={key} className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-2">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide">{COMPONENT_LABELS[key] || key}</div>
              <div className="text-sm font-mono font-bold text-white mt-0.5">{value.toFixed(0)}%</div>
              <div className="w-full bg-slate-800 h-1 rounded-sm overflow-hidden mt-1">
                <div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">{fleetHealth.methodology}</p>
    </div>
  );
};
