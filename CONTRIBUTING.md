# Contributing

Thanks for taking a look. This is an Electron app, so a few things behave differently from a plain web project — worth skimming before your first change.

## Setup

```bash
npm install     # also fetches a Chromium build for the test runner
npm run dev
```

Node 20 or newer.

## Before you open a PR

```bash
npm run format
npm run lint
npm run typecheck
npm run test:e2e
```

CI runs all four on Linux, Windows and macOS, so running them locally saves a round trip.

## How the code is laid out

Three processes, three trust levels:

- `src/main/` — Node. Full filesystem and process access. Everything that touches disk or launches a browser lives here.
- `src/preload/` — the only bridge. Adding a capability means adding an IPC channel in `src/shared/ipc.ts`, a handler in `src/main/ipc.ts`, and a method on the `api` object in `src/preload/index.ts`. All three, or it doesn't exist.
- `src/renderer/` — React. No Node access, by design. If a component needs something from the OS, it goes through `window.flow`.

`src/shared/` is imported by all three and must stay dependency-free.

## Conventions

- **IPC handlers return `Result<T>`, never throw.** The renderer should always have an error string to show rather than an unhandled rejection.
- **User-facing errors name a way out.** "Couldn't start Chrome" is half an error message; "…choose a different profile to continue" is the whole one.
- **Icon-only controls need a `label`.** `IconButton` requires it, and the e2e suite selects by accessible role and name — good a11y keeps the tests readable.
- **Components are typed with explicit return types** (`ReactNode`), matching the existing files.

## Tests

`tests/e2e/` drives the real compiled app through Playwright's Electron support. Two suites:

- `workspace.spec.ts` — hermetic. Runs anywhere, no browser needed.
- `generation.spec.ts` — exercises the real pipeline end to end, so it needs a Chromium-family browser. It skips rather than fails when one isn't available.

Every test gets a throwaway `userData` directory via the `userDataDir` fixture. Assert on files by reading that directory from the test process — `electronApplication.evaluate` cannot resolve dynamic imports in the packaged main bundle.

## Gotchas worth knowing

- **`framer-motion` is pinned to 11.11.17.** In 11.18.x, `AnimatePresence` runs exit animations but never calls `safeToRemove`, so removed list rows stay mounted at opacity 0. Verify list filtering and deletion still work before bumping it.
- **Don't add `titleBarOverlay` to `window.ts`.** It paints a second, native set of caption buttons over the custom ones, and native chrome composites above web content — it will also punch through full-screen overlays.
- **`page.screenshot()` won't show native window chrome.** If you're debugging the title bar, take an OS-level screenshot instead.
- **`ELECTRON_RUN_AS_NODE=1`** in your shell (VS Code's integrated terminal sets it) makes `electron.exe` boot as plain Node and reject Chromium flags. The test fixture strips it; you may need to as well.
