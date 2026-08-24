const config = require('../config/config');
const { jiraRequestTotal } = require('../metrics/metrics');

const PRIORITY_BY_RISK_LEVEL = {
  CRITICAL: 'Highest',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

/**
 * Creates a Jira issue for a remediation playbook. If Jira isn't configured
 * (any of JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN/JIRA_PROJECT_KEY missing),
 * returns a dry-run result instead of throwing - remediation-service should
 * still be useful (generating playbooks) even without a Jira integration.
 */
async function createTicket(cveId, playbook) {
  if (!config.jira.isConfigured) {
    jiraRequestTotal.inc({ outcome: 'skipped_dry_run' });
    return { dryRun: true, ticketKey: null, ticketUrl: null };
  }

  const body = {
    fields: {
      project: { key: config.jira.projectKey },
      summary: `[${playbook.urgency}] Remediate ${cveId}`,
      description: buildDescriptionDocument(cveId, playbook),
      issuetype: { name: config.jira.issueType },
      priority: { name: PRIORITY_BY_RISK_LEVEL[playbook.urgency] || 'Medium' },
      labels: ['cve-remediation', `risk-${playbook.urgency.toLowerCase()}`],
    },
  };

  const auth = Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString('base64');

  const response = await fetch(`${config.jira.baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    jiraRequestTotal.inc({ outcome: 'error' });
    throw new Error(`Jira API returned ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const created = await response.json();
  jiraRequestTotal.inc({ outcome: 'success' });
  return {
    dryRun: false,
    ticketKey: created.key,
    ticketUrl: `${config.jira.baseUrl}/browse/${created.key}`,
  };
}

/** Jira Cloud's REST API expects descriptions in Atlassian Document Format, not plain text/markdown. */
function buildDescriptionDocument(cveId, playbook) {
  const stepLines = playbook.steps.map(
    (step) => `${step.order}. [${step.priority}, ${step.owner}] ${step.action}`
  );

  return {
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: playbook.summary }] },
      { type: 'paragraph', content: [{ type: 'text', text: `Due within ${playbook.dueByHours} hours.` }] },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Remediation steps:\n' + stepLines.join('\n') }],
      },
    ],
  };
}

/** Fetches just the current status name for a Jira issue - used by the outcome-polling job. */
async function getIssueStatus(ticketKey) {
  if (!config.jira.isConfigured) {
    throw new Error('Jira is not configured - cannot poll issue status');
  }

  const auth = Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString('base64');

  const response = await fetch(`${config.jira.baseUrl}/rest/api/3/issue/${ticketKey}?fields=status`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Jira API returned ${response.status} fetching ${ticketKey}: ${errorText.slice(0, 500)}`);
  }

  const issue = await response.json();
  return issue.fields?.status?.name || null;
}

module.exports = { createTicket, getIssueStatus };
