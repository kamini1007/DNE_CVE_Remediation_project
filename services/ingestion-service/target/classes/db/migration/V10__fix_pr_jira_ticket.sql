-- Records which Jira ticket (if any) a fix PR is linked to. Previously
-- the Jira reference only lived in the PR's own title/branch name/body
-- text on GitHub - not queryable or displayable from this platform's own
-- history table. Nullable, since a PR created before this column existed,
-- or created when Jira wasn't configured, has no ticket to record.
ALTER TABLE fix_pr ADD COLUMN IF NOT EXISTS jira_ticket_key VARCHAR(50);
ALTER TABLE fix_pr ADD COLUMN IF NOT EXISTS jira_ticket_url VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_fix_pr_jira_ticket_key ON fix_pr (jira_ticket_key);
