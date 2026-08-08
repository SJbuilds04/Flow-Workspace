import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright-core'
import type { GenerationOutput, GenerationParams } from '@shared/types'
import { hasGoogleSession } from './google-session'
import { toMediaUrl } from './media-url'

export const FLOW_URL = 'https://labs.google/fx/tools/flow'

/**
 * Copy that only appears on Flow's public landing page, before you enter the
 * tool proper.
 */
const LANDING_MARKERS = [/render your sketches/i, /explore tools in google flow/i, /unlock your best creative work/i]

/** The landing page's real entrance. NOT "Get started" — that goes to billing. */
const ENTRY_CONTROL_TEXT = /create with google flow|try in google flow/i

/** Buttons that advance Flow's first-run consent and privacy dialogs. */
const CONSENT_ADVANCE = ['Continue', 'Next', 'I agree', 'Accept all', 'Accept', 'Got it', 'Done', 'Start']

const GENERATION_TIMEOUT_MS = 12 * 60_000
const POLL_MS = 6000
/** How often to reload while waiting, so finished media appears in the DOM. */
const REFRESH_INTERVAL_MS = 45_000

export class FlowUiError extends Error {
  readonly diagnostics: string[]

  constructor(message: string, diagnostics: string[] = []) {
    super(diagnostics.length > 0 ? `${message} Flow showed: ${diagnostics.join(', ')}.` : message)
    this.name = 'FlowUiError'
    this.diagnostics = diagnostics
  }
}

/**
 * Raised when Flow says this account has no credits left. Distinct from a UI
 * failure because the response is different: don't retry here, move the work
 * to another profile.
 */
export class FlowCreditsExhaustedError extends Error {
  constructor(detail?: string) {
    super(detail ? `This account is out of Flow credits: ${detail}` : 'This account is out of Flow credits.')
    this.name = 'FlowCreditsExhaustedError'
  }
}

/**
 * Phrasings that mean "no credits". Google has not committed to any of these
 * strings, so the list is deliberately broad — a missed match costs a wasted
 * retry on a dead account, which the queue recovers from.
 */
