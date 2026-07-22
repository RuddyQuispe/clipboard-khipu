# clipboard-khipu

A developer-focused clipboard history for GNOME Shell — like the Windows `Super+V`
clipboard stack, but native to GNOME and careful about formatting.

Press **`Super+V`** to see what you've copied and paste it back **exactly** as it was.

## Features

- **Text with formatting preserved.** JSON, YAML, code and indented snippets round-trip
  byte-for-byte — the original is stored raw and pasted raw, never re-formatted or trimmed.
- **Images.** `image/png` and other `image/*` — thumbnail in the list, binary on disk.
- **Real files.** Files copied in a file manager (Nautilus, via `x-special/gnome-copied-files`)
  are captured as actual files, so you can paste them into another folder or app.
- **Keyboard and mouse.** Arrow keys / Enter / Esc, or click. Type to filter the list.
- **Single-item shortcut.** If there's exactly one entry, `Super+V` pastes it directly — no menu.
- **Persistence.** History survives logout and Shell restarts.
- **Anti-echo.** Pasting from history never creates a duplicate entry.
- **Password-aware.** Content flagged as a password by its source app is skipped.
- **Adwaita preferences.** History size, shortcut, per-type toggles, and a clear-history button.

## Compatibility

| GNOME Shell | Ubuntu | Status |
|-------------|--------|--------|
| 46 | 24.04 LTS | ✅ Tested |
| 47 | 24.10 | ⚠️ Should work — not verified on real hardware |
| 48 | 25.04 | ⚠️ Should work — not verified on real hardware |
| 49 | 25.10 | ⚠️ Should work — not verified on real hardware |
| 50 | (Fedora 42) | ✅ Tested |

A single build covers GNOME 46 through 50 — the extension API surface it uses is stable across
that range.

> **Ubuntu 22.04 LTS (GNOME 42) is not supported.** GNOME 45 replaced the legacy extension module
> system with standard ES modules, which is incompatible with 42–44. Supporting them would require
> a separate legacy build.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/RuddyQuispe/clipboard-khipu/master/install.sh | bash
```

This downloads the latest prebuilt release and installs it — no Node or build tools needed.

If GNOME Shell doesn't pick it up immediately, log out and back in, then run:

```bash
gnome-extensions enable clipboard-khipu@ruddy.local
```

## Usage

1. Copy things as you normally would (text, an image, files in Nautilus).
2. Press **`Super+V`**.
3. Navigate with the arrow keys, type to filter, and press **Enter** to paste — or click an entry.
   With a single entry, `Super+V` pastes it directly.

The shortcut and all toggles are configurable:

```bash
gnome-extensions prefs clipboard-khipu@ruddy.local
```

## Privacy

History is stored locally in `~/.local/share/clipboard-khipu/` (metadata in `history.json`,
images under `images/`). Nothing leaves your machine. You can wipe it any time from the
preferences window ("Clear history"), and content marked as a password is never recorded.

## Development

Authored in TypeScript against `@girs/gnome-shell` types, compiled to plain GJS with `tsc`
(GJS resolves `gi://` / `resource://` ESM imports natively — no bundler).

```bash
npm install
npm run build            # tsc: src/*.ts -> dist/*.js
npm run compile-schemas  # glib-compile-schemas schemas/
npm run install-link     # symlink dist/ + schemas/ + metadata into the extensions dir
```

Then enable it (in a nested Shell for GNOME < 50, or after a re-login on your main session):

```bash
gnome-extensions enable clipboard-khipu@ruddy.local
```

### Releasing

Push a `v*.*.*` tag. GitHub Actions builds, packages a `.zip`, and publishes it as a Release
asset that `install.sh` consumes:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## License

MIT — see [LICENSE](LICENSE).
