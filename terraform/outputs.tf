output "cluster_name" {
  value = module.eks.cluster_name
}

output "region" {
  value = var.region
}

output "ecr_frontend_url" {
  value = aws_ecr_repository.app["frontend"].repository_url
}

output "ecr_backend_url" {
  value = aws_ecr_repository.app["backend"].repository_url
}

output "github_actions_role_arn" {
  description = "Put this in your GitHub repo secret AWS_ROLE_ARN"
  value       = aws_iam_role.github_actions.arn
}

output "configure_kubectl" {
  value = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}
