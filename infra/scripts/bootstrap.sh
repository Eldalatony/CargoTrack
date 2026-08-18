#!/usr/bin/env bash
# One-time local setup after a fresh clone.
#
#   ./infra/scripts/bootstrap.sh
#
# Does not install dependencies and does not start Docker.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

echo "==> Repo: $repo_root"

# 1. Environment file
if [ -f .env ]; then
  echo "==> .env already exists — leaving it untouched"
else
  cp .env.example .env
  echo "==> Created .env from .env.example"
  echo "    Edit it and replace every change_me_* value before starting the stack."
fi

# 2. Conventional-commit hook
if [ -d .git ]; then
  git config core.hooksPath .githooks
  chmod +x .githooks/* 2>/dev/null || true
  echo "==> Git hooks enabled (core.hooksPath=.githooks)"
else
  echo "==> Not a git repository yet — run 'git init' then re-run this script"
fi

echo ""
echo "Next:"
echo "  1. Edit .env"
echo "  2. Scaffold the apps (see README: 'Scaffolding the apps')"
echo "  3. docker compose up --build"
