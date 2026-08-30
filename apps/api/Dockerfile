# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Keep the image's package manager compatible with Node 20 and the lockfile.
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy workspace configuration and source before installing so pnpm can create
# valid workspace links for both the shared package and API package.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package and backend API
RUN pnpm --filter @tfhc/shared build
RUN pnpm --filter @tfhc/api prisma:generate
RUN pnpm --filter @tfhc/api build

# Prune dev dependencies for production
RUN pnpm --filter @tfhc/api deploy --prod /app/out/api
# `pnpm deploy` retains @prisma/client but does not retain its generated
# artifacts, which are required when the production image instantiates Prisma.
RUN cp -R /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma \
  /app/out/api/node_modules/.pnpm/@prisma+client@*/node_modules/

# Production Runner Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Security: Create and use unprivileged user
USER node

# Copy built artifacts from builder
COPY --chown=node:node --from=builder /app/out/api ./

EXPOSE 4000

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/ || exit 1

CMD ["node", "dist/apps/api/src/main.js"]
