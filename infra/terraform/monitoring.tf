# CloudWatch log group that Fluent Bit ships application logs into.
# auto_create_group is deliberately false in the Fluent Bit config so the
# group's retention and encryption settings are managed here in Terraform
# rather than being created ad hoc with defaults (never-expire retention is
# a common and expensive surprise).
resource "aws_cloudwatch_log_group" "application" {
  name              = "/aws/eks/${var.project_name}/application"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-${var.environment}-application-logs"
  }
}

data "aws_iam_policy_document" "fluent_bit" {
  statement {
    sid    = "WriteApplicationLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
      "logs:DescribeLogGroups"
    ]
    resources = [
      aws_cloudwatch_log_group.application.arn,
      "${aws_cloudwatch_log_group.application.arn}:*"
    ]
  }
}

resource "aws_iam_policy" "fluent_bit" {
  name   = "${var.project_name}-${var.environment}-fluent-bit"
  policy = data.aws_iam_policy_document.fluent_bit.json
}

module "fluent_bit_irsa_role" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.48"

  role_name = "${var.project_name}-${var.environment}-fluent-bit-irsa"

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["logging:fluent-bit"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "fluent_bit" {
  role       = module.fluent_bit_irsa_role.iam_role_name
  policy_arn = aws_iam_policy.fluent_bit.arn
}

# --- Alerting destination ---
# Prometheus Alertmanager handles in-cluster alert routing, but an SNS topic
# gives a path for alerts that must survive the cluster itself being unhealthy
# (e.g. CloudWatch alarms on EKS control plane or RDS metrics).
resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.environment}-alerts"
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU above 80% - the ingestion/analysis batches may be oversized for this instance class."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5368709120 # 5 GiB
  alarm_description   = "RDS free storage below 5 GiB. The cve table grows continuously with ingestion."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }
}
