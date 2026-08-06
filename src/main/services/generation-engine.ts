import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import type {
  Account,
  AttachmentRef,
  Generation,
  GenerationProgress,
  GenerationRequest,
  ModelOption
} from '@shared/types'
import { findAspectRatio, findModel } from '@shared/types'
import { compositionHtml, seedFromString, type CompositionConfig } from './composition'
import { mimeTypeFor } from './attachments'
import { toMediaUrl } from './media-url'
import { paths } from './paths'
import { type ProfileManager, ProfileUnavailableError } from './profile-manager'

/** Largest reference file we will inline into the render page. */
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
}

interface ActiveRun {
  cancel: () => void
}

/**
 * Turns a request into a finished artifact by driving the account's persistent
 * browser context. Progress is emitted as it goes so the UI can show real
 * stages rather than a fake spinner.
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

  async run({ request, account, attachments }: RunOptions): Promise<Generation> {
    const model = findModel(request.modelId)
    const ratio = findAspectRatio(request.aspectRatio)
    const startedAt = Date.now()

    const generation: Generation = {
      id: randomUUID(),
      projectId: request.projectId,
      accountId: request.accountId,
      prompt: request.prompt.trim(),
      modelId: model.id,
      aspectRatio: ratio.id,
      status: 'queued',
      createdAt: new Date().toISOString(),
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
      const payload: GenerationProgress = {
        generationId: generation.id,
        status: 'running',
        progress,
        stage
      }
      this.emit('progress', payload)
    }

    let page: Page | undefined

    try {
      generation.status = 'running'
      report(`Waking the ${account.name} profile`, 0.05)

      const context = await this.profiles.acquire(account)
      throwIfCancelled()

      report('Preparing the render surface', 0.2)
      page = await context.newPage()
      await page.setViewportSize({ width: ratio.width, height: ratio.height })
      await page.setContent(compositionHtml(), { waitUntil: 'load' })
      throwIfCancelled()

      report('Reading reference material', 0.32)
      const referenceImage = await this.referenceDataUri(attachments)
      throwIfCancelled()

      const config: CompositionConfig = {
        prompt: generation.prompt,
        modelName: model.name,
        aspectLabel: ratio.label,
        width: ratio.width,
        height: ratio.height,
        seed: seedFromString(`${generation.prompt}|${model.id}|${ratio.id}|${account.id}`),
        durationSeconds: model.id === 'flow-video-cinematic' ? 6 : 4,
        ...(referenceImage ? { referenceImage } : {})
      }

      const outputDirectory = paths.outputsFor(generation.projectId)
      await mkdir(outputDirectory, { recursive: true })

      if (model.kind === 'video') {
        await this.renderVideo({ page, config, model, generation, outputDirectory, report, throwIfCancelled })
      } else {
        await this.renderImage({ page, config, generation, outputDirectory, report, throwIfCancelled })
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
      if (error instanceof GenerationCancelledError || cancelled) {
        generation.status = 'cancelled'
        generation.error = 'Cancelled.'
      } else if (error instanceof ProfileUnavailableError) {
        generation.status = 'failed'
        generation.error = error.message
      } else {
        generation.status = 'failed'
        generation.error = error instanceof Error ? error.message : String(error)
      }
      this.emit('progress', {
        generationId: generation.id,
        status: generation.status,
        progress: 1,
        stage: generation.error ?? 'Failed'
      } satisfies GenerationProgress)
    } finally {
      this.active.delete(generation.id)
      if (page) {
        await page.close().catch(() => undefined)
      }
    }

    return generation
  }

  private async renderImage(args: {
    page: Page
    config: CompositionConfig
    generation: Generation
    outputDirectory: string
    report: (stage: string, progress: number) => void
    throwIfCancelled: () => void
  }): Promise<void> {
    const { page, config, generation, outputDirectory, report, throwIfCancelled } = args

    report('Composing the frame', 0.55)
    const base64 = await page.evaluate((input) => window.flowRenderStill(input), config)
    throwIfCancelled()

    report('Writing the artifact', 0.85)
    const outputPath = join(outputDirectory, `${generation.id}.png`)
    await writeFile(outputPath, Buffer.from(base64, 'base64'))

    generation.outputPath = outputPath
    generation.outputUrl = toMediaUrl('outputs', outputPath)
    generation.thumbnailUrl = generation.outputUrl
  }

  private async renderVideo(args: {
    page: Page
    config: CompositionConfig
    model: ModelOption
    generation: Generation
    outputDirectory: string
    report: (stage: string, progress: number) => void
    throwIfCancelled: () => void
  }): Promise<void> {
    const { page, config, generation, outputDirectory, report, throwIfCancelled } = args

    report('Rendering the poster frame', 0.45)
    const posterBase64 = await page.evaluate((input) => window.flowRenderPoster(input), config)
    throwIfCancelled()

    const posterPath = join(outputDirectory, `${generation.id}-poster.png`)
    await writeFile(posterPath, Buffer.from(posterBase64, 'base64'))
    generation.thumbnailUrl = toMediaUrl('outputs', posterPath)

    report(`Capturing ${config.durationSeconds ?? 4}s of motion`, 0.6)
    const clipBase64 = await page.evaluate((input) => window.flowRenderClip(input), config)
    throwIfCancelled()

    report('Writing the artifact', 0.9)
    const outputPath = join(outputDirectory, `${generation.id}.webm`)
    await writeFile(outputPath, Buffer.from(clipBase64, 'base64'))

    generation.outputPath = outputPath
    generation.outputUrl = toMediaUrl('outputs', outputPath)
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
