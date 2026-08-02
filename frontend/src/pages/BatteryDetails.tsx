import React, { useEffect, useState } from "react";
import type { BatteryRecord, BatteryDetailBundle } from "../api/client";
import { fetchBatteryDetail } from "../api/client";
import { BatteryRadarChart } from "../components/BatteryRadarChart";
import { RULPanel } from "../components/RULPanel";
import { XAIPanel } from "../components/XAIPanel";
import { RiskGauge } from "../components/RiskGauge";
import { RecommendationCard } from "../components/RecommendationCard";
import { DigitalTwinView } from "../components/DigitalTwinView";
import { Search, Battery, GitCompareArrows } from "lucide-react";

interface Props {
  batteries: BatteryRecord[];
  initialBatteryId?: string | null;
}

const TIER_STYLES: Record<string, string> = {
  SAFE: "bg-emerald-950 text-emerald-400 border-emerald-800/60",
  DEGRADED: "bg-amber-950 text-amber-400 border-amber-800/60",
  UNSAFE: "bg-rose-950 text-rose-400 border-rose-800/60",
};

export const BatteryDetails: React.FC<Props> = ({ batteries, initialBatteryId }) => {
  const [selectedId, setSelectedId] = useState<string>(initialBatteryId || batteries[0]?.battery_id || "");
  const [search, setSearch] = useState<string>("");
  const [detail, setDetail] = useState<BatteryDetailBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    if (initialBatteryId) setSelectedId(initialBatteryId);
  }, [initialBatteryId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    fetchBatteryDetail(selectedId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => console.error("Failed to load battery detail:", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filteredOptions = batteries
    .filter((b) => b.battery_id.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 100);

  const compareBatteries = batteries.filter((b) => compareIds.includes(b.battery_id));

  return (
    <div className="space-y-6 pb-12">
      {/* Selector Header */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <Battery className="w-6 h-6 text-cyan-400" />
          <div>
            <h1 className="text-lg font-extrabold text-white">Battery Details — Intelligence Platform</h1>
            <p className="text-slate-400 text-xs mt-0.5">RUL, XAI, Risk, Digital Twin & Maintenance for a single pack</p>
          </div>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search Battery ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-xs rounded-sm pl-9 pr-3 py-2 mb-1.5 focus:outline-none focus:border-cyan-500"
          />
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-sm p-2 focus:outline-none focus:border-cyan-500"
          >
            {filteredOptions.map((b) => (
              <option key={b.battery_id} value={b.battery_id}>
                {b.battery_id} ({b.tier})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading || !detail ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-slate-300 font-semibold text-xs">Loading battery intelligence bundle...</div>
        </div>
      ) : (
        <>
          {/* Suitability + Risk side-by-side header */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
              <div className="text-slate-400 text-[11px] font-semibold uppercase">Battery ID / Tier</div>
              <div className="text-xl font-extrabold text-white mt-1 font-mono">{detail.battery.battery_id}</div>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-sm text-[10px] font-bold border ${TIER_STYLES[detail.battery.tier]}`}>
                {detail.battery.tier}
              </span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
              <div className="text-slate-400 text-[11px] font-semibold uppercase">Suitability Score</div>
              <div className="text-2xl font-extrabold text-indigo-400 mt-1">
                {detail.explanation.suitability_score.toFixed(1)}
                <span className="text-sm text-slate-400"> &plusmn;{detail.explanation.suitability_uncertainty_pts.toFixed(1)}</span>
              </div>
              <div className="text-slate-400 text-xs mt-0.5">Performance-oriented</div>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
              <div className="text-slate-400 text-[11px] font-semibold uppercase">Risk Index</div>
              <div className="text-2xl font-extrabold text-rose-400 mt-1">{detail.risk.risk_index.toFixed(0)}</div>
              <div className="text-slate-400 text-xs mt-0.5">{detail.risk.risk_band} — Safety-oriented</div>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
              <div className="text-slate-400 text-[11px] font-semibold uppercase">Recommended Action</div>
              <div className="text-sm font-extrabold text-cyan-300 mt-1.5">{detail.recommendation.recommended_action}</div>
              <div className="text-slate-400 text-xs mt-0.5">{detail.recommendation.priority} Priority</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BatteryRadarChart battery={detail.battery} />
            <div className="space-y-6">
              <RiskGauge risk={detail.risk} />
              <RecommendationCard recommendation={detail.recommendation} />
            </div>
          </div>

          <RULPanel rul={detail.rul_prediction} />
          <XAIPanel explanation={detail.explanation} />
          <DigitalTwinView twin={detail.digital_twin} />

          {/* Battery Comparison Radar */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <GitCompareArrows className="w-4 h-4 text-cyan-400" /> Battery Comparison Radar
            </h3>
            <p className="text-slate-400 text-xs">Select up to 3 additional batteries to overlay against {detail.battery.battery_id}.</p>
            <select
              multiple
              value={compareIds}
              onChange={(e) => setCompareIds(Array.from(e.target.selectedOptions, (o) => o.value).slice(0, 3))}
              className="w-full h-24 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-sm p-2 focus:outline-none focus:border-cyan-500"
            >
              {batteries
                .filter((b) => b.battery_id !== detail.battery.battery_id)
                .slice(0, 200)
                .map((b) => (
                  <option key={b.battery_id} value={b.battery_id}>
                    {b.battery_id} ({b.tier}, SoH {b.state_of_health_percent.toFixed(0)}%)
                  </option>
                ))}
            </select>
            <BatteryRadarChart battery={detail.battery} compareBatteries={compareBatteries} title="Comparison Radar" />
          </div>
        </>
      )}
    </div>
  );
};
