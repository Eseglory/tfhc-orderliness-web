# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Keep the image's package manager compatible with Node 20 and the lockfile.
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy workspace configuration and source before installing so pnpm can create
# valid workspace links for both the shared package and web package.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build Next.js standalone application
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @tfhc/shared build
RUN pnpm --filter @tfhc/web build

# Production Runner Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Security: Create and use unprivileged user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy Next.js standalone output
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
