# Specification: Household Credit Card Expense Management (`bills-management`)

## Problem Statement

A household managing multiple credit cards across two spouses (`Cardholder`s)—currently issued by Isracard and American Express—struggles to get a unified, accurate monthly picture of where its money goes. 

Specifically, the household faces the following pain points during its monthly financial review:
1. **Fragmented Monthly Statements**: Charges are split across multiple `Card`s belonging to both `Cardholder`s, and each `Statement` contains separate tables for domestic and foreign-currency charges as well as summary rows that clutter manual spreadsheet analysis.
2. **Repetitive & Inconsistent Merchant Classification**: Raw business names on credit card exports vary across branches and payment processors (e.g., `"שופרסל שלי"`, `"שופרסל דיל"`, `"PAYPAL *NETFLIX"`), forcing repetitive manual tagging every month unless businesses are normalized into canonical `Merchant` entities with persistent default `Category` rules.
3. **Ambiguous Payees & Exceptions**: Peer-to-peer payment apps (such as Bit or PayBox) and general marketplaces cannot rely on a single static `Merchant` classification and require a fast way to classify individual `Transaction`s without losing the convenience of automatic `Merchant`-level defaults for 90% of other charges.
4. **Mismatched Monthly Totals Due to Installments & Billing Cycles**: Grouping expenses by purchase date causes numbers to diverge from actual bank account debits whenever multi-month payments (`Installment Info`) or deferred end-of-month charges occur, hiding both the true monthly cash outflow and upcoming installment commitments for future months.
5. **Lack of Visual, Decision-Oriented Analytics**: Raw spreadsheet tables make it hard to immediately see total spending by `Category` and `Spending Nature` (`Fixed`, `Variable`, `Discretionary` / "פינוקים"), compare the current `Billing Month` against historical averages or a `Budget Target`, or slice expenses by `Cardholder` and `Card`.

---

## Solution

The solution is a local-first, Hebrew (RTL) web application built in a TypeScript `Turborepo` monorepo backed by a local SQLite database. It is designed around a streamlined once-a-month household review workflow ("טקס חודשי") in three stages:

1. **Batch Statement Ingestion & Coverage Matrix (`Statement Coverage`)**:
   - The user drags and drops closed monthly `Statement` files (`.xls`, `.xlsx`, `.csv`) exported from Isracard and American Express—one `Card` per file, multiple files at once.
   - The parser automatically extracts the `Card`'s last four digits, detects the `Billing Month`, merges domestic and foreign-currency tables, strips summary/header noise, deduplicates `Transaction`s, and prompts once to onboard any unrecognized `Card` (assigning its `Cardholder` and display nickname).
   - A visual coverage matrix displays every active `Card` across `Billing Month`s so the household can verify at a glance that no spouse's `Card` was forgotten.

2. **Fast Categorization Inbox (`Uncategorized Inbox`)**:
   - After importing, the system automatically resolves raw statement names via `Merchant Alias` rules (including stripping processor prefixes like `PAYPAL *` or `GOOGLE *`) to canonical `Merchant`s and applies their default `Category`.
   - Any newly encountered `Merchant` without a default `Category`, along with any `Transaction` belonging to an `Ambiguous Merchant` (such as Bit or PayBox), is surfaced in a dedicated zero-inbox screen where the user can assign a `Category`, merge duplicate `Merchant`s, or set a per-`Transaction` `Category Override` and `Notes` in seconds.

3. **Interactive Visual Analytics Dashboard (`Monthly & Trend Analytics`)**:
   - Anchored on `Billing Month` and actual ILS billed amounts (per ADR 0002), the dashboard presents:
     - **KPI Summary Cards**: Total `Billing Month` spending vs. prior months' average, split by `Spending Nature` (`Fixed` קבועות, `Variable` משתנות, `Discretionary` פינוקים), and breakdown by `Cardholder` and `Card`.
     - **Category Breakdown & Budget Tracking**: Visual bar/donut charts comparing each `Category` against its optional monthly `Budget Target` and historical average, with refunds offsetting category totals.
     - **Multi-Month Trend Chart**: Stacked bar chart showing spending evolution across `Billing Month`s segmented by `Category` or `Spending Nature`.
     - **Top Merchants & Active Installments Projection**: Ranking of highest-spend `Merchant`s and a forward-looking schedule of future `Billing Month` obligations derived from `Installment Info`.
     - **Interactive Drill-Down Transaction Table**: Clicking any chart segment, `Category`, `Merchant`, or `Cardholder` filters the underlying `Transaction` table, allowing inline editing of `Category Override`, `Notes`, or flagging an `Excluded Transaction`.

