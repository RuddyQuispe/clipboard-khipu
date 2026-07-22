#!/usr/bin/env bash
set -euo pipefail

# Runs a throwaway nested GNOME Shell so the extension can be tested without
# touching the real session (Wayland does not support restarting the main
# gnome-shell process in place the way X11 did with Alt+F2 -> r).
exec dbus-run-session -- gnome-shell --nested --wayland
