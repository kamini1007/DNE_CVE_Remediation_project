module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.24"

  cluster_name    = local.cluster_name
  cluster_version = var.eks_cluster_version

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access = true # tighten to false + VPN/bastion for prod

  # OIDC provider is required for IRSA (IAM Roles for Service Accounts), used
  # below to scope Bedrock access to only the ai-analysis-service pod, not
  # the whole node.
  enable_irsa = true

  eks_managed_node_groups = {
    default = {
      instance_types = var.eks_node_instance_types
      min_size       = var.eks_node_min_size
      max_size       = var.eks_node_max_size
      desired_size   = var.eks_node_desired_size

      labels = {
        role = "general"
      }
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}
