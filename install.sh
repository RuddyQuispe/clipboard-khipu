#!/usr/bin/env bash
#
# clipboard-khipu installer.
#
# Downloads the latest release from GitHub and installs it as a GNOME Shell
# extension. No Node/npm/TypeScript needed — the release ships a prebuilt zip.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/RuddyQuispe/clipboard-khipu/master/install.sh | bash
#
set -euo pipefail

REPO="RuddyQuispe/clipboard-khipu"
UUID="clipboard-khipu@ruddy.local"
API_URL="https://api.github.com/repos/$REPO/releases/latest"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

for cmd in curl unzip; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Missing required command: $cmd" >&2
        exit 1
    fi
done

echo "Resolving latest release of $REPO…"
asset_url="$(
    curl -fsSL "$API_URL" \
        | grep -o "https://github.com/$REPO/releases/download/[^\"]*\.zip" \
        | head -n1
)"

if [ -z "$asset_url" ]; then
    echo "Could not find a .zip asset in the latest release." >&2
    echo "Check $API_URL" >&2
    exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "Downloading $asset_url"
curl -fsSL "$asset_url" -o "$tmp_dir/extension.zip"

echo "Installing to $TARGET_DIR"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

# The zip contains a top-level "<uuid>/" folder; strip it so files land
# directly in the target directory regardless of how it was packed.
unzip -q "$tmp_dir/extension.zip" -d "$tmp_dir/unpacked"
if [ -d "$tmp_dir/unpacked/$UUID" ]; then
    cp -r "$tmp_dir/unpacked/$UUID/." "$TARGET_DIR/"
else
    cp -r "$tmp_dir/unpacked/." "$TARGET_DIR/"
fi

echo "Enabling extension…"
if gnome-extensions enable "$UUID" 2>/dev/null; then
    echo
    echo "Done. Press Super+V to open your clipboard history."
else
    echo
    echo "Installed, but GNOME Shell hasn't picked it up yet."
    echo "Log out and back in, then run:"
    echo "    gnome-extensions enable $UUID"
fi
