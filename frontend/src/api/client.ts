export interface BatteryRecord {
  battery_id: string;
  chemistry: string;
  nominal_voltage_V: number;
  rated_capacity_Ah: number;
  state_of_charge_percent: number;
  state_of_health_percent: number;
  temperature_C: number;
  internal_resistance_mOhm: number;
  cycle_count: number;
  age_years: number;
  cell_voltage_imbalance_mV: number;
  max_temperature_last_24h_C: number;
  estimated_available_energy_kWh: number;
  station_status: string;
  tier: "SAFE" | "DEGRADED" | "UNSAFE";
  suitability_score: number;
}

export interface AllocationAssignment {
  request_id: string;
  battery_id: string;
  vehicle_type: string;
  priority: "Critical" | "High" | "Normal";
  required_range_km: number;
  minimum_acceptable_SOC_percent: number;
  battery_soc: number;
  battery_soh: number;
  battery_suitability_score: number;
  battery_tier: string;
  match_score?: number;
  assigned_at_step: number;
  // Battery Intelligence Platform enrichment (present when allocated via the
  // pipeline / Graph Optimization; null for the legacy baseline allocator)
  risk_index?: number | null;
  risk_band?: string | null;
  estimated_rul_cycles?: number | null;
  recommended_action?: string | null;
}

export interface AllocationKPIs {
  allocator_name: string;
  served_vehicles: number;
  unserved_vehicles: number;
  high_critical_served_pct: number;
  unsafe_allocations: number;
  avg_soh_allocated: number;
  avg_suitability_allocated: number;
  avg_wait_time_min: number;
}

export interface AllocationResponse {
  status: string;
  result: {
    allocator_name: string;
    assignments: AllocationAssignment[];
    unserved: any[];
    total_vehicles: number;
    served_count: number;
    unserved_count: number;
    high_critical_served_pct: number;
    unsafe_allocations_count: number;
    avg_soh_allocated: number;
    avg_suitability_allocated: number;
    avg_wait_time_min: number;
  };
  kpis: AllocationKPIs;
  verification: {
    rule1_no_unsafe_allocated: boolean;
    rule2_no_duplicate_battery: boolean;
    rule3_no_duplicate_vehicle: boolean;
    rule4_min_soc_satisfied: boolean;
    rule5_metrics_reproducible: boolean;
    all_passed: boolean;
  };
  // Allocation Explainability: present on /api/allocate/pipeline (and its
  // /graph alias) responses, keyed by request_id.
  explainability?: Record<string, AllocationExplanation>;
}

export interface AllocationExplanationAlternative {
  battery_id: string;
  match_score: number;
  reason_rejected: string;
}

export interface AllocationExplanation {
  request_id: string;
  battery_id: string;
  allocation_confidence_pct: number;
  decision_factors_pct: {
    priority: number;
    suitability: number;
    risk: number;
    energy_match: number;
    future_health: number;
  };
  alternatives_considered: AllocationExplanationAlternative[];
  methodology: string;
}

// "graph"/"pipeline" both resolve server-side to the same Battery
// Intelligence Platform result; "proposed"/"ml-ensemble" are legacy,
// API-completeness-only modes no longer surfaced as headline choices.
export type AllocationMode = "baseline" | "proposed" | "graph" | "ml-ensemble" | "pipeline";

export interface MultiObjectiveResult {
  allocator_name: string;
  multi_objective_score: number;
  objective_sub_scores: {
    served_vehicles: number;
    high_priority_served: number;
    avg_health: number;
    avg_suitability: number;
    unsafe_penalty: number;
    wait_time_penalty: number;
    fairness: number;
    degradation_penalty: number;
  };
  objective_weights: Record<string, number>;
}

export interface FleetHealthResult {
  fleet_health_score: number;
  band: "Excellent" | "Good" | "Moderate" | "Poor" | "Critical";
  total_packs: number;
  components: {
    avg_soh: number;
    avg_risk_inverted: number;
    unsafe_pct_inverted: number;
    utilization: number;
    avg_rul_normalized: number;
    avg_suitability: number;
    available_energy_pct: number;
    healthy_pct: number;
  };
  component_weights?: Record<string, number>;
  methodology: string;
}

export interface ComparisonResponse {
  status: string;
  comparison: {
    baseline: AllocationKPIs;
    battery_intelligence: AllocationKPIs;
  };
  multi_objective_comparison: {
    baseline: MultiObjectiveResult;
    battery_intelligence: MultiObjectiveResult;
  };
  verification_summary: {
    baseline_passed: boolean;
    battery_intelligence_passed: boolean;
  };
  fleet_health: FleetHealthResult;
  pipeline_stages: string[];
}

