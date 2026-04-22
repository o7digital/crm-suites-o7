#!/usr/bin/env sh
set -eu

echo "[api] Applying Prisma migrations..."
MIGRATE_LOG="$(mktemp)"
if npx prisma migrate deploy 2>&1 | tee "$MIGRATE_LOG"; then
  echo "[api] Prisma migrations applied."
else
  MIGRATE_EXIT=$?
  if grep -q "P3009" "$MIGRATE_LOG"; then
    echo "[api] WARNING: Prisma migrate blocked by failed historical migration (P3009)."
    echo "[api] WARNING: Starting API anyway to avoid crashloop. Resolve migration state separately."
  else
    echo "[api] ERROR: Prisma migrate deploy failed."
    exit "$MIGRATE_EXIT"
  fi
fi
rm -f "$MIGRATE_LOG"

echo "[api] Generating Prisma client..."
npx prisma generate

echo "[api] Starting server..."
node dist/main
