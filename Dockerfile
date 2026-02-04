# Multi-stage build for the NestJS API

FROM node:20-alpine AS builder
# Install OpenSSL 3 only. Prisma is pinned to the OpenSSL 3 builds, so 1.1 compat
# packages (removed from Alpine 3.20+) are no longer required.
RUN apk add --no-cache openssl
WORKDIR /app
# Install dependencies
COPY api/package*.json api/tsconfig*.json api/nest-cli.json ./api/
COPY api/prisma ./api/prisma
RUN cd api && npm ci
# Generate Prisma client for musl + OpenSSL 3
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x
RUN cd api && npx prisma generate --binary-target linux-musl-openssl-3.0.x
# Ensure the default engine filename resolves to the OpenSSL 3 build
RUN cd api/node_modules/.prisma/client && \
  ln -sf libquery_engine-linux-musl-openssl-3.0.x.so.node libquery_engine-linux-musl.so.node
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
# Ensure the default engine filename resolves to the OpenSSL 3 build
RUN cd node_modules/.prisma/client && \
  ln -sf libquery_engine-linux-musl-openssl-3.0.x.so.node libquery_engine-linux-musl.so.node
ENV PORT=8080
CMD ["node", "dist/main.js"]
