output "db_credentials_secret_name" {
  value = aws_secretsmanager_secret.db_credentials.name
}

output "nvd_api_key_secret_name" {
  value = aws_secretsmanager_secret.nvd_api_key.name
}

output "bedrock_iam_policy_arn" {
  value = aws_iam_policy.bedrock_invoke.arn
}

output "ai_analysis_local_role_arn" {
  value = aws_iam_role.ai_analysis_local.arn
}
