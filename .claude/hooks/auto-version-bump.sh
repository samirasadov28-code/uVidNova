#!/usr/bin/env bash
# Runs on Stop hook: bumps patch version + SW cache version, then commits & pushes.
# Only runs when there are uncommitted changes touching public/ or data/.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$REPO_ROOT"

# Nothing to do if working tree is clean
if git diff --quiet && git diff --cached --quiet; then
  exit 0
fi

# Only act when public/ or data/ files were touched
CHANGED=$(git diff --name-only; git diff --cached --name-only)
if ! printf '%s\n' "$CHANGED" | grep -qE '^(public|data)/'; then
  exit 0
fi

# ── Read current app version ─────────────────────────────────────────────────
CURRENT_VER=$(grep -o 'content="[0-9]\+\.[0-9]\+\.[0-9]\+"' public/index.html \
  | head -1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
[ -z "$CURRENT_VER" ] && exit 0

IFS='.' read -r MAJ MIN PAT <<< "$CURRENT_VER"
NEW_VER="$MAJ.$MIN.$((PAT + 1))"

# ── Read current SW cache version ────────────────────────────────────────────
CURRENT_SW=$(grep -o 'uvidnova-v[0-9]\+' public/service-worker.js | head -1)
[ -z "$CURRENT_SW" ] && exit 0
SW_NUM=$(printf '%s' "$CURRENT_SW" | grep -o '[0-9]*$')
NEW_SW="uvidnova-v$((SW_NUM + 1))"

# ── Apply bumps ───────────────────────────────────────────────────────────────
sed -i "s/content=\"$CURRENT_VER\"/content=\"$NEW_VER\"/g" public/index.html
sed -i "s/v$CURRENT_VER/v$NEW_VER/g" public/index.html
sed -i "s/$CURRENT_SW/$NEW_SW/g" public/service-worker.js

# ── Commit & push ─────────────────────────────────────────────────────────────
git add -u
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git commit -m "infra: auto version bump v${NEW_VER} (SW ${NEW_SW})" \
  --no-verify 2>/dev/null || true
git push -u origin "$BRANCH" 2>/dev/null || true
