import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { chromium, type BrowserContext, type LaunchOptions } from 'playwright-core'
import type { Account, AccountIdentity, ProfileState, ProfileStatus } from '@shared/types'
import { FLOW_URL, prepareFlowAccount } from './flow-provider'
import { detectGoogleIdentity, GOOGLE_SIGN_IN_URL } from './google-session'
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
  /** Visibility the context was launched with; cannot be changed in place. */
  headless: boolean
  launchedAt: string
}

/** Raised when the user closes the sign-in window, or cancels, or waits too long. */
export class SignInAbandonedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignInAbandonedError'
  }
}

/** How long we keep the sign-in window open waiting for the user to finish. */
const SIGN_IN_TIMEOUT_MS = 5 * 60_000
const SIGN_IN_POLL_MS = 1500

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
  private readonly signInAborts = new Set<string>()
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
   *
   * A context that is already up in the wrong visibility mode is torn down and
   * relaunched: headed and headless cannot be switched on a running browser,
   * and sign-in must be visible whatever the global setting says.
   */
  async acquire(account: Account, options?: { headless?: boolean }): Promise<BrowserContext> {
    const headless = options?.headless ?? this.headless
    const existing = this.contexts.get(account.id)

    if (existing && !this.isClosed(existing.context) && existing.headless === headless) {
      return existing.context
    }
    if (existing) {
      if (!this.isClosed(existing.context)) {
        await this.close(account.id)
      } else {
        this.contexts.delete(account.id)
      }
    }

    const inFlight = this.pending.get(account.id)
    if (inFlight) return inFlight

    const launch = this.launch(account, headless).finally(() => {
      this.pending.delete(account.id)
    })
    this.pending.set(account.id, launch)
    return launch
  }

  private async launch(account: Account, headless: boolean): Promise<BrowserContext> {
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
          headless,
          viewport: { width: 1440, height: 900 },
          args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check']
        })

        context.on('close', () => {
          this.contexts.delete(account.id)
          if (this.statuses.get(account.id)?.state === 'ready') {
            this.setStatus(account.id, 'idle')
          }
        })

        this.contexts.set(account.id, { context, headless, launchedAt: new Date().toISOString() })
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

  /**
   * Opens the account's profile in a *visible* browser at Google's sign-in page
   * and waits for the user to complete it by hand.
   *
   * Sign-in is deliberately manual. Google blocks scripted credential entry,
   * and a real person typing into a real Chrome window is both the thing that
   * works and the thing the user should be doing with their own account. Once
   * done, the session lives in the profile directory and survives restarts, so
   * this is a one-time cost per profile.
   */
  async signIn(account: Account, flowUrl?: string): Promise<AccountIdentity> {
    this.signInAborts.delete(account.id)

    // Sign-in must be visible even when the app is configured to run headless.
    const context = await this.acquire(account, { headless: false })
    this.setStatus(account.id, 'signing-in', 'Finish signing in with the browser window that just opened.')

    const page = await context.newPage()

    try {
      await page.goto(GOOGLE_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })

      const deadline = Date.now() + SIGN_IN_TIMEOUT_MS

      while (Date.now() < deadline) {
        if (this.signInAborts.has(account.id)) {
          throw new SignInAbandonedError('Sign-in cancelled.')
        }

        // The browser window disappearing is the user's way of backing out.
        if (!this.contexts.has(account.id)) {
          throw new SignInAbandonedError('The browser window was closed before sign-in finished.')
        }

        const identity = await detectGoogleIdentity(context)
        if (identity) {
          // Walk Flow's one-time welcome screens now, while the window is
          // visible and the user is here to help if a step needs them.
          this.setStatus(account.id, 'signing-in', 'Finishing Flow setup in the browser window…')
          await prepareFlowAccount(page, flowUrl ?? FLOW_URL).catch(() => false)

          this.setStatus(account.id, 'ready')
          return identity
        }

        await delay(SIGN_IN_POLL_MS)
      }

      throw new SignInAbandonedError('Sign-in timed out after 5 minutes. Try again when you are ready.')
    } finally {
      this.signInAborts.delete(account.id)
      if (!page.isClosed()) {
        await page.close().catch(() => undefined)
      }
      if (this.statuses.get(account.id)?.state === 'signing-in') {
        this.setStatus(account.id, this.contexts.has(account.id) ? 'ready' : 'idle')
      }
    }
  }

  cancelSignIn(accountId: string): void {
    this.signInAborts.add(accountId)
  }

  /** Drops the profile's cookies, ending any Google session inside it. */
  async signOut(account: Account): Promise<void> {
    const context = this.contexts.get(account.id)?.context
    if (context && !this.isClosed(context)) {
      await context.clearCookies()
      return
    }

    // A profile that has never been opened has nothing on disk to clear, so
    // don't spin up a browser just to prove it.
    if (!existsSync(paths.profile(account.profileDirectory))) return

    // Otherwise clear it in a short-lived headless context, so the user does not
    // have to watch a window open just to sign out.
    const fresh = await this.acquire(account, { headless: true })
    await fresh.clearCookies()
    await this.close(account.id)
  }

  /** Reads the identity currently signed into a profile, if any. */
  async currentIdentity(account: Account): Promise<AccountIdentity | null> {
    const context = this.contexts.get(account.id)?.context
    if (!context || this.isClosed(context)) return null
    return detectGoogleIdentity(context)
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
