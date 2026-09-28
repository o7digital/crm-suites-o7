#!/bin/sh
set -eu

deploy_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
revision=${1:?Provide the tested Git commit to deploy}
cd "$deploy_dir"
test -f .env
test -d app/.git
test -z "$(git -C app status --porcelain)"
git -C app fetch origin dev
commit=$(git -C app rev-parse --verify "$revision^{commit}")
git -C app merge-base --is-ancestor "$commit" origin/dev
./backup.sh
git -C app checkout --detach "$commit"
APP_VERSION=$commit docker compose build api
# Store the selected image tag for later Compose operations.
python3 - "$commit" <<'PY'
import os, sys
from pathlib import Path
path = Path('.env')
lines = [line for line in path.read_text().splitlines() if not line.startswith('APP_VERSION=')]
lines.append('APP_VERSION=' + sys.argv[1])
path.write_text('\n'.join(lines) + '\n')
os.chmod(path, 0o600)
PY
docker compose up -d --no-deps api
attempt=0
until curl --fail --silent http://127.0.0.1:8102/api/health >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    docker compose logs --tail=80 api
    exit 1
  fi
  sleep 2
done
printf 'VPS API deployed: %s\n' "$commit"
