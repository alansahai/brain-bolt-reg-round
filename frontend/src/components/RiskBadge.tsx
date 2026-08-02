import React from "react";
import { ShieldAlert } from "lucide-react";

interface Props {
  riskIndex: number;
  riskBand?: string;
  compact?: boolean;
}

const BAND_STYLES: Record<string, string> = {
  LOW: "bg-emerald-950 text-emerald-400 border-emerald-800/60",
  MEDIUM: "bg-amber-950 text-amber-400 border-amber-800/60",
  HIGH: "bg-orange-950 text-orange-400 border-orange-800/60",
  CRITICAL: "bg-rose-950 text-rose-400 border-rose-800/60",
};

function bandFromIndex(riskIndex: number): string {
  if (riskIndex <= 25) return "LOW";
  if (riskIndex <= 50) return "MEDIUM";
  if (riskIndex <= 75) return "HIGH";
  return "CRITICAL";
}

/**
 * Small reusable Risk Index chip, meant to always render NEXT TO — never
 * merged with — a Suitability Score, per the platform's design rule that
 * performance (Suitability) and safety (Risk) stay visually distinct.
 */
export const RiskBadge: React.FC<Props> = ({ riskIndex, riskBand, compact }) => {
  const band = (riskBand || bandFromIndex(riskIndex)).toUpperCase();
  const style = BAND_STYLES[band] || BAND_STYLES.MEDIUM;

  return (
    <span className={`inline-flex items-center gap-1 border rounded-sm font-bold ${style} ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"}`}>
      <ShieldAlert className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {riskIndex.toFixed(0)} {!compact && <span className="uppercase">{band}</span>}
    </span>
  );
};
