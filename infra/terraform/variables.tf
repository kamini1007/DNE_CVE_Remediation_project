variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project name, used as a resource-naming prefix"
  type        = string
  default     = "cve-remediation"
}

variable "environment" {
  description = "Environment name (dev/staging/prod)"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.30.0.0/16"
}

variable "availability_zones" {
  description = "AZs to spread subnets across"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS"
  type        = string
  default     = "1.30"
}

variable "eks_node_instance_types" {
  description = "Instance types for the default EKS managed node group"
  type        = list(string)
  default     = ["t3.large"]
}

variable "eks_node_desired_size" {
  type    = number
  default = 3
}

variable "eks_node_min_size" {
  type    = number
  default = 2
}

variable "eks_node_max_size" {
  type    = number
  default = 6
}

variable "db_instance_class" {
  description = "RDS instance class for PostgreSQL"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  type    = number
  default = 50
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.3"
}

variable "db_name" {
  type    = string
  default = "cve_db"
}

variable "db_username" {
  type      = string
  default   = "postgres"
  sensitive = true
}

variable "db_password" {
  description = "RDS master password. Prefer passing via TF_VAR_db_password env var or a CI secret - do not commit real values."
  type        = string
  sensitive   = true
}

variable "ecr_repositories" {
  description = "One ECR repo per microservice in the platform"
  type        = list(string)
  default = [
    "ingestion-service",
    "ai-analysis-service",
    "risk-engine-service",
    "remediation-service",
    "dashboard",
    "learning-service"
  ]
}

variable "bedrock_model_ids" {
  description = "Bedrock foundation model ARNs/IDs the AI analysis service is allowed to invoke"
  type        = list(string)
  default = [
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-haiku-20240307-v1:0"
  ]
}

# --- Phase 7: deployment & monitoring ---

variable "log_retention_days" {
  description = "CloudWatch Logs retention for application logs. Never-expire is the AWS default and gets expensive; 30 days is a reasonable starting point."
  type        = number
  default     = 30
}

variable "platform_hostname" {
  description = "Hostname the platform is served on, e.g. cve.example.com. Leave empty to skip ACM certificate creation (useful before DNS is ready)."
  type        = string
  default     = ""
}

# --- Secrets rotation ---

variable "db_password_rotation_days" {
  description = "How often Secrets Manager automatically rotates the RDS master password"
  type        = number
  default     = 30
}

variable "jira_token_reminder_days" {
  description = "Age (days) at which the Jira token reminder Lambda alerts that manual rotation is due. Atlassian has no API to rotate tokens programmatically, so this is a reminder, not automation."
  type        = number
  default     = 90
}
