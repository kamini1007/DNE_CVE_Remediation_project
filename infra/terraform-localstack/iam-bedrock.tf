# No EKS/IRSA here (LocalStack Community doesn't run a real Kubernetes
# control plane, so there's no OIDC provider to trust) - this just validates
# that the policy document itself is well-formed and attachable, using a
# plain IAM role instead of the IRSA role from infra/terraform/iam-bedrock.tf.

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
  name   = "${var.project_name}-local-bedrock-invoke"
  policy = data.aws_iam_policy_document.bedrock_invoke.json
}

resource "aws_iam_role" "ai_analysis_local" {
  name = "${var.project_name}-local-ai-analysis"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" } # placeholder trust - no real IRSA/OIDC available locally
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ai_analysis_bedrock_local" {
  role       = aws_iam_role.ai_analysis_local.name
  policy_arn = aws_iam_policy.bedrock_invoke.arn
}
