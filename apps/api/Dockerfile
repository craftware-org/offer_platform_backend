# Production image for the API and the worker (same image, different command) — ADR-0002.
# Build from the repository root:  docker build -f apps/api/Dockerfile -t offer-platform-api .
#   API:     docker run … offer-platform-api                      (node dist/main.js)
#   Worker:  docker run … offer-platform-api node dist/worker.js
#   Migrate: docker run … offer-platform-api node dist/cli/migrate.js

FROM node:24.21.0-bookworm-slim AS base
RUN npm install --global pnpm@12.4.2 && npm cache clean --force
WORKDIR /repo

# ---- Build: install all deps, compile, then extract production-only deps ----------------------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @offer-platform/api...
COPY apps/api apps/api
RUN pnpm --filter @offer-platform/api build \
 && pnpm --filter @offer-platform/api deploy --prod /out

# ---- Runtime: compiled code + production node_modules only, running as a non-root user --------
FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production \
    STORAGE_LOCAL_DIR=/data/storage
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/database ./database
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
