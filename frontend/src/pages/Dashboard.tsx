import React, { useEffect, useState } from "react";
import {
  API_BASE,
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

interface Props {
  currentTab: string;
  setCurrentTab?: (tab: string) => void;
  userRole?: UserRole;
}

export const Dashboard: React.FC<Props> = ({ currentTab, setCurrentTab }) => {
  const [batteries, setBatteries] = useState<BatteryRecord[]>([]);
  const [tierCounts, setTierCounts] = useState<{ SAFE?: number; DEGRADED?: number; UNSAFE?: number }>({});
  const [autoSummary, setAutoSummary] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [platformRes, setPlatformRes] = useState<AllocationResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBatteryId, setSelectedBatteryId] = useState<string | null>(null);
  const [riskByBatteryId, setRiskByBatteryId] = useState<Record<string, RiskIndexResult>>({});

  const handleViewDetails = (batteryId: string) => {
    setSelectedBatteryId(batteryId);
    setCurrentTab?.("details");
  };

  useEffect(() => {
    async function loadAll() {
      try {
        setLoading(true);
        const classData = await fetchClassification();
        setBatteries(classData.batteries || []);
        setTierCounts(classData.tier_counts || {});

        const sumRes = await fetch(`${API_BASE}/classify/auto_summary`);
        const sumData = await sumRes.json();
        setAutoSummary(sumData.auto_summary?.narrative || null);

        const [compData, riskData, pipelineData] = await Promise.all([
          fetchMetricsComparison(),
          fetchRiskFleet(),
          fetchAllocationPipeline(),
        ]);

        setComparison(compData);
        setPlatformRes(pipelineData);

        const riskMap: Record<string, RiskIndexResult> = {};
        riskData.risk_scores.forEach((r) => {
          riskMap[r.battery_id] = r;
        });
        setRiskByBatteryId(riskMap);
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

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
    return <ComparisonCharts comparison={comparison} />;
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

  // 13. Admin & Config Controls
  if (currentTab === "admin") {
    return (
      <div className="space-y-8 pb-12">
        <TwistControlPanel />
        <ExportPanel />
      </div>
    );
  }

  return null;
};