export interface OptimizationWeight {
  value: number;
  label: string;
  description: string;
}

export type OptimizationWeightsMap = Record<
  "priority" | "suitability" | "risk" | "future_health" | "waiting_time" | "energy_match" | "fair_usage" | "service_rate",
  OptimizationWeight
>;

// ---------------------------------------------------------------------------
// Battery Intelligence Platform types (RUL, XAI, Risk, Recommendation, Twin)
// ---------------------------------------------------------------------------

export interface StressDriver {
  factor: string;
  multiplier: number;
  deviation_pct: number;
  impact: string;
}

export interface DegradationTrendPoint {
  cycle_offset: number;
  predicted_soh_percent: number;
}

export interface RulPrediction {
  battery_id: string;
  current_soh_percent: number;
  projection_horizon_cycles: number;
  predicted_soh_after_horizon_percent: number;
  predicted_soh_uncertainty_pct_points: number;
  estimated_rul_cycles: number | null;
  predicted_remaining_cycles: number | null;
  estimated_rul_uncertainty_cycles: number | null;
  eol_soh_threshold_percent: number;
  confidence_level: "Low" | "Medium" | "High";
  confidence_pct: number;
  reliability_reasons: string[];
  confidence_note: string;
  stress_drivers: StressDriver[];
  degradation_trend: DegradationTrendPoint[];
  methodology: string;
}

export interface ComponentBreakdownItem {
  feature: string;
  component_score: number;
  weight: number;
  contribution_pts: number;
  weighted_deviation: number;
  sign: "+" | "-";
  strength: "strong" | "moderate" | "minor";
  label: string;
  reason_text: string;
}

export interface FeatureContributionBar {
  feature: string;
  weight_pct: number;
  fill_pct: number;
  contribution_pts: number;
}

export interface DecisionSummary {
  overall_strength: string;
  overall_weakness: string;
  summary_text: string;
}

export interface SuitabilityExplanation {
  battery_id: string;
  suitability_score: number;
  suitability_uncertainty_pts: number;
  component_breakdown: ComponentBreakdownItem[];
  feature_contribution_bars: FeatureContributionBar[];
  positive_reasons: ComponentBreakdownItem[];
  negative_reasons: ComponentBreakdownItem[];
  reasons_formatted: string[];
  decision_summary: DecisionSummary;
  methodology: string;
}

export interface RiskIndexResult {
  battery_id: string;
  risk_index: number;
  risk_band: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  quarantine_override_applied: boolean;
  sub_scores: Record<string, number>;
  dominant_risk_factor: string;
  predicted_degradation_rate_pct_per_100_cycles: number;
  methodology: string;
}

export interface MaintenanceRecommendation {
  battery_id: string;
  recommended_action: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  reasons: string[];
  reason: string;
  recommended_inspection_interval_days: number;
  estimated_remaining_service_time_days: number | null;
  risk_index: number;
  risk_band: string;
  estimated_rul_cycles: number | null;
}

export interface TimelineStage {
  stage: string;
  cycle_offset: number | null;
  date: string | null;
  predicted_soh_percent: number | null;
  status: string;
}

export interface MaintenanceWindow {
  trigger_date: string;
  recommended_by_date: string;
}

export interface DigitalTwin {
  battery_id: string;
  current_state: {
    state_of_charge_percent: number;
    state_of_health_percent: number;
    cycle_count: number;
    temperature_C: number;
    internal_resistance_mOhm: number;
    cell_voltage_imbalance_mV: number;
    tier: string;
    risk_band: string;
    station_status: string;
  };
  predicted_future_state: {
    projection_horizon_cycles: number;
    predicted_soh_percent: number;
    estimated_rul_cycles: number | null;
    remaining_life_cycles: number | null;
    future_availability: boolean;
    expected_maintenance_date: string | null;
    days_until_maintenance_trigger: number | null;
    maintenance_window: MaintenanceWindow | null;
    expected_retirement_date: string | null;
  };
  allocation: {
    current_allocation_status: string;
    last_allocated_timestamp: string | null;
    last_assigned_request_id: string | null;
    allocation_count: number;
  };
  timeline: DegradationTrendPoint[];
  timeline_stages: TimelineStage[];
}

export interface BatteryDetailBundle {
  status: string;
  battery: BatteryRecord;
  rul_prediction: RulPrediction;
  explanation: SuitabilityExplanation;
  risk: RiskIndexResult;
  recommendation: MaintenanceRecommendation;
  digital_twin: DigitalTwin;
}

