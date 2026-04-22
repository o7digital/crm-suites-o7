#!/usr/bin/env sh
set -eu

echo "[api] Applying Prisma migrations..."
npx prisma migrate deploy

echo "[api] Generating Prisma client..."
npx prisma generate

echo "[api] Starting server..."
node dist/main
