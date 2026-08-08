import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type {
  Account,
  AttachmentRef,
  Character,
  Generation,
  QueueSnapshot,
  RenderJob,
  Scene,
  ScenePlan
} from '@shared/types'
import { FlowCreditsExhaustedError } from './flow-provider'
import type { GenerationEngine } from './generation-engine'
import { buildScenePrompt } from './scene-prompt'
import type { WorkspaceStore } from './store'

/**
 * `scene-03-fog-rolls-in` — zero-padded so a folder of shots sorts into
 * playing order, which is what makes the stitch step trivial and the files
 * readable by hand.
 */
export function sceneBasename(index: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  const number = String(index + 1).padStart(2, '0')
  return slug ? `scene-${number}-${slug}` : `scene-${number}`
}

/** Credits reset daily, so an exhausted profile is parked until tomorrow. */
function nextReset(): string {
  const reset = new Date()
  reset.setHours(24, 0, 0, 0)
  return reset.toISOString()
}

export interface QueueDeps {
  store: WorkspaceStore
  engine: GenerationEngine
}

/**
 * Renders a storyboard across every usable profile at once.
 *
 * One shot takes minutes, so a sixty-second video is a half-hour of waiting if
 * run serially. Profiles are independent browsers with independent credit
 * allowances, so the queue keeps one job in flight per profile and hands work
 * to whoever is free.
 *
 * A profile that reports no credits is parked until the daily reset and its
 * job goes back in the queue for someone else — that is the whole point of the
 * design, and why jobs remember which profiles have already failed them.
 */
export class RenderQueue extends EventEmitter {
  private jobs: RenderJob[] = []
  private readonly busy = new Set<string>()
  private running = false
  private draining = false

  constructor(private readonly deps: QueueDeps) {
    super()
  }

  snapshot(): QueueSnapshot {
    return { jobs: this.jobs.map((job) => ({ ...job })), running: this.running }
  }

  private publish(): void {
    this.emit('changed', this.snapshot())
  }

  private patch(id: string, patch: Partial<RenderJob>): void {
    this.jobs = this.jobs.map((job) =>
      job.id === id ? { ...job, ...patch, updatedAt: new Date().toISOString() } : job
    )
    this.publish()
  }

  /**
   * Queues every shot that still needs rendering. Locked scenes and ones that
   * already produced a clip are skipped, so re-running after a partial failure
   * only pays for what is missing.
   */
  enqueuePlan(plan: ScenePlan, options?: { includeCompleted?: boolean }): RenderJob[] {
    const timestamp = new Date().toISOString()

    const pending = plan.scenes.filter((scene) => {
      if (scene.locked) return false
      if (options?.includeCompleted) return true
      if (scene.status === 'completed' && scene.generationId) return false
      return !this.jobs.some((job) => job.sceneId === scene.id && (job.status === 'queued' || job.status === 'running'))
    })

    const created = pending.map<RenderJob>((scene) => ({
      id: randomUUID(),
      planId: plan.id,
      projectId: plan.projectId,
      sceneId: scene.id,
      sceneTitle: scene.title,
      status: 'queued',
      triedAccountIds: [],
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    }))

    this.jobs = [...this.jobs, ...created]
    this.publish()
    void this.drain()
    return created
  }

  cancelAll(): void {
    for (const job of this.jobs) {
      if (job.status === 'queued') this.patch(job.id, { status: 'cancelled' })
      if (job.status === 'running' && job.generationId) this.deps.engine.cancel(job.generationId)
    }
  }

  cancelJob(id: string): void {
    const job = this.jobs.find((item) => item.id === id)
    if (!job) return
    if (job.status === 'queued') this.patch(id, { status: 'cancelled' })
    else if (job.status === 'running' && job.generationId) this.deps.engine.cancel(job.generationId)
  }

  /** Drops settled jobs so the panel reflects the current run. */
  clearSettled(): void {
    this.jobs = this.jobs.filter((job) => job.status === 'queued' || job.status === 'running')
    this.publish()
  }

  /**
   * Profiles that can take work right now: signed in, not already busy, and
   * not parked for running out of credits.
   */
  private availableAccounts(exclude: string[]): Account[] {
    const now = Date.now()
    // Read fresh each time, so changing the selection mid-run takes effect on
    // the next shot rather than only on the next render.
    const allowed = this.deps.store.settings.renderAccountIds

    return this.deps.store.accounts.filter((account) => {
      if (this.busy.has(account.id)) return false
      if (exclude.includes(account.id)) return false
      if (!account.identity) return false
      if (allowed.length > 0 && !allowed.includes(account.id)) return false

      const parked = account.creditsExhaustedUntil
      return !parked || new Date(parked).getTime() <= now
    })
  }

  /**
   * Hands queued work to free profiles until neither is left. Re-entrant calls
   * are collapsed, and it re-runs after each job settles so a freed profile
   * immediately picks up the next shot.
   */
  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true

