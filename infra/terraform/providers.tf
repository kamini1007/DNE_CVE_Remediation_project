terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Remote state - uncomment and fill in once the bootstrap S3 bucket + DynamoDB
  # lock table exist. Keeping state remote is important once more than one
  # person/pipeline runs terraform against this environment.
  #
  # backend "s3" {
  #   bucket         = "cve-remediation-tfstate-<account-id>"
  #   key            = "envs/dev/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "cve-remediation-tf-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
