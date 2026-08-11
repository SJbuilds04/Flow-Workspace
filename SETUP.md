# Setup

Getting Flow Workspace running from scratch. Takes about 15 minutes, most of it downloads.

If you know Node, it is the usual three lines — `git clone`, `npm install`, `npm run dev` — and the rest of this page is the accounts and keys the app needs to actually do anything.

Coming from Python? `package.json` is the `requirements.txt`, `npm install` is `pip install -r requirements.txt`, and `npm run dev` is `python app.py`. You do not need a virtualenv; `npm install` puts everything in a local `node_modules/` folder inside the project.

---

## Before you start: open these tabs

Keep these four open, you will bounce between them:

1. **https://nodejs.org** — to install Node, if you do not have it
2. **https://console.groq.com/keys** — to create the API key that plans your scenes
3. **https://labs.google/fx/tools/flow** — to confirm the Google account you plan to use can actually open Flow
4. **https://github.com/SJbuilds04/Flow-Workspace** — this repo

---

## Step 1 — Install the prerequisites

| What                    | Why it is needed                                                               |
| ----------------------- | ------------------------------------------------------------------------------ |
| **Node.js 20 or newer** | Runs the app and installs everything else                                      |
| **Git**                 | Downloads the code                                                             |
| **Google Chrome**       | Google blocks sign-in on automated browsers far more often than on real Chrome |
| **FFmpeg**              | Joins the finished shots into one video                                        |

**Windows**

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Google.Chrome
winget install Gyan.FFmpeg
```

**macOS**

```bash
brew install node git ffmpeg
brew install --cask google-chrome
```

**Linux (Debian/Ubuntu)**

```bash
sudo apt update && sudo apt install -y nodejs npm git ffmpeg
```

**Close and reopen your terminal**, then check all four:

```bash
node -v      # must be v20 or higher
git --version
ffmpeg -version
```

FFmpeg is only needed for the final join step. Everything else works without it, and the app tells you plainly if it is missing.

---

## Step 2 — Get the code and install dependencies

```bash
git clone https://github.com/SJbuilds04/Flow-Workspace.git
cd Flow-Workspace
npm install
```

`npm install` takes a few minutes. It reads `package.json`, downloads the libraries into `node_modules/`, and then downloads a Chromium build for the test runner. The Chromium download is the slow part — that is normal, let it finish.

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

**`bad option: --remote-debugging-port`**
You are in VS Code's terminal. Use a normal one.

**Sign-in gets refused or looks suspicious to Google**
Install Chrome. Without it the app falls back to Edge or a bundled Chromium, and Google is much more suspicious of those.

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
