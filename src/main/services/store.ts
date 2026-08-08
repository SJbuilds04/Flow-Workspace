import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  Account,
  AccountIdentity,
  Generation,
  Project,
  ScenePlan,
  Settings,
  WorkspaceSnapshot
} from '@shared/types'
import { DEFAULT_FLOW_MODELS, DEFAULT_PARAMS, DEFAULT_PLANNER_MODEL } from '@shared/types'
import { FLOW_URL } from './flow-provider'

const STORE_VERSION = 1

interface PersistedShape extends WorkspaceSnapshot {
  version: number
}

function nowIso(): string {
  return new Date().toISOString()
}

function defaultAccounts(): Account[] {
  const createdAt = nowIso()
  return [
    { id: 'personal', name: 'Personal', tone: 'green', profileDirectory: 'personal', createdAt },
    { id: 'client-1', name: 'Client 1', tone: 'purple', profileDirectory: 'client-1', createdAt },
    { id: 'client-2', name: 'Client 2', tone: 'blue', profileDirectory: 'client-2', createdAt }
  ]
}

function defaultSettings(): Settings {
  return {
    activeAccountId: 'personal',
    engine: 'google-flow',
    flowModels: [...DEFAULT_FLOW_MODELS],
    flowUrl: FLOW_URL,
    plannerModel: DEFAULT_PLANNER_MODEL,
    defaults: { ...DEFAULT_PARAMS },
    reduceMotion: false,
    showBrowserWindow: false,
    keepProfilesWarm: true
  }
}

function defaultSnapshot(): PersistedShape {
  const createdAt = nowIso()
  return {
    version: STORE_VERSION,
    projects: [
      {
        id: randomUUID(),
        name: 'Untitled Project',
        glyph: '◆',
        createdAt,
        updatedAt: createdAt
      }
    ],
    accounts: defaultAccounts(),
    generations: [],
    plans: [],
    settings: defaultSettings()
  }
}

/**
 * Small durable JSON store. Writes are serialised through a promise chain and
 * committed via write-to-temp + rename so a crash mid-write cannot truncate the
 * workspace file.
 */