const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Auth / RBAC — the app has no real user database, so a signed demo JWT is
// the only thing standing between "operator" and "admin". It must actually be
// attached to admin-only requests (Twist Adapter), not just held in UI state,
// or the server-side role check in backend/src/auth.py is trivially bypassed.
// ---------------------------------------------------------------------------

let authToken: string | null = null;

export function getAuthToken(): string | null {
  return authToken;
}

export interface RoleTokenResponse {
  status: string;
  access_token: string;
  token_type: string;
  user: { uid: string; email: string; role: string };
}

/**
 * Requests a signed role token from the server. Requester/Operator succeed
 * unconditionally; Admin requires `adminAccessCode` to match the server's
 * configured code (HTTP 403 otherwise). Throws on any non-2xx response —
 * callers must not flip local role state until this resolves successfully.
 */
export async function requestRoleToken(
  role: "requester" | "operator" | "admin",
  adminAccessCode?: string
): Promise<RoleTokenResponse> {
  const res = await fetch(`${API_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${role}@battery-poc.local`,
      role,
      ...(adminAccessCode ? { admin_access_code: adminAccessCode } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Failed to obtain ${role} token`);
  }
  const data: RoleTokenResponse = await res.json();
  authToken = data.access_token;
  return data;
}

export function clearAuthToken() {
  authToken = null;
}

export async function fetchClassification() {
  const res = await fetch(`${API_BASE}/classify/`);
  if (!res.ok) throw new Error("Failed to fetch battery classification");
  return res.json();
}

export async function fetchAllocation(mode: AllocationMode): Promise<AllocationResponse> {
  const res = await fetch(`${API_BASE}/allocate/${mode}`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to fetch allocation for ${mode}`);
  return res.json();
}

export async function fetchMetricsComparison(): Promise<ComparisonResponse> {
  const res = await fetch(`${API_BASE}/metrics/compare`);
  if (!res.ok) throw new Error("Failed to fetch metrics comparison");
  return res.json();
}

export async function fetchBatteryDetail(batteryId: string): Promise<BatteryDetailBundle> {
  const res = await fetch(`${API_BASE}/battery/${batteryId}/detail`);
  if (!res.ok) throw new Error(`Failed to fetch battery detail for ${batteryId}`);
  return res.json();
}

export async function fetchRulPrediction(batteryId: string): Promise<{ status: string; rul_prediction: RulPrediction }> {
  const res = await fetch(`${API_BASE}/predict-rul/${batteryId}`);
  if (!res.ok) throw new Error(`Failed to fetch RUL prediction for ${batteryId}`);
  return res.json();
}

export async function fetchExplanation(batteryId: string): Promise<{ status: string; explanation: SuitabilityExplanation }> {
  const res = await fetch(`${API_BASE}/explain/${batteryId}`);
  if (!res.ok) throw new Error(`Failed to fetch explanation for ${batteryId}`);
  return res.json();
}

export async function fetchRisk(batteryId: string): Promise<{ status: string; risk: RiskIndexResult }> {
  const res = await fetch(`${API_BASE}/risk/${batteryId}`);
  if (!res.ok) throw new Error(`Failed to fetch risk index for ${batteryId}`);
  return res.json();
}

export async function fetchRiskFleet(): Promise<{ status: string; band_counts: Record<string, number>; risk_scores: RiskIndexResult[] }> {
  const res = await fetch(`${API_BASE}/risk`);
  if (!res.ok) throw new Error("Failed to fetch fleet risk index");
  return res.json();
}

export async function fetchRecommendation(batteryId: string): Promise<{ status: string; recommendation: MaintenanceRecommendation }> {
  const res = await fetch(`${API_BASE}/recommend/${batteryId}`);
  if (!res.ok) throw new Error(`Failed to fetch recommendation for ${batteryId}`);
  return res.json();
}

export async function fetchDigitalTwin(batteryId: string): Promise<{ status: string; digital_twin: DigitalTwin }> {
  const res = await fetch(`${API_BASE}/digital-twin/${batteryId}`);
  if (!res.ok) throw new Error(`Failed to fetch digital twin for ${batteryId}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Layered pipeline: Fleet Health, Optimization Settings, Maintenance Center,
// Scenario Simulation
// ---------------------------------------------------------------------------

export async function fetchFleetHealth(): Promise<{ status: string; fleet_health: FleetHealthResult }> {
  const res = await fetch(`${API_BASE}/fleet-health`);
  if (!res.ok) throw new Error("Failed to fetch fleet health");
  return res.json();
}

export async function fetchOptimizationWeights(): Promise<{ status: string; weights: OptimizationWeightsMap }> {
  const res = await fetch(`${API_BASE}/config/optimization-weights`);
  if (!res.ok) throw new Error("Failed to fetch optimization weights");
  return res.json();
}

export async function fetchAllocationPipeline(weightOverrides?: Record<string, number>): Promise<AllocationResponse> {
  const res = await fetch(`${API_BASE}/allocate/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(weightOverrides ? { weight_overrides: weightOverrides } : {}),
  });
  if (!res.ok) throw new Error("Failed to run Battery Intelligence Platform allocation");
  return res.json();
}

