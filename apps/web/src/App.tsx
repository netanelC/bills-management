import React, { useEffect, useState } from 'react';
import { HealthResponseSchema, type HealthResponse } from '@bills/shared';
import { HouseholdSettings } from './components/HouseholdSettings.js';
import { StatementCoverage } from './components/StatementCoverage.js';
import { UncategorizedInbox } from './components/UncategorizedInbox.js';

type WorkflowTab = 'dashboard' | 'inbox' | 'coverage' | 'settings';

interface NavItem {
  id: WorkflowTab;
  label: string;
  heading: string;
  subtitle: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'dashboard',
    label: 'דשבורד חודשי',
    heading: 'דשבורד ניתוח חודשי (Billing Month)',
    subtitle: 'ניתוח הוצאות לפי חודש חיוב (Billing Month)',
  },
  {
    id: 'inbox',
    label: 'תיבת סיווג',
    heading: 'תיבת סיווג מהיר (Uncategorized Inbox)',
    subtitle: 'בתי עסק חדשים ועסקאות מעורבות (Uncategorized Inbox)',
  },
  {
    id: 'coverage',
    label: 'כיסוי דוחות',
    heading: 'מטריצת כיסוי דוחות (Statement Coverage)',
    subtitle: 'העלאת קבצי ישראכרט/אמקס ומטריצת כרטיסים (Statement Coverage)',
  },
  {
    id: 'settings',
    label: 'הגדרות משק בית',
    heading: 'הגדרות משק בית (Household Settings)',
    subtitle:
      'מחזיקי כרטיס, כרטיסים וקטגוריות (Cardholders, Cards & Categories)',
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

  const currentNav =
    NAV_ITEMS.find((item) => item.id === activeTab) ?? NAV_ITEMS[0]!;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              מערכת ניתוח הוצאות אשראי
            </h1>
            <p className="text-sm text-slate-500">
              ריכוז וניתוח חודשי של פירוטי ישראכרט ואמריקן אקספרס למשק הבית
            </p>
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
                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isSelected
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          {activeTab === 'settings' ? (
            <HouseholdSettings />
          ) : activeTab === 'coverage' ? (
            <StatementCoverage />
          ) : activeTab === 'inbox' ? (
            <UncategorizedInbox />
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {currentNav.heading}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {currentNav.subtitle}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}


