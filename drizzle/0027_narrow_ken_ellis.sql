CREATE TABLE `finance_fx_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`date` text NOT NULL,
	`rate_scaled` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_fx_rates_pair_date_idx` ON `finance_fx_rates` (`base`,`quote`,`date`);--> statement-breakpoint
CREATE TABLE `finance_credit_terms` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`credit_limit_minor` integer,
	`currency` text DEFAULT 'INR' NOT NULL,
	`apr_bps` integer,
	`statement_day` integer,
	`due_day` integer,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `finance_entities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`base_currency` text,
	`notes` text,
	`archived_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_entity_stakes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` integer NOT NULL,
	`holder_entity_id` integer NOT NULL,
	`ownership_bps` integer NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `finance_entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_entity_id`) REFERENCES `finance_entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `finance_entity_stakes_entity_from_idx` ON `finance_entity_stakes` (`entity_id`,`effective_from`);--> statement-breakpoint
CREATE INDEX `finance_entity_stakes_holder_idx` ON `finance_entity_stakes` (`holder_entity_id`);--> statement-breakpoint
CREATE TABLE `finance_institutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`country` text,
	`notes` text,
	`archived_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_loan_terms` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`original_amount_minor` integer,
	`currency` text DEFAULT 'INR' NOT NULL,
	`rate_bps` integer,
	`rate_type` text,
	`tenure_months` integer,
	`emi_minor` integer,
	`first_emi_date` text,
	`schedule_basis` text DEFAULT 'reducing_balance' NOT NULL,
	`fees_minor` integer,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `finance_settings` ADD `base_currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `entity_id` integer REFERENCES finance_entities(id);--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `institution_id` integer REFERENCES finance_institutions(id);--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `kind` text DEFAULT 'asset' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `normal_balance` text DEFAULT 'debit' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `liquidity` text DEFAULT 'liquid' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `source` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `method` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `confidence` text DEFAULT 'reported' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `as_of` text;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `import_batch_id` integer;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `external_ref` text;--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `finance_budgets` ADD `currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` ADD `institution_id` integer REFERENCES finance_institutions(id);--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` ADD `entity_id` integer REFERENCES finance_entities(id);--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` ADD `currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` ADD `source` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` ADD `method` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` ADD `confidence` text DEFAULT 'reported' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` ADD `as_of` text;--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` ADD `import_batch_id` integer;--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` ADD `external_ref` text;--> statement-breakpoint
ALTER TABLE `finance_insurance_policies` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `source` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `method` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `confidence` text DEFAULT 'reported' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `as_of` text;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `import_batch_id` integer;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `external_ref` text;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `void_reason` text;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `superseded_by_id` integer;--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `entity_id` integer REFERENCES finance_entities(id);--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `institution_id` integer REFERENCES finance_institutions(id);--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `liquidity` text DEFAULT 'liquid' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `sector` text;--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `country` text;--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `market_cap_band` text;--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `finance_investment_valuations` ADD `price_currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_valuations` ADD `source` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_valuations` ADD `method` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_valuations` ADD `confidence` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_investment_valuations` ADD `as_of` text;--> statement-breakpoint
ALTER TABLE `finance_investment_valuations` ADD `import_batch_id` integer;--> statement-breakpoint
ALTER TABLE `finance_investment_valuations` ADD `external_ref` text;--> statement-breakpoint
ALTER TABLE `finance_recurring_rules` ADD `currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_recurring_rules` ADD `to_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `finance_recurring_rules` ADD `to_currency` text;--> statement-breakpoint
ALTER TABLE `finance_recurring_rules` ADD `paused_at` text;--> statement-breakpoint
ALTER TABLE `finance_recurring_rules` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `to_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `to_currency` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `source` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `method` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `confidence` text DEFAULT 'reported' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `as_of` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `import_batch_id` integer;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `external_ref` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `void_reason` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `superseded_by_id` integer;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `updated_at` text;--> statement-breakpoint
-- ───────────────────────────────────────────────────────────────────────────
-- Backfills, hand-added to the generated DDL above (same approach as 0023).
-- drizzle-kit only diffs schema, so data statements live here and do not
-- affect the snapshot. Every statement is idempotent: a migration that runs
-- against a vault twice, or against an empty new vault, must behave.
-- ───────────────────────────────────────────────────────────────────────────

-- Every vault gets one `Self` entity, owned 100% by itself. The vault *is* one
-- user's, so this is the one entity attribution that can be inferred safely.
INSERT INTO `finance_entities` (`kind`, `name`)
SELECT 'personal', 'Self'
WHERE NOT EXISTS (SELECT 1 FROM `finance_entities`);--> statement-breakpoint

