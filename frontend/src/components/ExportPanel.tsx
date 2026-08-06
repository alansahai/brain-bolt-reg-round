import React, { useState } from "react";
import { Download, FileText, Table as TableIcon, FileCheck, ShieldCheck } from "lucide-react";

const MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "pipeline", label: "Battery Intelligence Platform (recommended)" },
  { value: "baseline", label: "Baseline (Highest-SoC-First)" },
  { value: "proposed", label: "Legacy Rule-Based (proposed)" },
  { value: "ml-ensemble", label: "Legacy Standalone ML-Ensemble" },
];

export const ExportPanel: React.FC = () => {
  const [mode, setMode] = useState<string>("pipeline");

  const handleDownload = (format: "csv" | "xlsx" | "pdf") => {
    const url = `/api/export/${format}?mode=${mode}`;
    window.open(url, "_blank");
  };

  const handleVerificationLogDownload = (format: "csv" | "xlsx" | "pdf") => {
    const url = `/api/export/verification-log/${format}?mode=${mode}`;
    window.open(url, "_blank");
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-md font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" /> Export Allocation Reports & Verification Logs
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            Download complete battery-to-vehicle assignment tables and quantitative validation results.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-sm p-2 focus:outline-none focus:border-cyan-500"
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleDownload("csv")}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-sm transition-all border border-slate-600"
            >
              <TableIcon className="w-4 h-4 text-emerald-400" /> Export CSV
            </button>
            <button
              onClick={() => handleDownload("xlsx")}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-sm transition-all"
            >
              <FileCheck className="w-4 h-4 text-white" /> Export Excel (.xlsx)
            </button>
            <button
              onClick={() => handleDownload("pdf")}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-sm transition-all"
            >
              <FileText className="w-4 h-4 text-white" /> Export PDF Summary
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-700/50">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Verification Log (Rules 1-5 Compliance)
          </div>
          <p className="text-slate-400 text-[11px] mb-2">
            Exports the pass/fail result of every Verification Rule (no unsafe allocation, no duplicate
            battery/vehicle, minimum SoC satisfied, metrics reproducible) for the selected method above.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleVerificationLogDownload("csv")}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-sm transition-all border border-slate-600"
            >
              <TableIcon className="w-4 h-4 text-emerald-400" /> Verification Log CSV
            </button>
            <button
              onClick={() => handleVerificationLogDownload("xlsx")}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-sm transition-all"
            >
              <FileCheck className="w-4 h-4 text-white" /> Verification Log Excel
            </button>
            <button
              onClick={() => handleVerificationLogDownload("pdf")}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-sm transition-all"
            >
              <FileText className="w-4 h-4 text-white" /> Verification Log PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
