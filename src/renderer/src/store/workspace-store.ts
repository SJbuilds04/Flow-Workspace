import { create } from 'zustand'
import type {
  Account,
  AttachmentRef,
  FlowDiagnosticsReport,
  Generation,
  GenerationParams,
  GenerationProgress,
  PlanMode,
  ProfileStatus,
  Project,
  QueueSnapshot,
  ScenePlan,
  Settings
} from '@shared/types'
import { DEFAULT_PARAMS } from '@shared/types'
import { toast } from './toast-store'

export type WorkspaceView = 'project' | 'settings'
export type ProjectTab = 'compose' | 'storyboard'
export type BootStatus = 'loading' | 'ready' | 'error'

/** Per-project composer state, so switching projects never loses a draft. */
export interface Draft extends GenerationParams {
  prompt: string
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

  plans: ScenePlan[]
  hasPlannerKey: boolean
  planning: boolean
  queue: QueueSnapshot

  activeProjectId: string | null
  view: WorkspaceView
  /** Which surface the open project shows: single prompt, or a storyboard. */
  projectTab: ProjectTab
  search: string
  drafts: Record<string, Draft>
  activeRun: ActiveRun | null
  /** Set when a profile could not be used; surfaced as a dismissible banner. */
  profileNotice: { accountId: string; message: string } | null
  /** Latest Flow diagnostic, shown inline in Settings. */
  flowDiagnostics: FlowDiagnosticsReport | null

  bootstrap: () => Promise<void>
  selectProject: (id: string) => void
  setView: (view: WorkspaceView) => void
  setProjectTab: (tab: ProjectTab) => void
  setSearch: (search: string) => void

  createPlan: (projectId: string, mode: PlanMode, brief: string, targetDurationSeconds: number) => Promise<boolean>
  renderPlan: (planId: string) => Promise<void>
  cancelQueue: () => Promise<void>
  cancelJob: (id: string) => Promise<void>
  clearSettledJobs: () => Promise<void>

  addAccount: (name: string) => Promise<void>
  renameAccount: (id: string, name: string) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  savePlan: (plan: ScenePlan) => Promise<void>
  pickReferenceImage: () => Promise<AttachmentRef | null>
  stitchPlan: (planId: string) => Promise<void>
  deletePlan: (id: string) => Promise<void>
  setPlannerKey: (value: string) => Promise<boolean>
  clearPlannerKey: () => Promise<void>

  createProject: (name: string, glyph?: string) => Promise<Project | null>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>

  setActiveAccount: (accountId: string) => Promise<void>
  launchProfile: (accountId: string) => Promise<boolean>
  closeProfile: (accountId: string) => Promise<void>
  signInProfile: (accountId: string) => Promise<boolean>
  cancelSignIn: (accountId: string) => Promise<void>
  signOutProfile: (accountId: string) => Promise<void>
  diagnoseFlow: (accountId: string) => Promise<void>
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
    ...(settings?.defaults ?? DEFAULT_PARAMS),
    prompt: '',
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
  plans: [],
  hasPlannerKey: false,
  planning: false,
  queue: { jobs: [], running: false },
  settings: null,
  profileStatuses: {},

  activeProjectId: null,
  view: 'project',
  projectTab: 'compose',
  search: '',
  drafts: {},
  activeRun: null,
  profileNotice: null,
  flowDiagnostics: null,

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