-- 10000 bps = 100%. `1970-01-01` is the "from the beginning" sentinel, so an
-- as-of lookup at any historical date resolves.
INSERT INTO `finance_entity_stakes` (`entity_id`, `holder_entity_id`, `ownership_bps`, `effective_from`)
SELECT `e`.`id`, `e`.`id`, 10000, '1970-01-01'
FROM `finance_entities` `e`
WHERE `e`.`kind` = 'personal'
  AND NOT EXISTS (SELECT 1 FROM `finance_entity_stakes` `s` WHERE `s`.`entity_id` = `e`.`id`);--> statement-breakpoint

UPDATE `finance_accounts`
SET `entity_id` = (SELECT `id` FROM `finance_entities` WHERE `kind` = 'personal' ORDER BY `id` LIMIT 1)
WHERE `entity_id` IS NULL;--> statement-breakpoint

UPDATE `finance_investment_holdings`
SET `entity_id` = (SELECT `id` FROM `finance_entities` WHERE `kind` = 'personal' ORDER BY `id` LIMIT 1)
WHERE `entity_id` IS NULL;--> statement-breakpoint

-- `kind`/`normal_balance` from the set the code already treats as liabilities
-- (service/domain/accounts.ts LIABILITY_TYPES). The stored sign is unchanged —
-- these columns only make the existing convention explicit rather than inferred.
UPDATE `finance_accounts`
SET `kind` = 'liability', `normal_balance` = 'credit'
WHERE `type` IN ('credit_card', 'revolving_credit', 'loan');--> statement-breakpoint

-- Liquidity is consulted for assets only; liabilities keep the column default.
-- `investment` is semi-liquid deliberately: the stricter emergency-fund
-- definition (checking/savings/cash) is the one that governs coverage, and
-- counting a brokerage balance as a cash buffer overstates it.
UPDATE `finance_accounts`
SET `liquidity` = CASE `type`
  WHEN 'checking' THEN 'liquid'
  WHEN 'savings' THEN 'liquid'
  WHEN 'cash' THEN 'liquid'
  WHEN 'investment' THEN 'semi_liquid'
  WHEN 'receivable' THEN 'illiquid'
  ELSE `liquidity`
END
WHERE `kind` = 'asset';--> statement-breakpoint

UPDATE `finance_investment_holdings`
SET `liquidity` = CASE `type`
  WHEN 'equity' THEN 'liquid'
  WHEN 'intl_equity' THEN 'liquid'
  WHEN 'mutual_fund_domestic' THEN 'liquid'
  WHEN 'mutual_fund_intl' THEN 'liquid'
  WHEN 'bond' THEN 'semi_liquid'
  WHEN 'gold' THEN 'semi_liquid'
  WHEN 'fd' THEN 'semi_liquid'
  WHEN 'rd' THEN 'semi_liquid'
  WHEN 'govt_scheme' THEN 'illiquid'
  WHEN 'chit_fund' THEN 'illiquid'
  WHEN 'other_asset' THEN 'illiquid'
  ELSE `liquidity`
END;--> statement-breakpoint

-- `as_of` is when the value was true, taken from each row's own date column.
-- Never `date('now')`: that would stamp years of history as freshly observed,
-- destroying the staleness signal the column exists to carry.
UPDATE `finance_transactions` SET `as_of` = COALESCE(`date`, `created_at`) WHERE `as_of` IS NULL;--> statement-breakpoint
UPDATE `finance_investment_cash_flows` SET `as_of` = COALESCE(`date`, `created_at`) WHERE `as_of` IS NULL;--> statement-breakpoint
UPDATE `finance_investment_valuations` SET `as_of` = COALESCE(`date`, `created_at`) WHERE `as_of` IS NULL;--> statement-breakpoint
UPDATE `finance_insurance_policies` SET `as_of` = COALESCE(`start_date`, `created_at`) WHERE `as_of` IS NULL;--> statement-breakpoint
UPDATE `finance_accounts` SET `as_of` = `created_at` WHERE `as_of` IS NULL;--> statement-breakpoint

-- The one institution attribution that is derivable: an insurance policy's
-- free-text `provider` already *is* an insurer's name. Accounts and holdings
-- are deliberately left NULL — their only signal is a name like
-- "HDFC Savings", and fuzzy-parsing that is worse than leaving it to the user.
INSERT INTO `finance_institutions` (`name`, `kind`)
SELECT DISTINCT TRIM(`provider`), 'insurer'
FROM `finance_insurance_policies`
WHERE TRIM(COALESCE(`provider`, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM `finance_institutions` `i`
    WHERE `i`.`name` = TRIM(`finance_insurance_policies`.`provider`) AND `i`.`kind` = 'insurer'
  );--> statement-breakpoint

UPDATE `finance_insurance_policies`
SET `institution_id` = (
  SELECT `i`.`id` FROM `finance_institutions` `i`
  WHERE `i`.`name` = TRIM(`finance_insurance_policies`.`provider`) AND `i`.`kind` = 'insurer'
)
WHERE `institution_id` IS NULL;
