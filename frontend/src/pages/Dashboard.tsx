import React, { useEffect, useState } from "react";
import {
  fetchClassification,
  fetchMetricsComparison,
  fetchRiskFleet,
  fetchAllocationPipeline,
} from "../api/client";
import type {
  BatteryRecord,
  AllocationResponse,
  ComparisonResponse,
  RiskIndexResult,
} from "../api/client";
import { ClassificationView } from "../components/ClassificationView";
import { AllocationTable } from "../components/AllocationTable";
import { ComparisonCharts } from "../components/ComparisonCharts";
import { SuitabilityDistribution } from "../components/SuitabilityDistribution";
import { UnsafeBatteryScatter } from "../components/UnsafeBatteryScatter";
import { ExportPanel } from "../components/ExportPanel";
import { TwistControlPanel } from "../components/TwistControlPanel";
import { ExpandedPredefinedCharts } from "../components/ExpandedPredefinedCharts";
import { VisualizationStudio } from "../components/VisualizationStudio";
import { MethodExplainer } from "./MethodExplainer";
import { LiveDemo } from "./LiveDemo";
import { BatteryDetails } from "./BatteryDetails";
import { FleetDashboard } from "./FleetDashboard";
import { AllocationDashboard } from "./AllocationDashboard";
import { DigitalTwinExplorer } from "./DigitalTwinExplorer";
import { MaintenanceCenter } from "./MaintenanceCenter";
import { ScenarioSimulator } from "./ScenarioSimulator";
import { FleetDigitalTwin } from "./FleetDigitalTwin";
import { SustainabilityDashboard } from "./SustainabilityDashboard";
import type { UserRole } from "../components/SidebarNav";
import { AlertTriangle, RotateCw } from "lucide-react";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)),
  ]);
}

interface Props {
  currentTab: string;
  setCurrentTab?: (tab: string) => void;
  userRole?: UserRole;
}

