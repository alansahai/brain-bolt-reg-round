import React, { useEffect, useState } from "react";
import { fetchAllocationPipeline } from "../api/client";
import type { AllocationResponse } from "../api/client";
import { OptimizationSettingsPanel } from "../components/OptimizationSettingsPanel";
import { AllocationTable } from "../components/AllocationTable";
import { AllocationExplainabilityPanel } from "../components/AllocationExplainabilityPanel";

/**
 * Allocation Dashboard — the Battery Intelligence Platform's final
 * allocation, live-tunable via the Optimization Settings Panel. This is the
 * platform's single allocation engine (Graph Optimization consuming ML
 * Suitability / Risk / RUL / priority / energy match / waiting time / fair
 * usage / service rate) — not a picker between competing methods.
 *
 * Click "Explain" on any assignment to see its Allocation Explainability
 * panel: decision-factor breakdown, confidence, and rejected alternatives.
 */
export const AllocationDashboard: React.FC = () => {
  const [res, setRes] = useState<AllocationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const runAllocation = async (weightOverrides?: Record<string, number>) => {
    setLoading(true);
    try {
      const data = await fetchAllocationPipeline(weightOverrides);
      setRes(data);
      setSelectedRequestId(null);
    } catch (err) {
      console.error("Failed to run allocation pipeline:", err);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    runAllocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const explanation = res?.explainability && selectedRequestId ? res.explainability[selectedRequestId] : null;

  return (
    <div className="space-y-6 pb-12">
      <OptimizationSettingsPanel onRerun={runAllocation} loading={loading} />
      {initialLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-slate-300 font-semibold text-xs">Running the Battery Intelligence Platform pipeline...</div>
        </div>
      ) : (
        <>
          <AllocationTable res={res} onExplain={setSelectedRequestId} selectedRequestId={selectedRequestId} />
          {explanation && <AllocationExplainabilityPanel explanation={explanation} />}
        </>
      )}
    </div>
  );
};
