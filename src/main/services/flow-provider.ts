import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext, Locator, Page } from 'playwright-core'
import type { GenerationOutput, GenerationParams } from '@shared/types'
import { hasGoogleSession } from './google-session'
import { toMediaUrl } from './media-url'

export const FLOW_URL = 'https://labs.google/fx/tools/flow'

/**
 * Copy that only appears on Flow's public landing page. Hitting these means we
 * are on the brochure, not the tool — either the account has no Flow access, or
 * the entry URL needs to be the app itself.
 */
const LANDING_MARKERS = [/try (in )?google flow/i, /get started/i, /render your sketches/i, /explore tools/i]

/** Anchor text that leads from the landing page into the tool. */
const ENTRY_LINK_TEXT = /^(try (in )?google flow|get started|open flow|launch)/i

/**
 * Raised when Flow's UI does not look the way we expect. Carries a snapshot of
 * what *was* on the page, because a selector that stopped matching is only
 * fixable if you can see what replaced it.
 */
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
  /** Where to start; configurable because Google moves the tool's entrance. */
  entryUrl: string
  report: (stage: string, progress: number) => void
  throwIfCancelled: () => void
}

export interface FlowRunResult {
  outputs: GenerationOutput[]
  creditsUsed?: number
}

/** How long to wait for Flow to finish rendering before giving up. */
const GENERATION_TIMEOUT_MS = 12 * 60_000
const POLL_MS = 3000

/**
 * Drives Flow's web UI inside the account's signed-in browser profile.
 *
 * Every control is addressed by its visible label rather than by class name:
 * Flow ships hashed CSS classes that change on every deploy, but the text on
 * its buttons ("Video", "10s", "16:9") is the product surface and moves far
 * less. When a label does go missing, we fail with the labels that *were*
 * present so the mapping can be corrected instead of guessed at.
 */
export async function runFlowGeneration(options: FlowRunOptions): Promise<FlowRunResult> {
  const { context, params, prompt, generationId, outputDirectory, entryUrl, report, throwIfCancelled } = options

  report('Opening Google Flow', 0.08)
  const page = await context.newPage()

  try {
    await openFlowApp(page, context, entryUrl)
    throwIfCancelled()

    report('Setting up the shot', 0.18)
    await selectMode(page, params)
    await selectAspectRatio(page, params)
    await selectModel(page, params)

    if (params.mode === 'video') {
      await selectDuration(page, params)
    }
    await selectOutputCount(page, params)
    throwIfCancelled()

    report('Writing the prompt', 0.3)
    await fillPrompt(page, prompt)

    const creditsUsed = await readQuotedCredits(page)
    throwIfCancelled()

    report('Submitting to Flow', 0.36)
    await submit(page)

    report('Flow is generating', 0.45)
    const mediaUrls = await waitForResults(page, params, { throwIfCancelled, report })

    report('Downloading results', 0.85)
    const outputs = await downloadResults({ page, mediaUrls, generationId, outputDirectory, params })

    return creditsUsed === undefined ? { outputs } : { outputs, creditsUsed }
  } finally {
    await page.close().catch(() => undefined)
  }
}

/**
 * Gets from the configured entry URL to the actual generation surface.
 *
 * `labs.google/fx/tools/flow` serves a marketing page, and the tool lives
 * behind it. Rather than hardcode a guess at the app URL, follow the landing
 * page's own call-to-action — whatever Google points that link at is by
 * definition the current entrance.
 */
async function openFlowApp(page: Page, context: BrowserContext, entryUrl: string): Promise<void> {
  await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  if (page.url().includes('accounts.google.com') || page.url().includes('/signin')) {
    throw new FlowSignedOutError()
  }

  if (!(await isLandingPage(page))) return

  const entry = page.getByRole('link', { name: ENTRY_LINK_TEXT }).first()
  if (await entry.isVisible({ timeout: 5000 }).catch(() => false)) {
    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => undefined),
      entry.click().catch(() => undefined)
    ])
    await page.waitForTimeout(4000)
  }

  if (!(await isLandingPage(page))) return

  // Still on the brochure. Distinguish "not signed in" from "no Flow access",
  // because the fix is completely different.
  const signedIn = await hasGoogleSession(context)
  if (!signedIn) throw new FlowSignedOutError()

  throw new FlowUiError(
    `Signed in, but ${entryUrl} is still showing Flow's landing page rather than the app. ` +
      'Open Flow manually in this profile once (Settings → Diagnose Flow), then set the Flow URL to the address the app actually loads at.',
    await visibleControlLabels(page)
  )
}

async function isLandingPage(page: Page): Promise<boolean> {
  const text = await page
    .locator('body')
    .innerText({ timeout: 5000 })
    .catch(() => '')
  return LANDING_MARKERS.some((marker) => marker.test(text))
}