const CREDIT_EXHAUSTED_PATTERNS = [
  /out of credits/i,
  /no credits (left|remaining)/i,
  /insufficient credits/i,
  /run out of credits/i,
  /credit limit/i,
  /not enough credits/i,
  /you(?:'ve| have) used all/i,
  /daily limit reached/i,
  /quota (exceeded|reached)/i
]

export class FlowSignedOutError extends Error {
  constructor() {
    super('That profile is not signed in to Google Flow. Connect a Google account for it in Settings, then try again.')
    this.name = 'FlowSignedOutError'
  }
}

export interface FlowRunOptions {
  context: BrowserContext
  params: GenerationParams
  prompt: string
  generationId: string
  outputDirectory: string
  entryUrl: string
  /** A previously resolved Flow project to reuse, skipping the whole entrance. */
  projectUrl?: string | null
  /** Filename stem for the artifacts; falls back to the generation id. */
  outputBasename?: string
  /** Local image paths to upload and condition this shot on. */
  referenceImagePaths?: string[]
  report: (stage: string, progress: number) => void
  throwIfCancelled: () => void
}

export interface FlowRunResult {
  outputs: GenerationOutput[]
  creditsUsed?: number
  /** The project this run used, worth remembering for the next one. */
  projectUrl?: string
}

/**
 * Drives Flow's web app inside the account's signed-in browser profile.
 *
 * The sequence was derived by walking the real product, and each step exists
 * because Flow blocks on it: the landing page hides the tool behind a button,
 * first-run consent gates its own dismissal behind scrolling to the end, the
 * generation surface only exists inside a project, and the agent asks for
 * confirmation before spending credits unless told not to.
 *
 * Controls are matched by *substring*, never by exact accessible name: Flow
 * renders Material Symbols as text inside its buttons, so the accessible name
 * of the 16:9 control is literally "crop_16_916:9".
 */
export async function runFlowGeneration(options: FlowRunOptions): Promise<FlowRunResult> {
  const {
    context,
    params,
    prompt,
    generationId,
    outputDirectory,
    entryUrl,
    projectUrl,
    outputBasename,
    referenceImagePaths,
    report,
    throwIfCancelled
  } = options

  const page = await context.newPage()

  try {
    // A remembered project is the fast path: straight in, no landing page, no
    // consent walk, and no new project cluttering the Flow account.
    const reused = projectUrl ? await openExistingProject(page, projectUrl) : false

    if (!reused) {
      report('Opening Google Flow', 0.06)
      await openFlowApp(page, context, entryUrl)
      throwIfCancelled()

      report('Clearing first-run dialogs', 0.14)
      await dismissConsent(page)
      throwIfCancelled()

      report('Opening a Flow project', 0.2)
      await ensureProject(page)
    } else {
      report('Reopening your Flow project', 0.2)
    }
    throwIfCancelled()

    report('Applying generation settings', 0.28)
    await applyAgentSettings(page, params)
    throwIfCancelled()

    if (referenceImagePaths && referenceImagePaths.length > 0) {
      report('Uploading reference images', 0.3)
      await attachReferenceImages(page, referenceImagePaths)
      throwIfCancelled()
    }

    report('Writing the prompt', 0.34)
    await submitPrompt(page, prompt, params)
    throwIfCancelled()

    // Checked right after submitting: when an account is dry Flow says so
    // straight away, and there is nothing to wait for.
    await assertHasCredits(page)

    report('Flow is generating', 0.42)
    const mediaUrls = await waitForResults(page, params, { throwIfCancelled, report })

    report('Downloading results', 0.88)
    const outputs = await downloadResults({
      page,
      mediaUrls,
      outputDirectory,
      params,
      basename: outputBasename ?? generationId
    })

    return { outputs, projectUrl: page.url() }
  } finally {
    await page.close().catch(() => undefined)
  }
}

/** Any clickable carrying this text, whatever element Flow built it from. */
function clickable(page: Page, text: RegExp) {
  return page.locator('button, [role="button"], a, [role="menuitem"], [role="radio"]').filter({ hasText: text })
}

async function openFlowApp(page: Page, context: BrowserContext, entryUrl: string): Promise<void> {
  await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(6000)

  if (page.url().includes('accounts.google.com') || page.url().includes('/signin')) {
    throw new FlowSignedOutError()
  }

  if (!(await isLandingPage(page))) return

  const entrance = clickable(page, ENTRY_CONTROL_TEXT).first()
  if (await entrance.isVisible({ timeout: 6000 }).catch(() => false)) {
    await entrance.click({ timeout: 10_000 }).catch(() => undefined)
    await page.waitForTimeout(7000)
  }

  if (!(await isLandingPage(page))) return

  if (!(await hasGoogleSession(context))) throw new FlowSignedOutError()

  throw new FlowUiError(
    `Signed in, but couldn't get past Flow's landing page at ${entryUrl}.`,
    await visibleControlLabels(page)
  )
}

async function isLandingPage(page: Page): Promise<boolean> {
  const text = await page
    .locator('body')
    .innerText({ timeout: 6000 })
    .catch(() => '')
  return LANDING_MARKERS.some((marker) => marker.test(text))
}

/**
 * Walks Flow's first-run consent flow. The privacy notice keeps its Continue
 * button disabled until the copy has been scrolled to the end, so every
 * scrollable container is driven to the bottom before each attempt.
 */
async function dismissConsent(page: Page): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    await page
      .evaluate(() => {
        // Runs in the page; the main process has no DOM lib to type it with.
        type Scrollable = { scrollHeight: number; clientHeight: number; scrollTop: number }
        const doc = (globalThis as unknown as { document: { querySelectorAll(s: string): Iterable<Scrollable> } })
          .document
        for (const element of doc.querySelectorAll('*')) {
          if (element.scrollHeight > element.clientHeight + 40) element.scrollTop = element.scrollHeight
        }
      })
      .catch(() => undefined)
    await page.waitForTimeout(700)

    let advanced = false
    for (const label of CONSENT_ADVANCE) {
      const button = page.getByRole('button', { name: label, exact: true }).first()
      if (!(await button.isVisible({ timeout: 800 }).catch(() => false))) continue
      if (!(await button.isEnabled().catch(() => false))) continue

      await button.click({ timeout: 8000 }).catch(() => undefined)
      advanced = true
      break
    }

    if (!advanced) return
    await page.waitForTimeout(3000)
  }
}

