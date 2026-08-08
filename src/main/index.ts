import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { handleMediaProtocol, registerMediaScheme } from './media-protocol'
import { GenerationEngine } from './services/generation-engine'
import { ensureAppDirectories } from './services/paths'
import { ProfileManager } from './services/profile-manager'
import { RenderQueue } from './services/render-queue'
import { WorkspaceStore } from './services/store'
import { createMainWindow } from './window'

// Must happen before `whenReady`, while the protocol registry is still open.
registerMediaScheme()

// A single instance keeps profile directories from being opened twice.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

const store = new WorkspaceStore()
const profiles = new ProfileManager()
const engine = new GenerationEngine(profiles)
const queue = new RenderQueue({ store, engine })

let mainWindow: BrowserWindow | null = null

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  await ensureAppDirectories()
  await store.load()

  profiles.setHeadless(!store.settings.showBrowserWindow)

  handleMediaProtocol()
  registerIpc({ store, profiles, engine, queue })

  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Browser contexts are child processes; quitting out from under them orphans
// the browser and can take the app down with it. Hold the quit until they are
// closed, then let the second pass through go ahead.
let shuttingDown = false

app.on('before-quit', (event) => {
  if (shuttingDown) return

  event.preventDefault()
  shuttingDown = true

  void profiles
    .closeAll()
    .catch((error) => console.error('[shutdown] failed to close profiles', error))
    .finally(() => app.quit())
})
