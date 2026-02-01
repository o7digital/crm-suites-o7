# Multi-stage build for the NestJS API

FROM node:20-alpine AS builder
RUN apk add --no-cache openssl1.1-compat
WORKDIR /app
# Install dependencies
COPY api/package*.json api/tsconfig*.json api/nest-cli.json ./api/
COPY api/prisma ./api/prisma
RUN cd api && npm ci
# Build sources
COPY api/src ./api/src
RUN cd api && npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl1.1-compat
WORKDIR /app
COPY --from=builder /app/api/dist ./dist
COPY --from=builder /app/api/package*.json ./
COPY --from=builder /app/api/prisma ./prisma
RUN npm ci --omit=dev
ENV PORT=8080
CMD ["node", "dist/main.js"]
