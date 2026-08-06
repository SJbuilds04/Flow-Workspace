# Flow Workspace

A desktop workspace for prompt-driven media generation. Electron + React + TypeScript + TailwindCSS, with Playwright doing double duty: it drives the end-to-end tests, and it powers the per-account persistent browser profiles that generations run through.

Dark mode only, by design.

## Getting started

```bash
npm install     # also fetches a Chromium build for the test runner
npm run dev     # hot-reloading app
```

Other scripts:

| Script                                         | What it does                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run build`                                | Typechecks both projects, then bundles main, preload and renderer into `out/` |
| `npm run typecheck`                            | `tsc --noEmit` over the Node side and the web side                            |
| `npm run test:e2e`                             | Builds, then runs the Playwright suite against the compiled app               |
| `npm run test:e2e:ui`                          | Same, in Playwright's UI mode                                                 |
| `npm run dist:win` / `dist:mac` / `dist:linux` | Packages an installer with electron-builder                                   |

## Layout

```
src/
├── shared/            # Types + IPC channel names, imported by all three processes
├── main/              # Electron main
│   ├── index.ts       # Lifecycle, single-instance lock, graceful shutdown
│   ├── window.ts      # Frameless BrowserWindow
│   ├── ipc.ts         # Every handler, each returning a Result<T>
│   ├── media-protocol.ts
│   └── services/
│       ├── store.ts             # Atomic JSON persistence
│       ├── profile-manager.ts   # One persistent Playwright context per account
│       ├── generation-engine.ts # Request -> artifact on disk
│       ├── composition.ts       # The document rendered inside the profile browser
│       ├── attachments.ts       # Native picker + managed uploads folder
│       ├── media-url.ts         # flow-media:// <-> path, with traversal guards
│       └── paths.ts
├── preload/           # The single `window.flow` bridge
└── renderer/src/
    ├── components/    # ui/ layout/ projects/ composer/ history/ account/
    ├── views/         # ProjectView, SettingsView
    ├── store/         # Zustand: workspace + toasts
    ├── hooks/  lib/  styles/
tests/e2e/             # Playwright specs driving the real app
```

## How accounts work

Each account (`Personal`, `Client 1`, `Client 2`) owns a directory under `userData/profiles/`. Selecting one launches — or reuses — a persistent Chromium context rooted at that directory, so cookies and logins stay isolated per client and survive restarts.

The manager tries Google Chrome, then Microsoft Edge, then a plain Chromium build. If none can start, or the profile is already open elsewhere, the account is marked `unavailable` and the UI shows a banner naming the problem with one-click buttons to switch to another profile — never a dead end.

Contexts are reused between generations when _Keep profiles warm_ is on, and are always closed before the app exits.

## How generation works

`GenerationEngine` takes a request, acquires the account's context, opens a page, and renders `composition.ts` into it — a deterministic canvas composition seeded from the prompt, model, ratio and account, blended with the reference image when one is attached. Image models screenshot the canvas to PNG; video models capture a poster frame plus a WebM clip via `MediaRecorder`. Artifacts land in `userData/outputs/<projectId>/` and progress is streamed to the renderer stage by stage.

The provider boundary is `GenerationEngine.run`. Swapping in a hosted model means replacing that method's body; nothing in the renderer, the IPC contract or the history UI depends on how pixels get made.

## Notes

- **Security**: `contextIsolation` on, `nodeIntegration` off, a strict CSP, and a custom `flow-media://` scheme that resolves only inside the managed uploads/outputs roots — renderer-supplied paths cannot escape them.
- **IPC**: every handler resolves to `Result<T>`, so nothing throws across the bridge and the UI always has an error string to show.
- **Window chrome**: macOS keeps its native traffic lights; Windows and Linux are frameless and draw their own controls in `TitleBar.tsx`. Do not add `titleBarOverlay` to `window.ts` — it paints a _second_, native set of caption buttons that overlaps the custom ones and composites above all web content, so it also punches through full-screen overlays like the generation viewer.
- **framer-motion is pinned to 11.11.17.** In 11.18.x, `AnimatePresence` runs exit animations but never calls `safeToRemove`, so filtered and deleted rows stay mounted at opacity 0. Re-pin only after verifying list removal still works.
