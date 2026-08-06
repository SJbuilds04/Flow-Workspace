import { EventEmitter } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { chromium, type BrowserContext, type LaunchOptions } from 'playwright-core'
import type { Account, ProfileState, ProfileStatus } from '@shared/types'
import { paths } from './paths'

/** Thrown when a profile cannot be brought up; carries a user-facing message. */
export class ProfileUnavailableError extends Error {
  readonly accountId: string

  constructor(accountId: string, message: string) {
    super(message)
    this.name = 'ProfileUnavailableError'
    this.accountId = accountId
  }
}

interface ManagedProfile {
  context: BrowserContext
  launchedAt: string
}

/**
 * Chromium builds we are willing to drive, in preference order. Using a stock
 * system browser keeps the installer small and lets the user sign in to a
 * profile they already trust; the Playwright-managed build is the fallback for
 * machines without Chrome or Edge.
 */
const LAUNCH_CANDIDATES: ReadonlyArray<{ label: string; options: LaunchOptions }> = [
  { label: 'Google Chrome', options: { channel: 'chrome' } },
  { label: 'Microsoft Edge', options: { channel: 'msedge' } },
  { label: 'Chromium', options: {} }
]

export interface ProfileManagerEvents {
  status: (status: ProfileStatus) => void
}

/**
 * Owns one persistent Playwright browser context per account. Contexts are
 * created lazily, reused across generations, and torn down on quit. A context
 * directory can only be driven by a single browser at a time, which is exactly
 * the isolation guarantee the account switcher needs.
 */
export class ProfileManager extends EventEmitter {
  private readonly contexts = new Map<string, ManagedProfile>()
  private readonly pending = new Map<string, Promise<BrowserContext>>()
  private readonly statuses = new Map<string, ProfileStatus>()
  private headless = true

  setHeadless(headless: boolean): void {
    this.headless = headless
  }

  statusFor(accountId: string): ProfileStatus {
    return this.statuses.get(accountId) ?? { accountId, state: 'idle' }
  }

  allStatuses(accounts: Account[]): ProfileStatus[] {
    return accounts.map((account) => this.statusFor(account.id))
  }

  private setStatus(accountId: string, state: ProfileState, message?: string): ProfileStatus {
    const previous = this.statuses.get(accountId)
    const status: ProfileStatus = {
      accountId,
      state,
      ...(message ? { message } : {}),
      ...(previous?.lastLaunchedAt ? { lastLaunchedAt: previous.lastLaunchedAt } : {}),
      ...(state === 'ready' ? { lastLaunchedAt: new Date().toISOString() } : {})
    }
    this.statuses.set(accountId, status)
    this.emit('status', status)
    return status
  }

  /**
   * Returns a live context for the account, launching it if needed.
   * Concurrent callers share a single launch attempt.
   */
  async acquire(account: Account): Promise<BrowserContext> {
    const existing = this.contexts.get(account.id)
    if (existing && !this.isClosed(existing.context)) {
      return existing.context
    }
    if (existing) {
      this.contexts.delete(account.id)
    }

    const inFlight = this.pending.get(account.id)
    if (inFlight) return inFlight

    const launch = this.launch(account).finally(() => {
      this.pending.delete(account.id)
    })
    this.pending.set(account.id, launch)
    return launch
  }

  private async launch(account: Account): Promise<BrowserContext> {
    this.setStatus(account.id, 'launching')

    const userDataDir = paths.profile(account.profileDirectory)
    try {
      await mkdir(userDataDir, { recursive: true })
    } catch (error) {
      const message = `Couldn't open the profile folder for ${account.name} (${errorMessage(error)}). Choose a different profile to continue.`
      this.setStatus(account.id, 'unavailable', message)
      throw new ProfileUnavailableError(account.id, message)
    }

    const failures: string[] = []

    for (const candidate of LAUNCH_CANDIDATES) {
      try {
        const context = await chromium.launchPersistentContext(userDataDir, {
          ...candidate.options,
          headless: this.headless,
          viewport: { width: 1440, height: 900 },
          args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check']
        })

        context.on('close', () => {
          this.contexts.delete(account.id)
          if (this.statuses.get(account.id)?.state === 'ready') {
            this.setStatus(account.id, 'idle')
          }
        })

        this.contexts.set(account.id, { context, launchedAt: new Date().toISOString() })
        this.setStatus(account.id, 'ready')
        return context
      } catch (error) {
        failures.push(`${candidate.label}: ${errorMessage(error)}`)
      }
    }

    const message = describeLaunchFailure(account, failures)
    this.setStatus(account.id, 'unavailable', message)
    throw new ProfileUnavailableError(account.id, message)
  }

  async close(accountId: string): Promise<void> {
    const managed = this.contexts.get(accountId)
    this.contexts.delete(accountId)
    if (!managed) {
      this.setStatus(accountId, 'idle')
      return
    }
    try {
      await managed.context.close()
    } catch {
      /* already gone */
    }
    this.setStatus(accountId, 'idle')
  }

  /**
   * Settles every in-flight launch before tearing contexts down. Quitting while
   * a launch is still resolving orphans the browser process, so shutdown waits
   * for the launch to land and then closes it.
   */
  async closeAll(): Promise<void> {
    const pending = [...this.pending.values()]
    if (pending.length > 0) {
      await Promise.allSettled(pending)
    }

    const ids = [...this.contexts.keys()]
    await Promise.all(ids.map((id) => this.close(id)))
  }

  private isClosed(context: BrowserContext): boolean {
    // `browser()` is null for persistent contexts, so liveness is inferred from
    // whether Playwright still reports any pages/driver connection.
    try {
      const browser = context.browser()
      if (browser) return !browser.isConnected()
      return false
    } catch {
      return true
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.split('\n')[0] ?? error.message
  return String(error)
}

function describeLaunchFailure(account: Account, failures: string[]): string {
  const locked = failures.some((failure) => /ProcessSingleton|already (in use|running)|SingletonLock/i.test(failure))

  if (locked) {
    return `The ${account.name} profile is already open in another window. Close it, or pick a different profile to continue.`
  }

  return `Couldn't start a browser for ${account.name}. Install Google Chrome or Microsoft Edge, or choose a different profile to continue.`
}
