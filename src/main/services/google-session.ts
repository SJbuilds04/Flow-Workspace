import type { BrowserContext } from 'playwright-core'
import type { AccountIdentity } from '@shared/types'

export const GOOGLE_SIGN_IN_URL = 'https://accounts.google.com/'

/**
 * Cookies Chromium itself treats as "there is a signed-in Google session".
 * Presence of all three is the authoritative signal; everything else in this
 * module is cosmetic.
 */
const SESSION_COOKIES = ['SID', 'HSID', 'SSID']

/**
 * Undocumented endpoint that Chromium uses to enumerate signed-in accounts.
 * It is the only way to read the account's email without an OAuth token, and
 * it can change without notice — every use is best-effort and failure only
 * costs us the display name, never the connection itself.
 */
const LIST_ACCOUNTS_URL = 'https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function hasGoogleSession(context: BrowserContext): Promise<boolean> {
  try {
    const cookies = await context.cookies('https://accounts.google.com')
    return SESSION_COOKIES.every((name) => cookies.some((cookie) => cookie.name === name && cookie.value.length > 0))
  } catch {
    return false
  }
}

/**
 * Returns the identity of the Google account signed into this profile, or null
 * if there is no session yet.
 */
export async function detectGoogleIdentity(context: BrowserContext): Promise<AccountIdentity | null> {
  if (!(await hasGoogleSession(context))) return null

  const identity: AccountIdentity = { connectedAt: new Date().toISOString() }
  const details = await readAccountDetails(context)

  if (details.email) identity.email = details.email
  if (details.displayName) identity.displayName = details.displayName
  if (details.avatarUrl) identity.avatarUrl = details.avatarUrl

  return identity
}

interface AccountDetails {
  email?: string
  displayName?: string
  avatarUrl?: string
}

async function readAccountDetails(context: BrowserContext): Promise<AccountDetails> {
  let payload: unknown
  try {
    const response = await context.request.get(LIST_ACCOUNTS_URL, { timeout: 10_000 })
    if (!response.ok()) return {}
    payload = await response.json()
  } catch {
    return {}
  }

  // The response is a deeply nested, positional array whose shape has changed
  // over time, so pick fields out by what they look like rather than by index.
  const strings = collectStrings(payload)

  const emailIndex = strings.findIndex((value) => EMAIL_PATTERN.test(value))
  if (emailIndex === -1) return {}

  const details: AccountDetails = { email: strings[emailIndex] }

  const previous = strings[emailIndex - 1]
  if (previous && !EMAIL_PATTERN.test(previous) && !previous.startsWith('http') && previous.trim().length > 0) {
    details.displayName = previous
  }

  const avatar = strings.find((value) => value.startsWith('https://') && value.includes('googleusercontent.com'))
  if (avatar) details.avatarUrl = avatar

  return details
}

/** Flattens every string in an arbitrarily nested array/object, in order. */
function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 8) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap((entry) => collectStrings(entry, depth + 1))
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((entry) => collectStrings(entry, depth + 1))
  }
  return []
}
