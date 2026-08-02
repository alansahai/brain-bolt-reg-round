import React from "react";
import type { AllocationResponse } from "../api/client";
import { CheckCircle2, XCircle, Brain } from "lucide-react";
import { RiskBadge } from "./RiskBadge";

interface Props {
  res: AllocationResponse | null;
  onExplain?: (requestId: string) => void;
  selectedRequestId?: string | null;
}

/**
 * Battery Intelligence Platform — Final Allocation table.
 *
 * Shows the single result of the layered pipeline (Engineering Validation ->
 * Battery Intelligence Engine -> Recommendation -> Graph Optimization),
 * with Risk Index and the Maintenance Recommendation shown per assignment —
 * always alongside, never merged into, the Suitability Score.
 */
export const AllocationTable: React.FC<Props> = ({ res, onExplain, selectedRequestId }) => {
  if (!res) {
    return <div className="text-slate-400 p-8 text-center">Loading allocation data...</div>;
  }

  const { result, kpis, verification } = res;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-800/80 border border-slate-700/80 p-4 rounded">
        <div>
          <h3 className="text-sm font-bold text-white">{result.allocator_name}</h3>
          <p className="text-slate-400 text-[11px] mt-0.5">Final allocation — Graph Optimization stage output</p>
        </div>
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-semibold border ${
            verification.all_passed
              ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-300"
              : "bg-rose-950/60 border-rose-800/80 text-rose-300"
          }`}
        >
          {verification.all_passed ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
          <span>Verification Rules 1-5: {verification.all_passed ? "ALL PASSED" : "FAILED"}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="text-slate-400 text-[11px] font-semibold uppercase">Vehicles Served</div>
          <div className="text-2xl font-extrabold text-white mt-1">
            {kpis.served_vehicles} / {result.total_vehicles}
          </div>
        </div>
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="text-slate-400 text-[11px] font-semibold uppercase">High & Critical Served</div>
          <div className="text-2xl font-extrabold text-cyan-400 mt-1">{kpis.high_critical_served_pct.toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="text-slate-400 text-[11px] font-semibold uppercase">Unsafe Allocations</div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">{kpis.unsafe_allocations}</div>
        </div>
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="text-slate-400 text-[11px] font-semibold uppercase">Avg SoH Allocated</div>
          <div className="text-2xl font-extrabold text-indigo-400 mt-1">{kpis.avg_soh_allocated.toFixed(2)}%</div>
        </div>
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="text-slate-400 text-[11px] font-semibold uppercase">Avg Suitability</div>
          <div className="text-2xl font-extrabold text-purple-400 mt-1">{kpis.avg_suitability_allocated.toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-slate-800/80 border border-slate-700/80 rounded overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider text-[11px] sticky top-0">
              <tr>
                <th className="px-4 py-3">Step</th>
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Assigned Battery</th>
                <th className="px-4 py-3">SoC</th>
                <th className="px-4 py-3">SoH</th>
                <th className="px-4 py-3">Suitability</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Recommended Action</th>
                {onExplain && <th className="px-4 py-3">Explain</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {result.assignments.map((a) => (
                <tr
                  key={a.request_id}
                  className={`hover:bg-slate-700/20 ${selectedRequestId === a.request_id ? "bg-indigo-950/40" : ""}`}
                >
                  <td className="px-4 py-3 text-slate-400">{a.assigned_at_step}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-white">{a.request_id}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-sm text-[10px] font-bold ${
                        a.priority === "Critical"
                          ? "bg-rose-950 text-rose-400 border border-rose-800/50"
                          : a.priority === "High"
                          ? "bg-amber-950 text-amber-400 border border-amber-800/50"
                          : "bg-slate-800 text-slate-300 border border-slate-700"
                      }`}
                    >
                      {a.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-cyan-300 font-semibold">{a.battery_id}</td>
                  <td className="px-4 py-3 font-medium">{a.battery_soc.toFixed(1)}%</td>
                  <td className="px-4 py-3 font-medium">{a.battery_soh.toFixed(1)}%</td>
                  <td className="px-4 py-3 font-mono text-white">{a.battery_suitability_score.toFixed(1)}</td>
                  <td className="px-4 py-3">
                    {a.risk_index != null ? <RiskBadge riskIndex={a.risk_index} riskBand={a.risk_band ?? undefined} compact /> : "—"}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-300">{a.recommended_action ?? "—"}</td>
                  {onExplain && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onExplain(a.request_id)}
                        className={`flex items-center gap-1 px-2.5 py-1 border text-[10px] font-bold rounded-sm transition-all ${
                          selectedRequestId === a.request_id
                            ? "bg-indigo-700 border-indigo-500 text-white"
                            : "bg-indigo-950/60 hover:bg-indigo-900 border-indigo-800/60 text-indigo-300"
                        }`}
                      >
                        <Brain className="w-3 h-3" /> Explain
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
