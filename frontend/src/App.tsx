import { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { SidebarNav } from "./components/SidebarNav";
import type { UserRole } from "./components/SidebarNav";

export function App() {
  const [currentTab, setCurrentTab] = useState<string>("fleet-dashboard");
  const [userRole, setUserRole] = useState<UserRole>("operator");

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-white">
      {/* Persistent Left Sidebar Navigation (Section C) */}
      <SidebarNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        userRole={userRole}
        setUserRole={setUserRole}
      />

      {/* Main SPA Content Pane */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-800 bg-slate-900/80 px-6 flex items-center justify-between sticky top-0 z-40">
          <div className="text-xs font-semibold text-slate-300">
            Navigation / <span className="text-white font-bold uppercase">{currentTab}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            Active Role: <span className="font-mono font-bold text-cyan-300 uppercase">{userRole}</span>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto">
          <Dashboard currentTab={currentTab} setCurrentTab={setCurrentTab} userRole={userRole} />
        </main>
      </div>
    </div>
  );
}

export default App;
