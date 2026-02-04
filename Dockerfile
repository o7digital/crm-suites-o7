# Multi-stage build for the NestJS API

FROM node:20-slim AS builder
# Use glibc-based image to match Prisma's debian-openssl-3.0.x engine and avoid musl/openssl1.1 issues
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Install dependencies
COPY api/package*.json api/tsconfig*.json api/nest-cli.json ./api/
COPY api/prisma ./api/prisma
RUN cd api && npm ci
# Generate Prisma client for glibc + OpenSSL 3
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN cd api && npx prisma generate --binary-target debian-openssl-3.0.x
# Build sources
COPY api/src ./api/src
RUN cd api && npm run build

FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/api/dist ./dist
COPY --from=builder /app/api/package*.json ./
COPY --from=builder /app/api/prisma ./prisma
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN npm ci --omit=dev \
  && npx prisma generate --binary-target debian-openssl-3.0.x
ENV PORT=8080
CMD ["node", "dist/main.js"]
