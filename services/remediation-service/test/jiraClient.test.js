const ORIGINAL_ENV = process.env;

function freshJiraClient(envOverrides) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...envOverrides };
  return require('../src/services/jiraClient');
}

const samplePlaybook = {
  summary: 'CVE-2024-12345 is CRITICAL risk.',
  urgency: 'CRITICAL',
  dueByHours: 24,
  steps: [{ order: 1, action: 'Patch it', priority: 'IMMEDIATE', owner: 'Security Team' }],
};

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
  delete global.fetch;
});

describe('createTicket - dry-run mode', () => {
  it('returns a dry-run result and never calls fetch when Jira env vars are missing', async () => {
    global.fetch = jest.fn();
    const { createTicket } = freshJiraClient({
      JIRA_BASE_URL: '',
      JIRA_EMAIL: '',
      JIRA_API_TOKEN: '',
      JIRA_PROJECT_KEY: '',
    });

    const result = await createTicket('CVE-2024-12345', samplePlaybook);

    expect(result).toEqual({ dryRun: true, ticketKey: null, ticketUrl: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('createTicket - configured mode', () => {
  const jiraEnv = {
    JIRA_BASE_URL: 'https://example.atlassian.net',
    JIRA_EMAIL: 'bot@example.com',
    JIRA_API_TOKEN: 'test-token',
    JIRA_PROJECT_KEY: 'SEC',
  };

  it('posts to the Jira issue API and returns the created ticket key/url', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'SEC-42' }),
    });
    const { createTicket } = freshJiraClient(jiraEnv);

    const result = await createTicket('CVE-2024-12345', samplePlaybook);

    expect(result).toEqual({
      dryRun: false,
      ticketKey: 'SEC-42',
      ticketUrl: 'https://example.atlassian.net/browse/SEC-42',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.atlassian.net/rest/api/3/issue',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends the project key, summary, and priority derived from playbook urgency', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ key: 'SEC-1' }) });
    const { createTicket } = freshJiraClient(jiraEnv);

    await createTicket('CVE-2024-12345', samplePlaybook);

    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody.fields.project.key).toBe('SEC');
    expect(requestBody.fields.summary).toContain('CVE-2024-12345');
    expect(requestBody.fields.priority.name).toBe('Highest'); // CRITICAL -> Highest
  });

  it('throws with a descriptive error when the Jira API returns a non-OK status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'field "project" is required',
    });
    const { createTicket } = freshJiraClient(jiraEnv);

    await expect(createTicket('CVE-2024-12345', samplePlaybook)).rejects.toThrow(/Jira API returned 400/);
  });
});
