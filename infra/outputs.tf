output "alb_dns_name" {
  description = "Public entry point URL for the application"
  value       = aws_lb.app_alb.dns_name
}

output "rds_endpoint" {
  description = "Private database endpoint for the application connection string"
  value       = aws_db_instance.postgres.endpoint
}

output "s3_bucket_name" {
  description = "S3 bucket for media and backups"
  value       = aws_s3_bucket.media_bucket.id
}

output "bastion_public_ip" {
  description = "Public IP address of the Bastion jump host"
  value       = aws_instance.bastion.public_ip
}

output "app_server_private_ip" {
  description = "Private IP address of the Application Server"
  value       = aws_instance.app_server.private_ip
}