/**
 * Reopens a known project. Returns false — rather than throwing — when the
 * project is gone or the prompt box never appears, so the caller can fall back
 * to the full entrance instead of failing the run.
 */
async function openExistingProject(page: Page, projectUrl: string): Promise<boolean> {
  try {
    await page.goto(projectUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(7000)

    if (!page.url().includes('/project/')) return false

    const box = page.getByPlaceholder(/what do you want to create/i).first()
    return await box.isVisible({ timeout: 12_000 }).catch(() => false)
  } catch {
    return false
  }
}

/**
 * The prompt box only exists inside a project, so open the current one or make
 * a new one.
 */
async function ensureProject(page: Page): Promise<void> {
  if (page.url().includes('/project/')) return

  const newProject = page.getByRole('button', { name: /new project/i }).first()
  if (await newProject.isVisible({ timeout: 8000 }).catch(() => false)) {
    await newProject.click({ timeout: 12_000 }).catch(() => undefined)
    await page.waitForURL(/\/project\//, { timeout: 45_000 }).catch(() => undefined)
    await page.waitForTimeout(8000)
  }

  if (!page.url().includes('/project/')) {
    throw new FlowUiError(
      "Couldn't open a Flow project. This is usually Flow's first-run setup still waiting — open Settings, sign this profile out and back in, and finish the welcome screens in the browser window.",
      await visibleControlLabels(page)
    )
  }
}

/**
 * Gets a freshly connected account through Flow's one-time welcome flow.
 *
 * Run right after sign-in, while the browser is still visible and the user is
 * present, because these screens are exactly where a headless run gets stuck —
 * and where a person can just click the thing if we cannot.
 */
export async function prepareFlowAccount(page: Page, entryUrl: string): Promise<boolean> {
  try {
    await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(6000)

    if (await isLandingPage(page)) {
      const entrance = clickable(page, ENTRY_CONTROL_TEXT).first()
      if (await entrance.isVisible({ timeout: 6000 }).catch(() => false)) {
        await entrance.click({ timeout: 10_000 }).catch(() => undefined)
        await page.waitForTimeout(7000)
      }
    }

    await dismissConsent(page)

    // Creating the first project now means the first real generation does not
    // have to, and confirms the account can actually reach the tool.
    await ensureProject(page)
    return true
  } catch {
    return false
  }
}

/**
 * Sets the agent to generate without asking, plus the ratio and output count.
 * Failing to apply a preference is not fatal — Flow's defaults still generate,
 * and a stopped run helps nobody.
 */
async function applyAgentSettings(page: Page, params: GenerationParams): Promise<void> {
  const tune = page.getByRole('button', { name: /tune|settings/i }).last()
  if (!(await tune.isVisible({ timeout: 6000 }).catch(() => false))) return

  await tune.click({ timeout: 8000 }).catch(() => undefined)
  await page.waitForTimeout(3000)

  // Without this the agent stops and waits for a human to confirm the spend.
  const never = clickable(page, /Never/).first()
  if (await never.isVisible({ timeout: 3000 }).catch(() => false)) {
    await never.click({ timeout: 6000 }).catch(() => undefined)
    await page.waitForTimeout(800)
  }

  // Video defaults sit in the lower half of the panel, so take the last match.
  const ratio = clickable(page, new RegExp(escapeRegExp(params.aspectRatio))).last()
  if (await ratio.isVisible({ timeout: 2500 }).catch(() => false)) {
    await ratio.click({ timeout: 6000 }).catch(() => undefined)
    await page.waitForTimeout(500)
  }

  const count = clickable(page, new RegExp(`^x${params.outputCount}$`)).last()
  if (await count.isVisible({ timeout: 2500 }).catch(() => false)) {
    await count.click({ timeout: 6000 }).catch(() => undefined)
    await page.waitForTimeout(500)
  }

  const save = page.getByRole('button', { name: 'Save', exact: true }).first()
  if (await save.isVisible({ timeout: 3000 }).catch(() => false)) {
    await save.click({ timeout: 8000 }).catch(() => undefined)
    await page.waitForTimeout(3000)
  }
}

/**
 * Uploads reference images so the shot is conditioned on them.
 *
 * Flow keeps a hidden `input[type=file][accept=image/*][multiple]` on the
 * project page, which is the whole upload mechanism — setting files on it
 * directly avoids driving a native file picker, which Playwright cannot see
 * into and which differs per platform.
 *
 * Best-effort: a shot rendered without its references is worse, but far better
 * than a run that fails outright.
 */
async function attachReferenceImages(page: Page, paths: string[]): Promise<boolean> {
  try {
    const input = page.locator('input[type="file"][accept*="image"]').first()
    if ((await input.count()) === 0) return false

    await input.setInputFiles(paths, { timeout: 30_000 })
    // Uploads are async; the thumbnail has to land before the prompt is sent.
    await page.waitForTimeout(6000)
    return true
  } catch {
    return false
  }
}

/**
 * Flow's composer is an agent, not a form: duration and output type are not
 * exposed as controls next to the prompt, so they are stated in the request.
 */
function composeInstruction(prompt: string, params: GenerationParams): string {
  const shape =
    params.mode === 'video'
      ? `Generate a ${params.durationSeconds} second ${params.aspectRatio} video`
      : `Generate a ${params.aspectRatio} image`
  return `${shape}: ${prompt}`
}

async function submitPrompt(page: Page, prompt: string, params: GenerationParams): Promise<void> {
  const box = page
    .getByPlaceholder(/what do you want to create/i)
    .or(page.locator('textarea, [contenteditable="true"]'))
    .first()

  if (!(await box.isVisible({ timeout: 10_000 }).catch(() => false))) {
    throw new FlowUiError("Couldn't find Flow's prompt box.", await visibleControlLabels(page))
  }

  await box.click({ timeout: 8000 })
  await page.keyboard.type(composeInstruction(prompt, params), { delay: 8 })
  await page.waitForTimeout(1200)

  const send = page.getByRole('button', { name: /arrow_forward|^create$/i }).last()
  if (await send.isVisible({ timeout: 4000 }).catch(() => false)) {
    await send.click({ timeout: 8000 }).catch(() => undefined)
    return
  }
  await page.keyboard.press('Enter')
}

/**
 * Reads the page for Flow's "no credits" messaging.
 *
 * Deliberately a short look: the agent answers a doomed request quickly, and a
 * long wait here would delay the failover to a profile that still has credits.
 */
async function assertHasCredits(page: Page): Promise<void> {
  await page.waitForTimeout(6000)

  const text = await page
    .locator('body')
    .innerText({ timeout: 6000 })
    .catch(() => '')

  const hit = CREDIT_EXHAUSTED_PATTERNS.find((pattern) => pattern.test(text))
  if (!hit) return

  // Hand back the sentence Flow actually used, so the UI is specific.
  const sentence = text
    .split(/(?<=[.!?])\s+/)
    .find((part) => hit.test(part))
    ?.trim()

  throw new FlowCreditsExhaustedError(sentence?.slice(0, 160))
}

/**
 * Waits for a clip that can actually be downloaded.
 *
 * Two traps here, both found the hard way:
 *
 * - The `<video>` element carries its final `src` the moment the job is
 *   queued, long before any bytes exist, so a source alone means nothing.
 * - `readyState` is useless as a readiness signal. A video that is off-screen
 *   or marked `preload="none"` never loads metadata, so it sits at 0 forever
 *   even after Flow has finished rendering — the run then times out on a clip
 *   that has been sitting ready on Google's servers for minutes.
 *
 * So readiness is tested directly: ask the server for the first couple of
 * kilobytes and see whether bytes come back. The page is also reloaded
 * periodically, because Flow's SPA does not reliably surface newly finished
 * media into a tab that has been sitting open.
 */
async function waitForResults(
  page: Page,
  params: GenerationParams,
  hooks: { throwIfCancelled: () => void; report: (stage: string, progress: number) => void }
): Promise<string[]> {
  const selector =
    params.mode === 'video'
      ? 'video[src], video source[src]'
      : 'img[src*="googleusercontent"], img[src*="media"], img[src*="/fx/api/"]'
  const deadline = Date.now() + GENERATION_TIMEOUT_MS
  let lastRefresh = Date.now()

  while (Date.now() < deadline) {
    hooks.throwIfCancelled()

    const candidates = await page
      .locator(selector)
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node as unknown as { src?: string }).src ?? '')
          .filter((src) => src.length > 0 && !src.startsWith('blob:') && !src.startsWith('data:'))
      )
      .catch(() => [] as string[])

    const ready = await probeDownloadable(page, [...new Set(candidates)])
    if (ready.length >= params.outputCount) return ready.slice(0, params.outputCount)

    // Flow reports no progress of its own, so say how long we have been
    // waiting rather than implying a percentage we cannot know.
    const elapsed = GENERATION_TIMEOUT_MS - (deadline - Date.now())
    const waited = formatWait(elapsed)
    hooks.report(
      ready.length > 0
        ? `Flow finished ${ready.length} of ${params.outputCount} — ${waited} elapsed`
        : `Flow is rendering — ${waited} elapsed`,
      Math.min(0.85, 0.42 + (elapsed / GENERATION_TIMEOUT_MS) * 0.43)
    )

    await page.waitForTimeout(POLL_MS)

    if (Date.now() - lastRefresh > REFRESH_INTERVAL_MS) {
      lastRefresh = Date.now()
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
      await page.waitForTimeout(6000)
    }
  }

  throw new FlowUiError(
    'Flow did not finish rendering within 12 minutes. If the clip exists in Flow, open the project there and it will be picked up on the next run.'
  )
}

