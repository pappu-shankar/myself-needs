# Entities & Ownership

**Related:** [net-worth.md](./net-worth.md) · [accounts-transactions.md](./accounts-transactions.md) · [institutions.md](./institutions.md) · [../../roadmap/phase-9-finance-remodel.md](../../roadmap/phase-9-finance-remodel.md)

Every account, holding and policy belongs to an **entity**. An entity is any actor whose wealth is being recorded: the user, a family member, a business, a trust, an SPV.

This is what makes the module work for HNI/UHNI users, where "my net worth" and "the wealth I'm responsible for" are different numbers.

## Entity

| Field | Notes |
|---|---|
| `kind` | `personal` · `joint` · `family_member` · `business` · `trust` · `other` |
| `name` | Free text — "Self", "Priya", "Acme Trading Pvt Ltd" |
| `base_currency` | Optional per-entity override; otherwise the user's base currency applies |
| `archived_at` | Entities are archived, never deleted — history references them |

Every vault is seeded with one `personal` entity named **Self**, held at 100%. An account with no explicit entity belongs to Self.

## Ownership stakes

`entity_stakes` records who owns how much of an entity, over time:

| Field | Notes |
|---|---|
| `entity_id` | The entity being owned |
| `holder_entity_id` | The entity doing the owning |
| `ownership_bps` | **Integer basis points** (7000 = 70%), never a float percentage |
| `effective_from` / `effective_to` | Dated — a stake that changes is a new row, not an overwrite |

**Why basis points and not a percentage:** stakes are used as multipliers on money. A REAL percentage reintroduces exactly the float drift that integer-paise storage was adopted to eliminate, and "70%" of a large illiquid holding is a number people argue about — it must be exact and auditable.

**Why dated:** a founder's stake dilutes across funding rounds. Net worth as of 2024 must use the 2024 stake, not today's. Overwriting the stake silently rewrites history.

## Consolidation order

This order is load-bearing and must not be rearranged:

```
sum per (entity, currency)
  → prorate by ownership_bps
    → convert to base currency at the as-of rate
      → sum
```

Converting before prorating double-rounds. Prorating before summing rounds once per row instead of once per entity subtotal.

## Rollups

- **Total net worth** = everything owned by `Self`, assets minus liabilities, no proration — the headline personal figure.
- **Individual net worth** = a single named entity in isolation, so a spouse's or a child's position can be read on its own.
- **Household net worth** = every `personal`, `joint` and `family_member` entity, each prorated by the stake held in it. Businesses and trusts are excluded.
- **Business-adjusted net worth** = household plus the user's prorated share of `business` and `trust` entities, with that share flagged **illiquid**.

Household and business-adjusted differ only by whether business and trust entities are included. They are kept separate because a family's spendable position and a family's total economic exposure are different questions, and conflating them is how an illiquid company stake ends up reading like money in the bank.

A 70% stake in a company valued at ₹20 Cr contributes ₹14 Cr of economic exposure — and that is explicitly *not* the same as ₹14 Cr in a bank account. See [net-worth.md](./net-worth.md) for how liquidity classes keep the two from reading as equivalent.

## Scope boundary — entities are not logins

Entities are **your record** of family and business wealth. They are not accounts those people sign into, and nothing syncs between a spouse's entity in your vault and that spouse's own login if they have one.

This is deliberate. A household rollup that read another user's vault would mean one user seeing another's financial data, which the product does not do — see [../../architecture/security.md](../../architecture/security.md). Linking real logins into a shared household is a future enhancement, and the entity model is shaped to accept it without a migration.

For two people who genuinely want a joint bookkeeping surface they both maintain, **shared spaces** already provide one.