---

## User Stories

### Household Setup: Cardholders, Cards & Categories
1. As a household member, I want the system to come pre-seeded with two `Cardholder` profiles (myself and my spouse) whose display names I can edit, so that every `Card` can be attributed to its owner.
2. As a household member, I want the system to come pre-seeded with a Hebrew default set of `Category` items grouped under the three `Spending Nature` tiers (`Fixed`: חשבונות ודיור, תקשורת ומנויים, ביטוחים ובריאות, חינוך וחוגים; `Variable`: קניות וסופרמרקט, פארם וטיפוח, תחבורה ודלק, רכב ותחזוקה, שונות לבית; `Discretionary`: פינוקים ומסעדות, שופינג וביגוד, בילויים ופנאי, חופשות וטיולים, מתנות ואירועים), so that I can start classifying `Merchant`s immediately without manual setup.
3. As a household member, I want to create, rename, change the color/icon, or change the `Spending Nature` of any `Category`, so that our classification taxonomy reflects our household's exact mental model.
4. As a household member, I want to set or update an optional monthly `Budget Target` (in ILS) on any `Category`, so that I can visually track whether our monthly spending in that `Category` stayed within plan.
5. As a household member, I want to view and edit the list of registered `Card`s (including their last four digits, provider, display nickname, and assigned `Cardholder`), so that I can manage our household's active credit cards.

