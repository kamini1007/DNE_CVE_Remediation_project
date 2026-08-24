-- Trivy reports a severity per vulnerability (CRITICAL/HIGH/MEDIUM/LOW/
-- UNKNOWN) that was never actually captured - only installed/fixed version
-- were stored. Nullable since existing rows from before this migration
-- won't have a value.
ALTER TABLE scanner_finding ADD COLUMN IF NOT EXISTS severity VARCHAR(20);
