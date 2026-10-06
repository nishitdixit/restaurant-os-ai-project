# syntax=docker/dockerfile:1.7
# One build, four runtime targets: api, worker, storefront, admin.
#   docker build --target api -t restaurant-os-api .
#   docker build --target storefront --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com ... -t restaurant-os-storefront .
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH" NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/storefront/package.json apps/storefront/
COPY apps/admin/package.json apps/admin/
COPY packages/domain/package.json packages/domain/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY tests/e2e/package.json tests/e2e/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_STORE_BRAND_SLUG=pilot
ARG NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_STORE_BRAND_SLUG=$NEXT_PUBLIC_STORE_BRAND_SLUG \
    NEXT_PUBLIC_STOREFRONT_URL=$NEXT_PUBLIC_STOREFRONT_URL NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
COPY . .
RUN pnpm --filter @restaurant-os/api build
RUN pnpm --filter @restaurant-os/api deploy --prod --legacy /out/api
RUN if [ -n "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" ]; then pnpm --filter @restaurant-os/admin build; else mkdir -p apps/admin/.next/standalone apps/admin/.next/static; fi
RUN pnpm --filter @restaurant-os/storefront build

FROM node:22-alpine AS node-runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
USER app

FROM node-runtime AS api
COPY --from=build --chown=app:app /out/api/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/api/dist ./dist
COPY --from=build --chown=app:app /app/apps/api/package.json ./package.json
COPY --from=build --chown=app:app /app/db ./db
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/main.js"]

FROM api AS worker
HEALTHCHECK NONE
CMD ["node", "dist/worker.js"]

FROM node-runtime AS storefront
COPY --from=build --chown=app:app /app/apps/storefront/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/storefront/.next/static ./apps/storefront/.next/static
ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "apps/storefront/server.js"]

FROM node-runtime AS admin
COPY --from=build --chown=app:app /app/apps/admin/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/admin/.next/static ./apps/admin/.next/static
ENV PORT=3001 HOSTNAME=0.0.0.0
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
