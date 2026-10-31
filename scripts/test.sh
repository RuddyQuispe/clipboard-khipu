#!/usr/bin/env bash
# Runs the unit test suite under GJS, outside GNOME Shell.
# Persistence tests write to a throwaway XDG_DATA_HOME, never the real history.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

npx tsc -p tsconfig.test.json
mkdir -p "$SCRATCH/schemas"
cp schemas/*.gschema.xml "$SCRATCH/schemas/"
glib-compile-schemas "$SCRATCH/schemas"

XDG_DATA_HOME="$SCRATCH/data" \
KHIPU_TEST_SCHEMA_DIR="$SCRATCH/schemas" \
  gjs -m build/test/tests/run.js