### Batch Statement Ingestion & Card Onboarding
6. As a household member, I want to drag and drop multiple Isracard and American Express `Statement` files (`.xls`, `.xlsx`, `.csv`) in a single batch upload, so that I can load all of my and my spouse's monthly files at once.
7. As a household member, I want the parser to automatically read both legacy HTML/XML-based `.xls`, binary `.xls`, modern `.xlsx`, and `.csv` exports from Isracard and American Express, so that I never have to manually convert files in Excel before uploading.
8. As a household member, I want the parser to automatically detect the `Card`'s last four digits and the `Billing Month` from each uploaded `Statement` header, so that files are routed to the right `Card` and period without manual data entry.
9. As a household member, I want the parser to extract both the domestic transactions table ("עסקאות בארץ") and the foreign-currency transactions table ("עסקאות בחו"ל / מט"ח") from a single `Statement` file while ignoring summary rows ("סה"כ חיוב..."), so that every real `Transaction` is captured accurately and totals are never double-counted.
10. As a household member, I want the upload preview screen to prompt me once when a `Statement` contains an unrecognized 4-digit `Card` number—asking me to select its `Cardholder` and give it a nickname—and remember that `Card` automatically on all future uploads.
11. As a household member, I want to see a pre-import preview summary for each file in the batch (showing detected `Card`, `Cardholder`, `Billing Month`, total ILS billed amount, number of new `Transaction`s, and number of skipped duplicates) before confirming the import, so that I can verify accuracy before writing to the database.
12. As a household member, I want the system to automatically deduplicate `Transaction`s based on a composite signature (`Card`, `Billing Month`, purchase date, raw merchant name, ILS billed amount, and installment/voucher metadata), so that accidentally uploading the same `Statement` twice never creates duplicate charges.
13. As a household member, I want a fallback column-mapping UI if an uploaded file's headers do not match the known Isracard/Amex layout, so that a future portal format change never blocks me from importing a `Statement`.
14. As a household member, I want to view a `Statement Coverage` matrix showing all registered `Card`s as rows and `Billing Month`s as columns (indicating which `Card` has an imported `Statement` and its total billed amount), so that I immediately spot if one of my or my spouse's `Card`s hasn't been uploaded yet for the month.

### Merchant Normalization, Aliases & Categorization Inbox
15. As a household member, I want raw merchant strings from imported `Statement`s to be automatically normalized (trimming redundant whitespace/branch numbers and extracting the real payee behind processor prefixes like `PAYPAL *NETFLIX` or `GOOGLE *YouTube`), so that clean `Merchant` entities are created automatically.
16. As a household member, I want each `Merchant` to store one or more `Merchant Alias` rules (exact match or substring match, e.g., contains `"שופרסל"`), so that all branch variations (`"שופרסל שלי"`, `"שופרסל דיל"`, `"שופרסל אונליין"`) automatically resolve to a single canonical `Merchant`.
17. As a household member, I want to merge two or more existing `Merchant`s into a single canonical `Merchant` with one action (automatically transferring all their `Transaction`s and converting their names into `Merchant Alias` rules), so that I can clean up fragmented vendor names at any time.
18. As a household member, I want every `Transaction` assigned to a `Merchant` to automatically inherit that `Merchant`'s default `Category` (unless the `Transaction` has a `Category Override`), so that once I classify a `Merchant` once, all past and future `Transaction`s at that `Merchant` are classified automatically.
19. As a household member, I want any change to a `Merchant`'s default `Category` to apply retroactively across all historical `Transaction`s of that `Merchant` (except those with an explicit `Category Override`), so that refining our taxonomy immediately updates historical trends.
20. As a household member, I want to flag specific `Merchant`s (such as `BIT`, `PAYBOX`, or general marketplaces) as an `Ambiguous Merchant`, so that their `Transaction`s are always routed to the `Uncategorized Inbox` for individual review rather than silently disappearing into a single default `Category`.
21. As a household member, I want a dedicated `Uncategorized Inbox` screen showing a badge count of: (a) newly imported `Merchant`s that lack a default `Category`, and (b) unreviewed `Transaction`s from `Ambiguous Merchant`s, so that I can classify an entire month's unknown items in under two minutes.
22. As a household member, I want to see sample `Transaction`s (dates and ILS amounts) next to each uncategorized `Merchant` in the `Uncategorized Inbox`, so that I have enough context to remember what that business is and pick the right `Category`.

### Transaction Overrides, Edge Cases & Installments
23. As a household member, I want to set or clear a `Category Override` on any individual `Transaction`, so that an atypical purchase at a known `Merchant` (e.g., buying a gift at a supermarket) is classified accurately without changing the `Merchant`'s default `Category`.
24. As a household member, I want to attach free-text `Notes` to any `Transaction`, so that I can record what a specific Bit transfer or large purchase was for.
25. As a household member, I want to mark or unmark any `Transaction` as an `Excluded Transaction`, so that reimbursed work expenses or canceled charges are omitted from all charts and spending totals while remaining visible in the `Statement` audit trail.
26. As a household member, I want credit/refund `Transaction`s (negative billed amounts) to automatically offset the total spending of their assigned `Category` in that `Billing Month`, so that returned purchases reduce net category expenditure accurately.
27. As a household member, I want foreign-currency `Transaction`s to be aggregated using their actual ILS billed amount from the `Statement` while preserving and displaying the original foreign amount and currency symbol alongside the ILS charge, so that all totals reconcile in ILS without losing foreign transaction details.
28. As a household member, I want the parser to extract `Installment Info` (current payment number $X$, total payments $Y$, and total deal amount) from installment remarks on the `Statement`, so that only the current month's payment is counted in the current `Billing Month` while future obligations are known.

### Visual Analytics & Monthly Exploration
29. As a household member, I want to select any `Billing Month` (or range of `Billing Month`s) and filter the entire dashboard by `Cardholder` (All / Me / Spouse), specific `Card`, `Spending Nature`, or `Category`, so that we can inspect both unified household spending and individual card patterns.
30. As a household member, I want to see top-level KPI cards for the selected `Billing Month` showing: Total Net Spend (in ILS), comparison (% and ₪ delta) against the trailing 3-month/6-month average, breakdown across the three `Spending Nature` groups (`Fixed`, `Variable`, `Discretionary`), and spend per `Cardholder`.
31. As a household member, I want a visual `Category` breakdown chart (horizontal bar chart and donut view) that displays each `Category`'s total ILS spend, share of monthly spend, comparison to the previous `Billing Month`, and visual progress/overrun indicator against its `Budget Target`.
32. As a household member, I want a multi-month trend stacked bar chart showing monthly spending across consecutive `Billing Month`s broken down by `Category` or `Spending Nature`, so that we can spot upward creeps or seasonal spikes over time.
33. As a household member, I want a `Top Merchants` visualization showing the businesses where the household spent the most in the selected `Billing Month` (and across time), including transaction count and average transaction size.
34. As a household member, I want a `Future Installments Forecast` widget that projects already-committed monthly installment charges into upcoming `Billing Month`s based on active `Installment Info` ($X < Y$), so that we know how much of next month's bill is already locked in.
35. As a household member, I want clicking on any bar, slice, `Category`, or `Merchant` in the dashboard charts to immediately filter the interactive `Transaction` drill-down table below it, so that I can inspect the exact charges behind any number.

---

## Implementation Decisions

### Architectural & Monorepo Structure
- **Local-First Monorepo Architecture**: Built with `pnpm` workspaces and `Turborepo`, running locally without external cloud dependencies or third-party bank-scraping credentials (per ADR 0001).
- **Workspace Packages**:
  - `apps/web`: React + Vite + Tailwind CSS single-page application rendered in full Hebrew RTL (`dir="rtl"`), using Recharts for interactive visualizations and TanStack Query for state synchronization.
  - `apps/api`: Local Node.js + Fastify HTTP server exposing JSON and multipart file upload endpoints.
  - `packages/domain`: Pure TypeScript domain package containing no framework or database dependencies. Houses the Isracard/Amex `Statement` parser, `Merchant Alias` normalization and resolution engine, `Transaction` deduplication fingerprinter, `Installment Info` projector, and `Billing Month` aggregation calculators.
  - `packages/db`: Local SQLite persistence layer managed via `better-sqlite3` and Drizzle ORM, storing the database file in a deterministic local data directory (`data/bills.sqlite`).
  - `packages/shared`: Shared Zod schemas and TypeScript DTO types consumed by both `apps/web` and `apps/api`.

### Domain Rules & Data Processing
- **Isracard & American Express Statement Parser**:
  - Accepts multipart uploads of `.xls`, `.xlsx`, and `.csv` files (parsed via `xlsx` / SheetJS + HTML table fallback for Isracard pseudo-XLS exports).
  - Scans header metadata cells to extract the 4-digit `Card` identifier and the `Billing Month` (`YYYY-MM`) corresponding to the bank debit date.
  - Identifies one or more transaction tables within the sheet (Specifically domestic charges and foreign-currency charges), mapping columns for purchase date, raw merchant name, original deal amount/currency, actual ILS billed amount, and additional details/installment notes (e.g., `"תשלום 2 מתוך 6"`).
  - Automatically discards summary rows (rows starting with `"סה"כ"` or lacking a valid purchase date and merchant name).
- **Deterministic Deduplication**:
  - Each parsed row generates a deterministic fingerprint from `(cardLast4, billingMonth, purchaseDate, rawMerchantName, billedAmountIls, installmentCurrent, installmentTotal, occurrenceIndexWithinStatement)`. Notice that `occurrenceIndexWithinStatement` ensures two identical coffees bought at the same `Merchant` on the same day on the same `Statement` are both kept, while re-uploading the same `Statement` skips both as existing duplicates.
- **Merchant Resolution Pipeline**:
  1. Strip known payment processor prefixes (`/^PAYPAL \*+/i`, `/^GOOGLE \*+/i`) and normalize whitespace.
  2. Check exact match against existing `Merchant Alias` records.
  3. Check substring/pattern rules defined on `Merchant Alias` records (ordered by longest pattern match first).
  4. If no match exists, create a new `Merchant` with `defaultCategoryId = null` and an exact `Merchant Alias` for the raw string, placing the `Merchant` in the `Uncategorized Inbox`.
- **Effective Category Calculation**:
  - A `Transaction`'s effective `Category` is resolved dynamically as: `transaction.categoryOverrideId ?? merchant.defaultCategoryId`.
  - If `merchant.isAmbiguous === true` (e.g., Bit / PayBox) and `transaction.categoryOverrideId === null`, the `Transaction` is considered uncategorized and surfaces in the `Uncategorized Inbox`.
  - Updating `merchant.defaultCategoryId` immediately updates the effective `Category` of all historical and future `Transaction`s for that `Merchant` where `categoryOverrideId IS NULL`.
- **Billing Month Aggregation & Installment Projection (per ADR 0002)**:
  - All monthly totals, `Spending Nature` splits, and `Budget Target` comparisons sum `billedAmountIls` grouped by `billingMonth` for all non-excluded `Transaction`s (`isExcluded === false`).
  - Negative `billedAmountIls` values (refunds/credits) subtract directly from their effective `Category`'s total in that `Billing Month`.
  - For any `Transaction` in the latest imported `Billing Month` per `Card` with `installmentCurrent < installmentTotal`, the domain engine projects `installmentTotal - installmentCurrent` future monthly commitments of `billedAmountIls` into the subsequent `Billing Month`s.

### Schema Shapes

```typescript
// Core relational schema shapes (Drizzle / SQLite)

type SpendingNature = 'FIXED' | 'VARIABLE' | 'DISCRETIONARY';

interface Cardholder {
  id: string;
  name: string; // e.g., "נתן", "אשתי"
  createdAt: string;
}

interface Card {
  id: string;
  cardholderId: string;
  lastFourDigits: string; // e.g., "1234"
  provider: 'ISRACARD' | 'AMEX' | 'OTHER';
  nickname: string;
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  spendingNature: SpendingNature;
  color: string;
  budgetTargetIls: number | null; // Optional monthly target in ILS
  sortOrder: number;
}

interface Merchant {
  id: string;
  canonicalName: string;
  defaultCategoryId: string | null;
  isAmbiguous: boolean; // True for Bit, PayBox, etc.
  createdAt: string;
}

interface MerchantAlias {
  id: string;
  merchantId: string;
  pattern: string;
  matchType: 'EXACT' | 'CONTAINS';
}

interface Statement {
  id: string;
  cardId: string;
  billingMonth: string; // Format: "YYYY-MM"
  sourceFilename: string;
  totalBilledIls: number;
  importedAt: string;
}

interface Transaction {
  id: string;
  statementId: string;
  cardId: string;
  merchantId: string;
  billingMonth: string; // Format: "YYYY-MM"
  purchaseDate: string; // Format: "YYYY-MM-DD"
  rawMerchantName: string;
  billedAmountIls: number; // Positive for charge, negative for refund/credit
  originalAmount: number;
  originalCurrency: string; // Default "ILS", or "USD", "EUR", etc.
  installmentCurrent: number | null;
  installmentTotal: number | null;
  installmentTotalAmountIls: number | null;
  categoryOverrideId: string | null;
  notes: string | null;
  isExcluded: boolean;
  dedupFingerprint: string; // Unique index
}
```

### API Contracts
- `POST /api/statements/preview`: Accepts multipart files; returns parsed preview per file (`detectedLastFour`, `existingCard`, `detectedBillingMonth`, `newTransactionsCount`, `duplicateTransactionsCount`, `totalBilledIls`, `requiresColumnMapping`).
- `POST /api/statements/commit`: Accepts confirmed batch payload (including new `Card` onboarding assignments for unrecognized 4-digit cards); persists `Card`s, `Statement`s, `Merchant`s, `Merchant Alias`es, and deduplicated `Transaction`s in a single database transaction.
- `GET /api/coverage`: Returns the `Card` $\times$ `Billing Month` coverage matrix with `Statement` totals.
- `GET /api/inbox`: Returns uncategorized `Merchant`s (with sample `Transaction`s) and uncategorized `Transaction`s belonging to `Ambiguous Merchant`s.
- `PATCH /api/merchants/:id`: Updates a `Merchant`'s `canonicalName`, `defaultCategoryId`, `isAmbiguous` flag, or adds a `Merchant Alias`.
- `POST /api/merchants/merge`: Merges source `Merchant` IDs into a target `Merchant` ID, re-pointing all `Transaction`s and `Merchant Alias`es within a transaction.
- `PATCH /api/transactions/:id`: Updates `categoryOverrideId`, `notes`, or `isExcluded` on a single `Transaction`.
- `GET /api/analytics/monthly`: Accepts filter query params (`billingMonth`, `cardholderId`, `cardId`); returns KPI summary, `Category` breakdown vs. `Budget Target` and trailing average, `Spending Nature` distribution, `Top Merchants`, multi-month trend series, and future installment projections.
- `GET /api/transactions`: Accepts filter query params (`billingMonth`, `cardholderId`, `cardId`, `categoryId`, `spendingNature`, `merchantId`, `search`, `includeExcluded`); returns matching `Transaction` rows with resolved `Merchant`, effective `Category`, and `Card` metadata.
- `GET / POST / PATCH / DELETE /api/categories`, `/api/cards`, `/api/cardholders`: CRUD endpoints for household configuration.

---

## Testing Decisions

### What Makes a Good Test
Tests must verify observable external behavior through the highest practical seam rather than testing private helper functions or mocking internal repository classes.

A test is good if:
1. **Single High-Level Seam (`Fastify.inject` + Ephemeral SQLite)**: Tests drive the system through `apps/api` HTTP endpoints using Fastify's `inject()` interface backed by an isolated in-memory or temporary SQLite database initialized with real Drizzle migrations and default seed data.
2. **Asserts on External Responses & Subsequent Reads**: Instead of asserting on internal SQL queries or private domain state, tests assert on the HTTP response of write operations (`POST /api/statements/commit`, `PATCH /api/merchants/:id`, `POST /api/merchants/merge`, `PATCH /api/transactions/:id`) and the resulting JSON payloads returned by read endpoints (`GET /api/inbox`, `GET /api/analytics/monthly`, `GET /api/coverage`, `GET /api/transactions`).
3. **Resilient to Refactoring**: Internal reorganization of `packages/domain` or `packages/db` never breaks a test as long as the HTTP contract remains satisfied.

### Modules & Behaviors to Test
1. **Batch Statement Ingestion & Parsing (`POST /api/statements/preview` & `/commit`)**:
   - Uploading realistic Isracard and American Express `.xls` / `.xlsx` / `.csv` fixtures containing domestic charges, foreign-currency charges, installment rows, negative refund rows, and `"סה"כ"` summary rows.
   - Verifying that summary rows are ignored, foreign charges use actual ILS billed amounts while preserving original currency, and onboarding a new 4-digit `Card` during commit persists the `Card` and links it to future uploads automatically.
   - Verifying that re-uploading the same `Statement` skips 100% of existing `Transaction`s while preserving identical same-day purchases within the same `Statement`.
2. **Merchant Normalization, Retroactive Categorization & Merging**:
   - Verifying that `PAYPAL *NETFLIX` normalizes to `NETFLIX`, and `CONTAINS` alias rules group branch variations under one `Merchant`.
   - Verifying that assigning a `defaultCategoryId` to an uncategorized `Merchant` removes it from `GET /api/inbox` and retroactively updates historical `Billing Month` analytics while leaving any `Transaction` with a `Category Override` untouched.
   - Verifying that `POST /api/merchants/merge` consolidates `Transaction`s and `Merchant Alias`es into the target `Merchant`.
3. **Ambiguous Merchants & Per-Transaction Overrides**:
   - Verifying that `Transaction`s under an `Ambiguous Merchant` (e.g., `BIT`) appear in `GET /api/inbox` until a `Category Override` is applied via `PATCH /api/transactions/:id`.
4. **Billing Month Analytics, Refunds, Exclusions & Installment Projections (`GET /api/analytics/monthly`)**:
   - Verifying that monthly totals, `Spending Nature` breakdowns, `Cardholder` filters, and `Budget Target` utilization percentages match expected ILS sums.
   - Verifying that negative refund `Transaction`s reduce their `Category` total and that flagging `isExcluded = true` omits the `Transaction` from all analytics totals.
   - Verifying that an installment `Transaction` ("תשלום 2 מתוך 5") counts only its monthly payment in the current `Billing Month` and projects 3 remaining payments into the future installments forecast.

---

## Out of Scope

1. **Automated Bank/Card Scraping**: Connecting directly to Isracard or American Express portals with credentials, 2FA/OTP handling, or `israeli-bank-scrapers` is out of scope (per ADR 0001).
2. **Cloud Hosting & Multi-Tenant Authentication**: User login, cloud deployment, and remote multi-device synchronization are out of scope; the system runs locally on the user's machine.
3. **Split Transactions**: Splitting a single `Transaction` line item across multiple `Category` allocations by partial ILS amounts is out of scope.
4. **Partial Mid-Month Statement Merging / Statement Deletion UI**: The workflow assumes uploading closed past `Billing Month` statements, so complex partial-month statement diffing and statement rollback UIs are out of scope.
5. **JSON/CSV Backup Export & Import UI**: Exporting or importing classification dictionaries or filtered CSVs from the UI is out of scope for the initial version.

---

## Further Notes

- **Domain Glossary**: All terminology in this specification adheres strictly to [`GLOSSARY.md`](./GLOSSARY.md).
- **Architecture Decision Records**:
  - [`docs/adr/0001-manual-statement-import.md`](./docs/adr/0001-manual-statement-import.md)
  - [`docs/adr/0002-billing-month-as-primary-period.md`](./docs/adr/0002-billing-month-as-primary-period.md)
