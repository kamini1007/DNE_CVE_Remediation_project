const { mockClient } = require('aws-sdk-client-mock');
const { SecretsManagerClient, DescribeSecretCommand } = require('@aws-sdk/client-secrets-manager');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const secretsMock = mockClient(SecretsManagerClient);
const snsMock = mockClient(SNSClient);

process.env.JIRA_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:jira-credentials';
process.env.ALERT_SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:alerts';
process.env.REMINDER_AFTER_DAYS = '90';

const { handler } = require('../index');

beforeEach(() => {
  secretsMock.reset();
  snsMock.reset();
});

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe('jira-rotation-reminder handler', () => {
  it('does not alert when the token is younger than the reminder threshold', async () => {
    secretsMock.on(DescribeSecretCommand).resolves({ LastChangedDate: daysAgo(10) });

    const result = await handler();

    expect(result.reminded).toBe(false);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it('publishes an SNS alert when the token exceeds the reminder threshold', async () => {
    secretsMock.on(DescribeSecretCommand).resolves({ LastChangedDate: daysAgo(120) });

    const result = await handler();

    expect(result.reminded).toBe(true);
    const calls = snsMock.commandCalls(PublishCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.TopicArn).toBe(process.env.ALERT_SNS_TOPIC_ARN);
    expect(calls[0].args[0].input.Message).toContain('id.atlassian.com');
  });

  it('alerts right at the threshold boundary (>=), not only strictly past it', async () => {
    secretsMock.on(DescribeSecretCommand).resolves({ LastChangedDate: daysAgo(90) });

    const result = await handler();
    expect(result.reminded).toBe(true);
  });

  it('skips gracefully when the secret has never been updated (no LastChangedDate)', async () => {
    secretsMock.on(DescribeSecretCommand).resolves({});

    const result = await handler();

    expect(result.skipped).toBe(true);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });
});
