# clipboard-khipu

A developer-focused clipboard history for GNOME Shell — like the Windows `Super+V`
clipboard stack, but native to GNOME and careful about formatting.

Press **`Super+V`** to see what you've copied and paste it back **exactly** as it was.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/RuddyQuispe/clipboard-khipu/master/install.sh | bash
```

This downloads the latest prebuilt release and installs it — no Node or build tools needed.

If GNOME Shell doesn't pick it up immediately, log out and back in, then run:

```bash
gnome-extensions enable clipboard-khipu@ruddy.local
```

> Prefer to build it yourself? See [Contributing](#contributing) for the from-source install.

## How it works

1. Copy things as you normally would — text, an image, or files in a file manager (Nautilus).
2. Press **`Super+V`**. A searchable popup lists your recent clipboard items.
3. Pick one — with the keyboard or the mouse — and it's pasted back into whatever you were using,
   **exactly** as it was copied. JSON, YAML and code keep their formatting byte-for-byte.

If there's only **one** item in history, `Super+V` pastes it immediately — no menu.

Pasting is **terminal-aware**: in a normal app it sends `Ctrl+V`, and in a terminal it sends
`Ctrl+Shift+V` (see [Terminals](#terminals)).

## Shortcuts

Everything is keyboard-driven. Once the popup is open:

| Key | Action |
|-----|--------|
| `Super+V` | Open clipboard history (configurable) |
| `↑` / `↓` | Move the selection |
| *type anything* | Filter the list |
| `Enter` | Paste the selected entry |
| `Shift+Delete` | Remove the selected entry from history |
| `Esc` | Close the popup |
| Click a row | Paste that entry |
| Click outside | Close the popup |

`Shift+Delete` (not plain `Delete`) removes an entry, so that `Delete` stays free for editing the
search text — the same convention Firefox uses to drop a history suggestion.

## Terminals

VTE-based terminals (GNOME Terminal, Console, Ptyxis, Konsole, kitty, Alacritty, foot, …) paste
with `Ctrl+Shift+V`, not `Ctrl+V`. clipboard-khipu detects the focused window and picks the right
combination automatically.

Detection is a configurable list of window-class hints. If your terminal isn't recognized, open
the preferences and add its WM class to **Terminals → Terminal hints** (comma-separated).

## Preferences

```bash
gnome-extensions prefs clipboard-khipu@ruddy.local
```

- **History size** — how many entries to keep (default 25).
- **Auto-paste on select** — paste immediately after picking, or just put it on the clipboard.
- **Capture images / files** — toggle per content type.
- **Exclude passwords** — skip content flagged as a password by its source app.
- **Terminal hints** — window classes that should paste with `Ctrl+Shift+V`.
- **Shortcut** — rebind the open-history key.
- **Clear history** — wipe all stored entries and images.

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

## Privacy

History is stored locally in `~/.local/share/clipboard-khipu/` (metadata in `history.json`,
images under `images/`). Nothing leaves your machine. You can wipe it any time from the
preferences window ("Clear history"), and content marked as a password is never recorded.

## Contributing

Contributions are welcome — the project is MIT-licensed. For architecture, project rules and the
spec-driven workflow, read [AGENTS.md](AGENTS.md).

The extension is authored in TypeScript against `@girs/gnome-shell` types and compiled to plain
GJS with `tsc` (GJS resolves `gi://` / `resource://` ESM imports natively — no bundler).

### Get the source

```bash
git clone https://github.com/RuddyQuispe/clipboard-khipu.git
cd clipboard-khipu
npm install
```

### Build

```bash
npm run build            # tsc: src/*.ts -> dist/*.js
npm run watch            # rebuild on change
npm run compile-schemas  # glib-compile-schemas schemas/
```

### Install your local build into GNOME

```bash
npm run install-link     # symlink dist/ + schemas/ + metadata into the extensions dir
```

### Dev reload loop

After rebuilding, reload the extension so GNOME Shell picks up the new code:

```bash
gnome-extensions disable clipboard-khipu@ruddy.local
gnome-extensions enable  clipboard-khipu@ruddy.local
```

On Wayland, if a disable/enable doesn't take (GJS caches ES modules), log out and back in for a
clean Shell restart.

> A nested-shell workflow (`scripts/run-nested.sh`) exists but relies on `gnome-shell --nested`,
> which was **removed in GNOME 50**. On 50+ use the disable/enable or re-login loop above.

### Verify

```bash
npx tsc --noEmit         # strict typecheck against the real GNOME 50 introspection types
```

There is **no automated test suite yet** — verification is the typecheck above plus a manual QA
pass (paste text with formatting intact, an image, files from Nautilus; single-item direct paste;
search, delete, click-outside; history survives a disable/enable). Adding automated tests is a
welcome contribution.

### Release

Push a `v*.*.*` tag. GitHub Actions builds, packages a `.zip`, and publishes it as a Release asset
that `install.sh` consumes:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## License

MIT — see [LICENSE](LICENSE).
