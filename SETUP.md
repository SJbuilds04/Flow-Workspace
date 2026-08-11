# Setup

Getting Flow Workspace running from scratch. Takes about 15 minutes, most of it downloads.

If you know Node, it is the usual three lines — `git clone`, `npm install`, `npm run dev` — and the rest of this page is the accounts and keys the app needs to actually do anything.

Coming from Python? `package.json` is the `requirements.txt`, `npm install` is `pip install -r requirements.txt`, and `npm run dev` is `python app.py`. You do not need a virtualenv; `npm install` puts everything in a local `node_modules/` folder inside the project.

---

## Before you start: open these tabs

Keep these four open, you will bounce between them:

1. **https://labs.google/fx/tools/flow** — check this first. If it shows a marketing page with a _Get started_ button rather than the tool itself, that Google account cannot use Flow, and nothing below will fix that.
2. **https://nodejs.org** — to install Node, if you do not have it
3. **https://console.groq.com/keys** — to create the API key that plans your scenes
4. **https://github.com/SJbuilds04/Flow-Workspace** — this repo

---

## Step 1 — Install the prerequisites

| What                    | Required? | Why                                                |
| ----------------------- | --------- | -------------------------------------------------- |
| **Node.js 20 or newer** | Yes       | Runs the app and installs everything else          |
| **A real browser**      | Yes       | Chrome **or** Edge — see the note below            |
| **Git**                 | Optional  | Only if you clone; you can download a ZIP instead  |
| **FFmpeg**              | Optional  | Only for joining the finished shots into one video |

**About the browser.** The app drives a real browser, trying **Chrome → Edge → a bundled Chromium** in that order. Chrome and Edge both work fine; on Windows you already have Edge, so there is usually nothing to install. What you want to avoid is falling all the way through to the bundled Chromium, which carries automation flags Google is much more suspicious of at sign-in.

