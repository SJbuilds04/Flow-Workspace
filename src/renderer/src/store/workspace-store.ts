import { create } from 'zustand'
import type {
  Account,
  AspectRatioId,
  AttachmentRef,
  Generation,
  GenerationProgress,
  ModelId,
  ProfileStatus,
  Project,
  Settings
} from '@shared/types'
import { toast } from './toast-store'

export type WorkspaceView = 'project' | 'settings'
export type BootStatus = 'loading' | 'ready' | 'error'

/** Per-project composer state, so switching projects never loses a draft. */
export interface Draft {
  prompt: string
  modelId: ModelId
  aspectRatio: AspectRatioId
  referenceImage: AttachmentRef | null
  referenceVideo: AttachmentRef | null
}

export interface ActiveRun {
  generationId: string | null
  projectId: string
  stage: string
  progress: number
}

interface WorkspaceState {
  status: BootStatus
  bootError: string | null
  platform: 'darwin' | 'win32' | 'linux' | 'other'

  projects: Project[]
  accounts: Account[]
  generations: Generation[]
  settings: Settings | null
  profileStatuses: Record<string, ProfileStatus>

  activeProjectId: string | null
  view: WorkspaceView
  search: string
  drafts: Record<string, Draft>
  activeRun: ActiveRun | null
  /** Set when a profile could not be used; surfaced as a dismissible banner. */
  profileNotice: { accountId: string; message: string } | null

  bootstrap: () => Promise<void>
  selectProject: (id: string) => void
  setView: (view: WorkspaceView) => void
  setSearch: (search: string) => void

  createProject: (name: string, glyph?: string) => Promise<Project | null>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>

  setActiveAccount: (accountId: string) => Promise<void>
  launchProfile: (accountId: string) => Promise<boolean>
  closeProfile: (accountId: string) => Promise<void>
  dismissProfileNotice: () => void

  patchDraft: (projectId: string, patch: Partial<Draft>) => void
  pickAttachment: (projectId: string, kind: 'image' | 'video') => Promise<void>
  clearAttachment: (projectId: string, kind: 'image' | 'video') => Promise<void>

  generate: (projectId: string) => Promise<void>
  cancelRun: () => Promise<void>
  deleteGeneration: (id: string) => Promise<void>
  downloadGeneration: (id: string) => Promise<void>
  revealGeneration: (id: string) => Promise<void>

  updateSettings: (patch: Partial<Settings>) => Promise<void>
}

export function emptyDraft(settings: Settings | null): Draft {
  return {
    prompt: '',
    modelId: settings?.defaultModelId ?? 'flow-image-v2',
    aspectRatio: settings?.defaultAspectRatio ?? '16:9',
    referenceImage: null,
    referenceVideo: null
  }
}

