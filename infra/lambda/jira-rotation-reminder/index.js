const { SecretsManagerClient, DescribeSecretCommand } = require('@aws-sdk/client-secrets-manager');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const secretsClient = new SecretsManagerClient({});
const snsClient = new SNSClient({});

/**
 * Atlassian does not provide a public API to create or rotate API tokens -
 * they can only be created interactively in a user's account settings
 * (id.atlassian.com/manage-profile/security/api-tokens). There is nothing
 * to programmatically rotate here. This function is the honest alternative:
 * it checks how long it's been since the jira-credentials secret last
 * changed, and if that exceeds REMINDER_AFTER_DAYS, publishes an SNS alert
 * asking a human to go create a new token and update the secret by hand.
 *
 * Runs on a daily EventBridge schedule (see secrets-rotation.tf).
 */
exports.handler = async () => {
  const secretArn = process.env.JIRA_SECRET_ARN;
  const topicArn = process.env.ALERT_SNS_TOPIC_ARN;
  const reminderAfterDays = parseInt(process.env.REMINDER_AFTER_DAYS || '90', 10);

  const description = await secretsClient.send(new DescribeSecretCommand({ SecretId: secretArn }));

  // LastChangedDate reflects the last PutSecretValue call, i.e. the last
  // time a human actually updated the token value - not just metadata edits.
  const lastChanged = description.LastChangedDate;
  if (!lastChanged) {
    console.log('Secret has no LastChangedDate yet (never updated since creation) - skipping reminder check');
    return { skipped: true, reason: 'no_last_changed_date' };
  }

  const ageDays = (Date.now() - new Date(lastChanged).getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays < reminderAfterDays) {
    console.log(`Jira token is ${ageDays.toFixed(1)} days old, below the ${reminderAfterDays}-day reminder threshold`);
    return { reminded: false, ageDays };
  }

  const message =
    `The Jira API token in ${secretArn} is ${Math.floor(ageDays)} days old ` +
    `(threshold: ${reminderAfterDays} days).\n\n` +
    `Atlassian doesn't support rotating API tokens programmatically, so this ` +
    `requires a manual step:\n` +
    `1. Create a new token at https://id.atlassian.com/manage-profile/security/api-tokens\n` +
    `2. Update the secret: aws secretsmanager put-secret-value --secret-id ${secretArn} ` +
    `--secret-string '{"baseUrl":"...","email":"...","apiToken":"<new-token>","projectKey":"..."}'\n` +
    `3. Revoke the old token in Atlassian once remediation-service picks up the new one ` +
    `(it re-reads the secret via ExternalSecrets' refreshInterval, currently 1h).`;

  await snsClient.send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: 'Jira API token rotation due',
      Message: message,
    })
  );

  console.log(`Reminder sent - token age ${ageDays.toFixed(1)} days exceeds threshold ${reminderAfterDays} days`);
  return { reminded: true, ageDays };
};
