# Multi-stage build for the NestJS API

FROM node:20-alpine AS builder
# Install OpenSSL 3 (default) and the compat package that provides libssl.so.1.1.
# Prisma sometimes still pulls the 1.1-linked engine on musl; having both avoids
# runtime "libssl.so.1.1 not found" crashes while keeping the 3.0 binary available.
RUN apk add --no-cache openssl openssl1.1-compat \
  && ln -sf /usr/lib/libssl.so.1.1 /lib/libssl.so.1.1 \
  && ln -sf /usr/lib/libcrypto.so.1.1 /lib/libcrypto.so.1.1
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
RUN apk add --no-cache openssl openssl1.1-compat \
  && ln -sf /usr/lib/libssl.so.1.1 /lib/libssl.so.1.1 \
  && ln -sf /usr/lib/libcrypto.so.1.1 /lib/libcrypto.so.1.1
WORKDIR /app
COPY --from=builder /app/api/dist ./dist
COPY --from=builder /app/api/package*.json ./
COPY --from=builder /app/api/prisma ./prisma
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x
RUN npm ci --omit=dev \
  && npx prisma generate --binary-target linux-musl-openssl-3.0.x
ENV PORT=8080
CMD ["node", "dist/main.js"]
