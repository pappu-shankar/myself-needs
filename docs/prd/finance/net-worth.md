# Net Worth

**Related:** [investments.md](./investments.md) · [debts-loans.md](./debts-loans.md) · [reports-allocation.md](./reports-allocation.md)

Computed, not snapshotted: for each month, `assets` (checking + savings + cash + investment/bond/FD/RD/chit/scheme current value) minus `liabilities` (credit_card + loan balances), via a single grouped SQL aggregation over transactions/opening balances/latest valuations/accrual estimates.

No separate snapshot table to keep in sync. If this ever becomes a performance bottleneck at very large history sizes, a cached monthly-snapshot table can be added later behind the same query interface without changing any caller — see [../../architecture/data-model.md](../../architecture/data-model.md).
