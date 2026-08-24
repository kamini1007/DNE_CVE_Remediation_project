# The AWS Load Balancer Controller (installed via Helm, see the deployment
# guide) provisions the ALB described by k8s/base/ingress.yaml. It needs a
# fairly broad IAM policy, published and maintained by AWS - referencing the
# published document rather than hand-writing it avoids drift as the
# controller adds API calls in new versions.
#
# Download it with:
#   curl -o alb-iam-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.8.1/docs/install/iam_policy.json
# then keep it alongside this file.

resource "aws_iam_policy" "alb_controller" {
  name        = "${var.project_name}-${var.environment}-alb-controller"
  description = "Policy for the AWS Load Balancer Controller"
  policy      = file("${path.module}/alb-iam-policy.json")
}

module "alb_controller_irsa_role" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.48"

  role_name = "${var.project_name}-${var.environment}-alb-controller-irsa"

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-load-balancer-controller"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "alb_controller" {
  role       = module.alb_controller_irsa_role.iam_role_name
  policy_arn = aws_iam_policy.alb_controller.arn
}

# --- TLS certificate for the ingress ---
# DNS validation requires the domain's Route 53 hosted zone (or manual record
# creation if DNS lives elsewhere). `terraform apply` will block on
# aws_acm_certificate_validation until those records resolve.
resource "aws_acm_certificate" "platform" {
  count = var.platform_hostname == "" ? 0 : 1

  domain_name       = var.platform_hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-cert"
  }
}