/**
 * Returns the URLs that actually serve bytes right now. A ranged request keeps
 * the check cheap — we only need to know the file exists, not fetch it twice.
 */
async function probeDownloadable(page: Page, urls: string[]): Promise<string[]> {
  if (urls.length === 0) return []

  return page
    .evaluate(async (candidates) => {
      const ready: string[] = []
      for (const url of candidates) {
        try {
          const response = await fetch(url, { headers: { Range: 'bytes=0-2047' } })
          if (!response.ok && response.status !== 206) continue
          const buffer = await response.arrayBuffer()
          if (buffer.byteLength > 512) ready.push(url)
        } catch {
          /* not ready yet */
        }
      }
      return ready
    }, urls)
    .catch(() => [] as string[])
}

/**
 * Flow serves results from a normal URL rather than a stream, so fetching from
 * inside the page — where the session's cookies sign the request — returns the
 * real file.
 */
async function downloadResults(args: {
  page: Page
  mediaUrls: string[]
  outputDirectory: string
  params: GenerationParams
  basename: string
}): Promise<GenerationOutput[]> {
  const { page, mediaUrls, outputDirectory, params, basename } = args
  await mkdir(outputDirectory, { recursive: true })

  const extension = params.mode === 'video' ? 'mp4' : 'png'
  const outputs: GenerationOutput[] = []

  for (const [index, mediaUrl] of mediaUrls.entries()) {
    const base64 = await page.evaluate(async (source) => {
      const response = await fetch(source)
      if (!response.ok) throw new Error(`Flow returned ${response.status} for the result`)
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength === 0) throw new Error('The result was empty')

      const bytes = new Uint8Array(buffer)
      let binary = ''
      const CHUNK = 0x8000
      for (let offset = 0; offset < bytes.length; offset += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(offset, offset + CHUNK)))
      }
      return btoa(binary)
    }, mediaUrl)

    const suffix = mediaUrls.length > 1 ? `-${index + 1}` : ''
    const path = join(outputDirectory, `${basename}${suffix}.${extension}`)
    await writeFile(path, Buffer.from(base64, 'base64'))

    const output: GenerationOutput = { path, url: toMediaUrl('outputs', path), kind: params.mode }

    // Flow gives no poster image, and a video card with no frame reads as
    // unfinished. Grab one from the clip itself.
    if (params.mode === 'video') {
      const posterPath = join(outputDirectory, `${basename}${suffix}-poster.jpg`)
      if (await capturePoster(page, mediaUrl, posterPath)) {
        output.thumbnailUrl = toMediaUrl('outputs', posterPath)
      }
    }

    outputs.push(output)
  }

  if (outputs.length === 0) {
    throw new FlowUiError('Flow finished but no media could be downloaded.')
  }

  return outputs
}

