import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ComparisonResponse } from "../api/client";
import { ArrowRight, GitBranch } from "lucide-react";
import { FleetHealthScore } from "./FleetHealthScore";

interface Props {
  comparison: ComparisonResponse | null;
}

/**
 * Method Comparison: Highest-SoC-First (naive baseline) vs the Battery
 * Intelligence Platform (Engineering Validation -> Battery Intelligence
 * Engine -> Recommendation -> Graph Optimization).
 *
 * This is deliberately a 2-way comparison, not the earlier 4-way "Rule-Based
 * vs Graph vs ML" framing — the Battery Intelligence Engine (ML Suitability +
 * Risk + RUL) is an enrichment stage feeding the platform's single final
 * allocator (Graph Optimization), not an alternative to choose between. See
 * backend/src/pipeline.py.
 */
export const ComparisonCharts: React.FC<Props> = ({ comparison }) => {
  if (!comparison) {
    return <div className="text-slate-400 p-8 text-center">Loading comparison charts...</div>;
  }

  const { baseline, battery_intelligence } = comparison.comparison;
  const mo = comparison.multi_objective_comparison;

  const kpiData = [
    { metric: "Average SoH Allocated (%)", Baseline: baseline.avg_soh_allocated, "Battery Intelligence Platform": battery_intelligence.avg_soh_allocated },
    { metric: "Avg Suitability Score (0-100)", Baseline: baseline.avg_suitability_allocated, "Battery Intelligence Platform": battery_intelligence.avg_suitability_allocated },
    { metric: "High & Critical Served (%)", Baseline: baseline.high_critical_served_pct, "Battery Intelligence Platform": battery_intelligence.high_critical_served_pct },
  ];

  const multiObjectiveData = [
    { method: "Baseline", score: mo.baseline.multi_objective_score, fill: "#F59E0B" },
    { method: "Battery Intelligence Platform", score: mo.battery_intelligence.multi_objective_score, fill: "#1C8F93" },
  ];

  return (
    <div className="space-y-6">
      {/* Decision Pipeline */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <GitBranch className="w-4 h-4 text-cyan-400" /> Layered Decision Pipeline
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {comparison.pipeline_stages.map((stage, idx) => (
            <React.Fragment key={stage}>
              <span className="px-2.5 py-1.5 bg-slate-900/70 border border-slate-700/60 rounded-sm text-[11px] font-semibold text-slate-200 whitespace-nowrap">
                {stage}
              </span>
              {idx < comparison.pipeline_stages.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
            </React.Fragment>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          The Battery Intelligence Engine (ML Suitability, Future Health, RUL, Risk Features) does not compete with
          Graph Optimization — it enriches every battery with intelligence signals that Graph Optimization consumes
          to compute the single globally-optimal assignment.
        </p>
      </div>

      <FleetHealthScore fleetHealth={comparison.fleet_health} />

      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-white">Method Comparison</h3>
            <p className="text-slate-400 text-xs mt-1">Highest-SoC-First vs the Battery Intelligence Platform</p>
          </div>
          <div className="flex gap-4 text-xs font-semibold flex-wrap">
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-3 h-3 bg-amber-500 rounded-sm inline-block" /> Baseline
            </span>
            <span className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-3 h-3 bg-cyan-500 rounded-sm inline-block" /> Battery Intelligence Platform
            </span>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={kpiData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="metric" stroke="#94A3B8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94A3B8" domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", borderRadius: "4px", color: "#F8FAFC" }} />
              <Bar dataKey="Baseline" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Battery Intelligence Platform" fill="#1C8F93" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6">
        <h4 className="text-sm font-bold text-white mb-1">Multi-Objective Allocation Score (0-100)</h4>
        <p className="text-slate-400 text-xs mb-4">
          Weighted-sum of 8 configurable objectives (served vehicles, priority coverage, health, suitability,
          unsafe/wait/fairness penalties, forward degradation) &mdash; see config.yaml: <code>multi_objective</code>.
        </p>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={multiObjectiveData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="method" stroke="#94A3B8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94A3B8" domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {multiObjectiveData.map((entry) => (
                  <Cell key={entry.method} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6">
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wider text-slate-300">
          Quantitative Output Comparison Matrix
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Mandatory Metric</th>
                <th className="px-4 py-3">Baseline (Highest-SoC)</th>
                <th className="px-4 py-3">Battery Intelligence Platform</th>
                <th className="px-4 py-3">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              <tr>
                <td className="px-4 py-3 font-semibold text-white">Vehicles Served</td>
                <td className="px-4 py-3">{baseline.served_vehicles} / {baseline.served_vehicles + baseline.unserved_vehicles}</td>
                <td className="px-4 py-3 font-bold text-cyan-400">{battery_intelligence.served_vehicles} / {battery_intelligence.served_vehicles + battery_intelligence.unserved_vehicles}</td>
                <td className="px-4 py-3 text-emerald-400 font-semibold">
                  {battery_intelligence.served_vehicles - baseline.served_vehicles >= 0 ? "+" : ""}
                  {battery_intelligence.served_vehicles - baseline.served_vehicles} vehicles
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-white">% High & Critical Served</td>
                <td className="px-4 py-3">{baseline.high_critical_served_pct.toFixed(1)}%</td>
                <td className="px-4 py-3 font-bold text-cyan-400">{battery_intelligence.high_critical_served_pct.toFixed(1)}%</td>
                <td className="px-4 py-3 text-emerald-400 font-semibold">
                  {(battery_intelligence.high_critical_served_pct - baseline.high_critical_served_pct).toFixed(1)} pts
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-white">Unsafe Battery Allocations</td>
                <td className="px-4 py-3 font-bold text-emerald-400">{baseline.unsafe_allocations}</td>
                <td className="px-4 py-3 font-bold text-emerald-400">{battery_intelligence.unsafe_allocations}</td>
                <td className="px-4 py-3 text-emerald-400 font-semibold">0 violations</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-white">Average SoH Allocated (%)</td>
                <td className="px-4 py-3">{baseline.avg_soh_allocated.toFixed(2)}%</td>
                <td className="px-4 py-3 font-bold text-cyan-400">{battery_intelligence.avg_soh_allocated.toFixed(2)}%</td>
                <td className="px-4 py-3 text-emerald-400 font-semibold">
                  +{(battery_intelligence.avg_soh_allocated - baseline.avg_soh_allocated).toFixed(2)}%
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-white">Avg Battery Suitability Score</td>
                <td className="px-4 py-3">{baseline.avg_suitability_allocated.toFixed(2)}</td>
                <td className="px-4 py-3 font-bold text-cyan-400">{battery_intelligence.avg_suitability_allocated.toFixed(2)}</td>
                <td className="px-4 py-3 text-emerald-400 font-semibold">
                  +{(battery_intelligence.avg_suitability_allocated - baseline.avg_suitability_allocated).toFixed(2)} pts
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-white">Multi-Objective Score (0-100)</td>
                <td className="px-4 py-3">{mo.baseline.multi_objective_score.toFixed(1)}</td>
                <td className="px-4 py-3 font-bold text-cyan-400">{mo.battery_intelligence.multi_objective_score.toFixed(1)}</td>
                <td className="px-4 py-3 text-emerald-400 font-semibold">
                  +{(mo.battery_intelligence.multi_objective_score - mo.baseline.multi_objective_score).toFixed(1)} pts
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
