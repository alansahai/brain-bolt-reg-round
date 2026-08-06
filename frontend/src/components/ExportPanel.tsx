import React, { useState } from "react";
import { Download, FileText, Table as TableIcon, ShieldCheck } from "lucide-react";

const MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "pipeline", label: "Battery Intelligence Platform (recommended)" },
  { value: "baseline", label: "Baseline (Highest-SoC-First)" },
  { value: "proposed", label: "Legacy Rule-Based (proposed)" },
  { value: "ml-ensemble", label: "Legacy Standalone ML-Ensemble" },
];

/**
 * Reports & Export — simplified to exactly 3 actions per method mode:
 * raw allocation data (CSV), Verification Rules 1-5 compliance (CSV), and a
 * single formatted judge/management summary (PDF, KPIs + verification +
 * sample assignments). Excel was dropped — it duplicated CSV's tabular data
 * with no distinct value. See backend/routers/export.py.
 */
export const ExportPanel: React.FC = () => {
  const [mode, setMode] = useState<string>("pipeline");

  const download = (endpoint: string) => {
    window.open(`/api/export/${endpoint}?mode=${mode}`, "_blank");
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-md font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" /> Reports & Export
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            Download the battery-to-vehicle assignment table, Verification Rules compliance, or a formatted
            summary report for the selected allocation method.
          </p>
        </div>

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-sm p-2 focus:outline-none focus:border-cyan-500 self-start"
        >
          {MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => download("allocation-csv")}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-sm transition-all border border-slate-600"
          >
            <TableIcon className="w-4 h-4 text-emerald-400" /> Export Allocation Data (CSV)
          </button>
          <button
            onClick={() => download("verification-csv")}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-sm transition-all border border-slate-600"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Export Verification Log (CSV)
          </button>
          <button
            onClick={() => download("summary-report-pdf")}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-sm transition-all"
          >
            <FileText className="w-4 h-4 text-white" /> Download Summary Report (PDF)
          </button>
        </div>
      </div>
    </div>
  );
};
