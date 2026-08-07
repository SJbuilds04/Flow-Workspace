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

export class FlowUiError extends Error {
  readonly diagnostics: string[]

  constructor(message: string, diagnostics: string[] = []) {
    super(diagnostics.length > 0 ? `${message} Flow showed: ${diagnostics.join(', ')}.` : message)
    this.name = 'FlowUiError'
    this.diagnostics = diagnostics
  }
}

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
  report: (stage: string, progress: number) => void
  throwIfCancelled: () => void
}

export interface FlowRunResult {
  outputs: GenerationOutput[]
  creditsUsed?: number
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
  const { context, params, prompt, generationId, outputDirectory, entryUrl, report, throwIfCancelled } = options

  report('Opening Google Flow', 0.06)
  const page = await context.newPage()

  try {
    await openFlowApp(page, context, entryUrl)
    throwIfCancelled()

    report('Clearing first-run dialogs', 0.14)
    await dismissConsent(page)
    throwIfCancelled()

    report('Opening a Flow project', 0.2)
    await ensureProject(page)
    throwIfCancelled()

    report('Applying generation settings', 0.28)
    await applyAgentSettings(page, params)
    throwIfCancelled()

    report('Writing the prompt', 0.34)
    await submitPrompt(page, prompt, params)
    throwIfCancelled()

    report('Flow is generating', 0.42)
    const mediaUrls = await waitForResults(page, params, { throwIfCancelled, report })

    report('Downloading results', 0.88)
    const outputs = await downloadResults({ page, mediaUrls, generationId, outputDirectory, params })

    return { outputs }
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
    throw new FlowUiError("Couldn't open a Flow project.", await visibleControlLabels(page))
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
 * Waits for a clip that can actually be read.
 *
 * The `<video>` element appears with its final `src` the moment the job is
 * queued, long before any bytes exist — so presence of a source means nothing.
 * Readiness is `readyState >= 1` or a finite duration, which only become true
 * once Flow has rendered and the browser has metadata.
 */
async function waitForResults(
  page: Page,
  params: GenerationParams,
  hooks: { throwIfCancelled: () => void; report: (stage: string, progress: number) => void }
): Promise<string[]> {
  const selector = params.mode === 'video' ? 'video[src]' : 'img[src*="googleusercontent"], img[src*="media"]'
  const deadline = Date.now() + GENERATION_TIMEOUT_MS

  while (Date.now() < deadline) {
    hooks.throwIfCancelled()

    const ready = await page
      .locator(selector)
      .evaluateAll((nodes) =>
        nodes
          .map(
            (node) => node as unknown as { src?: string; readyState?: number; duration?: number; complete?: boolean }
          )
          .filter((node) => typeof node.src === 'string' && node.src.length > 0 && !node.src.startsWith('blob:'))
          .filter((node) =>
            node.readyState === undefined
              ? node.complete === true
              : node.readyState >= 1 || Number.isFinite(node.duration)
          )
          .map((node) => node.src as string)
      )
      .catch(() => [] as string[])

    const unique = [...new Set(ready)]
    if (unique.length >= params.outputCount) return unique.slice(0, params.outputCount)

    const elapsed = GENERATION_TIMEOUT_MS - (deadline - Date.now())
    hooks.report(
      unique.length > 0 ? `Flow finished ${unique.length} of ${params.outputCount}` : 'Flow is rendering',
      Math.min(0.85, 0.42 + (elapsed / GENERATION_TIMEOUT_MS) * 0.43)
    )

    await page.waitForTimeout(POLL_MS)
  }

  throw new FlowUiError('Flow did not finish rendering within 12 minutes.')
}

/**
 * Flow serves results from a normal URL rather than a stream, so fetching from
 * inside the page — where the session's cookies sign the request — returns the
 * real file.
 */
async function downloadResults(args: {
  page: Page
  mediaUrls: string[]
  generationId: string
  outputDirectory: string
  params: GenerationParams
}): Promise<GenerationOutput[]> {
  const { page, mediaUrls, generationId, outputDirectory, params } = args
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
    const path = join(outputDirectory, `${generationId}${suffix}.${extension}`)
    await writeFile(path, Buffer.from(base64, 'base64'))

    outputs.push({ path, url: toMediaUrl('outputs', path), kind: params.mode })
  }

  if (outputs.length === 0) {
    throw new FlowUiError('Flow finished but no media could be downloaded.')
  }

  return outputs
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
