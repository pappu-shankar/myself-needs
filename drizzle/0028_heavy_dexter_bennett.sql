-- Phase 9 step 1, destructive pass. Hand-written: `drizzle-kit generate` cannot
-- see that a rename is a rename, so its version dropped and re-added every money
-- column — losing every amount in the vault — and its `ADD ... NOT NULL` without
-- a default would fail outright on a populated table. Only the CREATE TABLE
-- shapes below are generated; everything else is written to preserve data.
--
-- Three groups of change, in order:
--   1. the loan/credit satellites are filled BEFORE the columns they read are
--      dropped (order is load-bearing);
--   2. money columns are RENAMEd, never re-added: they have held INTEGER minor
--      units since migration 0023, so `amount` -> `amount_minor` is a pure
--      rename with no data conversion, no new DEFAULT and NOT NULL preserved;
--   3. the genuine REAL -> INTEGER conversions (units, prices, statutory tax
--      figures) go through a table rebuild, because renaming a REAL column
--      would leave money sitting in a column with REAL affinity — which is the
--      exact bug migration 0023 was written to kill.
PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- ---------------------------------------------------------------- reconciliation
CREATE TABLE `finance_reconciliation_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`subject_table` text NOT NULL,
	`subject_id` integer NOT NULL,
	`detail` text NOT NULL,
	`resolved_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `finance_reconciliation_open_idx` ON `finance_reconciliation_items` (`resolved_at`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_reconciliation_subject_idx` ON `finance_reconciliation_items` (`kind`,`subject_table`,`subject_id`);--> statement-breakpoint

-- ------------------------------------------------- loan + credit terms: fill first
-- A row is created only where at least one term actually has a value, so the
-- satellites never carry fabricated all-null rows for every loan account.
-- `interest_rate` was a REAL percentage; terms store integer basis points.
INSERT OR IGNORE INTO `finance_loan_terms`
	("account_id", "original_amount_minor", "currency", "rate_bps", "tenure_months", "emi_minor")
SELECT
	"id",
	"original_amount",
	"currency",
	CAST(ROUND("interest_rate" * 100) AS INTEGER),
	"tenure_months",
	"emi_amount"
FROM `finance_accounts`
WHERE "type" = 'loan'
	AND COALESCE("original_amount", "emi_amount", "tenure_months", "interest_rate") IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `finance_credit_terms`
	("account_id", "credit_limit_minor", "currency", "apr_bps")
SELECT
	"id",
	"credit_limit",
	"currency",
	CAST(ROUND("interest_rate" * 100) AS INTEGER)
FROM `finance_accounts`
WHERE "type" IN ('credit_card', 'revolving_credit')
	AND COALESCE("credit_limit", "interest_rate") IS NOT NULL;--> statement-breakpoint

-- ------------------------------------------------------------- accounts rebuild
-- Re-assert the kind/normal_balance pairing before the CHECK starts enforcing
-- it. 0027 wrote the two together so they already agree; this exists so a
-- hand-edited vault cannot wedge sign-in behind a failed constraint.
UPDATE `finance_accounts`
SET `normal_balance` = CASE WHEN `kind` = 'liability' THEN 'credit' ELSE 'debit' END
WHERE `normal_balance` <> CASE WHEN `kind` = 'liability' THEN 'credit' ELSE 'debit' END;--> statement-breakpoint
ALTER TABLE `finance_accounts` RENAME COLUMN `opening_balance` TO `opening_balance_minor`;--> statement-breakpoint
CREATE TABLE `__new_finance_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`entity_id` integer,
	`institution_id` integer,
	`currency` text DEFAULT 'INR' NOT NULL,
	`kind` text DEFAULT 'asset' NOT NULL,
	`normal_balance` text DEFAULT 'debit' NOT NULL,
	`liquidity` text DEFAULT 'liquid' NOT NULL,
	`opening_balance_minor` integer DEFAULT 0 NOT NULL,
	`exclude_from_net_worth` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`method` text DEFAULT 'manual' NOT NULL,
	`confidence` text DEFAULT 'reported' NOT NULL,
	`as_of` text,
	`import_batch_id` integer,
	`external_ref` text,
	`archived_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `finance_entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `finance_institutions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "finance_accounts_kind_normal_balance_ck" CHECK(("__new_finance_accounts"."kind" = 'liability') = ("__new_finance_accounts"."normal_balance" = 'credit'))
);
--> statement-breakpoint
INSERT INTO `__new_finance_accounts`("id", "name", "type", "entity_id", "institution_id", "currency", "kind", "normal_balance", "liquidity", "opening_balance_minor", "exclude_from_net_worth", "source", "method", "confidence", "as_of", "import_batch_id", "external_ref", "archived_at", "created_at") SELECT "id", "name", "type", "entity_id", "institution_id", "currency", "kind", "normal_balance", "liquidity", "opening_balance_minor", "exclude_from_net_worth", "source", "method", "confidence", "as_of", "import_batch_id", "external_ref", "archived_at", "created_at" FROM `finance_accounts`;--> statement-breakpoint
DROP TABLE `finance_accounts`;--> statement-breakpoint
ALTER TABLE `__new_finance_accounts` RENAME TO `finance_accounts`;--> statement-breakpoint

-- ------------------------------------------------- money renames (no data change)
ALTER TABLE `finance_transactions` RENAME COLUMN `amount` TO `amount_minor`;--> statement-breakpoint
ALTER TABLE `finance_recurring_rules` RENAME COLUMN `amount` TO `amount_minor`;--> statement-breakpoint
ALTER TABLE `finance_budgets` RENAME COLUMN `monthly_limit` TO `monthly_limit_minor`;--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` RENAME COLUMN `sum_assured` TO `sum_assured_minor`;--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` RENAME COLUMN `premium_amount` TO `premium_amount_minor`;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` RENAME COLUMN `amount` TO `amount_minor`;--> statement-breakpoint

-- --------------------------------------------- units and rates: REAL -> scaled int
-- Units scale by 1e6 (UNITS_SCALE); rates become integer basis points. Both
-- source columns are nullable, so add/backfill/drop is enough — no rebuild.
ALTER TABLE `finance_investment_cash_flows` ADD `units_scaled` integer;--> statement-breakpoint
UPDATE `finance_investment_cash_flows`
SET `units_scaled` = CAST(ROUND(`units` * 1000000) AS INTEGER)
WHERE `units` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` DROP COLUMN `units`;--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `units_scaled` integer;--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `rate_bps` integer;--> statement-breakpoint
UPDATE `finance_investment_holdings`
SET `units_scaled` = CAST(ROUND(`units` * 1000000) AS INTEGER)
WHERE `units` IS NOT NULL;--> statement-breakpoint
UPDATE `finance_investment_holdings`
SET `rate_bps` = CAST(ROUND(`interest_rate` * 100) AS INTEGER)
WHERE `interest_rate` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` DROP COLUMN `units`;--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` DROP COLUMN `interest_rate`;--> statement-breakpoint

-- --------------------------------------------------------- valuations rebuild
-- `price_per_unit` is REAL NOT NULL, so it needs the rebuild: a RENAME would
-- leave an integer price in a column with REAL affinity.
CREATE TABLE `__new_finance_investment_valuations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer NOT NULL,
	`date` text NOT NULL,
	`price_scaled` integer NOT NULL,
	`price_currency` text DEFAULT 'INR' NOT NULL,
	`source` text DEFAULT 'unknown' NOT NULL,
	`method` text DEFAULT 'unknown' NOT NULL,
	`confidence` text DEFAULT 'unknown' NOT NULL,
	`as_of` text,
	`import_batch_id` integer,
	`external_ref` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `finance_investment_holdings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_finance_investment_valuations`("id", "holding_id", "date", "price_scaled", "price_currency", "source", "method", "confidence", "as_of", "import_batch_id", "external_ref", "created_at") SELECT "id", "holding_id", "date", CAST(ROUND("price_per_unit" * 1000000) AS INTEGER), "price_currency", "source", "method", "confidence", "as_of", "import_batch_id", "external_ref", "created_at" FROM `finance_investment_valuations`;--> statement-breakpoint
DROP TABLE `finance_investment_valuations`;--> statement-breakpoint
ALTER TABLE `__new_finance_investment_valuations` RENAME TO `finance_investment_valuations`;--> statement-breakpoint
CREATE UNIQUE INDEX `finance_investment_valuations_holding_date_idx` ON `finance_investment_valuations` (`holding_id`,`date`);--> statement-breakpoint

-- ------------------------------------------------------- statutory tax figures
-- These are Finance Act rupee figures that migration 0023 missed and that were
-- still REAL. They convert to INR paise, not to the user's base currency: a
-- statutory limit does not move when someone switches their display currency.
CREATE TABLE `__new_finance_tax_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`fiscal_year` text DEFAULT '2024-25' NOT NULL,
	`eighty_c_limit_minor` integer DEFAULT 15000000 NOT NULL,
	`eighty_d_limit_minor` integer DEFAULT 2500000 NOT NULL,
	`equity_ltcg_threshold_months` integer DEFAULT 12 NOT NULL,
	`equity_ltcg_exemption_minor` integer DEFAULT 12500000 NOT NULL,
	`equity_ltcg_rate_bps` integer DEFAULT 1250 NOT NULL,
	`equity_stcg_rate_bps` integer DEFAULT 2000 NOT NULL,
	`other_ltcg_threshold_months` integer DEFAULT 24 NOT NULL,
	`other_ltcg_rate_bps` integer DEFAULT 2000 NOT NULL,
	`other_stcg_rate_bps` integer DEFAULT 3000 NOT NULL,
	`standard_deduction_old_minor` integer DEFAULT 5000000 NOT NULL,
	`standard_deduction_new_minor` integer DEFAULT 7500000 NOT NULL,
	`cess_bps` integer DEFAULT 400 NOT NULL,
	`rebate_87a_threshold_old_minor` integer DEFAULT 50000000 NOT NULL,
	`rebate_87a_threshold_new_minor` integer DEFAULT 70000000 NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_finance_tax_settings`("id", "fiscal_year", "eighty_c_limit_minor", "eighty_d_limit_minor", "equity_ltcg_threshold_months", "equity_ltcg_exemption_minor", "equity_ltcg_rate_bps", "equity_stcg_rate_bps", "other_ltcg_threshold_months", "other_ltcg_rate_bps", "other_stcg_rate_bps", "standard_deduction_old_minor", "standard_deduction_new_minor", "cess_bps", "rebate_87a_threshold_old_minor", "rebate_87a_threshold_new_minor", "updated_at")
SELECT
	"id", "fiscal_year",
	CAST(ROUND("eighty_c_limit" * 100) AS INTEGER),
	CAST(ROUND("eighty_d_limit" * 100) AS INTEGER),
	"equity_ltcg_threshold_months",
	CAST(ROUND("equity_ltcg_exemption" * 100) AS INTEGER),
	CAST(ROUND("equity_ltcg_rate" * 100) AS INTEGER),
	CAST(ROUND("equity_stcg_rate" * 100) AS INTEGER),
	"other_ltcg_threshold_months",
	CAST(ROUND("other_ltcg_rate" * 100) AS INTEGER),
	CAST(ROUND("other_stcg_rate" * 100) AS INTEGER),
	CAST(ROUND("standard_deduction_old" * 100) AS INTEGER),
	CAST(ROUND("standard_deduction_new" * 100) AS INTEGER),
	CAST(ROUND("cess_percent" * 100) AS INTEGER),
	CAST(ROUND("rebate_87a_threshold_old" * 100) AS INTEGER),
	CAST(ROUND("rebate_87a_threshold_new" * 100) AS INTEGER),
	"updated_at"
FROM `finance_tax_settings`;--> statement-breakpoint
DROP TABLE `finance_tax_settings`;--> statement-breakpoint
ALTER TABLE `__new_finance_tax_settings` RENAME TO `finance_tax_settings`;--> statement-breakpoint
CREATE UNIQUE INDEX `finance_tax_settings_fy_idx` ON `finance_tax_settings` (`fiscal_year`);--> statement-breakpoint
CREATE TABLE `__new_finance_tax_slabs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fiscal_year` text DEFAULT '2024-25' NOT NULL,
	`regime` text NOT NULL,
	`upto_amount_minor` integer,
	`rate_bps` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_finance_tax_slabs`("id", "fiscal_year", "regime", "upto_amount_minor", "rate_bps")
SELECT
	"id", "fiscal_year", "regime",
	CAST(ROUND("upto_amount" * 100) AS INTEGER),
	CAST(ROUND("rate_percent" * 100) AS INTEGER)
FROM `finance_tax_slabs`;--> statement-breakpoint
DROP TABLE `finance_tax_slabs`;--> statement-breakpoint
ALTER TABLE `__new_finance_tax_slabs` RENAME TO `finance_tax_slabs`;--> statement-breakpoint
CREATE INDEX `finance_tax_slabs_fy_regime_idx` ON `finance_tax_slabs` (`fiscal_year`,`regime`);--> statement-breakpoint

-- ------------------------------------------------------------------ plans goals
ALTER TABLE `plans_goals` ADD `target_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `plans_goals` ADD `currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
UPDATE `plans_goals`
SET `target_amount_minor` = CAST(ROUND(`target_amount` * 100) AS INTEGER)
WHERE `target_amount` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `plans_goals` DROP COLUMN `target_amount`;--> statement-breakpoint

-- ------------------------------------------------- seed the reconciliation queue
-- Every question the foundation could not answer for itself. `INSERT OR IGNORE`
-- against the (kind, subject) unique index makes a re-run idempotent, and a
-- question the user has already resolved is not re-asked.
INSERT OR IGNORE INTO `finance_reconciliation_items` ("kind", "subject_table", "subject_id", "detail")
SELECT 'currency_unconfirmed', 'finance_investment_holdings', "id",
	'Foreign-denominated holding "' || "name" || '" was assumed to be in INR. If its prices were entered in another currency, set it here — an unconfirmed INR is a silent factor-of-85 error.'
FROM `finance_investment_holdings`
WHERE "type" IN ('intl_equity', 'mutual_fund_intl') AND "currency" = 'INR';--> statement-breakpoint
INSERT OR IGNORE INTO `finance_reconciliation_items` ("kind", "subject_table", "subject_id", "detail")
SELECT 'entity_unattributed', 'finance_accounts', "id",
	'Account "' || "name" || '" was attributed to Self because no entity existed before this migration. Reassign it if it belongs to a family member or a business.'
FROM `finance_accounts`
WHERE "entity_id" IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `finance_reconciliation_items` ("kind", "subject_table", "subject_id", "detail")
SELECT 'institution_unknown', 'finance_accounts', "id",
	'No institution is linked to "' || "name" || '". The only signal was the account name, and guessing from free text is worse than asking.'
FROM `finance_accounts`
WHERE "institution_id" IS NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `finance_reconciliation_items` ("kind", "subject_table", "subject_id", "detail")
SELECT 'valuation_provenance_unknown', 'finance_investment_holdings', "h"."id",
	'Prices for "' || "h"."name" || '" carry no provenance: in pre-migration data a refreshed NAV and a hand-typed price are indistinguishable. Confirm how these were obtained.'
FROM `finance_investment_holdings` AS "h"
WHERE EXISTS (
	SELECT 1 FROM `finance_investment_valuations` AS "v"
	WHERE "v"."holding_id" = "h"."id" AND "v"."source" = 'unknown'
);--> statement-breakpoint
PRAGMA foreign_keys=ON;
