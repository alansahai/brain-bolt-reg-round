import React, { useEffect, useState } from "react";
import type { BatteryRecord, DigitalTwin } from "../api/client";
import { fetchDigitalTwin } from "../api/client";
import { DigitalTwinView } from "../components/DigitalTwinView";
import { Cpu, Search } from "lucide-react";

interface Props {
  batteries: BatteryRecord[];
  initialBatteryId?: string | null;
}

/**
 * Digital Twin — a dedicated, focused module for browsing any battery's
 * software twin (current state -> predicted future state -> lifecycle
 * timeline) without loading the full Battery Details bundle (RUL/XAI/Risk).
 */
export const DigitalTwinExplorer: React.FC<Props> = ({ batteries, initialBatteryId }) => {
  const [selectedId, setSelectedId] = useState<string>(initialBatteryId || batteries[0]?.battery_id || "");
  const [search, setSearch] = useState("");
  const [twin, setTwin] = useState<DigitalTwin | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialBatteryId) setSelectedId(initialBatteryId);
  }, [initialBatteryId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    fetchDigitalTwin(selectedId)
      .then((d) => !cancelled && setTwin(d.digital_twin))
      .catch((err) => console.error("Failed to load digital twin:", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filteredOptions = batteries.filter((b) => b.battery_id.toLowerCase().includes(search.toLowerCase())).slice(0, 100);

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <Cpu className="w-6 h-6 text-cyan-400" />
          <div>
            <h1 className="text-lg font-extrabold text-white">Digital Twin</h1>
            <p className="text-slate-400 text-xs mt-0.5">Software-side lifecycle twin for any battery pack</p>
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

      {loading || !twin ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-slate-300 font-semibold text-xs">Loading digital twin...</div>
        </div>
      ) : (
        <DigitalTwinView twin={twin} />
      )}
    </div>
  );
};
