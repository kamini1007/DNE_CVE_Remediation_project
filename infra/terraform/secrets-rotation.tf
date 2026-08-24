# --- DB password rotation: real and automated ---
#
# AWS publishes a maintained rotation Lambda for exactly this case
# (single-user RDS PostgreSQL credential rotation) via the Serverless
# Application Repository. Deploying that, rather than hand-writing a rotation
# Lambda, means AWS maintains the actual rotation logic (the tricky part -
# staging a new password, testing it, then promoting it) and this Terraform
# just wires it up.

resource "aws_serverlessapplicationrepository_cloudformation_stack" "rds_rotation" {
  name             = "${var.project_name}-${var.environment}-rds-rotation"
  application_id   = "arn:aws:serverlessrepo:us-east-1:297356227824:applications/SecretsManagerRDSPostgreSQLRotationSingleUser"
  capabilities     = ["CAPABILITY_IAM", "CAPABILITY_RESOURCE_POLICY"]
  semantic_version = "1.1.65"

  parameters = {
    functionName = "${var.project_name}-${var.environment}-rds-rotation"
    endpoint     = "secretsmanager.${var.aws_region}.amazonaws.com"
    vpcSubnetIds = join(",", module.vpc.private_subnets)
    vpcSecurityGroupIds = aws_security_group.rds_rotation_lambda.id
  }
}

# The rotation Lambda runs inside the VPC (it needs to reach RDS directly to
# test/set the new password) and needs its own security group, since it's
# not one of the application's own services.
resource "aws_security_group" "rds_rotation_lambda" {
  name_prefix = "${var.project_name}-${var.environment}-rds-rotation-lambda-"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-rotation-lambda-sg"
  }
}

# Let the rotation Lambda reach Postgres - without this, rotation deploys
# successfully and then fails silently on its first actual run.
resource "aws_security_group_rule" "rds_allow_rotation_lambda" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.rds_rotation_lambda.id
}

resource "aws_secretsmanager_secret_rotation" "db_credentials" {
  secret_id           = aws_secretsmanager_secret.db_credentials.id
  rotation_lambda_arn = aws_serverlessapplicationrepository_cloudformation_stack.rds_rotation.outputs["RotationLambdaARN"]

  rotation_rules {
    automatically_after_days = var.db_password_rotation_days
  }

  depends_on = [aws_secretsmanager_secret_version.db_credentials]
}

# --- Jira token rotation: reminder, not automation ---
#
# Atlassian does not offer a public API to create or rotate API tokens -
# tokens can only be created interactively in a user's account settings.
# There is nothing to automate here without Atlassian shipping that API.
# What IS honestly buildable: a scheduled check on the secret's age that
# alerts a human when it's time to go create a new token by hand.

data "archive_file" "jira_rotation_reminder" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/jira-rotation-reminder"
  output_path = "${path.module}/../lambda/jira-rotation-reminder.zip"

  # Only index.js ships - test files, package.json, and any local
  # node_modules are dev-time-only. The Lambda Node.js 20.x runtime already
  # bundles the AWS SDK v3 clients this function uses, so there's nothing to
  # npm-install for deployment anyway.
  excludes = ["test", "package.json", "package-lock.json", "node_modules"]
}

resource "aws_iam_role" "jira_rotation_reminder" {
  name = "${var.project_name}-${var.environment}-jira-rotation-reminder"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "jira_rotation_reminder" {
  name = "${var.project_name}-${var.environment}-jira-rotation-reminder"
  role = aws_iam_role.jira_rotation_reminder.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:DescribeSecret"]
        Resource = aws_secretsmanager_secret.jira_credentials.arn
      },
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.alerts.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/${var.project_name}-${var.environment}-jira-rotation-reminder:*"
      }
    ]
  })
}

resource "aws_lambda_function" "jira_rotation_reminder" {
  function_name    = "${var.project_name}-${var.environment}-jira-rotation-reminder"
  role             = aws_iam_role.jira_rotation_reminder.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  filename         = data.archive_file.jira_rotation_reminder.output_path
  source_code_hash = data.archive_file.jira_rotation_reminder.output_base64sha256

  environment {
    variables = {
      JIRA_SECRET_ARN     = aws_secretsmanager_secret.jira_credentials.arn
      ALERT_SNS_TOPIC_ARN = aws_sns_topic.alerts.arn
      REMINDER_AFTER_DAYS = var.jira_token_reminder_days
    }
  }
}

resource "aws_cloudwatch_event_rule" "jira_rotation_reminder" {
  name                = "${var.project_name}-${var.environment}-jira-rotation-reminder"
  description         = "Daily check on Jira API token age - alerts via SNS when manual rotation is due"
  schedule_expression = "rate(1 day)"
}

resource "aws_cloudwatch_event_target" "jira_rotation_reminder" {
  rule = aws_cloudwatch_event_rule.jira_rotation_reminder.name
  arn  = aws_lambda_function.jira_rotation_reminder.arn
}

resource "aws_lambda_permission" "jira_rotation_reminder_events" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.jira_rotation_reminder.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.jira_rotation_reminder.arn
}
