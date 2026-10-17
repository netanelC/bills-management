# Billing Month as Primary Aggregation Period

Israeli credit cards frequently include multi-month installment payments (`Installment Info`) and deferred charges where the purchase date differs from the bank debit cycle. We decided to aggregate and analyze all Transactions by their `Billing Month` and the actual ILS amount billed on that month's `Statement` (while preserving the original purchase date and installment metadata for drill-down and future commitment projections), ensuring monthly totals reconcile exactly with bank account debits.
