import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

interface FlowFixtures {
  /** The throwaway `userData` directory the app under test is pointed at. */
  userDataDir: string
  app: ElectronApplication
  window: Page
}

/**
 * Every test gets a fresh `userData` directory, so runs never inherit a previous
 * run's projects, generations or browser profiles. Assertions about files on
 * disk read straight from that directory rather than evaluating in the main
 * process, which cannot resolve dynamic imports.
 */
export const test = base.extend<FlowFixtures>({
  userDataDir: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'flow-workspace-e2e-'))
    await use(directory)
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  },

  app: async ({ userDataDir }, use) => {
    // Some parent processes (VS Code's extension host, for one) export
    // ELECTRON_RUN_AS_NODE=1, which makes electron.exe boot as plain Node and
    // reject Chromium's own flags. Strip it before launching.
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (key === 'ELECTRON_RUN_AS_NODE' || value === undefined) continue
      env[key] = value
    }
    env['NODE_ENV'] = 'test'

    const app = await electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      cwd: process.cwd(),
      env
    })

    await use(app)
    await app.close()
  },

  window: async ({ app }, use) => {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    // The shell shows a boot screen until the workspace file has loaded.
    await window.getByRole('navigation', { name: 'Projects' }).waitFor({ state: 'visible' })
    await use(window)
  }
})

export { expect } from '@playwright/test'
