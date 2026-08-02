import React, { useEffect, useState } from "react";
import { fetchScenarioList, runScenarioSimulation } from "../api/client";
import type { ScenarioResult } from "../api/client";
import { FlaskConical, PlayCircle, ArrowRightLeft, TrendingUp, TrendingDown } from "lucide-react";

const SCENARIO_PARAM_FIELDS: Record<string, { key: string; label: string; default: number }[]> = {
  battery_failure: [{ key: "count", label: "Batteries that fail", default: 10 }],
  demand_surge: [{ key: "count", label: "New vehicle requests", default: 20 }],
  temperature_spike: [{ key: "target_c", label: "Target ambient temperature (°C)", default: 45 }],
  degradation_increase: [{ key: "increase_pct", label: "Degradation rate increase (%)", default: 10 }],
  critical_demand_double: [],
  lower_soh_threshold: [{ key: "delta", label: "Change to Unsafe SoH cutoff (%, negative = lower)", default: -10 }],
  custom_weights: [],
};

function Delta({ before, after, higherIsBetter = true }: { before: number; after: number; higherIsBetter?: boolean }) {
  const diff = after - before;
  const good = higherIsBetter ? diff >= 0 : diff <= 0;
  const Icon = diff === 0 ? null : diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`ml-1.5 inline-flex items-center text-[11px] font-mono font-bold ${diff === 0 ? "text-slate-500" : good ? "text-emerald-400" : "text-rose-400"}`}>
      {Icon && <Icon className="w-3 h-3 mr-0.5" />}
      {diff >= 0 ? "+" : ""}{diff.toFixed(1)}
    </span>
  );
}

