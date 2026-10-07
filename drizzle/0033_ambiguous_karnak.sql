-- Tax paid, separated from lifestyle spending in wealth attribution.
--
-- A flag rather than a name match: "Income tax", "TDS", "Advance tax" and
-- "Self-assessment" are all tax and share no substring, and a name rule would
-- silently reclassify a category the day someone renamed it. Defaults to false,
-- so no existing category is reinterpreted.
ALTER TABLE `finance_categories` ADD `is_tax` integer DEFAULT false NOT NULL;