    try {
      for (;;) {
        const job = this.jobs.find((item) => item.status === 'queued')
        if (!job) break

        const [account] = this.availableAccounts(job.triedAccountIds)
        if (!account) break

        this.busy.add(account.id)
        this.patch(job.id, { status: 'running', accountId: account.id, attempts: job.attempts + 1 })

        void this.runJob(job.id, account).finally(() => {
          this.busy.delete(account.id)
          void this.drain()
        })
      }
    } finally {
      this.draining = false
      this.updateRunning()
    }
  }

  private updateRunning(): void {
    const active = this.jobs.some((job) => job.status === 'queued' || job.status === 'running')
    if (active !== this.running) {
      this.running = active
      this.publish()
    }
  }

  private async runJob(jobId: string, account: Account): Promise<void> {
    const job = this.jobs.find((item) => item.id === jobId)
    if (!job) return

    const plan = this.deps.store.findPlan(job.planId)
    const scene = plan?.scenes.find((item) => item.id === job.sceneId)

    if (!plan || !scene) {
      this.patch(jobId, { status: 'failed', error: 'That shot is no longer in the storyboard.' })
      return
    }

    await this.setSceneStatus(plan.id, scene.id, { status: 'running' })

    const settings = this.deps.store.settings
    const index = plan.scenes.findIndex((item) => item.id === scene.id)

    // Character photos for whoever is in this shot, plus the look references
    // that apply to the whole video.
    const references = [
      ...plan.characters
        .filter((character) => scene.characterTags.includes(character.tag))
        .map((character) => character.referenceImage)
        .filter((image): image is AttachmentRef => Boolean(image)),
      ...(plan.styleReferences ?? [])
    ]

    const generation = await this.deps.engine.run({
      request: {
        projectId: job.projectId,
        accountId: account.id,
        prompt: buildScenePrompt(scene, plan.characters as Character[]),
        mode: 'video',
        inputMode: 'ingredients',
        aspectRatio: plan.aspectRatio,
        model: settings.defaults.model,
        durationSeconds: scene.durationSeconds,
        outputCount: 1,
        outputBasename: sceneBasename(index, scene.title),
        referenceImages: references
      },
      account,
      attachments: [],
      engine: settings.engine,
      flowUrl: settings.flowUrl,
      flowProjectUrl: this.deps.store.findProject(job.projectId)?.flowProjects?.[account.id] ?? null,
      onProjectResolved: (projectUrl) => {
        void this.deps.store.setProjectFlowUrl(job.projectId, account.id, projectUrl)
      },
      onProgress: (progress) => {
        this.patch(jobId, { stage: `${account.name}: ${progress.stage}`, generationId: progress.generationId })
      }
    })

    await this.deps.store.upsertGeneration(generation)
    this.emit('generation', generation)

    if (generation.status === 'completed') {
      await this.setSceneStatus(plan.id, scene.id, { status: 'completed', generationId: generation.id })
      this.patch(jobId, { status: 'completed', generationId: generation.id, stage: 'Done' })
      return
    }

    if (generation.status === 'cancelled') {
      await this.setSceneStatus(plan.id, scene.id, { status: 'planned' })
      this.patch(jobId, { status: 'cancelled' })
      return
    }

    await this.handleFailure(jobId, account, generation)
  }

  /**
   * Out of credits is not a failure of the shot — it is a failure of the
   * profile. Park the profile and put the shot back for someone else.
   */
  private async handleFailure(jobId: string, account: Account, generation: Generation): Promise<void> {
    const job = this.jobs.find((item) => item.id === jobId)
    if (!job) return

    const message = generation.error ?? 'The generation failed.'
    const exhausted = /out of flow credits|out of credits|credit/i.test(message)

    if (exhausted) {
      const updated = await this.deps.store.setAccountExhausted(account.id, nextReset())
      if (updated) this.emit('account', updated)
    }

    const tried = [...new Set([...job.triedAccountIds, account.id])]
    const somewhereElse = this.availableAccounts(tried).length > 0

    if (somewhereElse) {
      this.patch(jobId, {
        status: 'queued',
        triedAccountIds: tried,
        error: exhausted ? `${account.name} is out of credits — moving to another profile.` : message
      })
      return
    }

    const plan = this.deps.store.findPlan(job.planId)
    if (plan) await this.setSceneStatus(plan.id, job.sceneId, { status: 'failed' })

    this.patch(jobId, {
      status: 'failed',
      triedAccountIds: tried,
      error: exhausted ? `${message} No other connected profile has credits left.` : message
    })
  }

  private async setSceneStatus(planId: string, sceneId: string, patch: Partial<Scene>): Promise<void> {
    const plan = this.deps.store.findPlan(planId)
    if (!plan) return

    const next: ScenePlan = {
      ...plan,
      scenes: plan.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene))
    }

    const saved = await this.deps.store.savePlan(next)
    this.emit('plan', saved)
  }
}

export { FlowCreditsExhaustedError }