export class WorkspaceStore {
  private data: PersistedShape = defaultSnapshot()
  private writeQueue: Promise<void> = Promise.resolve()
  private readonly filePath: string

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(app.getPath('userData'), 'workspace.json')
  }

  get path(): string {
    return this.filePath
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.data = defaultSnapshot()
      await this.flush()
      return
    }

    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<PersistedShape>
      this.data = this.migrate(parsed)
    } catch (error) {
      // A corrupt file should never brick the app: keep a copy and start clean.
      const backup = `${this.filePath}.${Date.now()}.corrupt`
      try {
        await rename(this.filePath, backup)
      } catch {
        /* the backup is best-effort */
      }
      console.error('[store] workspace file unreadable, recreated from defaults', error)
      this.data = defaultSnapshot()
    }

    await this.flush()
  }

  /** Fills in anything missing so older files keep working after an upgrade. */
  private migrate(parsed: Partial<PersistedShape>): PersistedShape {
    const base = defaultSnapshot()
    const accounts = parsed.accounts?.length ? parsed.accounts : base.accounts
    const settings: Settings = {
      ...base.settings,
      ...parsed.settings,
      // Nested objects must merge too, or a file written by an older build
      // leaves `defaults` partially populated.
      defaults: { ...base.settings.defaults, ...parsed.settings?.defaults },
      flowModels: parsed.settings?.flowModels?.length ? parsed.settings.flowModels : base.settings.flowModels
    }

    if (!accounts.some((account) => account.id === settings.activeAccountId)) {
      settings.activeAccountId = accounts[0]?.id ?? base.settings.activeAccountId
    }

    return {
      version: STORE_VERSION,
      projects: parsed.projects?.length ? parsed.projects : base.projects,
      accounts,
      generations: parsed.generations ?? [],
      plans: parsed.plans ?? [],
      settings
    }
  }

  snapshot(): WorkspaceSnapshot {
    return {
      projects: [...this.data.projects],
      accounts: [...this.data.accounts],
      generations: [...this.data.generations],
      plans: [...this.data.plans],
      settings: { ...this.data.settings }
    }
  }

  get accounts(): Account[] {
    return [...this.data.accounts]
  }

  get settings(): Settings {
    return { ...this.data.settings }
  }

  findAccount(id: string): Account | undefined {
    return this.data.accounts.find((account) => account.id === id)
  }

  findProject(id: string): Project | undefined {
    return this.data.projects.find((project) => project.id === id)
  }

  findGeneration(id: string): Generation | undefined {
    return this.data.generations.find((generation) => generation.id === id)
  }

  async createProject(name: string, glyph: string): Promise<Project> {
    const timestamp = nowIso()
    const project: Project = {
      id: randomUUID(),
      name: name.trim() || 'Untitled Project',
      glyph: glyph || '◆',
      createdAt: timestamp,
      updatedAt: timestamp
    }
    this.data.projects = [project, ...this.data.projects]
    await this.flush()
    return project
  }

  async renameProject(id: string, name: string): Promise<Project | undefined> {
    const project = this.findProject(id)
    if (!project) return undefined
    project.name = name.trim() || project.name
    project.updatedAt = nowIso()
    await this.flush()
    return { ...project }
  }

  async deleteProject(id: string): Promise<boolean> {
    const before = this.data.projects.length
    this.data.projects = this.data.projects.filter((project) => project.id !== id)
    this.data.generations = this.data.generations.filter((generation) => generation.projectId !== id)
    this.data.plans = this.data.plans.filter((plan) => plan.projectId !== id)
    if (this.data.projects.length === before) return false
    await this.flush()
    return true
  }

  async upsertGeneration(generation: Generation): Promise<Generation> {
    const index = this.data.generations.findIndex((item) => item.id === generation.id)
    if (index >= 0) {
      this.data.generations[index] = generation
    } else {
      this.data.generations = [generation, ...this.data.generations]
    }

    const project = this.findProject(generation.projectId)
    if (project) project.updatedAt = nowIso()

    await this.flush()
    return generation
  }

  async deleteGeneration(id: string): Promise<Generation | undefined> {
    const generation = this.findGeneration(id)
    if (!generation) return undefined
    this.data.generations = this.data.generations.filter((item) => item.id !== id)
    await this.flush()
    return generation
  }

  /** Records (or clears, with null) the Google account signed into a profile. */
  async setAccountIdentity(accountId: string, identity: AccountIdentity | null): Promise<Account | undefined> {
    const account = this.findAccount(accountId)
    if (!account) return undefined
    account.identity = identity
    await this.flush()
    return { ...account }
  }

  get plans(): ScenePlan[] {
    return [...this.data.plans]
  }

  findPlan(id: string): ScenePlan | undefined {
    return this.data.plans.find((plan) => plan.id === id)
  }

  /** One plan per project: a second plan replaces the first. */
  async savePlan(plan: ScenePlan): Promise<ScenePlan> {
    const next = { ...plan, updatedAt: new Date().toISOString() }
    this.data.plans = [next, ...this.data.plans.filter((item) => item.projectId !== plan.projectId)]
    await this.flush()
    return next
  }

  async deletePlan(id: string): Promise<boolean> {
    const before = this.data.plans.length
    this.data.plans = this.data.plans.filter((plan) => plan.id !== id)
    if (this.data.plans.length === before) return false
    await this.flush()
    return true
  }

  /** Remembers the Flow project a profile generates into. */
  async setAccountFlowProject(accountId: string, projectUrl: string | null): Promise<Account | undefined> {
    const account = this.findAccount(accountId)
    if (!account) return undefined
    account.flowProjectUrl = projectUrl
    await this.flush()
    return { ...account }
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    this.data.settings = { ...this.data.settings, ...patch }
    await this.flush()
    return this.settings
  }

  private async flush(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2)
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const temp = `${this.filePath}.tmp`
      await writeFile(temp, payload, 'utf-8')
      await rename(temp, this.filePath)
    })
    await this.writeQueue
  }
}
