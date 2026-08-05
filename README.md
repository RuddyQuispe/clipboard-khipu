# clipboard-khipu

*[Leer en español](README.es.md)*

A developer-focused clipboard history for GNOME Shell — like the Windows `Super+V`
clipboard stack, but native to GNOME and careful about formatting.

Press **`Super+V`** to see what you've copied and paste it back **exactly** as it was.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/RuddyQuispe/clipboard-khipu/master/install.sh | bash
```

This downloads the latest prebuilt release and installs it — no Node or build tools needed.
To update to a newer release later, just run the same command again.

If GNOME Shell doesn't pick it up immediately, log out and back in, then run:

```bash
gnome-extensions enable clipboard-khipu@ruddyquispe.github.io
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

## Formatting is preserved

Copying is never just text. A range of cells from LibreOffice Calc also carries the table, the
colours and the cell styles; a snippet from a web page carries its bold, links and headings. Those
travel as extra *formats* alongside the plain text, and the app you paste into picks the richest
one it understands.

clipboard-khipu stores **all** of them, and hands over the formatted one when the app you're
pasting into is a word processor, spreadsheet or mail client:

- Calc → Writer pastes the **whole table**, colours and cell styles included.
- A styled selection from a browser or a syntax-highlighted editor keeps its styling in a document.
- Everywhere else — terminals, code editors, and any app not on the list — you get plain text.

Items carrying formatting are labelled `html`, `rtf` or `formatted` in the list. Press
**`Ctrl+Enter`** instead of `Enter` to force plain text even in a rich-text app.

If your office suite or mail client doesn't get the formatting, add its window class under
**Preferences → Formats → Rich-text app hints**.

> **Why a list instead of just always sending the formatting?** GNOME lets an extension publish
> only *one* format at a time on the clipboard, so clipboard-khipu has to pick. Sending HTML to an
> app that only understands plain text would paste **nothing at all** — so anything not recognised
> as a rich-text app deliberately gets the plain version.

## Files adapt to where you paste them

A copied file has no single right form either, so the destination decides:

- **A file manager** — the file is copied or moved, exactly as if you had pasted in Nautilus.
- **A browser or chat client** — the file itself, ready to upload, the same way dropping it would
  attach it. Paste into Gmail, Slack or a chat box and the file goes up, not its path.
- **A document or mail client** — a lone image lands embedded; several files land as a file list.
- **A terminal** — the bare path.
- **Anywhere else** (editors, dialogs) — the **path as text**, one per line. It's the only thing an
  ordinary input can accept: the file formats are understood by file managers alone, and sending one
  to a text field would paste nothing at all.

Press **Ctrl+Enter** to get the bare path anywhere, including inside a browser — useful when the
field you are filling in wants text rather than a file.

> [!NOTE]
> Uploading works on pages that handle a paste, which is most chat boxes and compose windows. A bare
> **Choose file** button cannot be pasted into at all — no browser supports it — so use its file
> picker, or drag the file in.

If pasting into your file manager gives you the path instead of the file, add its window class under
**Preferences → Files → File manager hints**; if a browser or chat app pastes the path instead of
uploading, add it under **File upload hints**.

## Shortcuts

Everything is keyboard-driven. Once the popup is open:

| Key | Action |
|-----|--------|
| `Super+V` | Open clipboard history (configurable) |
| `↑` / `↓` | Move the selection |
| *type anything* | Filter the list |
| `Enter` | Paste the selected entry |
| `Ctrl+Enter` | Paste the selected entry as plain text (drops the formatting) |
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
gnome-extensions prefs clipboard-khipu@ruddyquispe.github.io
```

- **History size** — how many entries to keep (default 25).
- **Auto-paste on select** — paste immediately after picking, or just put it on the clipboard.
- **Capture images / files** — toggle per content type.
- **Preserve formatting** — keep the HTML/RTF/app-specific formats of a copy (on by default), which
  apps receive them, and size limits for how much to store.
- **Exclude passwords** — skip content flagged as a password by its source app.
- **File manager hints** — window classes that receive a copied file as the file itself.
- **File upload hints** — window classes that receive a copied file as a file to attach.
- **Terminal hints** — window classes that should paste with `Ctrl+Shift+V`.
- **Shortcut** — rebind the open-history key.
- **Clear history** — wipe all stored entries, images and formats.

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
images under `images/`, stored formats under `blobs/`). Nothing leaves your machine. You can wipe it any time from the
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
gnome-extensions disable clipboard-khipu@ruddyquispe.github.io
gnome-extensions enable  clipboard-khipu@ruddyquispe.github.io
```

On Wayland, if a disable/enable doesn't take (GJS caches ES modules), log out and back in for a
clean Shell restart.

> A nested-shell workflow (`scripts/run-nested.sh`) exists but relies on `gnome-shell --nested`,
> which was **removed in GNOME 50**. On 50+ use the disable/enable or re-login loop above.

### Update

If you installed from source (not via `install.sh`), pulling new commits doesn't update the running
extension by itself — `install-link` symlinks each `dist/*.js` file individually, so a fresh build
still needs to be re-linked:

```bash
git pull
npm install                # in case dependencies changed
npm run build
npm run compile-schemas
npm run install-link       # safe to re-run any time, re-links new/changed files
```

Then reload the extension as in the [dev reload loop](#dev-reload-loop) above (disable/enable, or
log out and back in on Wayland if that doesn't take).

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