export const Dashboard: React.FC<Props> = ({ currentTab, setCurrentTab, userRole }) => {
  const [batteries, setBatteries] = useState<BatteryRecord[]>([]);
  const [tierCounts, setTierCounts] = useState<{ SAFE?: number; DEGRADED?: number; UNSAFE?: number }>({});
  const [autoSummary, setAutoSummary] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [platformRes, setPlatformRes] = useState<AllocationResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedBatteryId, setSelectedBatteryId] = useState<string | null>(null);
  const [riskByBatteryId, setRiskByBatteryId] = useState<Record<string, RiskIndexResult>>({});

  const handleViewDetails = (batteryId: string) => {
    setSelectedBatteryId(batteryId);
    setCurrentTab?.("details");
  };

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        // Foundational — most tabs need the classified fleet, so a failure
        // here is a real error state, not silently swallowed.
        const classData = await withTimeout(fetchClassification(), 20000, "Classification");
        if (cancelled) return;
        setBatteries(classData.batteries || []);
        setTierCounts(classData.tier_counts || {});

        try {
          const sumRes = await fetch("/api/classify/auto_summary");
          const sumData = await sumRes.json();
          if (!cancelled) setAutoSummary(sumData.auto_summary?.narrative || null);
        } catch (err) {
          console.error("Failed to load auto-summary (non-fatal):", err);
        }

        // Independent, unrelated calls — one failing/hanging (e.g. the heavy
        // pipeline allocation) must not strand the other two forever. This
        // was the actual bug behind "Method Comparison" getting stuck: a
        // Promise.all here meant any one rejection left `comparison` (and
        // therefore ComparisonCharts) permanently null even though
        // /api/metrics/compare itself had already succeeded.
        const [compResult, riskResult, pipelineResult] = await Promise.allSettled([
          withTimeout(fetchMetricsComparison(), 20000, "Method comparison"),
          withTimeout(fetchRiskFleet(), 20000, "Fleet risk index"),
          withTimeout(fetchAllocationPipeline(), 20000, "Allocation pipeline"),
        ]);
        if (cancelled) return;

        if (compResult.status === "fulfilled") {
          setComparison(compResult.value);
        } else {
          console.error("Failed to load method comparison:", compResult.reason);
        }

        if (pipelineResult.status === "fulfilled") {
          setPlatformRes(pipelineResult.value);
        } else {
          console.error("Failed to load allocation pipeline:", pipelineResult.reason);
        }

        if (riskResult.status === "fulfilled") {
          const riskMap: Record<string, RiskIndexResult> = {};
          riskResult.value.risk_scores.forEach((r) => {
            riskMap[r.battery_id] = r;
          });
          setRiskByBatteryId(riskMap);
        } else {
          console.error("Failed to load fleet risk index:", riskResult.reason);
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load fleet data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAll();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <AlertTriangle className="w-9 h-9 text-rose-400" />
        <div className="text-rose-300 font-semibold text-sm">Failed to load the Battery Intelligence Platform</div>
        <div className="text-slate-500 text-xs">{error}</div>
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-sm"
        >
          <RotateCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <div className="text-slate-300 font-semibold text-sm">Running the Battery Intelligence Platform pipeline...</div>
      </div>
    );
  }

  // 1. Fleet Dashboard — station-wide health at a glance
  if (currentTab === "fleet-dashboard") {
    return (
      <FleetDashboard
        tierCounts={tierCounts}
        totalPacks={batteries.length}
        autoSummary={autoSummary}
        fleetHealth={comparison?.fleet_health ?? null}
      />
    );
  }

  // 2. Live Requests Ticker
  if (currentTab === "live") {
    return <LiveDemo />;
  }

  // 3. Battery Explorer — searchable raw fleet table
  if (currentTab === "explorer") {
    return (
      <ClassificationView
        batteries={batteries}
        tierCounts={tierCounts}
        onViewDetails={handleViewDetails}
        riskByBatteryId={riskByBatteryId}
      />
    );
  }

  // 4. Battery Details — RUL, XAI, Risk, Digital Twin, Recommendation for one pack
  if (currentTab === "details") {
    return <BatteryDetails batteries={batteries} initialBatteryId={selectedBatteryId} />;
  }

  // 5. Allocation Dashboard — the platform's final allocation, live-tunable
  if (currentTab === "allocation-dashboard") {
    return <AllocationDashboard />;
  }

  // 6. Analytics — visualization studio + predefined charts
  if (currentTab === "analytics") {
    return (
      <div className="space-y-8 pb-12">
        <VisualizationStudio batteries={batteries} />
        <ExpandedPredefinedCharts batteries={batteries} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SuitabilityDistribution batteries={batteries} />
          <UnsafeBatteryScatter batteries={batteries} />
        </div>
      </div>
    );
  }

  // 7. Maintenance Center — fleet-wide recommendations
  if (currentTab === "maintenance") {
    return <MaintenanceCenter />;
  }

  // 8. Digital Twin — dedicated lifecycle-twin browser
  if (currentTab === "digital-twin") {
    return <DigitalTwinExplorer batteries={batteries} initialBatteryId={selectedBatteryId} />;
  }

  // 9. Method Comparison — Baseline vs Battery Intelligence Platform
  if (currentTab === "comparison") {
    return <ComparisonCharts comparison={comparison} onRetry={() => setAttempt((n) => n + 1)} />;
  }

  // 10. Scenario Simulator — What-If analysis
  if (currentTab === "simulator") {
    return <ScenarioSimulator />;
  }

  // 10b. Fleet Digital Twin — station-wide software twin
  if (currentTab === "fleet-digital-twin") {
    return <FleetDigitalTwin />;
  }

  // 10c. Sustainability Dashboard — business-level KPIs
  if (currentTab === "sustainability") {
    return <SustainabilityDashboard />;
  }

  // 11. Reports & Export
  if (currentTab === "reports") {
    return (
      <div className="space-y-8 pb-12">
        <ExportPanel />
        <AllocationTable res={platformRes} />
      </div>
    );
  }

  // 12. Method Explainer
  if (currentTab === "explainer") {
    return <MethodExplainer />;
  }

  // 13. Admin & Config Controls — gated here too, not just by nav-item
  // visibility, so a role downgrade while this tab is already open can't
  // leave admin-only controls rendered.
  if (currentTab === "admin") {
    if (userRole !== "admin") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-2">
          <div className="text-rose-400 font-semibold text-sm">Admin access required</div>
          <div className="text-slate-500 text-xs">Switch to the Admin role in the sidebar to view this panel.</div>
        </div>
      );
    }
    return (
      <div className="space-y-8 pb-12">
        <TwistControlPanel onPatched={() => setAttempt((n) => n + 1)} />
        <ExportPanel />
      </div>
    );
  }

  return null;
};
