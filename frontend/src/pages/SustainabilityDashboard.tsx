import React, { useEffect, useState } from "react";
import { fetchSustainabilityKpis } from "../api/client";
import type { SustainabilityKPIs } from "../api/client";
import { Leaf, ShieldCheck, Zap, Recycle, DollarSign, TrendingUp, Battery, AlertTriangle, RotateCw } from "lucide-react";

/**
 * Sustainability Dashboard — business-level KPIs comparing the Battery
 * Intelligence Platform's allocation against the naive Highest-SoC-First
 * baseline. Every figure is derived from disclosed assumption constants
 * (config.yaml: sustainability) — the CO2 estimate in particular is always
 * rendered with its full derivation and an explicit "not a certified LCA"
 * disclaimer, never as a bare number.
 */
export const SustainabilityDashboard: React.FC = () => {
  const [kpis, setKpis] = useState<SustainabilityKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timeoutId = setTimeout(() => {
      if (!cancelled) setError("Request timed out after 20s.");
    }, 20000);

    fetchSustainabilityKpis()
      .then((d) => {
        if (!cancelled) setKpis(d.sustainability);
      })
      .catch((err) => {
        console.error("Failed to load sustainability KPIs:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load Sustainability KPIs.");
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [attempt]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <AlertTriangle className="w-8 h-8 text-rose-400" />
        <div className="text-rose-300 font-semibold text-sm">Failed to load Sustainability Dashboard</div>
        <div className="text-slate-500 text-xs">{error}</div>
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-sm"
        >
          <RotateCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (loading || !kpis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <div className="text-slate-300 font-semibold text-xs">Computing sustainability impact...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
        <h1 className="text-lg font-extrabold text-white flex items-center gap-2">
          <Leaf className="w-5 h-5 text-emerald-400" /> Sustainability Dashboard
        </h1>
        <p className="text-slate-400 text-xs mt-1 leading-relaxed">{kpis.methodology}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-semibold uppercase">
            <Battery className="w-4 h-4 text-cyan-400" /> Estimated Battery Life Extended
          </div>
          <div className="text-3xl font-extrabold text-white mt-2 font-mono">
            {kpis.estimated_battery_life_extended.avg_cycles_per_battery.toLocaleString()} cycles
          </div>
          <div className="text-slate-400 text-xs mt-1">
            Avg per battery &middot; {kpis.estimated_battery_life_extended.fleet_total_cycles.toLocaleString()} cycles fleet-wide
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-semibold uppercase">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Unsafe Allocations Prevented
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 mt-2 font-mono">{kpis.unsafe_allocations_prevented}</div>
          <div className="text-slate-400 text-xs mt-1">High/Critical-risk packs avoided vs. baseline</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-semibold uppercase">
            <Zap className="w-4 h-4 text-amber-400" /> Energy Utilization Efficiency
          </div>
          <div className="text-3xl font-extrabold text-amber-400 mt-2 font-mono">{kpis.energy_utilization_efficiency_pct.toFixed(1)}%</div>
          <div className="text-slate-400 text-xs mt-1">Right-sizing of allocated energy margin</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-semibold uppercase">
            <Recycle className="w-4 h-4 text-cyan-400" /> Replacements Avoided
          </div>
          <div className="text-3xl font-extrabold text-white mt-2 font-mono">{kpis.estimated_battery_replacements_avoided}</div>
          <div className="text-slate-400 text-xs mt-1">Packs steered away from imminent replacement</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-semibold uppercase">
            <DollarSign className="w-4 h-4 text-emerald-400" /> Maintenance Savings
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 mt-2 font-mono">
            ${kpis.estimated_maintenance_savings_usd.toLocaleString()}
          </div>
          <div className="text-slate-400 text-xs mt-1">
            @ ${kpis.assumptions.avg_maintenance_event_cost_usd}/event (disclosed assumption)
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-semibold uppercase">
            <TrendingUp className="w-4 h-4 text-cyan-400" /> Fleet Utilization Improvement
          </div>
          <div className="text-3xl font-extrabold text-white mt-2 font-mono">
            {kpis.estimated_fleet_utilization_improvement_pct >= 0 ? "+" : ""}
            {kpis.estimated_fleet_utilization_improvement_pct.toFixed(1)}%
          </div>
          <div className="text-slate-400 text-xs mt-1">
            SoH +{kpis.avg_soh_improvement_pct.toFixed(1)}% &middot; Suitability +{kpis.avg_suitability_improvement_pts.toFixed(1)} pts
          </div>
        </div>
      </div>

      {/* CO2 Estimate — always shown with full derivation + disclaimer */}
      <div className="bg-slate-800/80 border border-amber-700/50 rounded p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Leaf className="w-4 h-4 text-emerald-400" /> Estimated CO&#8322; Reduction
          </h3>
          <span className="px-2.5 py-1 bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[10px] font-bold uppercase rounded-sm flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Estimate — Not a Certified LCA
          </span>
        </div>
        <div className="text-4xl font-extrabold text-emerald-400 font-mono">
          {kpis.estimated_co2_reduction_kg.value_kg.toLocaleString()} kg CO&#8322;e
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{kpis.estimated_co2_reduction_kg.disclaimer}</p>
      </div>

      {/* Disclosed assumptions */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
        <h3 className="text-sm font-bold text-white mb-3">Disclosed Assumptions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {Object.entries(kpis.assumptions).map(([key, value]) => (
            <div key={key} className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">{key.replace(/_/g, " ")}</div>
              <div className="font-mono font-bold text-white mt-1">{value.toLocaleString()}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Every KPI on this page can be traced back to these constants (config.yaml: <code>sustainability</code>) — nothing
          is a hidden multiplier.
        </p>
      </div>
    </div>
  );
};
