variable "region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "cluster_name" {
  description = "Name of the EKS cluster (also used as a prefix for the VPC and ECR repos)"
  type        = string
  default     = "eks-notes"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version. Check current ones with: aws eks describe-cluster-versions"
  type        = string
  default     = "1.35"
}

variable "github_repo" {
  description = "Your GitHub repo in the form owner/repo (allowed to deploy via OIDC)"
  type        = string
}

variable "create_github_oidc_provider" {
  description = "Set to false if your AWS account already has the GitHub OIDC provider"
  type        = bool
  default     = true
}
