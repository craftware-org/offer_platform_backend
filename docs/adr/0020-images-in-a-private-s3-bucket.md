# ADR-0020: Images in a private S3 bucket, served by the API

- **Status:** Accepted (implements the owner's Phase 9 decision of 2026-10-09: "managed database: RDS + S3")
- **Date:** 2026-10-15

## Context
Shop and offer photos live on the preview server's disk (a Docker volume). Before launch they must survive the server being replaced, and the owner chose S3 for images on 2026-10-09. The storage port (`StorageProvider`: `put`, `get`, `deletePrefix`) was built for this in Phase 2.

Some photos are private (shop and owner verification photos, admin-only). Public ones are served by the API today with caching headers and `Cross-Origin-Resource-Policy: cross-origin`.

## Options considered
1. **Public bucket or CloudFront for public images, private bucket for the rest.** Faster for visitors, but two access paths, signed URLs for private photos, and more AWS setup and cost.
2. **One private bucket; the API keeps serving every image (chosen).** Nothing changes for the website or the apps; private photos stay behind the same permission checks.

## Decision
- New `S3StorageProvider` behind the existing port, chosen with `STORAGE_PROVIDER=s3` and `S3_BUCKET` (`S3_REGION` defaults to `ap-south-1`). The bucket is **private**: all public access blocked, default encryption, objects owned by the bucket owner.
- **No access keys in configuration.** The AWS SDK's default chain is used; on EC2 that is the instance role. `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` exist only for S3-compatible test servers and are refused in production.
- Keys are the same as on disk (`businesses/<id>/<imageId>/<size>.webp`, `offers/…`) and are checked by the same `assertSafeKey`. `deletePrefix` deletes `prefix/` in pages of 1,000, so `img1/` never touches `img10/`.
- Local disk stays the default for development and the preview until the switch.

## Consequences
- **Container credentials:** the API runs in a Docker container, so to use the instance role it must reach the instance metadata service: the instance's **metadata hop limit must be 2** once S3 images are on. (With only the host-side backup copy, 1 is enough and safer.) The role then needs `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the images bucket and `s3:ListBucket` on it, and nothing else.
- **Switching** needs the bucket, the role policy, the hop limit, a one-time copy of the existing files (`aws s3 sync` of the storage volume; keys are identical), then `STORAGE_PROVIDER=s3` + `S3_BUCKET` in `.env` and a restart. Steps in `docs/deployment.md`.
- Every image request goes through the API; at today's traffic that is fine (images are small WebP with long cache headers). A CDN can be added later without changing keys.
- Tested against a real S3-compatible server (Adobe S3Mock) in CI.
