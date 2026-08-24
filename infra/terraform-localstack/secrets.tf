# Same secret names/shapes as infra/terraform/secrets.tf, so anything you
# validate here (structure, naming, IAM access) transfers directly to the
# real AWS config. DB values are static placeholders here since there's no
# real RDS instance behind LocalStack - Postgres itself runs as a normal
# Docker container (see docker-compose.yml), not through LocalStack.

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${var.project_name}/local/db-credentials"
  description = "Placeholder DB credentials for LocalStack testing - matches the real secret's shape, not a real RDS instance"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    host     = "postgres" # the docker-compose service name
    port     = 5432
    dbname   = "cve_db"
    username = "postgres"
    password = "postgres"
  })
}

resource "aws_secretsmanager_secret" "nvd_api_key" {
  name        = "${var.project_name}/local/nvd-api-key"
  description = "NVD API key for LocalStack testing"
}

resource "aws_secretsmanager_secret_version" "nvd_api_key" {
  secret_id     = aws_secretsmanager_secret.nvd_api_key.id
  secret_string = jsonencode({ apiKey = "" })
}

resource "aws_secretsmanager_secret" "bedrock_config" {
  name        = "${var.project_name}/local/bedrock-config"
  description = "Bedrock config for LocalStack testing - in this environment ai-analysis-service actually talks to mock-bedrock, not this"
}

resource "aws_secretsmanager_secret_version" "bedrock_config" {
  secret_id = aws_secretsmanager_secret.bedrock_config.id
  secret_string = jsonencode({
    region   = var.aws_region
    modelIds = var.bedrock_model_ids
  })
}
