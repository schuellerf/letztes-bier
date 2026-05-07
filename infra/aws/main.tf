terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "docker_image" {
  type        = string
  description = "Image to run, e.g. ghcr.io/yourorg/letztes-bier:latest or letztes-bier:latest after docker load"
}

variable "admin_cidr_ssh" {
  type        = string
  description = "CIDR allowed to SSH (e.g. your public IP /32)"
  default     = "0.0.0.0/0"
}

provider "aws" {
  region = var.region
}

data "aws_default_vpc" "default" {}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_default_vpc.default.id]
  }
}

data "aws_ami" "debian12" {
  most_recent = true
  owners      = ["136693071363"]

  filter {
    name   = "name"
    values = ["debian-12-amd64-*"]
  }

  filter {
    name   = "virt-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "letztes_bier" {
  name_prefix = "letztes-bier-"
  vpc_id      = data.aws_default_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr_ssh]
  }

  ingress {
    description = "PocketBase HTTP"
    from_port   = 8090
    to_port     = 8090
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "letztes_bier" {
  ami                         = data.aws_ami.debian12.id
  instance_type               = var.instance_type
  subnet_id                   = sort(data.aws_subnets.default.ids)[0]
  vpc_security_group_ids      = [aws_security_group.letztes_bier.id]
  associate_public_ip_address = true

  user_data = <<-EOT
    #cloud-config
    package_update: true
    packages:
      - docker.io
    runcmd:
      - systemctl enable --now docker
      - docker run -d --name letztes-bier --restart unless-stopped -p 8090:8090 -v letztes-bier_pb_data:/pb/pb_data ${var.docker_image}
  EOT

  tags = {
    Name = "letztes-bier"
  }
}

output "public_ip" {
  value = aws_instance.letztes_bier.public_ip
}
