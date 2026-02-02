# Multi-stage build for the NestJS API

FROM node:20-alpine AS builder
# OpenSSL 3 is bundled in the default alpine openssl package
RUN apk add --no-cache openssl
WORKDIR /app
# Install dependencies
COPY api/package*.json api/tsconfig*.json api/nest-cli.json ./api/
COPY api/prisma ./api/prisma
RUN cd api && npm ci
# Generate Prisma client for musl + OpenSSL 3
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x
RUN cd api && npx prisma generate --binary-target linux-musl-openssl-3.0.x
# Build sources
COPY api/src ./api/src
RUN cd api && npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=builder /app/api/dist ./dist
COPY --from=builder /app/api/package*.json ./
COPY --from=builder /app/api/prisma ./prisma
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x
RUN npm ci --omit=dev \
  && npx prisma generate --binary-target linux-musl-openssl-3.0.x
ENV PORT=8080
CMD ["node", "dist/main.js"]
