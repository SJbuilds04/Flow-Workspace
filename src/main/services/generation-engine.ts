import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import type {
  Account,
  AttachmentRef,
  Generation,
  GenerationEngineId,
  GenerationOutput,
  GenerationParams,
  GenerationProgress,
  GenerationRequest
} from '@shared/types'
import { findFlowAspect, normaliseParams } from '@shared/types'
import { mimeTypeFor } from './attachments'
import { compositionHtml, seedFromString, type CompositionConfig } from './composition'
import { FlowSignedOutError, FlowUiError, runFlowGeneration } from './flow-provider'
import { toMediaUrl } from './media-url'
import { paths } from './paths'
import { type ProfileManager, ProfileUnavailableError } from './profile-manager'

/** Largest reference file we will inline into the local render page. */
const MAX_REFERENCE_BYTES = 12 * 1024 * 1024

export class GenerationCancelledError extends Error {
  constructor() {
    super('Generation cancelled.')
    this.name = 'GenerationCancelledError'
  }
}

interface RunOptions {
  request: GenerationRequest
  account: Account
  attachments: AttachmentRef[]
  engine: GenerationEngineId
  flowUrl: string
  /** The Flow project this app project uses on this account, if known. */
  flowProjectUrl?: string | null
  /** Called when a run settles on a Flow project worth reusing next time. */
  onProjectResolved?: (projectUrl: string) => void
  /**
   * Per-run progress. The engine also emits a global `progress` event, but with
   * several profiles rendering at once only the caller knows which job a given
   * update belongs to.
   */
  onProgress?: (progress: GenerationProgress) => void
}

interface ActiveRun {
  cancel: () => void
}

/**
 * Turns a request into finished artifacts by driving the account's persistent
 * browser context.
 *
 * Two engines share that context. `google-flow` operates the real Flow web app
 * as the signed-in account; `local-preview` renders a deterministic composition
 * locally, which needs no account and is what the end-to-end tests run against.
 */
export class GenerationEngine extends EventEmitter {
  private readonly active = new Map<string, ActiveRun>()

  constructor(private readonly profiles: ProfileManager) {
    super()
  }

  isRunning(generationId: string): boolean {
    return this.active.has(generationId)
  }

  cancel(generationId: string): boolean {
    const run = this.active.get(generationId)
    if (!run) return false
    run.cancel()
    return true
  }

  async run({
    request,
    account,
    attachments,
    engine,
    flowUrl,
    flowProjectUrl,
    onProjectResolved,
    onProgress
  }: RunOptions): Promise<Generation> {
    const params = normaliseParams(request)
    const startedAt = Date.now()

    const generation: Generation = {
      ...params,
      id: randomUUID(),
      projectId: request.projectId,
      accountId: request.accountId,
      prompt: request.prompt.trim(),
      status: 'queued',
      createdAt: new Date().toISOString(),
      engine,
      outputs: [],
      attachments
    }

    let cancelled = false
    this.active.set(generation.id, {
      cancel: () => {
        cancelled = true
      }
    })

    const throwIfCancelled = (): void => {
      if (cancelled) throw new GenerationCancelledError()
    }

    const report = (stage: string, progress: number): void => {
      const payload: GenerationProgress = { generationId: generation.id, status: 'running', progress, stage }
      onProgress?.(payload)
      this.emit('progress', payload)
    }

    try {
      generation.status = 'running'
      report(`Waking the ${account.name} profile`, 0.04)

      const context = await this.profiles.acquire(account)
      throwIfCancelled()

      const outputDirectory = paths.outputsFor(generation.projectId)
      await mkdir(outputDirectory, { recursive: true })

      if (engine === 'google-flow') {
        const result = await runFlowGeneration({
          context,
          params,
          prompt: generation.prompt,
          generationId: generation.id,
          outputDirectory,
          entryUrl: flowUrl,
          projectUrl: flowProjectUrl ?? null,
          ...(request.outputBasename ? { outputBasename: request.outputBasename } : {}),
          ...(request.referenceImages?.length
            ? { referenceImagePaths: request.referenceImages.map((image) => image.path) }
            : {}),
          report,
          throwIfCancelled
        })
        generation.outputs = result.outputs
        if (result.creditsUsed !== undefined) generation.creditsUsed = result.creditsUsed
        if (result.projectUrl && result.projectUrl !== flowProjectUrl) {
          onProjectResolved?.(result.projectUrl)
        }
      } else {
        generation.outputs = await this.renderLocally({
          context,
          params,
          generation,
          attachments,
          outputDirectory,
          report,
          throwIfCancelled
        })
      }

      const first = generation.outputs[0]
      if (first) {
        generation.outputPath = first.path
        generation.outputUrl = first.url
        generation.thumbnailUrl = first.thumbnailUrl ?? (first.kind === 'image' ? first.url : undefined)
      }

      generation.status = 'completed'
      generation.completedAt = new Date().toISOString()
      generation.durationMs = Date.now() - startedAt
      this.emit('progress', {
        generationId: generation.id,
        status: 'completed',
        progress: 1,
        stage: 'Done'
      } satisfies GenerationProgress)
    } catch (error) {
      generation.durationMs = Date.now() - startedAt
      generation.status = error instanceof GenerationCancelledError || cancelled ? 'cancelled' : 'failed'
      generation.error = describeFailure(error, cancelled)

      this.emit('progress', {
        generationId: generation.id,
        status: generation.status,
        progress: 1,
        stage: generation.error
      } satisfies GenerationProgress)
    } finally {
      this.active.delete(generation.id)
    }

    return generation
  }

