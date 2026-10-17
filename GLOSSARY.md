# Household Expense Tracking

Aggregates monthly credit card statements across household members, classifies spending by merchant and category, and visualizes monthly expense patterns.

## Language

### Cards & Statements

**Cardholder**:
A household member who owns one or more credit cards tracked by the system.
_Avoid_: User, account owner, member

**Card**:
A credit card issued by a provider (such as Isracard or American Express), belonging to a specific Cardholder and identified by its last four digits and display name.
_Avoid_: Account, payment method

**Statement**:
A single-Card monthly billing export file from a credit card provider listing all charges and credits billed to that Card for a given Billing Month.
_Avoid_: Bill, invoice, report

**Billing Month**:
The calendar year and month in which a Statement's charges are debited, serving as the primary period for monthly expense aggregation.
_Avoid_: Statement period, transaction month, cycle

### Transactions & Classification

**Transaction**:
A single charge, installment payment, or credit entry on a Statement, recorded with its ILS billed amount (plus original foreign amount/currency when applicable), purchase date, Card, Merchant, optional Notes, and optional Category Override.
_Avoid_: Purchase, expense, payment, line item

**Installment Info**:
The payment sequence metadata on an installment Transaction (current payment number, total number of payments, and total deal amount) used to project future Billing Month commitments.
_Avoid_: Payment plan, loan, split

**Excluded Transaction**:
A Transaction explicitly marked to be omitted from spending totals, budgets, and analytics charts (such as a reimbursed work expense or canceled duplicate) while remaining part of its Statement record.
_Avoid_: Deleted transaction, hidden transaction, ignored item

**Merchant**:
A canonical business or payee entity that aggregates one or more raw statement names and carries a default Category that applies retroactively to all of its Transactions without a Category Override.
_Avoid_: Vendor, store, business, shop

**Ambiguous Merchant**:
A Merchant (such as a peer-to-peer payment app like Bit or PayBox, or a general marketplace) flagged as requiring per-Transaction categorization rather than relying on a single default Category.
_Avoid_: Mixed vendor, uncategorizable merchant

**Merchant Alias**:
A raw merchant string or substring rule from a Statement that resolves automatically to a canonical Merchant.
_Avoid_: Mapping, nickname, raw vendor

**Category**:
A household-defined spending classification (e.g., "קניות", "פינוקים") belonging to a Spending Nature, optionally carrying a monthly Budget Target, and applied to Transactions via their Merchant's default or a Category Override.
_Avoid_: Tag, type, bucket, label

**Category Override**:
An explicit Category assignment on a specific Transaction that takes precedence over its Merchant's default Category.
_Avoid_: Custom tag, exception

**Spending Nature**:
The high-level character of a Category—either `Fixed` (הוצאות קבועות), `Variable` (הוצאות מחיה משתנות), or `Discretionary` (פינוקים ופנאי).
_Avoid_: Super-category, parent category, tier

**Budget Target**:
An optional monthly ILS spending limit set on a Category to measure actual Billing Month spending against household goals.
_Avoid_: Quota, cap, allowance
