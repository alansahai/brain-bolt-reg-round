import React from "react";
import type { MaintenanceRecommendation } from "../api/client";
import { Wrench, ShieldCheck, Thermometer, Scale, CalendarClock, ShieldOff, Stethoscope } from "lucide-react";
import { RiskBadge } from "./RiskBadge";

interface Props {
  recommendation: MaintenanceRecommendation;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  "Continue Service": ShieldCheck,
  "Rebalance Cells": Scale,
  "Cooling Inspection": Thermometer,
  "Schedule Preventive Maintenance": Stethoscope,
  "Replace Battery Soon": CalendarClock,
  "Immediate Quarantine": ShieldOff,
};

const PRIORITY_STYLES: Record<string, string> = {
  Critical: "bg-rose-950 text-rose-300 border-rose-800/60",
  High: "bg-amber-950 text-amber-300 border-amber-800/60",
  Medium: "bg-cyan-950 text-cyan-300 border-cyan-800/60",
  Low: "bg-emerald-950 text-emerald-300 border-emerald-800/60",
};

export const RecommendationCard: React.FC<Props> = ({ recommendation }) => {
  const Icon = ACTION_ICONS[recommendation.recommended_action] || Wrench;

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Wrench className="w-4 h-4 text-cyan-400" /> AI Maintenance Recommendation
        </h3>
        <div className="flex items-center gap-2">
          <RiskBadge riskIndex={recommendation.risk_index} riskBand={recommendation.risk_band} />
          <span className={`px-2.5 py-1 rounded-sm text-[10px] font-bold border uppercase ${PRIORITY_STYLES[recommendation.priority]}`}>
            {recommendation.priority} Priority
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-slate-900/60 rounded-sm p-3 border border-slate-700/50">
        <div className="w-10 h-10 border border-cyan-700/60 bg-cyan-950 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <div className="text-base font-extrabold text-white">{recommendation.recommended_action}</div>
          <div className="text-[11px] text-slate-400">
            Inspect within {recommendation.recommended_inspection_interval_days} day
            {recommendation.recommended_inspection_interval_days === 1 ? "" : "s"}
            {recommendation.estimated_remaining_service_time_days !== null && (
              <> &middot; Est. remaining service time: {recommendation.estimated_remaining_service_time_days.toFixed(0)} days</>
            )}
          </div>
        </div>
      </div>

      <ul className="space-y-1">
        {recommendation.reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-slate-300 leading-relaxed">
            <span className="shrink-0 text-slate-500">&bull;</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
