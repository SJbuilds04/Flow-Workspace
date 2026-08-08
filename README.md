# Flow Workspace

Plan a video as a shot list, render every shot through Google Flow across several of your own Google accounts in parallel, and join the result into one file.

Electron + React + TypeScript + TailwindCSS. Playwright does double duty: it drives the end-to-end tests, and it powers the per-account persistent browser profiles that generations run through. Groq turns a brief — or a story you already wrote — into the shot list.

Dark mode only, by design.

## Read this before you use it

**This drives Google Flow's web interface as you.** There is no official API involved. It signs into your own Google accounts in real browser profiles and clicks the same buttons you would.

That has consequences worth understanding up front:

- **It spends real credits.** Every shot is a real Flow generation on a real account. A 60-second video is 6+ shots. Check what a run will cost before starting one — the storyboard shows an estimate.
- **It will break.** Google redesigns Flow, and UI automation breaks when it does. When that happens the error tells you what Flow actually showed, which is usually enough to fix the selector in `src/main/services/flow-provider.ts`. Treat breakage as expected maintenance, not as a bug report.
- **Your accounts, your responsibility.** Automating a service you have an account with is between you and that service's terms. This project takes no position on that and gives you no cover for it.
- **Character consistency is conditioning, not identity locking.** Reference photos make a subject much more likely to look the same across shots. They do not guarantee it. Expect a recognisable person, not an identical one.

Nothing here is affiliated with, endorsed by, or supported by Google.

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

## Connecting a Google account

**Settings → Browser profiles → Connect Google**, or the account menu at the top right.

That opens the profile's own browser **visibly** at `accounts.google.com` and waits up to five minutes while you sign in by hand. The app polls for a session and, once it sees one, stores the identity against the account and closes the sign-in tab. The session lives in the profile directory from then on, so it survives restarts — this is a one-time cost per profile.

Sign-in is deliberately manual. Google blocks scripted credential entry, so there is no version of this that types a password for you; a real person in a real Chrome window is both what works and what should be happening with your own accounts. The profile manager prefers your installed Chrome (then Edge, then bundled Chromium) partly for this reason — stock Chrome clears Google's checks far more often than the Playwright build.

Two things to know about how a connection is detected:

- **The session** is read from the `SID`/`HSID`/`SSID` cookies. That signal is authoritative.
- **The email, name and avatar** come from `accounts.google.com/ListAccounts`, an undocumented endpoint Chromium itself uses. It can change without notice. If it fails, the profile is still connected — just shown without a label rather than with a guessed one.

**Sign out** clears the profile's cookies. If the profile was never opened there is nothing on disk to clear, so no browser is launched.

Whether to drive a particular Google product's web UI this way is your call against that product's terms — the app gives you signed-in profiles; it does not decide what you point them at.

## How generation works

Two engines share one code path, chosen in **Settings → Generation engine**. Both run inside the selected account's browser context, and both stream progress to the renderer stage by stage. Artifacts land in `userData/outputs/<projectId>/`.

### Google Flow (default)

`flow-provider.ts` drives the real [Flow](https://labs.google/fx/tools/flow) web app as the signed-in account: it sets output type, reference mode, ratio, model, duration and output count, writes the prompt, reads Flow's own credit quote, submits, waits for media to appear, and downloads each result from inside the page so the session's cookies sign the request.

Every control is addressed **by its visible label** — `Video`, `10s`, `16:9`, `x2` — never by class name. Flow ships hashed CSS that changes on each deploy, but the text on its buttons is the product surface and moves far less. When a label does go missing, the run fails with the labels that _were_ on the page, so the mapping can be corrected rather than guessed at. The same applies to models: a name that Flow no longer offers produces an error listing what it does offer, and the list is editable in Settings.

This is UI automation against someone else's app. It is inherently brittle — expect to adjust when Flow redesigns, and treat the diagnostics in the error message as the intended repair path.

### Local preview

`composition.ts` rendered in the profile browser: a deterministic canvas composition seeded from the prompt, model, ratio and account, blended with a reference image when one is attached. Stills screenshot to PNG; video captures a poster frame plus a WebM clip via `MediaRecorder`.

It needs no Google account and always produces the same output for the same input, which is what the end-to-end suite runs against (`test.use({ seedSettings: { engine: 'local-preview' } })`).

## Notes

- **Security**: `contextIsolation` on, `nodeIntegration` off, a strict CSP, and a custom `flow-media://` scheme that resolves only inside the managed uploads/outputs roots — renderer-supplied paths cannot escape them.
- **IPC**: every handler resolves to `Result<T>`, so nothing throws across the bridge and the UI always has an error string to show.
- **Window chrome**: macOS keeps its native traffic lights; Windows and Linux are frameless and draw their own controls in `TitleBar.tsx`. Do not add `titleBarOverlay` to `window.ts` — it paints a _second_, native set of caption buttons that overlaps the custom ones and composites above all web content, so it also punches through full-screen overlays like the generation viewer.
- **framer-motion is pinned to 11.11.17.** In 11.18.x, `AnimatePresence` runs exit animations but never calls `safeToRemove`, so filtered and deleted rows stay mounted at opacity 0. Re-pin only after verifying list removal still works.
