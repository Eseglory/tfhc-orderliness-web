# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace configs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package and backend API
RUN pnpm --filter @tfhc/shared build
RUN pnpm --filter @tfhc/api prisma:generate
RUN pnpm --filter @tfhc/api build

# Prune dev dependencies for production
RUN pnpm --filter @tfhc/api deploy --prod /app/out/api

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

CMD ["node", "dist/main.js"]
