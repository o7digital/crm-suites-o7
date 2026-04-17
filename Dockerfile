FROM node:20-slim AS builder
# Use glibc-based image to match Prisma engines in schema.prisma binaryTargets.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Install dependencies
COPY api/package*.json api/tsconfig*.json api/nest-cli.json ./api/
COPY api/prisma ./api/prisma
RUN cd api && npm ci
# Generate Prisma client using targets declared in prisma/schema.prisma.
RUN cd api && npx prisma generate
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
RUN npm ci --omit=dev \
  && npx prisma generate
ENV PORT=8080
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
