variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "cve-remediation"
}

variable "localstack_endpoint" {
  description = "LocalStack's edge endpoint - default matches the docker-compose.localstack.yml port mapping"
  type        = string
  default     = "http://localhost:4566"
}

variable "bedrock_model_ids" {
  description = "Same list as the real infra/terraform config, kept in sync manually since this is an intentionally-separate overlay"
  type        = list(string)
  default = [
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-haiku-20240307-v1:0"
  ]
}