/**
 * Draws a frame out of the finished clip to use as its thumbnail.
 *
 * Done inside the page because the media URL is same-origin there, so the
 * canvas is not tainted and can be read back. Best-effort: a missing poster
 * costs a thumbnail, never the generation.
 */
async function capturePoster(page: Page, mediaUrl: string, destination: string): Promise<boolean> {
  try {
    const base64 = await page.evaluate(async (url) => {
      const doc = (globalThis as unknown as { document: { createElement(tag: string): unknown } }).document

      const video = doc.createElement('video') as {
        src: string
        muted: boolean
        currentTime: number
        duration: number
        videoWidth: number
        videoHeight: number
        onloadeddata: (() => void) | null
        onseeked: (() => void) | null
        onerror: (() => void) | null
      }

      video.muted = true
      video.src = url

      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve()
        video.onerror = () => reject(new Error('poster: video failed to load'))
        setTimeout(() => reject(new Error('poster: timed out')), 30_000)
      })

      // A frame slightly in tends to be more representative than frame zero,
      // which is often a fade from black.
      video.currentTime = Number.isFinite(video.duration) ? Math.min(1.5, video.duration * 0.2) : 0
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve()
        setTimeout(resolve, 5000)
      })

      const canvas = doc.createElement('canvas') as {
        width: number
        height: number
        getContext(kind: string): { drawImage(source: unknown, x: number, y: number): void } | null
        toDataURL(type: string, quality: number): string
      }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const context = canvas.getContext('2d')
      if (!context || canvas.width === 0) throw new Error('poster: no frame available')
      context.drawImage(video, 0, 0)

      return canvas.toDataURL('image/jpeg', 0.82).split(',')[1] ?? ''
    }, mediaUrl)

    if (!base64) return false
    await writeFile(destination, Buffer.from(base64, 'base64'))
    return true
  } catch {
    return false
  }
}

