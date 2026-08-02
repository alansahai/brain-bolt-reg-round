import React from "react";
import {
  LayoutDashboard,
  Radio,
  Battery,
  BarChart3,
  Download,
  BookOpen,
  Sliders,
  Shield,
  UserCheck,
  Cpu,
  Microscope,
  Workflow,
  Wrench,
  GitCompareArrows,
  FlaskConical,
  Boxes,
  Leaf,
} from "lucide-react";

export type UserRole = "requester" | "operator" | "admin";

interface Props {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
}

import { API_BASE } from "../api/client";

export const SidebarNav: React.FC<Props> = ({
  currentTab,
  setCurrentTab,
  userRole,
  setUserRole,
}) => {
  const handleRoleChange = async (newRole: UserRole) => {
    setUserRole(newRole);
    try {
      await fetch(`${API_BASE}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `${newRole}@battery-poc.local`, role: newRole }),
      });
    } catch {
      // Fallback
    }
  };

  const isOperatorOrAdmin = userRole === "operator" || userRole === "admin";
  const isAdmin = userRole === "admin";

  const navItems = [
    { id: "fleet-dashboard", label: "Fleet Dashboard", icon: LayoutDashboard, visible: true },
    { id: "live", label: "Live Requests Ticker", icon: Radio, visible: true },
    { id: "explorer", label: "Battery Explorer", icon: Battery, visible: isOperatorOrAdmin },
    { id: "details", label: "Battery Details", icon: Microscope, visible: true },
    { id: "allocation-dashboard", label: "Allocation Dashboard", icon: Workflow, visible: true },
    { id: "analytics", label: "Analytics", icon: BarChart3, visible: true },
    { id: "maintenance", label: "Maintenance Center", icon: Wrench, visible: isOperatorOrAdmin },
    { id: "digital-twin", label: "Digital Twin", icon: Cpu, visible: true },
    { id: "fleet-digital-twin", label: "Fleet Digital Twin", icon: Boxes, visible: true },
    { id: "comparison", label: "Method Comparison", icon: GitCompareArrows, visible: true },
    { id: "simulator", label: "Scenario Simulator", icon: FlaskConical, visible: isOperatorOrAdmin },
    { id: "sustainability", label: "Sustainability Dashboard", icon: Leaf, visible: true },
    { id: "reports", label: "Reports & Export", icon: Download, visible: isOperatorOrAdmin },
    { id: "explainer", label: "Method Explainer", icon: BookOpen, visible: true },
    { id: "admin", label: "Admin & Config Controls", icon: Sliders, visible: isAdmin },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between h-screen sticky top-0 shrink-0">
      <div>
        {/* Header / Wordmark */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-800">
          <div className="w-8 h-8 border border-cyan-700/60 bg-cyan-950 flex items-center justify-center shrink-0">
            <Battery className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="font-mono font-bold text-[13px] text-white tracking-widest uppercase leading-none">
              BatteryHealth
            </div>
            <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mt-1">
              Fleet Intelligence Console &middot; PS2P1
            </div>
          </div>
        </div>

        <div className="p-3 space-y-4">
          {/* Role Switcher Widget */}
          <div className="bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2.5 pt-2">
              <span className="flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-cyan-500" /> Role
              </span>
              <span className="font-mono font-bold text-cyan-400">{userRole}</span>
            </div>

            <div className="grid grid-cols-3 border-t border-slate-800 mt-2">
              {(["requester", "operator", "admin"] as UserRole[]).map((r, idx) => (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  className={`py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                    idx > 0 ? "border-l border-slate-800" : ""
                  } ${
                    userRole === r
                      ? "bg-cyan-800/40 text-cyan-300"
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  {r === "requester" ? "Req" : r === "operator" ? "Op" : "Admin"}
                </button>
              ))}
            </div>
          </div>

          {/* Sidebar Nav Items */}
          <nav className="space-y-0.5">
            {navItems
              .filter((item) => item.visible)
              .map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-[11px] font-semibold transition-colors border-l-2 ${
                      isActive
                        ? "bg-cyan-950/50 border-cyan-500 text-cyan-200"
                        : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
                    <span className="text-left">{item.label}</span>
                  </button>
                );
              })}
          </nav>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800 text-[9px] text-slate-600 flex items-center justify-between uppercase tracking-wider">
        <span>Siemens Energy &middot; PS2P1</span>
        <Shield className="w-3 h-3 text-slate-600" />
      </div>
    </aside>
  );
};
