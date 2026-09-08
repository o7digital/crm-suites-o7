#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PHASE1_TEST_DATABASE_URL:?Provide the URL of a disposable local PostgreSQL database}"
node -e 'const u = new URL(process.env.PHASE1_TEST_DATABASE_URL); if (!["localhost", "127.0.0.1"].includes(u.hostname) || u.pathname !== "/pulse_phase1_test") throw new Error("Use the local disposable pulse_phase1_test database")'
export DATABASE_URL="$PHASE1_TEST_DATABASE_URL"
# This is an explicitly disposable database. Historical migration 0006 cannot
# replay from empty; use the frozen pre-Phase-1 schema, then test the real 0037 SQL.
fixture_sql=$(mktemp)
trap 'rm -f "$fixture_sql"' EXIT
./node_modules/.bin/prisma db execute --stdin --schema prisma/schema.prisma <<< 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
./node_modules/.bin/prisma migrate diff --from-empty --to-schema-datamodel test/fixtures/pre-phase1.prisma --script > "$fixture_sql"
./node_modules/.bin/prisma db execute --file "$fixture_sql" --schema prisma/schema.prisma
./node_modules/.bin/prisma db execute --file test/fixtures/pre-phase1-data.sql --schema prisma/schema.prisma
./node_modules/.bin/prisma db execute --file prisma/migrations/0037_pulse_phase1/migration.sql --schema prisma/schema.prisma
./node_modules/.bin/jest --config test/jest-phase1.json --runInBand
