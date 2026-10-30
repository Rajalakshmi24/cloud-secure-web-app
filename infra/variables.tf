variable "aws_region" {
  type        = string
  default     = "ap-northeast-1"
  description = "Target AWS Region"
}

variable "key_pair_name" {
  type        = string
  description = "Existing EC2 Key Pair name for SSH jump access"
}

variable "db_username" {
  type        = string
  default     = "cloudmart_admin"
  description = "Database administrator username"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Database administrator password"
}