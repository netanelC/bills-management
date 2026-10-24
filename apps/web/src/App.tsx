import React, { useEffect, useState } from 'react';
import { HealthResponseSchema, type HealthResponse } from '@bills/shared';
import { HouseholdSettings } from './components/HouseholdSettings.js';
import { MonthlyDashboard } from './components/MonthlyDashboard.js';
import { StatementCoverage } from './components/StatementCoverage.js';
import { UncategorizedInbox } from './components/UncategorizedInbox.js';

type WorkflowTab = 'settings' | 'coverage' | 'inbox' | 'dashboard';

interface NavItem {
  id: WorkflowTab;
  step: number;
  label: string;
  guideLabel: string;
  shortDesc: string;
  badgeClass: string;
  activeBorder: string;
  activeText: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'settings',
    step: 1,
    label: 'הגדרות משק בית',
    guideLabel: 'הגדרות',
    shortDesc: 'בני הזוג והכרטיסים',
    badgeClass: 'bg-blue-100 text-blue-800',
    activeBorder: 'border-blue-600',
    activeText: 'text-blue-700 font-bold',
  },
  {
    id: 'coverage',
    step: 2,
    label: 'כיסוי דפי פירוט',
    guideLabel: 'קליטה וכיסוי',
    shortDesc: 'העלאה ובדיקת חוסרים',
    badgeClass: 'bg-purple-100 text-purple-800',
    activeBorder: 'border-purple-600',
    activeText: 'text-purple-700 font-bold',
  },
  {
    id: 'inbox',
    step: 3,
    label: 'תיבת סיווג',
    guideLabel: 'סיווג עסקאות',
    shortDesc: 'עסקים חדשים ו-Bit',
    badgeClass: 'bg-amber-100 text-amber-800',
    activeBorder: 'border-amber-500',
    activeText: 'text-amber-700 font-bold',
  },
  {
    id: 'dashboard',
    step: 4,
    label: 'דשבורד חודשי',
    guideLabel: 'דשבורד הוצאות',
    shortDesc: 'תקציב, ניתוח ותובנות',
    badgeClass: 'bg-emerald-100 text-emerald-800',
    activeBorder: 'border-emerald-600',
    activeText: 'text-emerald-700 font-bold',
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
      <header className="border-b border-slate-200 bg-white shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-lg font-black text-white shadow-xs">
              ₪
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                ניהול הוצאות משק בית
              </h1>
              <p className="text-xs text-slate-500">
                קליטת פירוטי ישראכרט ואמקס • סיווג מהיר • מעקב תקציב
              </p>
            </div>
          </div>

          <div
            data-testid="health-indicator"
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              health
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                : healthError
                  ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                health
                  ? 'bg-emerald-500'
                  : healthError
                    ? 'bg-rose-500'
                    : 'bg-slate-400'
              }`}
            />
            {health
              ? `מחובר לשרת (${health.tablesInitialized} טבלאות)`
              : healthError
                ? 'שגיאת חיבור לשרת'
                : 'בודק חיבור לשרת...'}
          </div>
        </div>

        {/* 🧭 Visual Workflow Orientation Bar */}
        <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-2">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-500">
              🧭 מדריך התמצאות לפי שלבים:
            </span>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs">
              {NAV_ITEMS.map((item, idx) => {
                const isActive = activeTab === item.id;
                return (
                  <React.Fragment key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
                        isActive
                          ? `${item.badgeClass} font-bold shadow-2xs ring-2 ring-indigo-500/20`
                          : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/90 text-[10px] font-black">
                        {item.step}
                      </span>
                      <span>{item.guideLabel}</span>
                    </button>
                    {idx < NAV_ITEMS.length - 1 ? (
                      <span className="text-slate-300 font-bold">←</span>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Tabs Navigation */}
        <nav
          aria-label="ניווט ראשי"
          className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-6"
        >
          {NAV_ITEMS.map((item) => {
            const isSelected = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors ${
                  isSelected
                    ? `${item.activeBorder} ${item.activeText}`
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                <span
                  className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${item.badgeClass}`}
                >
                  שלב {item.step}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
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
