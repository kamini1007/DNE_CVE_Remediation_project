terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

# Points the AWS provider at LocalStack instead of real AWS. Only the
# services LocalStack Community actually emulates well are used anywhere in
# this directory - see README.md for exactly what that is and isn't.
provider "aws" {
  region                      = var.aws_region
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    secretsmanager = var.localstack_endpoint
    iam            = var.localstack_endpoint
    sts            = var.localstack_endpoint
  }

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = "localstack"
      ManagedBy   = "terraform"
    }
  }
}
