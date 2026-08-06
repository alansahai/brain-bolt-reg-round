import React, { useState, useEffect } from "react";
import { Play, RotateCcw, Zap, Award, Cpu, Radio, ShieldCheck, GitBranch, Info } from "lucide-react";
import { ExplanationPanel } from "../components/ExplanationPanel";
import type { AllocationMode } from "../api/client";

const METHOD_INFO: Record<string, { label: string; short: string; description: string; icon: React.ElementType }> = {
  baseline: {
    label: "Baseline — Highest SoC First",
    short: "Highest SoC First",
    description:
      "Processes vehicle requests in arrival order and assigns each one the unassigned safe/degraded battery with the highest State of Charge that satisfies its minimum acceptable SoC. Never allocates an UNSAFE or quarantined battery. No health, risk, or priority weighting beyond that.",
    icon: Zap,
  },
  proposed: {
    label: "Proposed — Rule-Based Allocation",
    short: "Rule-Based Allocation",
    description:
      "Sorts requests by priority, excludes UNSAFE batteries, then matches vehicles to batteries by optimizing a multi-objective rule-based score (health, suitability, SoC fit) instead of SoC alone — a smarter greedy allocator, still not globally optimal across the whole fleet.",
    icon: Award,
  },
  graph: {
    label: "Graph Optimization — Hungarian Algorithm",
    short: "Hungarian Algorithm",
    description:
      "Models every vehicle/battery pair as a weighted bipartite graph and solves it with the Hungarian algorithm, finding the single assignment that maximizes total edge weight across the entire fleet at once — the platform's final allocator, consuming ML suitability, Risk, and RUL as edge-weight inputs.",
    icon: GitBranch,
  },
  "ml-ensemble": {
    label: "ML-Ensemble — Battery Intelligence Scoring",
    short: "Battery Intelligence Scoring",
    description:
      "Scores every battery with a stacked ensemble model (RandomForest + GradientBoosting + Ridge, supervised on domain-rule weak labels) that non-linearly refines the rule-based Suitability Score, then allocates greedily on that ML score. Legacy standalone allocator — in the main pipeline this same ML score instead feeds Graph Optimization rather than allocating directly.",
    icon: Cpu,
  },
};

interface LiveOutcome {
  session_id: string;
  mode_used: string;
  assigned: boolean;
  assignment?: {
    request_id: string;
    battery_id: string;
    vehicle_type: string;
    priority: string;
    battery_soc: number;
    battery_soh: number;
    battery_suitability_score: number;
    battery_tier: string;
  };
  explanation?: any;
  unserved_reason?: string;
  one_line_why: string;
  rolling_kpis: {
    total_requests: number;
    total_served: number;
    total_unserved: number;
    high_critical_served: number;
    avg_soh_allocated: number;
    avg_suitability_allocated: number;
  };
  remaining_inventory: {
    total_available: number;
    tier_counts: { SAFE?: number; DEGRADED?: number };
  };
}

