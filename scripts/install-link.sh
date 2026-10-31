#!/usr/bin/env bash
set -euo pipefail

UUID="clipboard-khipu@ruddyquispe.github.io"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

if [ ! -d "$PROJECT_DIR/dist" ]; then
    echo "dist/ not found — run 'npm run build' first." >&2
    exit 1
fi

# Start clean: a previous install.sh install leaves real files and a real
# schemas/ directory, and `ln -sfn` onto an existing directory links *inside*
# it instead of replacing it. History lives elsewhere, so nothing is lost.
case "${TARGET_DIR:?}" in
    */gnome-shell/extensions/"$UUID") rm -rf "$TARGET_DIR" ;;
    *) echo "Refusing to remove unexpected path: $TARGET_DIR" >&2; exit 1 ;;
esac
mkdir -p "$TARGET_DIR"

ln -sfn "$PROJECT_DIR/metadata.json" "$TARGET_DIR/metadata.json"
ln -sfn "$PROJECT_DIR/stylesheet.css" "$TARGET_DIR/stylesheet.css"
ln -sfn "$PROJECT_DIR/schemas" "$TARGET_DIR/schemas"

for file in "$PROJECT_DIR"/dist/*.js; do
    ln -sfn "$file" "$TARGET_DIR/$(basename "$file")"
done

echo "Linked $PROJECT_DIR -> $TARGET_DIR"
echo "Next: gnome-extensions enable $UUID  (or reload the nested shell)"
