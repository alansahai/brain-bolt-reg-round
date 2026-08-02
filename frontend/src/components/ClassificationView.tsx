import React, { useState } from "react";
import type { BatteryRecord, RiskIndexResult } from "../api/client";
import { ShieldCheck, AlertTriangle, XCircle, Search, Filter, Cpu } from "lucide-react";

interface Props {
  batteries: BatteryRecord[];
  tierCounts: { SAFE?: number; DEGRADED?: number; UNSAFE?: number };
  onViewDetails?: (batteryId: string) => void;
  riskByBatteryId?: Record<string, RiskIndexResult>;
}

const RISK_BAND_COLORS: Record<string, string> = {
  LOW: "text-emerald-400",
  MEDIUM: "text-amber-400",
  HIGH: "text-orange-400",
  CRITICAL: "text-rose-400",
};

export const ClassificationView: React.FC<Props> = ({ batteries, tierCounts, onViewDetails, riskByBatteryId }) => {
  const [filterTier, setFilterTier] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  const filtered = batteries.filter((b) => {
    const matchesTier = filterTier === "ALL" || b.tier === filterTier;
    const matchesSearch =
      b.battery_id.toLowerCase().includes(search.toLowerCase()) ||
      b.chemistry.toLowerCase().includes(search.toLowerCase()) ||
      b.station_status.toLowerCase().includes(search.toLowerCase());
    return matchesTier && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Tier Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Fleet Size</div>
          <div className="text-3xl font-extrabold text-white mt-2">{batteries.length} Packs</div>
          <div className="text-slate-400 text-xs mt-1">200-pack Light EV Fleet</div>
        </div>

        <div
          onClick={() => setFilterTier("SAFE")}
          className={`cursor-pointer bg-slate-800/80 border transition-all rounded p-5 ${
            filterTier === "SAFE" ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-slate-700/80 hover:border-emerald-500/50"
          }`}
        >
          <div className="flex justify-between items-center">
            <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">Safe & Available</span>
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 mt-2">{tierCounts.SAFE || 0}</div>
          <div className="text-slate-400 text-xs mt-1">49.0% of fleet (<span className="text-emerald-300">Safe band</span>)</div>
        </div>

        <div
          onClick={() => setFilterTier("DEGRADED")}
          className={`cursor-pointer bg-slate-800/80 border transition-all rounded p-5 ${
            filterTier === "DEGRADED" ? "border-amber-500 ring-2 ring-amber-500/20" : "border-slate-700/80 hover:border-amber-500/50"
          }`}
        >
          <div className="flex justify-between items-center">
            <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Degraded but Usable</span>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-amber-400 mt-2">{tierCounts.DEGRADED || 0}</div>
          <div className="text-slate-400 text-xs mt-1">30.5% of fleet (&ge;2 soft flags)</div>
        </div>

        <div
          onClick={() => setFilterTier("UNSAFE")}
          className={`cursor-pointer bg-slate-800/80 border transition-all rounded p-5 ${
            filterTier === "UNSAFE" ? "border-rose-500 ring-2 ring-rose-500/20" : "border-slate-700/80 hover:border-rose-500/50"
          }`}
        >
          <div className="flex justify-between items-center">
            <span className="text-rose-400 text-xs font-semibold uppercase tracking-wider">Unsafe / Quarantined</span>
            <XCircle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="text-3xl font-extrabold text-rose-400 mt-2">{tierCounts.UNSAFE || 0}</div>
          <div className="text-slate-400 text-xs mt-1">20.5% of fleet (12 Quarantined + 29 Tail)</div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-800/50 p-4 rounded border border-slate-700/50">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-300 font-medium">Filter Tier:</span>
          {["ALL", "SAFE", "DEGRADED", "UNSAFE"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterTier(t)}
              className={`px-3 py-1 text-xs font-semibold rounded-sm transition-all ${
                filterTier === t
                  ? "bg-cyan-500 text-white shadow"
                  : "bg-slate-700/50 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search Battery ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-xs rounded-sm pl-9 pr-3 py-2 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Battery Data Table */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">Battery ID</th>
                <th className="px-4 py-3">Chemistry</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">SoC (%)</th>
                <th className="px-4 py-3">SoH (%)</th>
                <th className="px-4 py-3">R_int (mΩ)</th>
                <th className="px-4 py-3">V_imb (mV)</th>
                <th className="px-4 py-3">Temp (°C)</th>
                <th className="px-4 py-3">Suitability Score</th>
                {riskByBatteryId && <th className="px-4 py-3">Risk Index</th>}
                {onViewDetails && <th className="px-4 py-3">Details</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filtered.slice(0, 50).map((b) => (
                <tr key={b.battery_id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-cyan-300 font-semibold">{b.battery_id}</td>
                  <td className="px-4 py-3">{b.chemistry}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        b.station_status === "AVAILABLE"
                          ? "bg-slate-700 text-slate-300"
                          : "bg-rose-950/80 text-rose-300 border border-rose-800/50"
                      }`}
                    >
                      {b.station_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-sm text-[10px] font-bold ${
                        b.tier === "SAFE"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                          : b.tier === "DEGRADED"
                          ? "bg-amber-950 text-amber-400 border border-amber-800/50"
                          : "bg-rose-950 text-rose-400 border border-rose-800/50"
                      }`}
                    >
                      {b.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{b.state_of_charge_percent.toFixed(1)}%</td>
                  <td className="px-4 py-3 font-medium">{b.state_of_health_percent.toFixed(1)}%</td>
                  <td className="px-4 py-3">{b.internal_resistance_mOhm.toFixed(1)}</td>
                  <td className="px-4 py-3">{b.cell_voltage_imbalance_mV.toFixed(1)}</td>
                  <td className="px-4 py-3">{b.temperature_C.toFixed(1)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-700 h-2 rounded-sm overflow-hidden">
                        <div
                          className={`h-full ${
                            b.suitability_score >= 70
                              ? "bg-emerald-400"
                              : b.suitability_score >= 50
                              ? "bg-amber-400"
                              : "bg-rose-400"
                          }`}
                          style={{ width: `${b.suitability_score}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold text-white">{b.suitability_score.toFixed(1)}</span>
                    </div>
                  </td>
                  {riskByBatteryId && (
                    <td className="px-4 py-3">
                      {riskByBatteryId[b.battery_id] ? (
                        <span className={`font-mono font-bold ${RISK_BAND_COLORS[riskByBatteryId[b.battery_id].risk_band]}`}>
                          {riskByBatteryId[b.battery_id].risk_index.toFixed(0)}
                          <span className="text-[9px] font-semibold ml-1 uppercase">{riskByBatteryId[b.battery_id].risk_band}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  )}
                  {onViewDetails && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onViewDetails(b.battery_id)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800/60 text-cyan-300 text-[10px] font-bold rounded-sm transition-all"
                      >
                        <Cpu className="w-3 h-3" /> View
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-900/50 px-4 py-2 text-[11px] text-slate-400 border-t border-slate-700/50">
          Showing {Math.min(50, filtered.length)} of {filtered.length} matching batteries
        </div>
      </div>
    </div>
  );
};
