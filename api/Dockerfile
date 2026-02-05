# Multi-stage Dockerfile scoped to the API directory

FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Install dependencies
COPY package*.json nest-cli.json tsconfig*.json ./
COPY prisma ./prisma
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN npm ci && npx prisma generate --binary-target debian-openssl-3.0.x
# Build sources
COPY src ./src
RUN npm run build

FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN npm ci --omit=dev && npx prisma generate --binary-target debian-openssl-3.0.x
ENV PORT=8080
CMD ["node", "dist/main.js"]
