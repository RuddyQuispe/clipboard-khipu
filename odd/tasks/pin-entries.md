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
- Pinned section on top (replaces the earlier "chronological order" decision): the popup lists
  pinned entries first, then unpinned, each group newest-first. View concern only; the store keeps
  its chronological array.
- Initial selection is the newest unpinned row (row 0 if none), also after every search change, so
  `Super+V` then `Enter` still pastes the latest copy.
- Unpinning never deletes immediately: `setPinned()` does not trim; an over-limit entry is trimmed
  by the normal `_trim()` on the next copy or on `setMaxSize`.
- The popup resyncs with the store after a pin toggle (`HistoryPinHandler` returns the full
  history) and re-selects the toggled entry by id.
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
- [x] T2 — Popup (`Ctrl+P` toggle, pin icon, footer), wiring in `extension.ts`, stylesheet,
  README.md / README.es.md / AGENTS.md. Route: delegated (writer, 2+ non-trivial files).
  Commit: `feat(popup): toggle pin with Ctrl+P`.
- [x] T3 — Pinned section on top, newest-unpinned initial selection, deferred trim on unpin, popup
  resync after toggle (fixes R3-stale-row-after-unpin-trim), `!!pinned` truthiness, docs.
  Route: delegated (writer, 3+ files). Commit: `f648b87` (`fix(popup): list pinned entries first and defer trim on unpin`).

## Acceptance criteria
- With `history-size` 3, pinning entry #2 and copying 5 new items keeps the pinned entry plus
  exactly 3 unpinned entries.
- Pinned entries are listed at the top of the popup.
- `Super+V` then `Enter` pastes the latest copy even when pinned entries exist.
- `Ctrl+P` on a pinned row with a full history removes nothing; the over-limit entry is evicted
  only on the next copy.
- After a pin toggle the popup never shows a stale row; the selection follows the toggled entry.
- Pinned state persists across disable/enable.
- `Ctrl+P` in the search field does not insert text; single-entry direct paste unaffected.

## Checks
- No automated test suite exists (test-first exception: no runnable RED).
- `npx tsc --noEmit`, `npm run build`, `npm run compile-schemas`.
- Manual QA in `npm run nested` per acceptance criteria.

## Progress
- Branch `feat/pin-entries` created from `master`.
- T1 done in `4afcf5b` (`feat(store): support pinned entries exempt from eviction`): `_trim()` evicts
  only unpinned entries from the tail, `setPinned()` toggles in place and re-trims, dedup carries the pin.
- T2 done in `fe384ef` (`feat(popup): toggle pin with Ctrl+P`): Ctrl+P toggle keeping selection, pin icon and
  `khipu-row-pinned` class, footer hint, `extension.ts` wiring, stylesheet, README/README.es/AGENTS.
- Checks observed: `npx tsc --noEmit` pass, `npm run build` pass, `npm run compile-schemas` pass.
  Manual QA pending.
- T3 done in `f648b87` (`fix(popup): list pinned entries first and defer trim on unpin`): `pinnedFirst()` /
  `defaultSelection()` helpers in `historyView.ts`, `setPinned()` no longer trims, pin handler returns
  `store.getAll()` and the popup resyncs, README/README.es/AGENTS updated.
- T3 checks observed: `npx tsc --noEmit` pass, `npm run build` pass. Manual QA pending.

## Next step
Manual QA in nested session (`npm run nested`) against the updated acceptance criteria (pinned on
top, Enter pastes latest copy, unpin with full history removes nothing until the next copy, no stale
rows), then decide on the PR.
