# ADR-0011: AWS hosting, Mumbai region

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
The product owner prefers AWS. The initial market is Hubballi-Dharwad, India. India's DPDP Act, 2023 favours keeping personal data in-country.

## Decision
- Cloud: **AWS, region `ap-south-1` (Mumbai)**.
- Intended managed services (final choice in Phase 9): RDS for PostgreSQL (PostGIS supported), ElastiCache (Redis-compatible), S3 for images, and a container runtime for the `api` and `worker` processes.
- Until a real domain is provided, the placeholder `offer-platform.example` is used. `.example` is reserved by RFC 2606 and can never be registered.

## Consequences
- The app code stays cloud-neutral: S3-compatible storage (MinIO locally) and standard Postgres/Redis connection strings. AWS-specific details live only in infrastructure config.
- The specific compute service (ECS Fargate, App Runner, etc.) is decided in Phase 9 with cost estimates.