  /**
   * The offline engine: renders a deterministic composition in the profile
   * browser. Same prompt and settings always produce the same frame, which is
   * what makes the end-to-end tests assertable without touching a real service.
   */
  private async renderLocally(args: {
    context: Awaited<ReturnType<ProfileManager['acquire']>>
    params: GenerationParams
    generation: Generation
    attachments: AttachmentRef[]
    outputDirectory: string
    report: (stage: string, progress: number) => void
    throwIfCancelled: () => void
  }): Promise<GenerationOutput[]> {
    const { context, params, generation, attachments, outputDirectory, report, throwIfCancelled } = args
    const ratio = findFlowAspect(params.aspectRatio)

    report('Preparing the render surface', 0.2)
    const page: Page = await context.newPage()

    try {
      await page.setViewportSize({ width: ratio.width, height: ratio.height })
      await page.setContent(compositionHtml(), { waitUntil: 'load' })
      throwIfCancelled()

      report('Reading reference material', 0.32)
      const referenceImage = await this.referenceDataUri(attachments)
      throwIfCancelled()

      const outputs: GenerationOutput[] = []

      for (let index = 0; index < params.outputCount; index += 1) {
        const config: CompositionConfig = {
          prompt: generation.prompt,
          modelName: params.model,
          aspectLabel: ratio.label,
          width: ratio.width,
          height: ratio.height,
          seed: seedFromString(
            `${generation.prompt}|${params.model}|${params.aspectRatio}|${generation.accountId}|${index}`
          ),
          durationSeconds: params.durationSeconds,
          ...(referenceImage ? { referenceImage } : {})
        }

        const suffix = params.outputCount > 1 ? `-${index + 1}` : ''
        const progressBase = 0.4 + (index / params.outputCount) * 0.5

        if (params.mode === 'video') {
          report(`Rendering the poster frame${suffix}`, progressBase)
          const poster = await page.evaluate((input) => window.flowRenderPoster(input), config)
          const posterPath = join(outputDirectory, `${generation.id}${suffix}-poster.png`)
          await writeFile(posterPath, Buffer.from(poster, 'base64'))
          throwIfCancelled()

          report(`Capturing ${params.durationSeconds}s of motion${suffix}`, progressBase + 0.1)
          const clip = await page.evaluate((input) => window.flowRenderClip(input), config)
          const clipPath = join(outputDirectory, `${generation.id}${suffix}.webm`)
          await writeFile(clipPath, Buffer.from(clip, 'base64'))

          outputs.push({
            path: clipPath,
            url: toMediaUrl('outputs', clipPath),
            thumbnailUrl: toMediaUrl('outputs', posterPath),
            kind: 'video'
          })
        } else {
          report(`Composing the frame${suffix}`, progressBase)
          const still = await page.evaluate((input) => window.flowRenderStill(input), config)
          const stillPath = join(outputDirectory, `${generation.id}${suffix}.png`)
          await writeFile(stillPath, Buffer.from(still, 'base64'))

          outputs.push({ path: stillPath, url: toMediaUrl('outputs', stillPath), kind: 'image' })
        }

        throwIfCancelled()
      }

      return outputs
    } finally {
      await page.close().catch(() => undefined)
    }
  }

  private async referenceDataUri(attachments: AttachmentRef[]): Promise<string | undefined> {
    const image = attachments.find((attachment) => attachment.kind === 'image')
    if (!image) return undefined

    try {
      const buffer = await readFile(image.path)
      if (buffer.byteLength > MAX_REFERENCE_BYTES) return undefined
      return `data:${mimeTypeFor(image.path)};base64,${buffer.toString('base64')}`
    } catch {
      return undefined
    }
  }
}

function describeFailure(error: unknown, cancelled: boolean): string {
  if (error instanceof GenerationCancelledError || cancelled) return 'Cancelled.'
  if (error instanceof FlowSignedOutError) return error.message
  if (error instanceof FlowUiError) return error.message
  if (error instanceof ProfileUnavailableError) return error.message
  return error instanceof Error ? error.message : String(error)
}
