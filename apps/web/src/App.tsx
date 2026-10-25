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
}

const STEPS: readonly NavStep[] = [
  {
    id: 'settings',
    step: 1,
    label: 'הגדרות',
    description: 'כרטיסים ומחזיקים',
  },
  {
    id: 'coverage',
    step: 2,
    label: 'קליטה וכיסוי',
    description: 'העלאת דפי פירוט',
  },
  {
    id: 'inbox',
    step: 3,
    label: 'תיבת סיווג',
    description: 'שיוך מהיר וחוקים',
  },
  {
    id: 'dashboard',
    step: 4,
    label: 'דשבורד חודשי',
    description: 'מעקב, תקציב וניתוח',
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
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xs shadow-xs">
        {/* Top Branding & Status */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-black text-white shadow-sm ring-2 ring-indigo-100">
              ₪
            </span>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                ניהול הוצאות משק בית
              </h1>
              <p className="text-xs text-slate-500">
                קליטת פירוטים • סיווג מהיר • מעקב תקציב
              </p>
            </div>
          </div>

          {/* Elegant Status Indicator */}
          <div
            data-testid="health-indicator"
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-2xs transition-all ${
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
            <span>
              {health
                ? 'מסונכרן'
                : healthError
                  ? 'שגיאת חיבור לשרת'
                  : 'בודק סנכרון...'}
            </span>
          </div>
        </div>

        {/* Single Unified Stepper Navigation Bar (RTL 1 -> 4) */}
        <nav
          aria-label="שלבי תהליך"
          className="border-t border-slate-100 bg-slate-50/60"
        >
          <div className="mx-auto flex max-w-7xl overflow-x-auto px-6 py-2">
            <div className="flex w-full items-center justify-between gap-2 sm:gap-4">
              {STEPS.map((item, idx) => {
                const isActive = activeTab === item.id;
                return (
                  <React.Fragment key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`group flex flex-1 items-center gap-3 rounded-xl px-3 py-2 text-right transition-all ${
                        isActive
                          ? 'bg-white shadow-xs ring-1 ring-slate-200/80 border-b-2 border-indigo-600'
                          : 'hover:bg-white/60 hover:text-slate-900 text-slate-600'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black transition-colors ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-200/80 text-slate-600 group-hover:bg-slate-300'
                        }`}
                      >
                        {item.step}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={`text-xs sm:text-sm font-bold truncate ${
                            isActive ? 'text-indigo-900' : 'text-slate-700'
                          }`}
                        >
                          {item.label}
                        </div>
                        <div className="hidden sm:block text-[11px] text-slate-400 truncate">
                          {item.description}
                        </div>
                      </div>
                    </button>

                    {idx < STEPS.length - 1 && (
                      <span className="text-slate-300 select-none font-bold text-sm">
                        ←
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs">
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
