import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DigitalTwin } from "../api/client";
import { Cpu, ArrowRight, CalendarClock, History, Milestone } from "lucide-react";

interface Props {
  twin: DigitalTwin;
}

const STAGE_STYLES: Record<string, string> = {
  Current: "border-cyan-500 bg-cyan-950/60 text-cyan-300",
  Assigned: "border-emerald-500 bg-emerald-950/60 text-emerald-300",
  "Not Yet Allocated": "border-slate-600 bg-slate-900 text-slate-400",
  Projected: "border-indigo-500 bg-indigo-950/60 text-indigo-300",
  Maintenance: "border-amber-500 bg-amber-950/60 text-amber-300",
  "End of Life": "border-orange-500 bg-orange-950/60 text-orange-300",
  Replace: "border-rose-500 bg-rose-950/60 text-rose-300",
};

export const DigitalTwinView: React.FC<Props> = ({ twin }) => {
  const chartData = twin.timeline.map((p) => ({ cycle: p.cycle_offset, soh: p.predicted_soh_percent }));

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Cpu className="w-4 h-4 text-indigo-400" /> Battery Digital Twin
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
        {/* Current State */}
        <div className="bg-slate-900/60 rounded-sm border border-slate-700/50 p-3 space-y-1.5">
          <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Current State</div>
          <div className="text-xs text-slate-300 space-y-1">
            <div className="flex justify-between"><span className="text-slate-400">SoH</span><span className="font-mono font-semibold text-white">{twin.current_state.state_of_health_percent.toFixed(1)}%</span></div>
            <div className="flex justify-between"><span className="text-slate-400">SoC</span><span className="font-mono font-semibold text-white">{twin.current_state.state_of_charge_percent.toFixed(1)}%</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Cycles</span><span className="font-mono font-semibold text-white">{twin.current_state.cycle_count}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Tier</span><span className="font-mono font-semibold text-white">{twin.current_state.tier}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Risk Band</span><span className="font-mono font-semibold text-white">{twin.current_state.risk_band}</span></div>
          </div>
        </div>

        <ArrowRight className="w-6 h-6 text-slate-500 mx-auto hidden md:block" />

        {/* Predicted Future State */}
        <div className="bg-slate-900/60 rounded-sm border border-indigo-800/50 p-3 space-y-1.5">
          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
            Predicted Future State (+{twin.predicted_future_state.projection_horizon_cycles} cycles)
          </div>
          <div className="text-xs text-slate-300 space-y-1">
            <div className="flex justify-between"><span className="text-slate-400">Predicted SoH</span><span className="font-mono font-semibold text-amber-400">{twin.predicted_future_state.predicted_soh_percent.toFixed(1)}%</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Est. RUL</span><span className="font-mono font-semibold text-white">{twin.predicted_future_state.estimated_rul_cycles ?? "—"} cycles</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Future Availability</span><span className={`font-mono font-semibold ${twin.predicted_future_state.future_availability ? "text-emerald-400" : "text-rose-400"}`}>{twin.predicted_future_state.future_availability ? "Available" : "At Risk"}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Maintenance Due</span><span className="font-mono font-semibold text-white">{twin.predicted_future_state.expected_maintenance_date ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Remaining Life</span><span className="font-mono font-semibold text-white">{twin.predicted_future_state.remaining_life_cycles ?? "—"} cycles</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Expected Retirement</span><span className="font-mono font-semibold text-rose-300">{twin.predicted_future_state.expected_retirement_date ?? "—"}</span></div>
          </div>
        </div>
      </div>

      {twin.predicted_future_state.maintenance_window && (
        <div className="text-[11px] text-amber-200 bg-amber-950/30 border border-amber-800/40 rounded-sm px-3 py-2">
          <span className="font-semibold">Maintenance Window:</span> {twin.predicted_future_state.maintenance_window.trigger_date} through {twin.predicted_future_state.maintenance_window.recommended_by_date}
        </div>
      )}

      {/* Lifecycle Timeline (horizontal) */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Milestone className="w-3.5 h-3.5" /> Battery Lifecycle Timeline
        </div>
        <div className="flex items-stretch overflow-x-auto pb-1">
          {twin.timeline_stages.map((stage, idx) => (
            <React.Fragment key={stage.stage}>
              <div className={`shrink-0 w-36 border rounded-sm p-2.5 ${STAGE_STYLES[stage.status] || "border-slate-700 bg-slate-900 text-slate-300"}`}>
                <div className="text-[10px] font-bold uppercase tracking-wide">{stage.stage}</div>
                <div className="text-[10px] mt-1 opacity-80">{stage.date ?? "TBD"}</div>
                {stage.predicted_soh_percent !== null && (
                  <div className="text-sm font-mono font-bold mt-1">{stage.predicted_soh_percent.toFixed(0)}% SoH</div>
                )}
                <div className="text-[9px] mt-1 opacity-70">{stage.status}</div>
              </div>
              {idx < twin.timeline_stages.length - 1 && (
                <div className="flex items-center justify-center w-6 shrink-0">
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Allocation History */}
      <div className="flex items-center gap-2 bg-slate-900/40 rounded-sm border border-slate-700/40 px-3 py-2 text-[11px] text-slate-300">
        <History className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="font-semibold">{twin.allocation.current_allocation_status}</span>
        <span className="text-slate-500">|</span>
        <span>Allocations so far: <span className="font-mono text-white">{twin.allocation.allocation_count}</span></span>
        {twin.allocation.last_allocated_timestamp && (
          <>
            <span className="text-slate-500">|</span>
            <span className="flex items-center gap-1">
              <CalendarClock className="w-3 h-3" /> Last: {new Date(twin.allocation.last_allocated_timestamp).toLocaleString()}
            </span>
          </>
        )}
      </div>

      {/* Timeline Visualization */}
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 15, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="cycle" stroke="#94A3B8" tick={{ fontSize: 10 }} />
            <YAxis stroke="#94A3B8" tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC" }} />
            <Area type="monotone" dataKey="soh" stroke="#6366F1" fill="#6366F1" fillOpacity={0.25} name="Projected SoH Timeline" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
