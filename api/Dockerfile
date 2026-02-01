# Multi-stage Dockerfile scoped to the API directory

FROM node:20-alpine AS builder
WORKDIR /app
# Install dependencies
COPY package*.json nest-cli.json tsconfig*.json ./
COPY prisma ./prisma
RUN npm ci
# Build sources
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
RUN npm ci --omit=dev
ENV PORT=8080
CMD ["node", "dist/main.js"]
