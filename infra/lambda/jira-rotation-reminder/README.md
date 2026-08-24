# jira-rotation-reminder

Daily Lambda (EventBridge-scheduled, see `infra/terraform/secrets-rotation.tf`)
that checks how long it's been since the `jira-credentials` Secrets Manager
secret was last updated, and publishes an SNS alert if it's overdue.

## Why this isn't real rotation

The DB password (`db-credentials`) gets genuine automated rotation via AWS's
maintained `SecretsManagerRDSPostgreSQLRotationSingleUser` Lambda - it
generates a new password, tests it against RDS, and promotes it, on a
schedule, with no human involved.

**Atlassian doesn't offer an equivalent for API tokens.** There is no public
API to create or invalidate a Jira/Atlassian API token - they can only be
created interactively at
`https://id.atlassian.com/manage-profile/security/api-tokens`. So there's
nothing this Lambda (or any Lambda) can automate here. Building a "rotation"
Lambda that pretended otherwise - or silently did nothing while implying it
handled this - would be worse than not building it.

What this does instead: track the token's age and nag a human when it's due,
with the exact manual steps in the alert message. That's the honest ceiling
for this specific case.

## Testing

```bash
npm install
npm test
```

Uses `aws-sdk-client-mock` rather than hitting real AWS - covers the
under-threshold case, the alert-fires case, the exact boundary (age equal to
the threshold should still alert), and the case where the secret has never
been updated (no `LastChangedDate` yet).

## Deployment

Not deployed via `npm install` + zip - see the `excludes` list in
`secrets-rotation.tf`'s `archive_file` data source. Only `index.js` ships;
the Lambda Node.js 20.x runtime already bundles the AWS SDK v3 clients this
function imports, so there's nothing to install for production.