export const LiveDemo: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<AllocationMode>("ml-ensemble");
  
  // Request Form State
  const [vehicleType, setVehicleType] = useState<string>("Personal Commuter");
  const [loadCategory, setLoadCategory] = useState<string>("Medium");
  const [priority, setPriority] = useState<"Critical" | "High" | "Normal">("High");
  const [requiredRange, setRequiredRange] = useState<number>(45);
  const [minSoc, setMinSoc] = useState<number>(50);
  const [maxWait, setMaxWait] = useState<number>(15);

  const [outcomes, setOutcomes] = useState<LiveOutcome[]>([]);
  const [latestKPIs, setLatestKPIs] = useState<any>(null);
  const [remainingInv, setRemainingInv] = useState<any>({ total_available: 159, tier_counts: { SAFE: 98, DEGRADED: 61 } });
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    async function initSession() {
      try {
        const res = await fetch("/api/live/session", { method: "POST" });
        const data = await res.json();
        setSessionId(data.session.session_id);
      } catch (err) {
        console.error("Failed to initialize live session:", err);
      }
    }
    initSession();
  }, []);

  const handleResetSession = async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      await fetch("/api/live/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      setOutcomes([]);
      setLatestKPIs(null);
      setRemainingInv({ total_available: 159, tier_counts: { SAFE: 98, DEGRADED: 61 } });
    } catch (err) {
      console.error("Failed to reset session:", err);
    } finally {
      setLoading(false);
    }
  };

  const submitVehicleRequest = async (reqObj: any) => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const res = await fetch("/api/live/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          vehicle_request: reqObj,
          mode: activeMode,
        }),
      });
      const data = await res.json();
      const outcome: LiveOutcome = data.outcome;
      setOutcomes((prev) => [outcome, ...prev]);
      setLatestKPIs(outcome.rolling_kpis);
      setRemainingInv(outcome.remaining_inventory);
    } catch (err) {
      console.error("Failed to submit request:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const reqObj = {
      request_id: `LIVE-REQ-${Date.now().toString().slice(-4)}`,
      arrival_time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      vehicle_type: vehicleType,
      required_range_km: requiredRange,
      load_category: loadCategory,
      priority: priority,
      minimum_acceptable_SOC_percent: minSoc,
      maximum_wait_time_min: maxWait,
    };
    submitVehicleRequest(reqObj);
  };

  const handleSimulateRandom = () => {
    const types = ["Personal Commuter", "Delivery Cargo", "Fleet Taxi", "Micro Transit"];
    const loads = ["Light", "Medium", "Heavy"];
    const priorities: ("Critical" | "High" | "Normal")[] = ["Critical", "High", "High", "Normal", "Normal"];

    const randomReq = {
      request_id: `SIM-REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      arrival_time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      vehicle_type: types[Math.floor(Math.random() * types.length)],
      required_range_km: Math.floor(20 + Math.random() * 65),
      load_category: loads[Math.floor(Math.random() * loads.length)],
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      minimum_acceptable_SOC_percent: Math.floor(35 + Math.random() * 45),
      maximum_wait_time_min: Math.floor(5 + Math.random() * 15),
    };
    submitVehicleRequest(randomReq);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Session Header */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Radio className="w-6 h-6 text-cyan-400 animate-pulse" />
            <h1 className="text-xl font-extrabold text-white">Real-Time Live Allocation Testing Mode</h1>
          </div>
          <p className="text-slate-400 text-xs mt-1">
            Session ID: <span className="font-mono text-cyan-300 font-bold">{sessionId || "Initializing..."}</span> (Isolated Per-Session Battery Inventory)
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode Selector */}
          <div className="flex bg-slate-900/80 p-1 rounded-sm border border-slate-700/50">
            <button
              onClick={() => setActiveMode("baseline")}
              title={METHOD_INFO.baseline.description}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md ${
                activeMode === "baseline" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Zap className="w-3 h-3 text-amber-400" /> Baseline
            </button>
            <button
              onClick={() => setActiveMode("proposed")}
              title={METHOD_INFO.proposed.description}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md ${
                activeMode === "proposed" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Award className="w-3 h-3 text-cyan-300" /> Proposed
            </button>
            <button
              onClick={() => setActiveMode("graph")}
              title={METHOD_INFO.graph.description}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md ${
                activeMode === "graph" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <GitBranch className="w-3 h-3 text-emerald-300" /> Graph-Opt
            </button>
            <button
              onClick={() => setActiveMode("ml-ensemble")}
              title={METHOD_INFO["ml-ensemble"].description}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md ${
                activeMode === "ml-ensemble" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Cpu className="w-3 h-3 text-indigo-300" /> ML-Ensemble
            </button>
          </div>

          <button
            onClick={handleResetSession}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-sm border border-slate-600 shadow"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Pool
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-slate-900/60 border border-slate-700/50 rounded-sm px-3.5 py-2.5 text-[11px] text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
        <span>
          <strong className="text-slate-200">{METHOD_INFO[activeMode]?.label}:</strong> {METHOD_INFO[activeMode]?.description}
        </span>
      </div>

      {/* Rolling KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="text-slate-400 text-[11px] font-semibold uppercase">Total Requests</div>
          <div className="text-2xl font-extrabold text-white mt-1">{latestKPIs ? latestKPIs.total_requests : 0}</div>
          <div className="text-slate-400 text-xs mt-0.5">Live Submissions</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="text-slate-400 text-[11px] font-semibold uppercase">Served vs Unserved</div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            {latestKPIs ? latestKPIs.total_served : 0} / {latestKPIs ? latestKPIs.total_unserved : 0}
          </div>
          <div className="text-emerald-400 text-xs mt-0.5">Active Session</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="text-slate-400 text-[11px] font-semibold uppercase">High & Critical Served</div>
          <div className="text-2xl font-extrabold text-cyan-400 mt-1">{latestKPIs ? latestKPIs.high_critical_served : 0}</div>
          <div className="text-slate-400 text-xs mt-0.5">Priority Requests</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="text-slate-400 text-[11px] font-semibold uppercase">Avg SoH Allocated</div>
          <div className="text-2xl font-extrabold text-indigo-400 mt-1">
            {latestKPIs ? `${latestKPIs.avg_soh_allocated}%` : "0.0%"}
          </div>
          <div className="text-slate-400 text-xs mt-0.5">Allocated Health</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-4">
          <div className="text-slate-400 text-[11px] font-semibold uppercase">Remaining Safe/Degraded</div>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">{remainingInv.total_available}</div>
          <div className="text-slate-400 text-xs mt-0.5">Available Packs Left</div>
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Vehicle Request Submission Form */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Play className="w-4 h-4 text-cyan-400" /> Push Live Vehicle Request
          </h2>

          <form onSubmit={handleManualSubmit} className="space-y-3 text-xs">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Vehicle Type</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500"
              >
                <option value="Personal Commuter">Personal Commuter</option>
                <option value="Delivery Cargo">Delivery Cargo</option>
                <option value="Fleet Taxi">Fleet Taxi</option>
                <option value="Micro Transit">Micro Transit</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Normal">Normal</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Load Category</label>
                <select
                  value={loadCategory}
                  onChange={(e) => setLoadCategory(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500"
                >
                  <option value="Light">Light</option>
                  <option value="Medium">Medium</option>
                  <option value="Heavy">Heavy</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Range (km)</label>
                <input
                  type="number"
                  value={requiredRange}
                  onChange={(e) => setRequiredRange(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Min SoC (%)</label>
                <input
                  type="number"
                  value={minSoc}
                  onChange={(e) => setMinSoc(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Max Wait (m)</label>
                <input
                  type="number"
                  value={maxWait}
                  onChange={(e) => setMaxWait(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-sm p-2 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-cyan-700 hover:bg-cyan-600 border border-cyan-600 text-white font-bold uppercase tracking-wide text-xs transition-colors"
            >
              {loading ? "Allocating..." : "Submit Manual Request"}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-700/60">
            <button
              onClick={handleSimulateRandom}
              disabled={loading}
              className="w-full py-2 bg-indigo-600/80 hover:bg-indigo-500 text-white font-bold rounded-sm transition-all border border-indigo-500/50 shadow"
            >
              🎲 Simulate Incoming Request
            </button>
          </div>
        </div>

        {/* Right Col: Live Event Ticker Stream + Explanation Panel */}
        <div className="lg:col-span-2 bg-slate-800/80 border border-slate-700/80 rounded p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Live Allocation Event Ticker & Explanations
            </h2>
            <span className="text-xs text-slate-400">Showing latest outcomes first</span>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {outcomes.length === 0 ? (
              <div className="text-center text-slate-400 py-16 text-xs">
                No requests submitted yet. Use the form or click "Simulate Incoming Request" to test live allocation.
              </div>
            ) : (
              outcomes.map((out, idx) => (
                <div key={idx} className="space-y-2">
                  <div
                    className={`p-4 rounded border transition-all ${
                      out.assigned
                        ? "bg-slate-900/80 border-slate-700/80"
                        : "bg-rose-950/30 border-rose-800/50"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            out.assigned ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60" : "bg-rose-950 text-rose-400 border border-rose-800/60"
                          }`}
                        >
                          {out.assigned ? "ALLOCATED" : "UNSERVED"}
                        </span>
                        <span className="font-mono text-xs font-bold text-white">
                          {out.assignment ? out.assignment.request_id : "Request"}
                        </span>
                      </div>

                      <span
                        className="text-[11px] font-mono text-cyan-300 bg-slate-800 px-2 py-0.5 rounded cursor-help"
                        title={METHOD_INFO[out.mode_used]?.description ?? out.mode_used}
                      >
                        {METHOD_INFO[out.mode_used]?.short ?? out.mode_used}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mt-2 leading-relaxed font-semibold">
                      💡 {out.one_line_why}
                    </p>
                  </div>

                  {/* Render Structured Explanation Panel */}
                  <ExplanationPanel explanation={out.explanation} unservedReason={out.unserved_reason} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