export interface MaintenanceRecommendationsBatch {
  status: string;
  count: number;
  action_counts: Record<string, number>;
  recommendations: MaintenanceRecommendation[];
}

export async function fetchMaintenanceRecommendations(): Promise<MaintenanceRecommendationsBatch> {
  const res = await fetch(`${API_BASE}/maintenance/recommendations`);
  if (!res.ok) throw new Error("Failed to fetch maintenance recommendations");
  return res.json();
}

export interface ScenarioSnapshot {
  kpis: AllocationKPIs;
  fleet_health: FleetHealthResult;
  multi_objective: MultiObjectiveResult;
}

export interface ScenarioResult {
  status: string;
  scenario_type: string;
  scenario_description: string;
  scenario_params: Record<string, any>;
  scenario_meta: Record<string, any>;
  before: ScenarioSnapshot;
  after: ScenarioSnapshot;
  allocation_changes: {
    newly_served: string[];
    newly_unserved: string[];
    reassigned: string[];
    newly_served_count: number;
    newly_unserved_count: number;
    reassigned_count: number;
  };
}

export async function fetchScenarioList(): Promise<{ status: string; scenarios: Record<string, string> }> {
  const res = await fetch(`${API_BASE}/simulate/scenarios`);
  if (!res.ok) throw new Error("Failed to fetch scenario list");
  return res.json();
}

export async function runScenarioSimulation(
  scenarioType: string,
  params: Record<string, any> = {}
): Promise<ScenarioResult> {
  const res = await fetch(`${API_BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario_type: scenarioType, params }),
  });
  if (!res.ok) throw new Error(`Failed to run scenario ${scenarioType}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Fleet Digital Twin
// ---------------------------------------------------------------------------

export interface FleetDigitalTwin {
  total_packs: number;
  fleet_health: FleetHealthResult;
  current_utilization_pct: number;
  battery_availability: {
    safe: number;
    degraded: number;
    unsafe: number;
    total: number;
    deployable: number;
  };
  charging_capacity: {
    installed_capacity_kwh: number;
    currently_available_kwh: number;
    deployable_available_kwh: number;
  };
  charging_queue: {
    total_vehicles_simulated: number;
    avg_wait_time_min: number;
    max_wait_time_min: number;
    timeout_count: number;
  };
  average_risk_index: number;
  average_rul_cycles: number | null;
  peak_demand_concurrent_vehicles: number;
  future_capacity_prediction: {
    projection_horizon_cycles: number;
    predicted_available_kwh: number | null;
    change_pct: number | null;
  };
  methodology: string;
}

export async function fetchFleetDigitalTwin(): Promise<{ status: string; fleet_digital_twin: FleetDigitalTwin }> {
  const res = await fetch(`${API_BASE}/fleet-digital-twin`);
  if (!res.ok) throw new Error("Failed to fetch fleet digital twin");
  return res.json();
}

// ---------------------------------------------------------------------------
// Sustainability Dashboard
// ---------------------------------------------------------------------------

export interface SustainabilityKPIs {
  estimated_battery_life_extended: {
    avg_cycles_per_battery: number;
    fleet_total_cycles: number;
  };
  unsafe_allocations_prevented: number;
  energy_utilization_efficiency_pct: number;
  estimated_battery_replacements_avoided: number;
  estimated_maintenance_savings_usd: number;
  estimated_fleet_utilization_improvement_pct: number;
  avg_soh_improvement_pct: number;
  avg_suitability_improvement_pts: number;
  estimated_co2_reduction_kg: {
    value_kg: number;
    is_estimate: boolean;
    disclaimer: string;
  };
  assumptions: Record<string, number>;
  methodology: string;
}

export async function fetchSustainabilityKpis(): Promise<{ status: string; sustainability: SustainabilityKPIs }> {
  const res = await fetch(`${API_BASE}/metrics/sustainability`);
  if (!res.ok) throw new Error("Failed to fetch sustainability KPIs");
  return res.json();
}
