# AGENTS.md

Context for anyone — human or AI agent — modifying clipboard-khipu. Read this before writing code.

## What this is

A GNOME Shell extension that reproduces the Windows `Super+V` clipboard history: a hotkey opens a
searchable popup of recent clipboard items (text, images, real files); picking one pastes it back
into the previously focused app, exactly as copied. One item in history → pastes directly, no menu.

## Immovable architectural constraints

These are not preferences — they are forced by the platform. Don't "modernize" around them.

- **GNOME Shell extension in GJS, not an external app.** Mutter (GNOME) does not implement the
  Wayland `data-control` protocol, so no external process (Electron, Rust, Python, a GTK app) can
  watch the clipboard in the background, capture a global `Super+V`, or paste into another app
  without stealing focus irrecoverably. Only the compositor — i.e. code running *inside* GNOME
  Shell — can do this. That is why this is a Shell extension.
- **ES modules, GNOME 45+ floor.** GNOME 45 replaced the legacy `imports.*` system with standard
  ESM. All code uses `import`/`export`. GNOME 42–44 (Ubuntu 22.04) is intentionally unsupported.
- **UI is St + Clutter**, the Shell's own toolkit — not GTK, not a web view. The popup is a modal
  St actor stack; paste is synthesized with a `Clutter.VirtualInputDevice`.
- **Runs on the Shell's main loop.** Any blocking I/O freezes the whole desktop. All disk access
  is async and debounced.

## The golden rule

**Store raw, show trimmed, paste the original — never reformat.** Text is saved exactly as it
arrives (no trim, no newline/indent normalization). Type detection (JSON/YAML/URL/path/code) is
for the label and preview *only*. Pasting always reproduces the original bytes, so JSON, YAML and
code round-trip byte-for-byte. Breaking this defeats the point of the tool.

## File map (`src/*.ts`)

| File | Responsibility |
|------|----------------|
| `extension.ts` | `enable()`/`disable()`, wires everything, registers the keybinding, captures the paste target and decides terminal vs normal paste. |
| `clipboardMonitor.ts` | Listens to `Meta.Selection` `owner-changed`; resolves content by MIME priority (files > images > text); skips password-flagged content; anti-echo via `suppressNextChange()`. |
| `historyStore.ts` | In-memory ring buffer, most-recent-first; async debounced JSON persistence; dedup; image files on disk; `remove()` / `clear()`. |
| `historyView.ts` | The modal popup: search filter, keyboard/mouse nav, `Shift+Delete` removal, click-outside backdrop, deterministic scroll math. |
| `paster.ts` | Writes the original content back to the clipboard, then synthesizes `Ctrl+V` or `Ctrl+Shift+V` via the virtual keyboard. |
| `typeDetect.ts` | Heuristic text-type detection — label/icon only, never affects stored content. |
| `prefs.ts` | Adwaita (GTK4) preferences window, bound to GSettings. |
| `types.ts` | `HistoryEntry` union (`text` / `image` / `files`). |

## Cross-cutting rules

- **Async, debounced I/O.** Never call blocking Gio/GLib file ops on the main loop. Follow the
  existing pattern in `historyStore.ts` (`replace_contents_async`, debounced `_scheduleSave`).
- **Anti-echo.** Before the extension writes to the clipboard (on paste), it calls
  `monitor.suppressNextChange()` so it doesn't re-record its own write as a new entry.
- **Password safety.** Content flagged as a password by its source app is never stored.
- **Terminal-aware paste.** `extension.ts` reads the focused window's `get_wm_class()` /
  `get_wm_class_instance()` / `get_gtk_application_id()` and matches against the configurable
  `terminal-wm-classes` GSettings list to choose `Ctrl+Shift+V` over `Ctrl+V`.
- **Single vs multi.** Zero entries → nothing. One → paste directly, no UI. More → open the popup.
- **Fallback never loses the action.** Even if synthetic paste fails, the content is already on
  the clipboard, so a manual paste works.

## Build & verify

```bash
npm install
npm run build            # tsc -> dist/
npm run compile-schemas  # glib-compile-schemas schemas/
npm run install-link     # symlink into ~/.local/share/gnome-shell/extensions/
npx tsc --noEmit         # strict typecheck — the primary automated gate
```

Reload after a build with `gnome-extensions disable/enable clipboard-khipu@ruddy.local`; on
Wayland a re-login guarantees a clean Shell restart. There is **no automated test suite** — the
typecheck plus a manual QA pass is the current safety net.

## Compatibility policy

- **One build covers GNOME 46–50.** The API surface used is stable across that range; the manifest
  declares all five in `metadata.json` `shell-version`.
- **Known debt:** `St.BoxLayout({ vertical: true })` is deprecated since GNOME 48 (use
  `orientation: Clutter.Orientation.VERTICAL`). It still works through 50, so it's kept for now;
  migrate when the floor rises above the version that removes it.

## Conventions

- **Authoring in TypeScript** against `@girs/gnome-shell`; the runtime is GJS. No bundler.
- **English** for all code, identifiers, comments, UI strings and docs.
- **Conventional commits**, no AI attribution.
- **Spec-driven for anything non-trivial.** Plan the change (scope, files, verification) before
  writing code; keep the golden rule and the async/main-loop constraint front of mind.

## Out of scope (v1)

Pinned/favorite items, cross-machine sync, entry editing, rich formats (RTF/HTML), image OCR.
