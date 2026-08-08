import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import type { Account, AccountIdentity, Project, ScenePlan, Settings } from '@shared/types'

/**
 * Mirrors the store's default accounts. Seeding writes a workspace file *before*
 * the app boots — the main process keeps the workspace in memory, so editing the
 * file after launch has no effect and would be overwritten on the next save.
 */
function defaultAccounts(): Account[] {
  const createdAt = new Date().toISOString()
  return [
    { id: 'personal', name: 'Personal', tone: 'green', profileDirectory: 'personal', createdAt },
    { id: 'client-1', name: 'Client 1', tone: 'purple', profileDirectory: 'client-1', createdAt },
    { id: 'client-2', name: 'Client 2', tone: 'blue', profileDirectory: 'client-2', createdAt }
  ]
}

interface FlowOptions {
  /**
   * Google identities to attach to profiles before the app boots, keyed by
   * account id. Set per-describe with
   * `test.use({ seedIdentities: { personal: { email: '…', connectedAt: '…' } } })`.
   *
   * Plain data on purpose: `test.use()` interprets a function value as a
   * fixture override rather than as an option value.
   */
  seedIdentities: Record<string, AccountIdentity> | null

  /**
   * Settings to write before the app boots. Suites that exercise generation set
   * `{ engine: 'local-preview' }` so they never reach out to labs.google.
   */
  seedSettings: Partial<Settings> | null

  /**
   * Extra environment for the app process. Mainly `GROQ_API_KEY`, which the
   * planner reads before the keychain — so key-gated UI is reachable without
   * a real secret.
   */
  seedEnv: Record<string, string> | null

  /**
   * Projects and storyboards to write before launch. The main process keeps
   * the workspace in memory, so anything written after the app starts is
   * invisible to it and gets overwritten on the next save.
   */
  seedProjects: Project[] | null
  seedPlans: ScenePlan[] | null
}

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
export const test = base.extend<FlowOptions & FlowFixtures>({
  seedIdentities: [null, { option: true }],
  seedSettings: [null, { option: true }],
  seedEnv: [null, { option: true }],
  seedProjects: [null, { option: true }],
  seedPlans: [null, { option: true }],

  userDataDir: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'flow-workspace-e2e-'))
    await use(directory)
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  },

  app: async ({ userDataDir, seedIdentities, seedSettings, seedEnv, seedProjects, seedPlans }, use) => {
    if (seedIdentities || seedSettings || seedProjects || seedPlans) {
      const accounts = defaultAccounts().map((account) => {
        const identity = seedIdentities?.[account.id]
        return identity ? { ...account, identity } : account
      })
      // Anything omitted is filled in by the store's own migration step.
      await writeFile(
        join(userDataDir, 'workspace.json'),
        JSON.stringify(
          {
            version: 1,
            accounts,
            ...(seedProjects ? { projects: seedProjects } : {}),
            ...(seedPlans ? { plans: seedPlans } : {}),
            ...(seedSettings ? { settings: seedSettings } : {})
          },
          null,
          2
        ),
        'utf-8'
      )
    }

    // Some parent processes (VS Code's extension host, for one) export
    // ELECTRON_RUN_AS_NODE=1, which makes electron.exe boot as plain Node and
    // reject Chromium's own flags. Strip it before launching.
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (key === 'ELECTRON_RUN_AS_NODE' || value === undefined) continue
      env[key] = value
    }
    env['NODE_ENV'] = 'test'
    Object.assign(env, seedEnv ?? {})

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
