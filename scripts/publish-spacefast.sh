#!/usr/bin/env bash
# Publishes the Crosspost SpaceFast migration to a preview space.
#
# Builds the standalone SPA (vite.spa.config.ts), renames spa.html to
# index.html, and publishes it with the Functions backend. SPA routes
# (/login, /app) are rewritten to /index.html via _redirects.
#
# Usage: ./scripts/publish-spacefast.sh [space-slug] [message]
set -euo pipefail

SPACE="${1:-crosspost-preview}"
MESSAGE="${2:-preview publish}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)/sf-publish"

cd "$ROOT"
bun x vite build --config vite.spa.config.ts

rm -rf "$OUT"
mkdir -p "$OUT"
cp -a dist-spa/. "$OUT/"
mv "$OUT/spa.html" "$OUT/index.html"
cp -a functions sf.jsonc "$OUT/"

# SPA fallback: serve index.html for client-side routes.
printf '/login /index.html 200\n/app /index.html 200\n' > "$OUT/_redirects"

sf publish "$OUT" --space "$SPACE" -m "$MESSAGE" -y --wait
