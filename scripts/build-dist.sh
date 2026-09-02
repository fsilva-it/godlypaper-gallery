#!/bin/bash
# Zips each wallpapers/<slug>/ (manifest at zip root) into dist/, copies
# previews, and builds index.json. Usage: scripts/build-dist.sh [base-url]
set -euo pipefail
cd "$(dirname "$0")/.."
BASE_URL="${1:-https://fsilva-it.github.io/godlypaper-gallery}"

rm -rf dist previews
mkdir -p dist previews
for dir in wallpapers/*/; do
    slug="$(basename "$dir")"
    [ -f "$dir/manifest.json" ] || continue
    (cd "$dir" && zip -qr "../../dist/$slug.godlypaper" . -x ".*")
    [ -f "$dir/preview.jpg" ] && cp "$dir/preview.jpg" "previews/$slug.jpg"
done

if command -v node >/dev/null; then
    node scripts/build-index.mjs "$BASE_URL"
else
    python3 scripts/build-index.py "$BASE_URL"
fi
echo "dist ready: $(ls dist | wc -l | tr -d ' ') packages"