/** Clicks a control identified by its exact visible label. */
async function clickLabel(page: Page, label: string, what: string): Promise<void> {
  const target = page.getByRole('button', { name: label, exact: true }).first()

  if (await target.isVisible({ timeout: 8000 }).catch(() => false)) {
    await target.click()
    return
  }

  // Not every Flow control is a <button>; fall back to any element carrying the
  // label before declaring the mapping broken.
  const loose = page.getByText(label, { exact: true }).first()
  if (await loose.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loose.click()
    return
  }

  throw new FlowUiError(`Couldn't find the ${what} control labelled "${label}".`, await visibleControlLabels(page))
}

async function selectMode(page: Page, params: GenerationParams): Promise<void> {
  await clickLabel(page, params.mode === 'video' ? 'Video' : 'Image', 'output type')

  if (params.mode === 'video') {
    await clickLabel(page, params.inputMode === 'frames' ? 'Frames' : 'Ingredients', 'reference')
  }
}

async function selectAspectRatio(page: Page, params: GenerationParams): Promise<void> {
  await clickLabel(page, params.aspectRatio, 'aspect ratio')
}

async function selectDuration(page: Page, params: GenerationParams): Promise<void> {
  await clickLabel(page, `${params.durationSeconds}s`, 'duration')
}

async function selectOutputCount(page: Page, params: GenerationParams): Promise<void> {
  await clickLabel(page, `x${params.outputCount}`, 'output count')
}

/**
 * Opens Flow's model dropdown and picks by visible name. A missing model is the
 * most likely thing to drift, so the error lists what Flow currently offers.
 */
async function selectModel(page: Page, params: GenerationParams): Promise<void> {
  const trigger = page.getByRole('combobox').first()

  if (await trigger.isVisible({ timeout: 5000 }).catch(() => false)) {
    await trigger.click()
  } else {
    const fallback = page.getByRole('button', { name: new RegExp(escapeRegExp(params.model), 'i') }).first()
    if (!(await fallback.isVisible({ timeout: 3000 }).catch(() => false))) {
      throw new FlowUiError("Couldn't find Flow's model picker.", await visibleControlLabels(page))
    }
    await fallback.click()
  }

  const option = page.getByRole('option', { name: params.model, exact: true }).first()
  if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
    await option.click()
    return
  }

  const offered = await page
    .getByRole('option')
    .allTextContents()
    .catch(() => [])

  throw new FlowUiError(
    `Flow does not offer a model called "${params.model}". Update the model list in Settings.`,
    offered.map((text) => text.trim()).filter(Boolean)
  )
}

async function fillPrompt(page: Page, prompt: string): Promise<void> {
  const box = page.getByRole('textbox').first()
  if (!(await box.isVisible({ timeout: 8000 }).catch(() => false))) {
    throw new FlowUiError("Couldn't find Flow's prompt box.", await visibleControlLabels(page))
  }
  await box.click()
  await box.fill(prompt)
}

/** Reads Flow's own "Generating will use N credits" quote, if it is shown. */
async function readQuotedCredits(page: Page): Promise<number | undefined> {
  const quote = page.getByText(/will use\s+\d+\s+credits?/i).first()
  const text = await quote.textContent({ timeout: 3000 }).catch(() => null)
  if (!text) return undefined

  const match = /(\d+)\s+credits?/i.exec(text)
  return match?.[1] ? Number(match[1]) : undefined
}

async function submit(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /^generate/i }).first()
  if (!(await button.isVisible({ timeout: 8000 }).catch(() => false))) {
    throw new FlowUiError("Couldn't find Flow's Generate button.", await visibleControlLabels(page))
  }
  await button.click()
}

/**
 * Waits for Flow to produce media. Flow renders results into the page as
 * `<video>` or `<img>` elements, so we watch for sources that were not present
 * when we submitted.
 */
async function waitForResults(
  page: Page,
  params: GenerationParams,
  hooks: { throwIfCancelled: () => void; report: (stage: string, progress: number) => void }
): Promise<string[]> {
  const selector = params.mode === 'video' ? 'video[src]' : 'img[src*="blob"], img[src*="googleusercontent"]'
  const deadline = Date.now() + GENERATION_TIMEOUT_MS

  while (Date.now() < deadline) {
    hooks.throwIfCancelled()

    const sources = await page
      .locator(selector)
      // Structural casts: the main process has no DOM lib, but these callbacks
      // run in the page.
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node as unknown as { src?: string }).src)
          .filter((src): src is string => typeof src === 'string' && src.length > 0)
      )
      .catch(() => [] as string[])

    const unique = [...new Set(sources)]
    if (unique.length >= params.outputCount) {
      return unique.slice(0, params.outputCount)
    }

    const elapsed = GENERATION_TIMEOUT_MS - (deadline - Date.now())
    hooks.report(
      unique.length > 0 ? `Flow returned ${unique.length} of ${params.outputCount}` : 'Flow is generating',
      Math.min(0.8, 0.45 + (elapsed / GENERATION_TIMEOUT_MS) * 0.35)
    )

    await page.waitForTimeout(POLL_MS)
  }

  throw new FlowUiError('Flow did not return a result within 12 minutes.')
}

