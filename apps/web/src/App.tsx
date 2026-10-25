import React, { useEffect, useState } from 'react';
import { HealthResponseSchema, type HealthResponse } from '@bills/shared';
import { HouseholdSettings } from './components/HouseholdSettings.js';
import { MonthlyDashboard } from './components/MonthlyDashboard.js';
import { StatementCoverage } from './components/StatementCoverage.js';
import { UncategorizedInbox } from './components/UncategorizedInbox.js';

export type WorkflowTab = 'settings' | 'coverage' | 'inbox' | 'dashboard';

interface NavStep {
  id: WorkflowTab;
  step: number;
  label: string;
  description: string;
  icon: string;
}

const STEPS: readonly NavStep[] = [
  {
    id: 'dashboard',
    step: 1,
    label: 'דשבורד חודשי',
    description: 'מעקב, תקציב וניתוח',
    icon: '📊',
  },
  {
    id: 'inbox',
    step: 2,
    label: 'תיבת סיווג',
    description: 'שיוך מהיר וחוקים',
    icon: '🏷️',
  },
  {
    id: 'coverage',
    step: 3,
    label: 'קליטה וכיסוי',
    description: 'העלאת דפי פירוט',
    icon: '📥',
  },
  {
    id: 'settings',
    step: 4,
    label: 'הגדרות',
    description: 'כרטיסים ומחזיקים',
    icon: '⚙️',
  },
];

export function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<WorkflowTab>('dashboard');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth(): Promise<void> {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: unknown = await res.json();
        const parsed = HealthResponseSchema.parse(data);
        if (!cancelled) {
          setHealth(parsed);
          setHealthError(false);
        }
      } catch {
        if (!cancelled) {
          setHealthError(true);
        }
      }
    }

    void fetchHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50/70 text-slate-900 md:flex">
      {/* 🧭 Right Sidebar (RTL - Fixed & Sticky) */}
      <aside className="w-full md:w-72 lg:w-80 shrink-0 border-b md:border-b-0 md:border-l border-slate-200 bg-white md:min-h-screen md:sticky md:top-0 md:h-screen flex flex-col justify-between overflow-y-auto z-30 shadow-xs">
        <div className="p-4 sm:p-5">
          {/* Top Branding & Status */}
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-black text-white shadow-sm ring-2 ring-indigo-100">
                ₪
              </span>
              <div>
                <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
                  ניהול הוצאות
                </h1>
                <p className="text-[11px] text-slate-400">משק בית חכם</p>
              </div>
            </div>

            {/* Status indicator */}
            <div
              data-testid="health-indicator"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                health
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                  : healthError
                    ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {health && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    health
                      ? 'bg-emerald-500'
                      : healthError
                        ? 'bg-rose-500'
                        : 'bg-slate-400'
                  }`}
                />
              </span>
              <span>{health ? 'מסונכרן' : healthError ? 'שגיאת חיבור' : 'סנכרון...'}</span>
            </div>
          </div>

          {/* Navigation Items (Vertical List) */}
          <nav aria-label="ניווט ראשי" className="mt-4 space-y-1.5">
            {STEPS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition-all ${
                    isActive
                      ? 'bg-indigo-50/80 text-indigo-950 font-bold shadow-2xs ring-1 ring-indigo-200/80 border-r-4 border-indigo-600'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-bold truncate">
                      {item.label}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate font-normal">
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* 🎯 Contextual Sticky Slot for Dashboard Filters */}
          <div
            id="sidebar-filters-slot"
            className={activeTab === 'dashboard' ? 'mt-4 border-t border-slate-100 pt-3' : 'hidden'}
          />
        </div>

        {/* Footer info in sidebar */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-400 flex items-center justify-between">
          <span>ניהול הוצאות משק בית</span>
          <span className="font-mono">v1.2</span>
        </div>
      </aside>

      {/* 🖥️ Main Scroll-Free Content Area */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs min-h-[calc(100vh-4rem)]">
          {activeTab === 'settings' ? (
            <HouseholdSettings />
          ) : activeTab === 'coverage' ? (
            <StatementCoverage />
          ) : activeTab === 'inbox' ? (
            <UncategorizedInbox />
          ) : (
            <MonthlyDashboard />
          )}
        </section>
      </main>
    </div>
  );
}
