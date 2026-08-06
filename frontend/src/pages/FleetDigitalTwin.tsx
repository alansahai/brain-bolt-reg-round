import React, { useEffect, useState } from "react";
import { fetchFleetDigitalTwin } from "../api/client";
import type { FleetDigitalTwin as FleetDigitalTwinData } from "../api/client";
import { FleetHealthScore } from "../components/FleetHealthScore";
import { RiskBadge } from "../components/RiskBadge";
import { Boxes, Zap, Users, Battery, Gauge, TrendingUp, TrendingDown, Info, AlertTriangle, RotateCw } from "lucide-react";

/**
 * Fleet Digital Twin — station-wide software twin.
 *
 * Distinct from the per-battery Digital Twin (Digital Twin nav page): that
 * page answers "what will happen to THIS pack?"; this page answers "what
 * will happen to the STATION?" — aggregate health, utilization, queueing,
 * charging capacity, and a fleet-wide future-capacity projection.
 */
export const FleetDigitalTwin: React.FC = () => {
  const [twin, setTwin] = useState<FleetDigitalTwinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // A hung/never-settling request must not leave the page spinning forever
    // — this was the actual mechanism behind the "infinite loading" report:
    // .catch() only logged to console, so a failed or stalled fetch left
    // `twin` null and the `loading || !twin` guard below true permanently.
    const timeoutId = setTimeout(() => {
      if (!cancelled) setError("Request timed out after 20s.");
    }, 20000);

    fetchFleetDigitalTwin()
      .then((d) => {
        if (!cancelled) setTwin(d.fleet_digital_twin);
      })
      .catch((err) => {
        console.error("Failed to load fleet digital twin:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load Fleet Digital Twin.");
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
        <div className="text-rose-300 font-semibold text-sm">Failed to load Fleet Digital Twin</div>
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

  if (loading || !twin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <div className="text-slate-300 font-semibold text-xs">Building the Fleet Digital Twin...</div>
      </div>
    );
  }

  const capacityChange = twin.future_capacity_prediction.change_pct;
  const ChangeIcon = capacityChange !== null && capacityChange < 0 ? TrendingDown : TrendingUp;

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
        <h1 className="text-lg font-extrabold text-white flex items-center gap-2">
          <Boxes className="w-5 h-5 text-cyan-400" /> Fleet Digital Twin
        </h1>
        <p className="text-slate-400 text-xs mt-1 leading-relaxed">
          A station-wide software twin, aggregated from every battery's own twin. The per-battery{" "}
          <strong className="text-slate-300">Digital Twin</strong> page answers "what will happen to THIS pack?";
          this page answers <strong className="text-slate-300">"what will happen to the STATION?"</strong>
        </p>
      </div>

      <FleetHealthScore fleetHealth={twin.fleet_health} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-semibold uppercase">
            <Gauge className="w-4 h-4 text-cyan-400" /> Current Utilization
          </div>
          <div className="text-3xl font-extrabold text-white mt-2 font-mono">{twin.current_utilization_pct.toFixed(1)}%</div>
          <div className="text-slate-400 text-xs mt-1">Of deployable fleet currently ASSIGNED</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-semibold uppercase">
            <Users className="w-4 h-4 text-amber-400" /> Peak Demand
          </div>
          <div className="text-3xl font-extrabold text-amber-400 mt-2 font-mono">{twin.peak_demand_concurrent_vehicles}</div>
          <div className="text-slate-400 text-xs mt-1">Max concurrent vehicles queued/served</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-semibold uppercase">
            <RiskBadge riskIndex={twin.average_risk_index} compact /> Average Risk
          </div>
          <div className="text-3xl font-extrabold text-white mt-2 font-mono">{twin.average_risk_index.toFixed(0)}</div>
          <div className="text-slate-400 text-xs mt-1">Fleet-wide mean Risk Index</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Battery Availability */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Battery className="w-4 h-4 text-cyan-400" /> Battery Availability
          </h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-sm p-2">
              <div className="text-xl font-mono font-extrabold text-emerald-400">{twin.battery_availability.safe}</div>
              <div className="text-[10px] text-slate-400 uppercase">Safe</div>
            </div>
            <div className="bg-amber-950/40 border border-amber-800/50 rounded-sm p-2">
              <div className="text-xl font-mono font-extrabold text-amber-400">{twin.battery_availability.degraded}</div>
              <div className="text-[10px] text-slate-400 uppercase">Degraded</div>
            </div>
            <div className="bg-rose-950/40 border border-rose-800/50 rounded-sm p-2">
              <div className="text-xl font-mono font-extrabold text-rose-400">{twin.battery_availability.unsafe}</div>
              <div className="text-[10px] text-slate-400 uppercase">Unsafe</div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            Deployable: <span className="font-mono text-white">{twin.battery_availability.deployable}</span> / {twin.battery_availability.total}
          </div>
          <div className="text-[11px] text-slate-400">
            Average RUL: <span className="font-mono text-white">{twin.average_rul_cycles ?? "—"} cycles</span>
          </div>
        </div>

        {/* Charging Capacity */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> Charging Capacity
          </h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-400">Installed Capacity</span><span className="font-mono font-semibold text-white">{twin.charging_capacity.installed_capacity_kwh.toFixed(1)} kWh</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Currently Available</span><span className="font-mono font-semibold text-white">{twin.charging_capacity.currently_available_kwh.toFixed(1)} kWh</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Deployable Available</span><span className="font-mono font-semibold text-white">{twin.charging_capacity.deployable_available_kwh.toFixed(1)} kWh</span></div>
          </div>
          <div className="pt-2 border-t border-slate-700/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Predicted Future Capacity (+{twin.future_capacity_prediction.projection_horizon_cycles} cycles)</span>
              <span className={`font-mono font-bold flex items-center gap-1 ${capacityChange !== null && capacityChange < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                <ChangeIcon className="w-3.5 h-3.5" />
                {twin.future_capacity_prediction.predicted_available_kwh?.toFixed(1) ?? "—"} kWh ({capacityChange?.toFixed(1) ?? 0}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Charging Queue */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400" /> Charging Queue
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-3">
            <div className="text-xl font-mono font-extrabold text-white">{twin.charging_queue.total_vehicles_simulated}</div>
            <div className="text-[10px] text-slate-400 uppercase mt-1">Simulated Requests</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-3">
            <div className="text-xl font-mono font-extrabold text-white">{twin.charging_queue.avg_wait_time_min.toFixed(1)}m</div>
            <div className="text-[10px] text-slate-400 uppercase mt-1">Avg Wait</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-3">
            <div className="text-xl font-mono font-extrabold text-white">{twin.charging_queue.max_wait_time_min.toFixed(1)}m</div>
            <div className="text-[10px] text-slate-400 uppercase mt-1">Max Wait</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-sm p-3">
            <div className="text-xl font-mono font-extrabold text-amber-400">{twin.charging_queue.timeout_count}</div>
            <div className="text-[10px] text-slate-400 uppercase mt-1">Timeouts</div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-indigo-950/30 border border-indigo-800/40 rounded-sm p-3 text-[11px] text-slate-300">
        <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
        <span>{twin.methodology}</span>
      </div>
    </div>
  );
};
