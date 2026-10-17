# Feature: pin-entries

Locator: `odd/tasks/pin-entries.md` · Engram mirror: `odd/pin-entries/tasks` · Branch: `feat/pin-entries`

## Objective
Let the user pin any item already in the history queue so capacity eviction never removes it,
and unpin it to return it to the normal flow. A single toggle shortcut, `Ctrl+P`, acts on the
selected popup row, mirroring how `Shift+Delete` removes one.

## Problem / why
`_trim()` in `src/historyStore.ts` evicts the oldest entries with no exemption, so frequently
reused snippets fall out of history once `history-size` new copies arrive.

## Decisions
- Chronological order: a pinned item keeps its date position and slides down as new copies
  arrive, but is never evicted.
- Shortcut `Ctrl+P` (`Ctrl+F` rejected: conventionally "find", and the popup has a search field).
- Pinned entries do not count toward `history-size`; the limit applies to unpinned entries only.
- Re-copying pinned content moves it to the top and keeps it pinned.
- `Shift+Delete` still removes a pinned entry.

## Scope / constraints
- Golden rule untouched: stored bytes are never reformatted.
- All I/O stays async and debounced via `_scheduleSave`.
- `pinned?: boolean` is optional, so v2 `history.json` loads unchanged (no migration).
- Delivery strategy: `ask-on-risk`; forecast ~150 authored lines (single PR).

## Tasks
- [x] T1 — Model + store: `pinned?` field, `_trim()` skips pinned, `setPinned()`, dedup keeps
  pinned. Route: delegated (writer). Commit: `feat(store): support pinned entries exempt from eviction`.
- [ ] T2 — Popup (`Ctrl+P` toggle, pin icon, footer), wiring in `extension.ts`, stylesheet,
  README.md / README.es.md / AGENTS.md. Route: delegated (writer, 2+ non-trivial files).
  Commit: `feat(popup): toggle pin with Ctrl+P`.

## Acceptance criteria
- With `history-size` 3, pinning entry #2 and copying 5 new items keeps the pinned entry plus
  exactly 3 unpinned entries.
- `Ctrl+P` on a pinned row unpins it; it is evicted on the next copy if over the limit.
- Pinned state persists across disable/enable.
- `Ctrl+P` in the search field does not insert text; single-entry direct paste unaffected.

## Checks
- No automated test suite exists (test-first exception: no runnable RED).
- `npx tsc --noEmit`, `npm run build`, `npm run compile-schemas`.
- Manual QA in `npm run nested` per acceptance criteria.

## Progress
- Branch `feat/pin-entries` created from `master`.

## Next step
T1.
