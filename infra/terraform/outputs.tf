output "eks_cluster_name" {
  value = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "eks_oidc_provider_arn" {
  value = module.eks.oidc_provider_arn
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.address
}

output "rds_port" {
  value = aws_db_instance.postgres.port
}

output "ecr_repository_urls" {
  value = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}

output "ai_analysis_irsa_role_arn" {
  value = module.ai_analysis_irsa_role.iam_role_arn
}

output "configure_kubectl" {
  value = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

# --- Phase 7 outputs (fill these into the k8s manifests) ---

output "fluent_bit_irsa_role_arn" {
  description = "Annotate the logging:fluent-bit ServiceAccount with this (k8s/monitoring/fluent-bit.yaml)"
  value       = module.fluent_bit_irsa_role.iam_role_arn
}

output "alb_controller_irsa_role_arn" {
  description = "Used by the AWS Load Balancer Controller Helm install"
  value       = module.alb_controller_irsa_role.iam_role_arn
}

output "application_log_group" {
  value = aws_cloudwatch_log_group.application.name
}

output "alerts_sns_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "acm_certificate_arn" {
  description = "Fill into the ingress's certificate-arn annotation (k8s/base/ingress.yaml). Empty if platform_hostname wasn't set."
  value       = try(aws_acm_certificate.platform[0].arn, "")
}

# --- Secrets rotation outputs ---

output "db_rotation_lambda_arn" {
  description = "The AWS-managed rotation Lambda now attached to db-credentials"
  value       = aws_serverlessapplicationrepository_cloudformation_stack.rds_rotation.outputs["RotationLambdaARN"]
}

output "jira_rotation_reminder_function_name" {
  description = "CloudWatch Logs group for this function is /aws/lambda/<this-name> if you need to debug a missed reminder"
  value       = aws_lambda_function.jira_rotation_reminder.function_name
}
