const ORIGINAL_ENV = process.env;

function freshOutcomeService(envOverrides) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...envOverrides };
  return {
    outcomeService: require('../src/services/outcomeTrackingService'),
    remediationRepository: require('../src/repository/remediationRepository'),
    jiraClient: require('../src/services/jiraClient'),
  };
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

const jiraEnv = {
  JIRA_BASE_URL: 'https://example.atlassian.net',
  JIRA_EMAIL: 'bot@example.com',
  JIRA_API_TOKEN: 'test-token',
  JIRA_PROJECT_KEY: 'SEC',
};

describe('pollOutcomes', () => {
  it('skips entirely when Jira is not configured', async () => {
    const { outcomeService } = freshOutcomeService({
      JIRA_BASE_URL: '',
      JIRA_EMAIL: '',
      JIRA_API_TOKEN: '',
      JIRA_PROJECT_KEY: '',
    });

    const result = await outcomeService.pollOutcomes();
    expect(result.skipped).toBe('jira_not_configured');
  });

  it('marks a ticket resolved when Jira reports a resolved status', async () => {
    const { outcomeService, remediationRepository, jiraClient } = freshOutcomeService(jiraEnv);

    jest.spyOn(remediationRepository, 'findTicketsAwaitingOutcome').mockResolvedValue([
      { cve_id: 'CVE-2024-1', jira_ticket_key: 'SEC-1', created_at: new Date(), playbook: { dueByHours: 24 } },
    ]);
    jest.spyOn(jiraClient, 'getIssueStatus').mockResolvedValue('Done');
    const markResolvedSpy = jest.spyOn(remediationRepository, 'markResolved').mockResolvedValue();

    const result = await outcomeService.pollOutcomes();

    expect(result.checked).toBe(1);
    expect(result.resolved).toBe(1);
    expect(markResolvedSpy).toHaveBeenCalledWith('CVE-2024-1', expect.any(Date), 24);
  });

  it('does not mark a ticket resolved when Jira reports an in-progress status', async () => {
    const { outcomeService, remediationRepository, jiraClient } = freshOutcomeService(jiraEnv);

    jest.spyOn(remediationRepository, 'findTicketsAwaitingOutcome').mockResolvedValue([
      { cve_id: 'CVE-2024-2', jira_ticket_key: 'SEC-2', created_at: new Date(), playbook: { dueByHours: 24 } },
    ]);
    jest.spyOn(jiraClient, 'getIssueStatus').mockResolvedValue('In Progress');
    const markResolvedSpy = jest.spyOn(remediationRepository, 'markResolved').mockResolvedValue();

    const result = await outcomeService.pollOutcomes();

    expect(result.resolved).toBe(0);
    expect(markResolvedSpy).not.toHaveBeenCalled();
  });

  it('continues polling remaining tickets when one lookup fails', async () => {
    const { outcomeService, remediationRepository, jiraClient } = freshOutcomeService(jiraEnv);

    jest.spyOn(remediationRepository, 'findTicketsAwaitingOutcome').mockResolvedValue([
      { cve_id: 'CVE-2024-3', jira_ticket_key: 'SEC-3', created_at: new Date(), playbook: { dueByHours: 24 } },
      { cve_id: 'CVE-2024-4', jira_ticket_key: 'SEC-4', created_at: new Date(), playbook: { dueByHours: 72 } },
    ]);
    jest.spyOn(jiraClient, 'getIssueStatus')
      .mockRejectedValueOnce(new Error('issue not found'))
      .mockResolvedValueOnce('Resolved');
    jest.spyOn(remediationRepository, 'markResolved').mockResolvedValue();

    const result = await outcomeService.pollOutcomes();

    expect(result.checked).toBe(2);
    expect(result.resolved).toBe(1);
  });

  it('is case-insensitive when matching resolved statuses', async () => {
    const { outcomeService, remediationRepository, jiraClient } = freshOutcomeService(jiraEnv);

    jest.spyOn(remediationRepository, 'findTicketsAwaitingOutcome').mockResolvedValue([
      { cve_id: 'CVE-2024-5', jira_ticket_key: 'SEC-5', created_at: new Date(), playbook: { dueByHours: 24 } },
    ]);
    jest.spyOn(jiraClient, 'getIssueStatus').mockResolvedValue('CLOSED');
    const markResolvedSpy = jest.spyOn(remediationRepository, 'markResolved').mockResolvedValue();

    await outcomeService.pollOutcomes();
    expect(markResolvedSpy).toHaveBeenCalled();
  });
});
