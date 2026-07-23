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
- **One mimetype per grab, and that cannot be worked around from GJS.** A real clipboard grab is a
  *set* of representations (`text/html`, `text/rtf`, `application/x-openoffice-*`, `text/plain`, …)
  and the pasting app picks the richest one it understands. We can only publish one:
  - `St.Clipboard.set_content()` takes a single mimetype.
  - The layer under it, `Meta.Selection.set_owner()`, needs a `Meta.SelectionSource`. The only
    concrete one, `Meta.SelectionSourceMemory`, also holds a single mimetype.
  - Subclassing `Meta.SelectionSource` is **impossible in GJS**: `registerClass` rejects
    `vfunc_read_async` with *"VFunc read_async accepts another callback as a parameter. This is not
    supported"* — a hard limit in GJS's C-side `hook_up_vfunc_symbol`. `vfunc_get_mimetypes` and
    `vfunc_read_finish` are accepted, but without `read_async` there is no way to serve different
    bytes per mimetype.

  So *capture* keeps every flavor, and *paste* picks the single one the target window can use
  (see the format-choice rule below). Do not re-attempt the multi-flavor source; it has been tried.
- **UI is St + Clutter**, the Shell's own toolkit — not GTK, not a web view. The popup is a modal
  St actor stack; paste is synthesized with a `Clutter.VirtualInputDevice`.
- **Runs on the Shell's main loop.** Any blocking I/O freezes the whole desktop. All disk access
  is async and debounced.

## The golden rule

**Store raw, show trimmed, paste the original — never reformat.** Text is saved exactly as it
arrives (no trim, no newline/indent normalization). Type detection (JSON/YAML/URL/path/code) is
for the label and preview *only*. Pasting always reproduces the original bytes, so JSON, YAML and
code round-trip byte-for-byte. Breaking this defeats the point of the tool.

This extends to **every flavor**, not just the text one: the HTML, RTF and app-specific blobs of a
grab are stored and replayed verbatim. We never parse, sanitize, convert or re-encode them — we
only ever choose *which* stored blob to hand over.

## File map (`src/*.ts`)

| File | Responsibility |
|------|----------------|
| `extension.ts` | `enable()`/`disable()`, wires everything, registers the keybinding, captures the paste target and decides terminal vs normal paste. |
| `clipboardMonitor.ts` | Listens to `Meta.Selection` `owner-changed`; classifies the grab by MIME priority (files > images > text) and reads *every* flavor sequentially via `Meta.Selection.transfer_async`; skips password-flagged content; anti-echo via `suppressNextChange()`; generation counter abandons in-flight reads when a new copy lands. |
| `historyStore.ts` | In-memory ring buffer, most-recent-first; async debounced JSON persistence; dedup; image files and flavor blobs on disk; orphan-blob sweep on load; `remove()` / `clear()`. |
| `historyView.ts` | The modal popup: search filter, keyboard/mouse nav, `Shift+Delete` removal, click-outside backdrop, deterministic scroll math. |
| `paster.ts` | Picks the one representation the target window can use (rich flavor vs. primary), writes it back with `St.Clipboard`, then synthesizes `Ctrl+V` or `Ctrl+Shift+V` via the virtual keyboard. |
| `typeDetect.ts` | Heuristic text-type detection — label/icon only, never affects stored content. |
| `prefs.ts` | Adwaita (GTK4) preferences window, bound to GSettings. |
| `types.ts` | `HistoryEntry` union (`text` / `image` / `files`), each carrying its `Flavor[]` — the extra MIME representations stored as blobs. |

## Cross-cutting rules

- **Async, debounced I/O.** Never call blocking Gio/GLib file ops on the main loop. Follow the
  existing pattern in `historyStore.ts` (`replace_contents_async`, debounced `_scheduleSave`).
- **Anti-echo.** Before the extension writes to the clipboard (on paste), it calls
  `monitor.suppressNextChange()` so it doesn't re-record its own write as a new entry.
- **Password safety.** Content flagged as a password by its source app is never stored.
- **Format fidelity is bounded, never truncated.** A flavor over `flavor-max-bytes` (or over the
  per-entry `entry-max-bytes` budget) is dropped whole — half an HTML or RTF blob is worse than
  none. The primary representation is read uncapped, so a large plain-text copy is never lost.
- **Format choice is target-driven and conservative.** Only windows matching `rich-text-wm-classes`
  get a formatted flavor (`text/html` > `text/rtf` > `application/rtf` > `text/richtext`);
  everything else, including every unknown app, gets the primary representation. Publishing HTML to
  an app that only asked for plain text yields an *empty* paste, so the default must stay plain.
  `Ctrl+Enter` in the popup forces plain regardless. App-specific formats
  (`application/x-openoffice-*`) are captured but never published alone — they only round-trip
  together with their companion descriptor, which is exactly what the one-mimetype limit forbids.
- **Terminal-aware paste.** `extension.ts` reads the focused window's `get_wm_class()` /
  `get_wm_class_instance()` / `get_gtk_application_id()` and matches against the configurable
  `terminal-wm-classes` GSettings list to choose `Ctrl+Shift+V` over `Ctrl+V`. The same lookup
  builds the `PasteTarget` used for the format choice above.
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

Pinned/favorite items, cross-machine sync, entry editing, image OCR.