/**
 * Pulls each result into the project's output folder.
 *
 * Flow's own download control is tried first, because a `<video>` in a modern
 * web app is usually fed by MediaSource Extensions: its `src` is a `blob:` URL
 * backed by a stream, and fetching it yields nothing useful. Asking the app to
 * export the file gets the real artifact. Fetching the media URL is kept as a
 * fallback for stills and for any result served as a plain URL, where the
 * page's cookies sign the request for us.
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
    const suffix = mediaUrls.length > 1 ? `-${index + 1}` : ''
    const path = join(outputDirectory, `${generationId}${suffix}.${extension}`)

    const exported = await exportViaFlow(page, index, path)
    if (!exported) {
      await fetchMediaToDisk(page, mediaUrl, path)
    }

    outputs.push({
      path,
      url: toMediaUrl('outputs', path),
      kind: params.mode
    })
  }

  if (outputs.length === 0) {
    throw new FlowUiError(
      'Flow finished, but neither its download control nor the media URL yielded a file. ' +
        'If the result plays in Flow but will not export here, the clip is likely streamed rather than served as a file.'
    )
  }

  return outputs
}

/**
 * Asks Flow to export result `index` and saves what it hands back.
 * Returns false when no download control could be driven, so the caller can
 * fall back rather than fail the whole run.
 */
async function exportViaFlow(page: Page, index: number, destination: string): Promise<boolean> {
  const direct = page.getByRole('button', { name: /^download/i })

  try {
    // The control often lives behind a per-result overflow menu, so reveal it.
    if ((await direct.count()) === 0) {
      const overflow = page.getByRole('button', { name: /^(more|more options|more_vert)$/i }).nth(index)
      if (await overflow.isVisible({ timeout: 2000 }).catch(() => false)) {
        await overflow.click()
      }
    }

    const control = page.getByRole('menuitem', { name: /download/i }).or(direct)
    const target = control.nth(Math.min(index, Math.max(0, (await control.count()) - 1)))

    if (!(await target.isVisible({ timeout: 4000 }).catch(() => false))) return false

    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), target.click()])

    await download.saveAs(destination)
    return true
  } catch {
    return false
  }
}

/** Fallback: pull the media URL from inside the page, using its cookies. */
async function fetchMediaToDisk(page: Page, mediaUrl: string, destination: string): Promise<void> {
  const base64 = await page.evaluate(async (source) => {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`Fetch failed with ${response.status}`)
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0) throw new Error('The media stream returned no bytes')

    const bytes = new Uint8Array(buffer)
    let binary = ''
    const CHUNK = 0x8000
    for (let offset = 0; offset < bytes.length; offset += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(offset, offset + CHUNK)))
    }
    return btoa(binary)
  }, mediaUrl)

  await writeFile(destination, Buffer.from(base64, 'base64'))
}

/**
 * The visible, clickable labels on the page — the payload that turns "selector
 * not found" into something actionable.
 */
async function visibleControlLabels(page: Page): Promise<string[]> {
  try {
    const labels = await page.locator('button, [role="button"], [role="option"], [role="tab"]').evaluateAll((nodes) =>
      nodes
        .filter((node) => (node as unknown as { offsetParent: unknown }).offsetParent !== null)
        .map((node) => (node.textContent ?? '').trim())
        .filter((text) => text.length > 0 && text.length < 40)
    )
    return [...new Set(labels)].filter((label) => !isIconLigature(label)).slice(0, 40)
  } catch {
    return []
  }
}

/**
 * Material Symbols render their icon name as text content, so `more_vert` and
 * `play_arrow` arrive looking like labels. They are never real controls, and
 * they drown out the ones that are.
 */
function isIconLigature(label: string): boolean {
  return /^[a-z]+(_[a-z]+)+$/.test(label)
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface FlowDiagnostics {
  capturedAt: string
  entryUrl: string
  /** Where the browser actually ended up. */
  finalUrl: string
  title: string
  signedIn: boolean
  isLandingPage: boolean
  /** Visible control labels, icon-font noise removed. */
  labels: string[]
  /** Links that look like they lead into the tool — candidate entry URLs. */
  candidateAppUrls: string[]
}

/**
 * Opens Flow and reports what it found, without generating anything.
 *
 * This exists because the entrance moves. Rather than guessing a URL, this
 * records where the browser landed, whether the profile has a Google session,
 * and every in-product link on the page — which is how the real app URL gets
 * discovered instead of invented.
 */
export async function inspectFlow(context: BrowserContext, entryUrl: string): Promise<FlowDiagnostics> {
  const page = await context.newPage()

  try {
    await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // Flow hydrates late; a snapshot taken immediately is mostly empty.
    await page.waitForTimeout(6000)

    const candidateAppUrls = await page
      .locator('a[href]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node as unknown as { href?: string }).href ?? '')
          .filter((href) => href.includes('flow') || href.includes('/fx/'))
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

export type { Locator }
