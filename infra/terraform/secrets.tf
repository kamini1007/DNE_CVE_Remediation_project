# Application services read these at startup / via External Secrets Operator
# in-cluster, rather than having credentials baked into images or plain k8s
# Secrets checked into git.

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${var.project_name}/${var.environment}/db-credentials"
  description = "PostgreSQL master credentials for the CVE remediation platform"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    host     = aws_db_instance.postgres.address
    port     = aws_db_instance.postgres.port
    dbname   = var.db_name
    username = var.db_username
    password = var.db_password
  })
}

resource "aws_secretsmanager_secret" "nvd_api_key" {
  name        = "${var.project_name}/${var.environment}/nvd-api-key"
  description = "NVD API key used by the ingestion service to raise its rate limit"
}

resource "aws_secretsmanager_secret_version" "nvd_api_key" {
  secret_id     = aws_secretsmanager_secret.nvd_api_key.id
  secret_string = jsonencode({ apiKey = "" }) # fill in via `terraform apply -var` or console, not in git
}

resource "aws_secretsmanager_secret" "bedrock_config" {
  name        = "${var.project_name}/${var.environment}/bedrock-config"
  description = "Bedrock region/model configuration for the AI analysis service"
}

resource "aws_secretsmanager_secret_version" "bedrock_config" {
  secret_id = aws_secretsmanager_secret.bedrock_config.id
  secret_string = jsonencode({
    region  = var.aws_region
    modelIds = var.bedrock_model_ids
  })
}

resource "aws_secretsmanager_secret" "jira_credentials" {
  name        = "${var.project_name}/${var.environment}/jira-credentials"
  description = "Jira API credentials for remediation-service ticket creation. Optional - remediation-service runs in dry-run mode if this is left empty."
}

resource "aws_secretsmanager_secret_version" "jira_credentials" {
  secret_id = aws_secretsmanager_secret.jira_credentials.id
  secret_string = jsonencode({
    baseUrl    = ""
    email      = ""
    apiToken   = ""
    projectKey = ""
  }) # fill in via console/CLI, not in git - leave blank to keep remediation-service in dry-run mode
}
