-- Categories were the one descriptive table migration 0027 missed, so a
-- category that history referenced had no retire path: it could be renamed but
-- never hidden from the pickers, and deleting it is refused precisely because
-- history points at it. Additive and nullable, so every existing category stays
-- active.
ALTER TABLE `finance_categories` ADD `archived_at` text;