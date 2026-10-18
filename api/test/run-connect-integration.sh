#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CONNECT_TEST_DATABASE_URL:?Provide the isolated local pulse_connect_test database URL}"
node -e 'const u=new URL(process.env.CONNECT_TEST_DATABASE_URL); if(!["localhost","127.0.0.1"].includes(u.hostname)||u.pathname!=="/pulse_connect_test") throw new Error("Use the disposable local pulse_connect_test database")'
export DATABASE_URL="$CONNECT_TEST_DATABASE_URL"
fixture_sql=$(mktemp)
trap 'rm -f "$fixture_sql"' EXIT
# Never replay historical migrations: 0006 has an existing CTE failure. Build
# the frozen pre-connector schema and apply only the real additive 0042 SQL.
./node_modules/.bin/prisma db execute --stdin --schema prisma/schema.prisma <<< 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
./node_modules/.bin/prisma migrate diff --from-empty --to-schema-datamodel test/fixtures/pre-connect.prisma --script > "$fixture_sql"
./node_modules/.bin/prisma db execute --file "$fixture_sql" --schema prisma/schema.prisma
./node_modules/.bin/prisma db execute --file prisma/migrations/0042_pulse_connect/migration.sql --schema prisma/schema.prisma
./node_modules/.bin/prisma generate
./node_modules/.bin/jest --config test/jest-connect.json --runInBand