function indexStatuses(statuses: ProfileStatus[]): Record<string, ProfileStatus> {
  return Object.fromEntries(statuses.map((status) => [status.accountId, status]))
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  status: 'loading',
  bootError: null,
  platform: 'other',

  projects: [],
  accounts: [],
  generations: [],
  settings: null,
  profileStatuses: {},

  activeProjectId: null,
  view: 'project',
  search: '',
  drafts: {},
  activeRun: null,
  profileNotice: null,

  bootstrap: async () => {
    // The renderer is a normal Vite app, so the dev server URL can be opened in
    // a browser — but the preload bridge only exists inside Electron. Say so
    // plainly instead of hanging on the boot spinner.
    if (typeof window.flow === 'undefined') {
      set({
        status: 'error',
        bootError:
          'Flow Workspace runs in its own desktop window. This page is the renderer on its own, without the desktop bridge that reads projects and drives browser profiles — start the app with `npm run dev`.'
      })
      return
    }

    const result = await window.flow.workspace.load()
    if (!result.ok) {
      set({ status: 'error', bootError: result.error })
      return
    }

    const { projects, accounts, generations, settings, profileStatuses, platform } = result.data
    const drafts: Record<string, Draft> = {}
    for (const project of projects) {
      drafts[project.id] = emptyDraft(settings)
    }

    set({
      status: 'ready',
      bootError: null,
      platform,
      projects,
      accounts,
      generations,
      settings,
      profileStatuses: indexStatuses(profileStatuses),
      activeProjectId: projects[0]?.id ?? null,
      drafts
    })
  },

  selectProject: (id) => set({ activeProjectId: id, view: 'project' }),
  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),

  createProject: async (name, glyph) => {
    const result = await window.flow.projects.create({ name, ...(glyph ? { glyph } : {}) })
    if (!result.ok) {
      toast.error('Could not create project', result.error)
      return null
    }

    const project = result.data
    set((state) => ({
      projects: [project, ...state.projects],
      activeProjectId: project.id,
      view: 'project',
      drafts: { ...state.drafts, [project.id]: emptyDraft(state.settings) }
    }))
    return project
  },

  renameProject: async (id, name) => {
    const result = await window.flow.projects.rename({ id, name })
    if (!result.ok) {
      toast.error('Could not rename project', result.error)
      return
    }
    set((state) => ({
      projects: state.projects.map((project) => (project.id === id ? result.data : project))
    }))
  },

  deleteProject: async (id) => {
    const result = await window.flow.projects.remove({ id })
    if (!result.ok) {
      toast.error('Could not delete project', result.error)
      return
    }

    set((state) => {
      const projects = state.projects.filter((project) => project.id !== id)
      const drafts = { ...state.drafts }
      delete drafts[id]
      return {
        projects,
        drafts,
        generations: state.generations.filter((generation) => generation.projectId !== id),
        activeProjectId: state.activeProjectId === id ? (projects[0]?.id ?? null) : state.activeProjectId
      }
    })
  },

  setActiveAccount: async (accountId) => {
    const previous = get().settings?.activeAccountId
    if (previous === accountId) return

    set((state) => ({
      settings: state.settings ? { ...state.settings, activeAccountId: accountId } : state.settings,
      profileNotice: null
    }))

    const result = await window.flow.settings.update({ activeAccountId: accountId })
    if (!result.ok) {
      toast.error('Could not switch profile', result.error)
      set((state) => ({
        settings: state.settings && previous ? { ...state.settings, activeAccountId: previous } : state.settings
      }))
      return
    }

    set({ settings: result.data })
    // Warm the context up front so the first generation is not the thing that
    // discovers the profile is unusable.
    void get().launchProfile(accountId)
  },

  launchProfile: async (accountId) => {
    const result = await window.flow.accounts.launch({ accountId })
    if (!result.ok) {
      set({ profileNotice: { accountId, message: result.error } })
      return false
    }
    set((state) => ({
      profileStatuses: { ...state.profileStatuses, [accountId]: result.data },
      profileNotice: null
    }))
    return true
  },

  closeProfile: async (accountId) => {
    const result = await window.flow.accounts.close({ accountId })
    if (!result.ok) return
    set((state) => ({ profileStatuses: { ...state.profileStatuses, [accountId]: result.data } }))
  },

  dismissProfileNotice: () => set({ profileNotice: null }),

  patchDraft: (projectId, patch) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [projectId]: { ...(state.drafts[projectId] ?? emptyDraft(state.settings)), ...patch }
      }
    })),

  pickAttachment: async (projectId, kind) => {
    const result = await window.flow.attachments.pick({ kind })
    if (!result.ok) {
      toast.error('Could not read that file', result.error)
      return
    }
    if (!result.data) return

    get().patchDraft(projectId, kind === 'image' ? { referenceImage: result.data } : { referenceVideo: result.data })
  },

  clearAttachment: async (projectId, kind) => {
    const draft = get().drafts[projectId]
    const attachment = kind === 'image' ? draft?.referenceImage : draft?.referenceVideo
    get().patchDraft(projectId, kind === 'image' ? { referenceImage: null } : { referenceVideo: null })
    if (attachment) {
      await window.flow.attachments.remove({ url: attachment.url })
    }
  },

  generate: async (projectId) => {
    const state = get()
    const settings = state.settings
    const draft = state.drafts[projectId]

    if (!settings || !draft || !draft.prompt.trim() || state.activeRun) return

    set({
      activeRun: { generationId: null, projectId, stage: 'Queued', progress: 0.02 },
      profileNotice: null
    })

    const result = await window.flow.generations.run({
      projectId,
      accountId: settings.activeAccountId,
      prompt: draft.prompt,
      modelId: draft.modelId,
      aspectRatio: draft.aspectRatio,
      referenceImage: draft.referenceImage,
      referenceVideo: draft.referenceVideo
    })

    set({ activeRun: null })

    if (!result.ok) {
      if (result.code === 'PROFILE_UNAVAILABLE') {
        set({ profileNotice: { accountId: settings.activeAccountId, message: result.error } })
      } else {
        toast.error('Generation failed', result.error)
      }
      return
    }

    if (result.data.status === 'cancelled') {
      toast.info('Generation cancelled')
      return
    }

    // The prompt is cleared but the model, ratio and references stay put — the
    // common next action is a variation, not a fresh setup.
    get().patchDraft(projectId, { prompt: '' })
  },

  cancelRun: async () => {
    const run = get().activeRun
    if (!run?.generationId) return
    await window.flow.generations.cancel({ id: run.generationId })
  },

  deleteGeneration: async (id) => {
    const result = await window.flow.generations.remove({ id })
    if (!result.ok) {
      toast.error('Could not delete generation', result.error)
      return
    }
    set((state) => ({ generations: state.generations.filter((generation) => generation.id !== id) }))
  },

  downloadGeneration: async (id) => {
    const result = await window.flow.generations.download({ id })
    if (!result.ok) {
      toast.error('Download failed', result.error)
      return
    }
    if (result.data) {
      toast.success('Saved', result.data.savedTo)
    }
  },

  revealGeneration: async (id) => {
    const result = await window.flow.generations.reveal({ id })
    if (!result.ok) toast.error('Could not open the folder', result.error)
  },

  updateSettings: async (patch) => {
    const previous = get().settings
    set((state) => ({ settings: state.settings ? { ...state.settings, ...patch } : state.settings }))

    const result = await window.flow.settings.update(patch)
    if (!result.ok) {
      toast.error('Could not save settings', result.error)
      set({ settings: previous })
      return
    }
    set({ settings: result.data })
  }
}))

/** Wires main-process events into the store. Called once from `App`. */
export function subscribeToMainEvents(): () => void {
  if (typeof window.flow === 'undefined') return () => undefined

  const unsubscribers = [
    window.flow.events.onGenerationProgress((progress: GenerationProgress) => {
      useWorkspaceStore.setState((state) => {
        if (!state.activeRun) return state
        if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled') {
          return { activeRun: { ...state.activeRun, stage: progress.stage, progress: 1 } }
        }
        return {
          activeRun: {
            ...state.activeRun,
            generationId: progress.generationId,
            stage: progress.stage,
            progress: progress.progress
          }
        }
      })
    }),

    window.flow.events.onGenerationSettled((generation: Generation) => {
      useWorkspaceStore.setState((state) => ({
        generations: [generation, ...state.generations.filter((item) => item.id !== generation.id)]
      }))
    }),

    window.flow.events.onProfileStatus((status: ProfileStatus) => {
      useWorkspaceStore.setState((state) => ({
        profileStatuses: { ...state.profileStatuses, [status.accountId]: status }
      }))
    })
  ]

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
}
