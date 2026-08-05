#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

STAGE_DIR="${1:?usage: stage-package.sh <stage-dir>}"

npm run build
glib-compile-schemas schemas/

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/schemas"
cp dist/*.js "$STAGE_DIR/"
cp metadata.json stylesheet.css "$STAGE_DIR/"
cp schemas/org.gnome.shell.extensions.clipboard-khipu.gschema.xml "$STAGE_DIR/schemas/"
cp schemas/gschemas.compiled "$STAGE_DIR/schemas/"

echo "Staged package at $STAGE_DIR"
