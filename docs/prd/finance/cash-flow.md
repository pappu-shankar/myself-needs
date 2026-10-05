# Cash Flow

**Related:** [accounts-transactions.md](./accounts-transactions.md) · [debts-loans.md](./debts-loans.md) · [investments.md](./investments.md) · [recurring-transactions.md](./recurring-transactions.md) · [budgets.md](./budgets.md) · [currency-fx.md](./currency-fx.md) · [net-worth.md](./net-worth.md)

Cash flow splits every movement of money into three kinds, rather than one income-minus-expense total.

| Kind          | What it contains                                                                |
| ------------- | ------------------------------------------------------------------------------- |
| **Operating** | Income and expenses — earning and living                                        |
| **Investing** | Purchases and sales of assets: securities, property, gold, fund units, deposits |
| **Financing** | Borrowing, repayment of principal, and interest on debt                         |

**Why three and not two:** plain category totals can say "you earned ₹1.2 Cr and spent ₹40L", which looks like an ₹80L surplus. They cannot say that ₹35L went into loan principal and ₹14L into a property purchase, so the **net investable surplus** was ₹31L. Putting asset purchases in "spending" misreads saving as consumption; leaving debt repayment out of the picture overstates what is free to invest. The split lets the app state the second sentence, which is the one that drives decisions.

## Operating

**Income sources:** salary · business · dividends · interest · rental · other. Taken from the category's income tag and a source label, so a user's own categories roll up without a fixed list.

**Expense categories:** the user's own categories from [accounts-transactions.md](./accounts-transactions.md), grouped by their parent.

Interest earned is operating income; interest _paid_ is financing (below), so the cost of debt is not buried inside lifestyle spend.

## Investing

Outflows are purchases (buy, SIP instalment, property purchase, gold purchase, deposit placed); inflows are sales, redemptions and maturities. Principal only — dividends and interest received are operating. Drawn from investment cash flows and transfers into investment accounts, so it ties to the same ledger rows that produce XIRR in [investments.md](./investments.md).

## Financing

Inflows are loan disbursals and drawdowns; outflows are principal repayments and **interest and fees paid**. A single EMI is split by the loan engine into its principal and interest parts — see [debts-loans.md](./debts-loans.md) — so the principal is financing and the interest is financing, and neither is counted as an expense.

## Surplus

```
net investable surplus = operating inflow − operating outflow − financing outflow (net of disbursals)
```

shown split by what happened to it: **invested** (investing outflow), **saved** (left as cash or deposits that stayed liquid), **spent** (operating outflow). Over a period the three reconcile to the change in liquid balance, and any remainder is shown as unexplained rather than forced to zero.

## What is excluded from all three

**Transfers and internal movements** — between the user's own accounts, a card payment from a bank account, cross-currency moves between own accounts — are in none of the three. They are never spending. A transfer nets to zero in net worth, and counting either leg would double-count the movement. Imported pairs are matched and confirmed before they are excluded — see [ingestion.md](./ingestion.md).

Voided transactions are excluded everywhere.

## Currency and confidence

Per-currency subtotals come from SQL with `currency` in the `GROUP BY`; conversion to the base currency happens afterwards in TypeScript at each row's date, and the result carries the audit shape from [currency-fx.md](./currency-fx.md). The result also carries the weakest contributing `confidence` and the mix by value, per [provenance-lifecycle.md](./provenance-lifecycle.md), so a surplus built partly on estimated rows says so.

## Emergency-fund coverage

How many months of expenses the liquid position covers: liquid assets ÷ trailing average monthly expense over the last three complete months.

Both halves of that ratio need stating wherever it appears, because both are judgement calls. "Liquid" is the `liquid` liquidity class only, never semi-liquid or illiquid — see [net-worth.md](./net-worth.md). The expense window excludes the current partial month, so a figure read on the 2nd is not distorted by two days of data, and excludes transfers and voided rows like every other cash-flow figure.

Expenses in other currencies convert to the base currency at the as-of rate, and the result carries the same confidence mix as any other aggregate — a coverage figure resting largely on estimated balances must say so.