/**
 * Visible control labels, with Material Symbols ligatures stripped — Flow
 * renders icon names as text, so raw labels are half `more_vert` and friends.
 */
async function visibleControlLabels(page: Page): Promise<string[]> {
  try {
    const labels = await page
      .locator('button, [role="button"], [role="option"], [role="tab"], [role="radio"]')
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => (node as unknown as { offsetParent: unknown }).offsetParent !== null)
          .map((node) => (node.textContent ?? '').trim())
          .filter((text) => text.length > 0 && text.length < 45)
      )
    return [...new Set(labels)].map(stripLigatures).filter(Boolean).slice(0, 40)
  } catch {
    return []
  }
}

function stripLigatures(label: string): string {
  return label.replace(/[a-z]+(_[a-z0-9]+)+/g, '').trim()
}

function formatWait(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface FlowDiagnostics {
  capturedAt: string
  entryUrl: string
  finalUrl: string
  title: string
  signedIn: boolean
  isLandingPage: boolean
  labels: string[]
  candidateAppUrls: string[]
}

/** Opens Flow and reports what it found, without generating anything. */
export async function inspectFlow(context: BrowserContext, entryUrl: string): Promise<FlowDiagnostics> {
  const page = await context.newPage()

  try {
    await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(6000)

    if (await isLandingPage(page)) {
      await clickable(page, ENTRY_CONTROL_TEXT)
        .first()
        .click({ timeout: 8000 })
        .catch(() => undefined)
      await page.waitForTimeout(7000)
    }

    await dismissConsent(page)

    const candidateAppUrls = await page
      .locator('a[href]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node as unknown as { href?: string }).href ?? '')
          .filter((href) => href.includes('/fx/tools/flow'))
      )
      .catch(() => [] as string[])

    return {
      capturedAt: new Date().toISOString(),
      entryUrl,
      finalUrl: page.url(),
      title: await page.title().catch(() => ''),
      signedIn: await hasGoogleSession(context),
      isLandingPage: await isLandingPage(page),
      labels: await visibleControlLabels(page),
      candidateAppUrls: [...new Set(candidateAppUrls)].slice(0, 30)
    }
  } finally {
    await page.close().catch(() => undefined)
  }
}
