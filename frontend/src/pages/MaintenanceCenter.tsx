import React, { useEffect, useState } from "react";
import { fetchMaintenanceRecommendations } from "../api/client";
import type { MaintenanceRecommendationsBatch, MaintenanceRecommendation } from "../api/client";
import { RiskBadge } from "../components/RiskBadge";
import { Wrench, Filter } from "lucide-react";

const PRIORITY_STYLES: Record<string, string> = {
  Critical: "bg-rose-950 text-rose-300 border-rose-800/60",
  High: "bg-amber-950 text-amber-300 border-amber-800/60",
  Medium: "bg-cyan-950 text-cyan-300 border-cyan-800/60",
  Low: "bg-emerald-950 text-emerald-300 border-emerald-800/60",
};

export const MaintenanceCenter: React.FC = () => {
  const [data, setData] = useState<MaintenanceRecommendationsBatch | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMaintenanceRecommendations()
      .then(setData)
      .catch((err) => console.error("Failed to load maintenance recommendations:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <div className="text-slate-300 font-semibold text-xs">Generating fleet-wide maintenance recommendations...</div>
      </div>
    );
  }

  const filtered: MaintenanceRecommendation[] =
    priorityFilter === "ALL" ? data.recommendations : data.recommendations.filter((r) => r.priority === priorityFilter);

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
        <h1 className="text-lg font-extrabold text-white flex items-center gap-2">
          <Wrench className="w-5 h-5 text-cyan-400" /> Maintenance Center
        </h1>
        <p className="text-slate-400 text-xs mt-1">
          Fleet-wide maintenance recommendations from the AI Maintenance Recommendation Engine, sorted by priority.
          Every recommendation explains why — see the Reasons column.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(data.action_counts).map(([action, count]) => (
          <div key={action} className="bg-slate-800/80 border border-slate-700/80 rounded p-3">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">{action}</div>
            <div className="text-2xl font-extrabold text-white mt-1 font-mono">{count}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 bg-slate-800/50 p-3 rounded border border-slate-700/50">
        <Filter className="w-4 h-4 text-slate-400" />
        <span className="text-xs text-slate-300 font-medium">Priority:</span>
        {["ALL", "Critical", "High", "Medium", "Low"].map((p) => (
          <button
            key={p}
            onClick={() => setPriorityFilter(p)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-sm transition-all ${
              priorityFilter === p ? "bg-cyan-600 text-white" : "bg-slate-700/50 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {p}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-500">{filtered.length} of {data.count} packs</span>
      </div>

      <div className="bg-slate-800/80 border border-slate-700/80 rounded overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider text-[11px] sticky top-0">
              <tr>
                <th className="px-4 py-3">Battery ID</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Recommended Action</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Inspection Interval</th>
                <th className="px-4 py-3">Est. Remaining Service</th>
                <th className="px-4 py-3">Reasons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filtered.map((r) => (
                <tr key={r.battery_id} className="hover:bg-slate-700/20 align-top">
                  <td className="px-4 py-3 font-mono text-cyan-300 font-semibold whitespace-nowrap">{r.battery_id}</td>
                  <td className="px-4 py-3"><RiskBadge riskIndex={r.risk_index} riskBand={r.risk_band} /></td>
                  <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">{r.recommended_action}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border uppercase ${PRIORITY_STYLES[r.priority]}`}>
                      {r.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.recommended_inspection_interval_days} day(s)</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.estimated_remaining_service_time_days !== null ? `${r.estimated_remaining_service_time_days.toFixed(0)} days` : "—"}
                  </td>
                  <td className="px-4 py-3 min-w-[280px]">
                    <ul className="space-y-0.5">
                      {r.reasons.map((reason, i) => (
                        <li key={i} className="text-[11px] text-slate-400 flex gap-1">
                          <span className="shrink-0">&bull;</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
