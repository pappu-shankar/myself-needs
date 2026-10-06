-- A voided recurring confirmation must stop occupying its period's slot.
--
-- The partial unique index on (recurring_rule_id, period_start) did not exclude
-- voided rows, so correcting a recurring-generated transaction was impossible:
-- the replacement collided with the very row it was replacing, surfacing as a
-- generic "that already exists". The same gap kept a wrongly-confirmed period
-- reported as confirmed forever — it never returned to the due worklist.
--
-- Index-only, so there is no data to migrate and nothing to roll back.
DROP INDEX `finance_transactions_rule_period_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `finance_transactions_rule_period_idx` ON `finance_transactions` (`recurring_rule_id`,`period_start`) WHERE "finance_transactions"."recurring_rule_id" IS NOT NULL AND "finance_transactions"."period_start" IS NOT NULL AND "finance_transactions"."voided_at" IS NULL;