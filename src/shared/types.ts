/**
 * Domain types shared by the Electron main process, the preload bridge and the
 * React renderer. This module must stay free of runtime dependencies so it can
 * be imported from every process without pulling Node or DOM globals in.
 */

export type AccountTone = 'green' | 'purple' | 'blue'

/**
 * The Google account signed into a profile. Everything except `connectedAt` is
 * best-effort: the session is confirmed from cookies, but the display details
 * come from an undocumented endpoint and may be absent. A profile with an
 * identity but no email is still connected — just unlabelled.
 */
export interface AccountIdentity {
  email?: string
  displayName?: string
  avatarUrl?: string
  connectedAt: string
}

/**
 * An "account" is a named, persistent Playwright browser profile. Switching
 * accounts switches which on-disk browser context generations run through.
 */
export interface Account {
  id: string
  name: string
  tone: AccountTone
  /** Directory (inside userData) holding the persistent browser context. */
  profileDirectory: string
  createdAt: string
  /** Present once a Google account has been signed into this profile. */
  identity?: AccountIdentity | null
}

export type ProfileState = 'idle' | 'launching' | 'ready' | 'unavailable' | 'signing-in'

export interface ProfileStatus {
  accountId: string
  state: ProfileState
  /** Human-readable explanation, present when `state` is `unavailable`. */
  message?: string
  /** Populated once the context has been launched at least once. */
  lastLaunchedAt?: string
}

export interface Project {
  id: string
  name: string
  /** Emoji or short glyph rendered in the sidebar. */
  glyph: string
  createdAt: string
  updatedAt: string
}

export type AspectRatioId = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9'

export interface AspectRatio {
  id: AspectRatioId
  label: string
  description: string
  width: number
  height: number
}

export type ModelId = 'flow-image-v2' | 'flow-image-turbo' | 'flow-video-v1' | 'flow-video-cinematic'

export type ModelKind = 'image' | 'video'

export interface ModelOption {
  id: ModelId
  name: string
  kind: ModelKind
  description: string
  /** Rough guidance surfaced in the picker. */
  latency: string
}

export interface AttachmentRef {
  id: string
  kind: 'image' | 'video'
  fileName: string
  /** Absolute path on disk inside the app's managed uploads folder. */
  path: string
  /** `flow-media://` URL that the renderer can safely load. */
  url: string
  sizeBytes: number
  mimeType: string
}

export type GenerationStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface GenerationRequest {
  projectId: string
  accountId: string
  prompt: string
  modelId: ModelId
  aspectRatio: AspectRatioId
  /** Already-imported files, as returned by the attachment picker. */
  referenceImage?: AttachmentRef | null
  referenceVideo?: AttachmentRef | null
}

export interface Generation {
  id: string
  projectId: string
  accountId: string
  prompt: string
  modelId: ModelId
  aspectRatio: AspectRatioId
  status: GenerationStatus
  createdAt: string
  completedAt?: string
  /** Absolute path of the rendered artifact. */
  outputPath?: string
  /** `flow-media://` URL for the artifact. */
  outputUrl?: string
  /** `flow-media://` URL for the poster/thumbnail frame. */
  thumbnailUrl?: string
  attachments: AttachmentRef[]
  error?: string
  durationMs?: number
}

export interface GenerationProgress {
  generationId: string
  status: GenerationStatus
  /** 0 – 1 */
  progress: number
  stage: string
}

export interface Settings {
  activeAccountId: string
  defaultModelId: ModelId
  defaultAspectRatio: AspectRatioId
  reduceMotion: boolean
  /** Launch the browser context with a visible window instead of headless. */
  showBrowserWindow: boolean
  /** Keep contexts warm after a generation finishes. */
  keepProfilesWarm: boolean
}

export interface WorkspaceSnapshot {
  projects: Project[]
  accounts: Account[]
  generations: Generation[]
  settings: Settings
}

/** Everything the renderer needs on first paint. */
export interface WorkspaceBootstrap extends WorkspaceSnapshot {
  profileStatuses: ProfileStatus[]
  platform: 'darwin' | 'win32' | 'linux' | 'other'
}

/** Discriminated result so IPC never throws across the bridge. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: ResultCode }

export type ResultCode =
  'PROFILE_UNAVAILABLE' | 'PROFILE_BUSY' | 'NOT_FOUND' | 'INVALID_INPUT' | 'IO_ERROR' | 'CANCELLED' | 'UNKNOWN'

export const ASPECT_RATIOS: readonly AspectRatio[] = [
  { id: '1:1', label: '1:1', description: 'Square', width: 1024, height: 1024 },
  { id: '16:9', label: '16:9', description: 'Widescreen', width: 1280, height: 720 },
  { id: '9:16', label: '9:16', description: 'Vertical', width: 720, height: 1280 },
  { id: '4:3', label: '4:3', description: 'Classic', width: 1152, height: 864 },
  { id: '3:4', label: '3:4', description: 'Portrait', width: 864, height: 1152 },
  { id: '21:9', label: '21:9', description: 'Cinematic', width: 1512, height: 648 }
] as const

export const MODELS: readonly ModelOption[] = [
  {
    id: 'flow-image-v2',
    name: 'Flow Image v2',
    kind: 'image',
    description: 'Highest fidelity stills with strong prompt adherence.',
    latency: '~30s'
  },
  {
    id: 'flow-image-turbo',
    name: 'Flow Image Turbo',
    kind: 'image',
    description: 'Fast drafts for exploring composition and colour.',
    latency: '~8s'
  },
  {
    id: 'flow-video-v1',
    name: 'Flow Video v1',
    kind: 'video',
    description: 'Short motion clips from a prompt or reference frame.',
    latency: '~2m'
  },
  {
    id: 'flow-video-cinematic',
    name: 'Flow Video Cinematic',
    kind: 'video',
    description: 'Longer takes with camera motion and depth cues.',
    latency: '~4m'
  }
] as const

export function findAspectRatio(id: AspectRatioId): AspectRatio {
  const match = ASPECT_RATIOS.find((ratio) => ratio.id === id)
  return match ?? (ASPECT_RATIOS[0] as AspectRatio)
}

export function findModel(id: ModelId): ModelOption {
  const match = MODELS.find((model) => model.id === id)
  return match ?? (MODELS[0] as ModelOption)
}