    const { projects, accounts, generations, plans, settings, profileStatuses, platform, hasPlannerKey } = result.data
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
      plans,
      hasPlannerKey,
      settings,
      profileStatuses: indexStatuses(profileStatuses),
      activeProjectId: projects[0]?.id ?? null,
      drafts
    })
  },

  selectProject: (id) => set({ activeProjectId: id, view: 'project' }),
  setView: (view) => set({ view }),
  setProjectTab: (projectTab) => set({ projectTab }),
  setSearch: (search) => set({ search }),

  createPlan: async (projectId, mode, brief, targetDurationSeconds) => {
    set({ planning: true })
    const result = await window.flow.plans.create({ projectId, mode, brief, targetDurationSeconds })
    set({ planning: false })

    if (!result.ok) {
      toast.error('Could not plan the scenes', result.error)
      return false
    }

    set((state) => ({
      plans: [result.data, ...state.plans.filter((plan) => plan.projectId !== projectId)]
    }))
    return true
  },

  savePlan: async (plan) => {
    // Optimistic: storyboard edits are frequent and should never feel laggy.
    set((state) => ({ plans: state.plans.map((item) => (item.id === plan.id ? plan : item)) }))

    const result = await window.flow.plans.save(plan)
    if (!result.ok) {
      toast.error('Could not save the storyboard', result.error)
      return
    }
    set((state) => ({ plans: state.plans.map((item) => (item.id === plan.id ? result.data : item)) }))
  },

  pickReferenceImage: async () => {
    const result = await window.flow.attachments.pick({ kind: 'image' })
    if (!result.ok) {
      toast.error('Could not read that image', result.error)
      return null
    }
    return result.data
  },

  stitchPlan: async (planId) => {
    const result = await window.flow.stitch.plan({ planId })
    if (!result.ok) {
      toast.error('Could not join the shots', result.error)
      return
    }

    set((state) => ({
      projects: state.projects.map((project) => (project.id === result.data.id ? result.data : project))
    }))
    toast.success('Video assembled', result.data.stitchedPath ?? undefined)
  },

  deletePlan: async (id) => {
    const result = await window.flow.plans.remove({ id })
    if (!result.ok) {
      toast.error('Could not delete the storyboard', result.error)
      return
    }
    set((state) => ({ plans: state.plans.filter((plan) => plan.id !== id) }))
  },

  renderPlan: async (planId) => {
    const result = await window.flow.queue.renderPlan({ planId })
    if (!result.ok) {
      toast.error('Could not start rendering', result.error)
      return
    }
    set({ queue: result.data })
  },

  cancelQueue: async () => {
    const result = await window.flow.queue.cancelAll()
    if (result.ok) set({ queue: result.data })
  },

  cancelJob: async (id) => {
    const result = await window.flow.queue.cancelJob({ id })
    if (result.ok) set({ queue: result.data })
  },

  clearSettledJobs: async () => {
    const result = await window.flow.queue.clearSettled()
    if (result.ok) set({ queue: result.data })
  },

  addAccount: async (name) => {
    const result = await window.flow.accounts.create({ name })
    if (!result.ok) {
      toast.error('Could not add the profile', result.error)
      return
    }
    set((state) => ({ accounts: [...state.accounts, result.data] }))
  },

  renameAccount: async (id, name) => {
    const result = await window.flow.accounts.rename({ id, name })
    if (!result.ok) {
      toast.error('Could not rename the profile', result.error)
      return
    }
    set((state) => ({ accounts: state.accounts.map((account) => (account.id === id ? result.data : account)) }))
  },

  removeAccount: async (id) => {
    const result = await window.flow.accounts.remove({ id })
    if (!result.ok) {
      toast.error('Could not remove the profile', result.error)
      return
    }
    set((state) => ({ accounts: state.accounts.filter((account) => account.id !== id) }))
  },

  setPlannerKey: async (value) => {
    const result = await window.flow.secrets.set({ name: 'groqApiKey', value })
    if (!result.ok) {
      toast.error('Could not save the key', result.error)
      return false
    }
    set({ hasPlannerKey: result.data.stored })
    if (result.data.stored) toast.success('Groq key saved')
    return result.data.stored
  },

  clearPlannerKey: async () => {
    const result = await window.flow.secrets.clear({ name: 'groqApiKey' })
    if (!result.ok) {
      toast.error('Could not remove the key', result.error)
      return
    }
    set({ hasPlannerKey: false })
  },

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
        plans: state.plans.filter((plan) => plan.projectId !== id),
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

  signInProfile: async (accountId) => {
    const result = await window.flow.accounts.signIn({ accountId })

    if (!result.ok) {
      // Backing out of the browser window is a normal outcome, not an error.
      if (result.code === 'CANCELLED') {
        toast.info('Sign-in not completed', result.error)
      } else if (result.code === 'PROFILE_UNAVAILABLE') {
        set({ profileNotice: { accountId, message: result.error } })
      } else {
        toast.error('Could not sign in', result.error)
      }
      return false
    }

    set((state) => ({
      accounts: state.accounts.map((account) => (account.id === accountId ? result.data : account))
    }))
    toast.success('Profile connected', result.data.identity?.email ?? `${result.data.name} is signed in.`)
    return true
  },

  cancelSignIn: async (accountId) => {
    await window.flow.accounts.cancelSignIn({ accountId })
  },

  signOutProfile: async (accountId) => {
    const result = await window.flow.accounts.signOut({ accountId })
    if (!result.ok) {
      toast.error('Could not sign out', result.error)
      return
    }
    set((state) => ({
      accounts: state.accounts.map((account) => (account.id === accountId ? result.data : account))
    }))
  },

  diagnoseFlow: async (accountId) => {
    const result = await window.flow.flow.diagnose({ accountId })
    if (!result.ok) {
      toast.error('Could not reach Flow', result.error)
      return
    }

    set({ flowDiagnostics: result.data })

    if (result.data.isLandingPage) {
      toast.info(
        result.data.signedIn ? 'Flow served its landing page' : 'Not signed in to Google',
        result.data.signedIn
          ? 'Pick one of the candidate URLs below, or open Flow in this profile and copy the address the app loads at.'
          : 'Connect a Google account for this profile first.'
      )
    } else {
      toast.success('Flow looks reachable', result.data.finalUrl)
    }
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

    const { prompt, referenceImage, referenceVideo, ...params } = draft

    const result = await window.flow.generations.run({
      ...params,
      projectId,
      accountId: settings.activeAccountId,
      prompt,
      referenceImage,
      referenceVideo
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
    }),

    window.flow.events.onAccountUpdated((account: Account) => {
      useWorkspaceStore.setState((state) => ({
        accounts: state.accounts.map((item) => (item.id === account.id ? account : item))
      }))
    }),

    window.flow.events.onQueueChanged((queue: QueueSnapshot) => {
      useWorkspaceStore.setState({ queue })
    }),

    window.flow.events.onPlanUpdated((plan: ScenePlan) => {
      useWorkspaceStore.setState((state) => ({
        plans: state.plans.map((item) => (item.id === plan.id ? plan : item))
      }))
    }),

    window.flow.events.onProjectUpdated((project: Project) => {
      useWorkspaceStore.setState((state) => ({
        projects: state.projects.map((item) => (item.id === project.id ? project : item))
      }))
    })
  ]

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
}
