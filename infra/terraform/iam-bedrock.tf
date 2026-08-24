# Scope Bedrock access to a single Kubernetes ServiceAccount (the AI analysis
# service) via IRSA, rather than granting it to every node in the cluster.
# The service account must be annotated with this role's ARN - see
# k8s/ai-analysis-service/serviceaccount.yaml.

data "aws_iam_policy_document" "bedrock_invoke" {
  statement {
    sid    = "InvokeBedrockModels"
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ]
    resources = [
      for model_id in var.bedrock_model_ids :
      "arn:aws:bedrock:${var.aws_region}::foundation-model/${model_id}"
    ]
  }
}

resource "aws_iam_policy" "bedrock_invoke" {
  name   = "${var.project_name}-${var.environment}-bedrock-invoke"
  policy = data.aws_iam_policy_document.bedrock_invoke.json
}

module "ai_analysis_irsa_role" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.48"

  role_name = "${var.project_name}-${var.environment}-ai-analysis-irsa"

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["cve-platform:ai-analysis-service"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "ai_analysis_bedrock" {
  role       = module.ai_analysis_irsa_role.iam_role_name
  policy_arn = aws_iam_policy.bedrock_invoke.arn
}
