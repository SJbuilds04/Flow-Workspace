import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type {
  Account,
  AttachmentRef,
  Generation,
  GenerationProgress,
  GenerationRequest,
  ProfileStatus,
  Project,
  Result,
  Settings,
  WorkspaceBootstrap
} from '@shared/types'

type Unsubscribe = () => void

function invoke<T>(channel: string, ...args: unknown[]): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<Result<T>>
}

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

/**
 * The single surface the renderer is allowed to reach the main process through.
 * Nothing else is exposed, and every call resolves to a `Result` so the UI never
 * has to reason about IPC exceptions.
 */
const api = {
  workspace: {
    load: (): Promise<Result<WorkspaceBootstrap>> => invoke(IpcChannels.workspaceLoad)
  },

  projects: {
    create: (input: { name: string; glyph?: string }): Promise<Result<Project>> =>
      invoke(IpcChannels.projectCreate, input),
    rename: (input: { id: string; name: string }): Promise<Result<Project>> => invoke(IpcChannels.projectRename, input),
    remove: (input: { id: string }): Promise<Result<{ id: string }>> => invoke(IpcChannels.projectDelete, input)
  },

  accounts: {
    list: (): Promise<Result<Account[]>> => invoke(IpcChannels.accountList),
    statuses: (): Promise<Result<ProfileStatus[]>> => invoke(IpcChannels.profileStatuses),
    launch: (input: { accountId: string }): Promise<Result<ProfileStatus>> => invoke(IpcChannels.profileLaunch, input),
    close: (input: { accountId: string }): Promise<Result<ProfileStatus>> => invoke(IpcChannels.profileClose, input),
    signIn: (input: { accountId: string }): Promise<Result<Account>> => invoke(IpcChannels.profileSignIn, input),
    cancelSignIn: (input: { accountId: string }): Promise<Result<{ accountId: string }>> =>
      invoke(IpcChannels.profileSignInCancel, input),
    signOut: (input: { accountId: string }): Promise<Result<Account>> => invoke(IpcChannels.profileSignOut, input)
  },

  attachments: {
    pick: (input: { kind: 'image' | 'video' }): Promise<Result<AttachmentRef | null>> =>
      invoke(IpcChannels.attachmentPick, input),
    remove: (input: { url: string }): Promise<Result<{ url: string }>> => invoke(IpcChannels.attachmentRemove, input)
  },

  generations: {
    run: (request: GenerationRequest): Promise<Result<Generation>> => invoke(IpcChannels.generationRun, request),
    cancel: (input: { id: string }): Promise<Result<{ id: string }>> => invoke(IpcChannels.generationCancel, input),
    remove: (input: { id: string }): Promise<Result<{ id: string }>> => invoke(IpcChannels.generationDelete, input),
    download: (input: { id: string }): Promise<Result<{ savedTo: string } | null>> =>
      invoke(IpcChannels.generationDownload, input),
    reveal: (input: { id: string }): Promise<Result<{ id: string }>> => invoke(IpcChannels.generationReveal, input)
  },

  settings: {
    update: (patch: Partial<Settings>): Promise<Result<Settings>> => invoke(IpcChannels.settingsUpdate, patch)
  },

  window: {
    minimize: (): void => ipcRenderer.send(IpcChannels.windowMinimize),
    toggleMaximize: (): void => ipcRenderer.send(IpcChannels.windowToggleMaximize),
    close: (): void => ipcRenderer.send(IpcChannels.windowClose)
  },

  events: {
    onGenerationProgress: (listener: (payload: GenerationProgress) => void): Unsubscribe =>
      subscribe(IpcChannels.eventGenerationProgress, listener),
    onGenerationSettled: (listener: (payload: Generation) => void): Unsubscribe =>
      subscribe(IpcChannels.eventGenerationSettled, listener),
    onProfileStatus: (listener: (payload: ProfileStatus) => void): Unsubscribe =>
      subscribe(IpcChannels.eventProfileStatus, listener),
    onAccountUpdated: (listener: (payload: Account) => void): Unsubscribe =>
      subscribe(IpcChannels.eventAccountUpdated, listener)
  }
} as const

export type FlowApi = typeof api

contextBridge.exposeInMainWorld('flow', api)