**Windows**

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git          # skip if you download the ZIP
winget install Gyan.FFmpeg      # skip if you do not need joining
```

**macOS**

```bash
brew install node
brew install git ffmpeg         # optional
```

**Linux (Debian/Ubuntu)**

```bash
sudo apt update && sudo apt install -y nodejs npm
sudo apt install -y git ffmpeg  # optional
```

**Close and reopen your terminal**, then check:

```bash
node -v         # must be v20 or higher
ffmpeg -version # only if you installed it
```

Without FFmpeg everything works except the final join, and the app says so plainly rather than failing oddly.

---

## Step 2 — Get the code

Pick whichever you prefer. The ZIP needs no Git; cloning makes updates one command instead of a re-download.

### Option A — Download the ZIP (no Git needed)

1. Go to **https://github.com/SJbuilds04/Flow-Workspace**
2. Click the green **Code** button → **Download ZIP**
3. Right-click the downloaded file → **Extract All** → pick somewhere simple like `C:\Projects`
4. Open the extracted folder. If it contains a single folder named `Flow-Workspace-main`, that inner folder is the project
5. Open a terminal **in that folder**:
   - **Windows:** click the address bar in File Explorer, type `cmd`, press Enter
   - **macOS:** right-click the folder → Services → New Terminal at Folder

To update later, download the ZIP again and replace the folder — keeping your own `node_modules` out of it. Your settings, keys and generated videos live outside the project folder, so replacing it loses nothing.

### Option B — Clone with Git

```bash
git clone https://github.com/SJbuilds04/Flow-Workspace.git
cd Flow-Workspace
```

Updating later is just `git pull`.

### Then, either way

```bash
npm install
```

This takes a few minutes. It reads `package.json`, downloads the libraries into a local `node_modules/` folder, and then pulls down two large binaries: Electron itself (~180 MB) and a Chromium build for the test runner. Those downloads are the slow part — that is normal, let it finish.

**Do not interrupt it.** If the Electron download is cut short, `npm install` can still look successful but `npm run dev` will fail with `Error: Electron uninstall`. See the troubleshooting section if that happens.

---

## Step 3 — Start it

```bash
npm run dev
```

The app window opens. It will not generate anything yet — it needs a key and an account first.

> **Windows + VS Code:** run this in a normal terminal (Windows Terminal, PowerShell, cmd), **not** VS Code's built-in terminal. VS Code sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron boot as plain Node and fail with `bad option: --remote-debugging-port`.

---

## Step 4 — Add your Groq key

Groq turns your brief, or a story you paste in, into a list of individual shots. It costs no Flow credits and the free tier is plenty.

1. Go to **https://console.groq.com/keys** → **Create API Key** → copy it
2. In the app: **Settings → Scene planner → Groq API key** → paste → **Save**

The key is encrypted by your OS keychain and stored outside the project folder. It is never written into the repo, and the app never reads it back out to the interface.

If the default model has been retired by the time you read this, planning will fail with Groq's own message naming the problem. Change **Planner model** in the same panel — that field exists precisely because providers rotate model names.

---

## Step 5 — Connect a Google account

You need an account that can open Google Flow. Check it first in the tab you opened earlier: if **https://labs.google/fx/tools/flow** shows you a marketing page with a _Get started_ button instead of the tool, that account has no Flow access and the app cannot fix that.

1. In the app: **Settings → Browser profiles → Connect Google**
2. A real browser window opens. **Sign in by hand.**
3. Leave it alone while it walks Flow's welcome and privacy screens and creates a first project

Sign-in is manual on purpose. Google blocks scripted credential entry, so there is no version of this that types your password for you.

**Adding more accounts is the point.** Each profile is a separate browser with its own credits, so more accounts means more shots per day and more shots rendering at once. Add them under the same Settings section.

---

## Step 6 — Make something

1. Open the **Storyboard** tab in a project
2. Either describe what you want (**Generate scenes**) or paste writing you already have (**Paste your story**, which only cuts it into shots and invents nothing)
3. **Plan scenes**
4. Optional: add a reference photo per character so faces stay recognisable between shots
5. **Render** — work spreads across every connected profile at once
6. **Join into one video** when the shots are done

**Start small.** Try two shots at four seconds before committing to a sixty-second video. A single shot takes two to five minutes of real Google rendering time, and every one of them spends real credits.

---

## Costs and timing, honestly

- A 60-second video is roughly 6–8 shots, around 90 credits
- Free Flow allowance is about 50 credits per day, per account
- So one 60-second video is more than a day of credits on a single account — which is exactly why the app spreads work across several
- Each shot takes 2–5 minutes. That is Google rendering, not the app being slow
- When an account runs dry, it is parked until the daily reset and its shot moves to another profile automatically

---

## When something goes wrong

**`Error: Electron uninstall`** when running `npm run dev`

The `electron` package is only a downloader — its install step fetches a ~180 MB binary from GitHub Releases, and that part did not finish. `npm install` can still report success while leaving it missing.

Check for it:

```bash
# Windows
dir node_modules\electron\dist\electron.exe

# macOS / Linux
ls node_modules/electron/dist
```

If it is not there, re-run just that download:

```bash
node node_modules/electron/install.js
```

Still failing? Something is blocking the download — antivirus, a corporate network, or a proxy. Try `npm install --force`, and if you are behind a proxy set `ELECTRON_GET_USE_PROXY=true` before installing.

**`bad option: --remote-debugging-port`**
You are in VS Code's terminal. Use a normal one.

**Sign-in gets refused or Google says the browser may not be secure**
The app fell through to its bundled Chromium, which Google distrusts. Install Chrome or Edge — either is fine — and it will use that instead.

**"Couldn't open a Flow project" / it lands on the marketing page**
Either that account has no Flow access, or first-run setup did not finish. Sign the profile out and back in, and complete the welcome screens yourself in the window that opens.

**A run fails naming a control it could not find**
Google redesigned Flow. The error lists what was actually on the page — that is usually enough to fix the selector in `src/main/services/flow-provider.ts`. This is expected maintenance for UI automation, not a defect.

**Joining is greyed out**
FFmpeg is not on your PATH. Install it and restart the app.

---

## Useful commands

| Command            | What it does                                             |
| ------------------ | -------------------------------------------------------- |
| `npm run dev`      | Run the app with hot reload                              |
| `npm run build`    | Typecheck and bundle                                     |
| `npm run test:e2e` | Run the end-to-end tests                                 |
| `npm run dist:win` | Build a Windows installer (`dist:mac`, `dist:linux` too) |
| `npm run lint`     | Check code style                                         |
