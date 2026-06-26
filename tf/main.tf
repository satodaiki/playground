# ---------------------------------------------
# Providers
# ---------------------------------------------
# デフォルト（東京リージョン）: S3などのリソース用
provider "aws" {
  region = "ap-northeast-1"
}

# ACM用（バージニア北部リージョン）: CloudFrontのSSL証明書はここで作る必須要件がある
provider "aws" {
  alias  = "virginia"
  region = "us-east-1"
}

# ---------------------------------------------
# Variables (変更してください)
# ---------------------------------------------
variable "root_domain" {
  type = string
}

variable "sub_domain_name" {
  type = string
}

variable "project_name" {
  type = string
}

# バケット名は世界で一意になるようにドメイン名を含めると良いです
locals {
  fqdn        = "${var.sub_domain_name}.${var.root_domain}"
  bucket_name = "${var.project_name}-${var.sub_domain_name}-${var.root_domain}-bucket"
}

# ---------------------------------------------
# Route 53 Zone Data (既存のホストゾーンを参照)
# ---------------------------------------------
data "aws_route53_zone" "main" {
  name         = var.root_domain
  private_zone = false
}

# ---------------------------------------------
# ACM Certificate (SSL証明書) - us-east-1
# ---------------------------------------------
resource "aws_acm_certificate" "cert" {
  provider          = aws.virginia
  domain_name       = local.fqdn
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# ACM検証用DNSレコードの作成
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

# ACM検証の完了待機
resource "aws_acm_certificate_validation" "cert" {
  provider                = aws.virginia
  certificate_arn         = aws_acm_certificate.cert.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ---------------------------------------------
# S3 Bucket (React App)
# ---------------------------------------------
resource "aws_s3_bucket" "static_site" {
  bucket = local.bucket_name
}

resource "aws_s3_bucket_public_access_block" "static_site" {
  bucket = aws_s3_bucket.static_site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "static_site_policy" {
  bucket = aws_s3_bucket.static_site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.static_site.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.s3_distribution.arn
          }
        }
      }
    ]
  })
}

# ---------------------------------------------
# CloudFront OAC
# ---------------------------------------------
resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "${var.project_name}-oac"
  description                       = "OAC for React App"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------
# CloudFront Distribution
# ---------------------------------------------
resource "aws_cloudfront_distribution" "s3_distribution" {
  origin {
    domain_name              = aws_s3_bucket.static_site.bucket_regional_domain_name
    origin_id                = aws_s3_bucket.static_site.id
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  # 独自ドメインの設定
  aliases = [local.fqdn]

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = aws_s3_bucket.static_site.id

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  # SPAルーティング対策
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL証明書の設定
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cert.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ---------------------------------------------
# Route 53 Record (CloudFrontへのエイリアス)
# ---------------------------------------------
resource "aws_route53_record" "www" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.fqdn
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.s3_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.s3_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------
# Outputs
# ---------------------------------------------
output "website_url" {
  value = "https://${local.fqdn}"
}

output "s3_bucket_name" {
  value = aws_s3_bucket.static_site.id
}