export const ScenarioSimulator: React.FC = () => {
  const [scenarios, setScenarios] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>("battery_failure");
  const [params, setParams] = useState<Record<string, number>>({ count: 10 });
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchScenarioList().then((d) => setScenarios(d.scenarios));
  }, []);

  useEffect(() => {
    const fields = SCENARIO_PARAM_FIELDS[selected] || [];
    const defaults: Record<string, number> = {};
    fields.forEach((f) => (defaults[f.key] = f.default));
    setParams(defaults);
  }, [selected]);

  const handleRun = async () => {
    setLoading(true);
    try {
      const res = await runScenarioSimulation(selected, params);
      setResult(res);
    } catch (err) {
      console.error("Scenario simulation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const fields = SCENARIO_PARAM_FIELDS[selected] || [];

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
        <h1 className="text-lg font-extrabold text-white flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-cyan-400" /> What-If Scenario Simulator
        </h1>
        <p className="text-slate-400 text-xs mt-1">
          Simulate a fleet or demand event and rerun the full Battery Intelligence Platform pipeline. Nothing here
          touches the live dataset or config.yaml — every run is a pure before/after comparison.
        </p>
      </div>

      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {Object.entries(scenarios).map(([key, desc]) => (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`text-left p-3 rounded-sm border transition-colors ${
                selected === key ? "border-cyan-500 bg-cyan-950/40" : "border-slate-700 bg-slate-900/60 hover:border-slate-600"
              }`}
            >
              <div className="text-xs font-bold text-white capitalize">{key.replace(/_/g, " ")}</div>
              <div className="text-[10px] text-slate-400 mt-1 leading-snug">{desc}</div>
            </button>
          ))}
        </div>

        {fields.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-900/50 p-3 rounded-sm border border-slate-700/50">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">{f.label}</label>
                <input
                  type="number"
                  value={params[f.key] ?? f.default}
                  onChange={(e) => setParams({ ...params, [f.key]: parseFloat(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-sm p-2 text-xs font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleRun}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-700 hover:bg-cyan-600 border border-cyan-600 text-white text-xs font-bold uppercase tracking-wide transition-colors"
        >
          <PlayCircle className="w-4 h-4" /> {loading ? "Running Scenario..." : "Run Scenario"}
        </button>
      </div>

      {result && (
        <div className="space-y-6">
          <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4 text-xs text-slate-300">
            <span className="font-bold text-white">{result.scenario_description}</span>
            {Object.keys(result.scenario_meta).length > 0 && (
              <span className="ml-2 text-slate-400">
                ({Object.entries(result.scenario_meta).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ")})
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(["before", "after"] as const).map((phase) => {
              const snap = result[phase];
              const other = phase === "before" ? result.after : result.before;
              return (
                <div key={phase} className={`bg-slate-800/80 border rounded p-5 space-y-3 ${phase === "after" ? "border-cyan-700/60" : "border-slate-700/80"}`}>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-cyan-400" /> {phase}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-900/60 p-2 rounded-sm border border-slate-700/50">
                      <div className="text-[10px] text-slate-400 uppercase">Vehicles Served</div>
                      <div className="font-mono font-bold text-white text-base">
                        {snap.kpis.served_vehicles}
                        {phase === "after" && <Delta before={other.kpis.served_vehicles} after={snap.kpis.served_vehicles} />}
                      </div>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded-sm border border-slate-700/50">
                      <div className="text-[10px] text-slate-400 uppercase">Unsafe Allocations</div>
                      <div className="font-mono font-bold text-white text-base">{snap.kpis.unsafe_allocations}</div>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded-sm border border-slate-700/50">
                      <div className="text-[10px] text-slate-400 uppercase">Priority Coverage</div>
                      <div className="font-mono font-bold text-white text-base">
                        {snap.kpis.high_critical_served_pct.toFixed(0)}%
                        {phase === "after" && <Delta before={other.kpis.high_critical_served_pct} after={snap.kpis.high_critical_served_pct} />}
                      </div>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded-sm border border-slate-700/50">
                      <div className="text-[10px] text-slate-400 uppercase">Avg SoH</div>
                      <div className="font-mono font-bold text-white text-base">
                        {snap.kpis.avg_soh_allocated.toFixed(1)}%
                        {phase === "after" && <Delta before={other.kpis.avg_soh_allocated} after={snap.kpis.avg_soh_allocated} />}
                      </div>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded-sm border border-slate-700/50">
                      <div className="text-[10px] text-slate-400 uppercase">Fleet Health</div>
                      <div className="font-mono font-bold text-white text-base">
                        {snap.fleet_health.fleet_health_score.toFixed(0)}% ({snap.fleet_health.band})
                        {phase === "after" && <Delta before={other.fleet_health.fleet_health_score} after={snap.fleet_health.fleet_health_score} />}
                      </div>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded-sm border border-slate-700/50">
                      <div className="text-[10px] text-slate-400 uppercase">Multi-Objective Score</div>
                      <div className="font-mono font-bold text-white text-base">
                        {snap.multi_objective.multi_objective_score.toFixed(1)}
                        {phase === "after" && <Delta before={other.multi_objective.multi_objective_score} after={snap.multi_objective.multi_objective_score} />}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
            <h3 className="text-sm font-bold text-white mb-3">Allocation Changes</h3>
            <div className="grid grid-cols-3 gap-3 mb-3 text-center">
              <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-sm p-2">
                <div className="text-2xl font-mono font-extrabold text-emerald-400">{result.allocation_changes.newly_served_count}</div>
                <div className="text-[10px] text-slate-400 uppercase">Newly Served</div>
              </div>
              <div className="bg-rose-950/40 border border-rose-800/50 rounded-sm p-2">
                <div className="text-2xl font-mono font-extrabold text-rose-400">{result.allocation_changes.newly_unserved_count}</div>
                <div className="text-[10px] text-slate-400 uppercase">Newly Unserved</div>
              </div>
              <div className="bg-amber-950/40 border border-amber-800/50 rounded-sm p-2">
                <div className="text-2xl font-mono font-extrabold text-amber-400">{result.allocation_changes.reassigned_count}</div>
                <div className="text-[10px] text-slate-400 uppercase">Reassigned</div>
              </div>
            </div>
            {result.allocation_changes.newly_unserved.length > 0 && (
              <p className="text-[11px] text-slate-400">
                Newly unserved requests: <span className="font-mono text-rose-300">{result.allocation_changes.newly_unserved.join(", ")}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
