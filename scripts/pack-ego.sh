#!/usr/bin/env bash
#
# Produces an extensions.gnome.org-submittable zip: a flat archive with
# metadata.json / *.js / schemas/ at the root (no wrapping <uuid>/ folder,
# unlike the GitHub Releases zip built by release.yml + stage-package.sh).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

UUID="$(grep -oP '"uuid":\s*"\K[^"]+' metadata.json)"
STAGE_DIR="build/stage/$UUID"
OUT_DIR="build/ego"

bash scripts/stage-package.sh "$STAGE_DIR"
rm -f "$STAGE_DIR/schemas/gschemas.compiled"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
gnome-extensions pack "$STAGE_DIR" \
  --schema="schemas/org.gnome.shell.extensions.clipboard-khipu.gschema.xml" \
  --out-dir="$OUT_DIR" \
  --force

echo
echo "EGO-ready zip: $OUT_DIR/${UUID}.shell-extension.zip"
echo "Upload it at https://extensions.gnome.org/upload/"
