# Household Expense Management System (ניהול הוצאות משק בית)

A modern, full-stack TypeScript monorepo designed for Israeli households to ingest, normalize, categorize, and analyze monthly credit card statements across multiple household members and credit card providers.

---

## 🎯 Highlights & Features

- **Multi-Format Batch Statement Ingestion**:
  - Ingests credit card statements exported from **Isracard** and **American Express** (`.xls` HTML-table format, `.xlsx`, and `.csv`).
  - Automatically detects the **Card's last four digits**, **Billing Month (`YYYY-MM`)**, transaction dates, domestic and foreign currencies (ILS, USD, EUR), refunds, and installments (`Installment Info`).
  - Fallback interactive column-mapping modal for custom or legacy statement formats.

- **Pre-Seeded Household & Card Onboarding**:
  - Pre-seeded dual-partner household profiles (`Cardholders`), credit cards (`Cards`), and categories.
  - Automatic detection and one-click onboarding prompt for unrecognized 4-digit credit cards during statement upload.

- **Card × Billing Month Coverage Matrix**:
  - Visual matrix tracking received vs. missing statements across all household cards for every billing period, guaranteeing financial data completeness.

- **Canonical Merchant Normalization & Uncategorized Inbox**:
  - Strips clearinghouse processor prefixes (e.g., `PAYPAL *`, `BIT*`, `PAYBOX*`, subscription tags).
  - Regex- and substring-based `Merchant Alias` learning rules.
  - Quick-triage **Inbox** for newly discovered merchants with one-click default categorization and merchant merging (`Merge Merchants`).

- **Per-Transaction Controls & Exclusions**:
  - **Category Override**: Override a merchant's default category on specific individual transactions.
  - **Excluded Transaction**: Mark reimbursed work expenses or non-household transactions to exclude them from analytics totals while preserving the audit trail.
  - **Freeform Notes**: Add context or annotations to any transaction.

- **Interactive Monthly Dashboard & Budget Tracking**:
  - Net spending calculations (automatically netting refunds within their respective category).
  - Visual budget progress bars and overrun alerts against **Budget Targets**.
  - Historical comparison against the 3-month trailing moving average.
  - Drill-down exploration filters: by Cardholder, Card, Spending Nature (`Fixed`, `Variable`, `Discretionary`), Category, and search query.

- **Longitudinal Trends & Future Installment Forecast**:
  - Multi-month trend tracking across historical billing months.
  - Top merchant aggregations.
  - Future billing commitment forecasting based on active installment plans ($X$ of $Y$ remaining payments).

- **Hebrew RTL First-Class UX**:
  - Built from the ground up for right-to-left (`dir="rtl"`) reading and Hebrew terminology compliant with [`GLOSSARY.md`](./GLOSSARY.md).

---

## 🏗️ Architecture & Monorepo Structure

Built with [Turborepo](https://turbo.build/) and [pnpm](https://pnpm.io/) workspaces with strict TypeScript:

```
├── apps/
│   ├── api/          # Fastify REST API, multipart parser, SQLite repository
│   └── web/          # React 19 + Vite + Tailwind CSS (v4) Hebrew RTL Web UI
├── packages/
│   ├── shared/       # Zod schemas, DTOs, and shared domain contracts
│   ├── domain/       # Pure business logic: normalization, installment projections, analytics
│   └── db/           # SQLite schema (Drizzle ORM), migrations, and seeds
├── docs/
│   └── adr/          # Architecture Decision Records (ADRs)
├── GLOSSARY.md       # Ubiquitous domain language & terminology
└── SPEC.md           # Product & technical specification
```

---

## 🛠️ Tech Stack

- **Runtime & Package Manager**: Node.js (>= 20), pnpm (v10)
- **Monorepo Engine**: Turborepo
- **Backend**: Fastify v5, Zod v3, `@fastify/multipart`, `@fastify/cors`, `xlsx`
- **Database**: SQLite (via `better-sqlite3`), Drizzle ORM
- **Frontend**: React 19, TypeScript, Vite v6, Tailwind CSS v4
- **Testing**: Vitest v3, `@testing-library/react`, JSDOM, `@faker-js/faker`

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher (tested on Node `v24`)
- **pnpm**: `v10.0.0` or higher

```bash
# Verify versions
node -v
pnpm -v
```

### 1. Installation

Clone the repository and install all workspace dependencies:

```bash
git clone <repository-url>
cd bills-management
pnpm install
```

### 2. Build the Monorepo

Compile all shared packages (`@bills/shared`, `@bills/domain`, `@bills/db`) and applications:

```bash
pnpm build
```

### 3. Start Development Servers

Run the backend API and frontend dev server simultaneously:

```bash
pnpm dev
```

- **Frontend Web UI**: [http://localhost:5173](http://localhost:5173)
- **Backend API Server**: [http://localhost:3001](http://localhost:3001)
- **API Health Check**: [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

## 🧪 Testing & Quality Assurance

All suites follow strict test isolation, AAA structure (Arrange-Act-Assert), and conventions:

```bash
# Run all unit, integration, and component tests across the monorepo
pnpm test

# Run TypeScript strict typecheck across all workspaces
pnpm typecheck

# Run linter
pnpm lint
```

---

## 📖 Key Domain Concepts

See [`GLOSSARY.md`](./GLOSSARY.md) for full terminology definitions:

| Term | Hebrew Term | Description |
| :--- | :--- | :--- |
| **Cardholder** | מחזיק כרטיס | A household member who owns one or more credit cards. |
| **Card** | כרטיס אשראי | Credit card belonging to a Cardholder, identified by 4 digits and display name. |
| **Statement** | דף פירוט | Monthly billing statement export from a card provider. |
| **Billing Month** | חודש חיוב | The debit calendar month (`YYYY-MM`) used as primary reporting period. |
| **Transaction** | עסקה | A single debit, credit, or installment item on a statement. |
| **Merchant** | בית עסק | Canonical business entity aggregating statement names. |
| **Spending Nature** | אופי הוצאה | High-level classification: `Fixed`, `Variable`, or `Discretionary`. |
| **Budget Target** | יעד תקציב | Monthly ILS spending goal set on a category. |
| **Excluded Transaction** | עסקה מוחרגת | A transaction omitted from totals (e.g. reimbursed work expense). |

---

## 📄 License

Private household project. All rights reserved.
