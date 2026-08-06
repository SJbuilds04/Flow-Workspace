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

/** What Flow is being asked to produce. */
export type GenerationMode = 'image' | 'video'

/**
 * Flow's two ways of feeding reference material into a video:
 * `frames` pins the first/last frame, `ingredients` supplies subjects, styles
 * or objects the shot should contain.
 */
export type VideoInputMode = 'frames' | 'ingredients'

/** Flow offers exactly these two ratios. */
export type FlowAspectRatio = '16:9' | '9:16'

export type VideoDuration = 4 | 6 | 8 | 10

export type OutputCount = 1 | 2 | 3 | 4

export const VIDEO_DURATIONS: readonly VideoDuration[] = [4, 6, 8, 10] as const
export const OUTPUT_COUNTS: readonly OutputCount[] = [1, 2, 3, 4] as const

export const FLOW_ASPECT_RATIOS: readonly { id: FlowAspectRatio; label: string; width: number; height: number }[] = [
  { id: '9:16', label: '9:16', width: 720, height: 1280 },
  { id: '16:9', label: '16:9', width: 1280, height: 720 }
] as const

/**
 * Model names are stored as free text rather than a fixed union: Flow renames
 * and rotates its models, and the automation selects one by the visible label
 * in Flow's own dropdown. When a stored name is no longer offered, the run
 * fails with the list Flow actually showed, which is how the list gets fixed.
 */
export const DEFAULT_FLOW_MODELS: readonly string[] = ['Omni Flash'] as const

export function findFlowAspect(id: FlowAspectRatio): {
  id: FlowAspectRatio
  label: string
  width: number
  height: number
} {
  return FLOW_ASPECT_RATIOS.find((ratio) => ratio.id === id) ?? FLOW_ASPECT_RATIOS[1]!
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

/** The knobs Flow's generation panel exposes, in one place. */
export interface GenerationParams {
  mode: GenerationMode
  /** Only meaningful when `mode` is `video`. */
  inputMode: VideoInputMode
  aspectRatio: FlowAspectRatio
  /** Visible model name as it appears in Flow's dropdown. */
  model: string
  /** Only meaningful when `mode` is `video`. */
  durationSeconds: VideoDuration
  outputCount: OutputCount
}

export interface GenerationRequest extends GenerationParams {
  projectId: string
  accountId: string
  prompt: string
  /** Already-imported files, as returned by the attachment picker. */
  referenceImage?: AttachmentRef | null
  referenceVideo?: AttachmentRef | null
}

/** One artifact produced by a run. A single request can return several. */
export interface GenerationOutput {
  /** Absolute path of the artifact on disk. */
  path: string
  /** `flow-media://` URL for the artifact. */
  url: string
  /** `flow-media://` URL for the poster frame, when the artifact is a video. */
  thumbnailUrl?: string
  kind: 'image' | 'video'
}

export interface Generation extends GenerationParams {
  id: string
  projectId: string
  accountId: string
  prompt: string
  status: GenerationStatus
  createdAt: string
  completedAt?: string
  /** Which engine produced this — Flow, or the local preview renderer. */
  engine: GenerationEngineId
  outputs: GenerationOutput[]
  /** First output, kept flat for the card and viewer. */
  outputPath?: string
  outputUrl?: string
  thumbnailUrl?: string
  attachments: AttachmentRef[]
  error?: string
  durationMs?: number
  /** Credits Flow reported for the run, when it could be read. */
  creditsUsed?: number
}

export type GenerationEngineId = 'google-flow' | 'local-preview'

/** What the Flow diagnostic found, so a broken entrance is discoverable. */
export interface FlowDiagnosticsReport {
  capturedAt: string
  entryUrl: string
  finalUrl: string
  title: string
  signedIn: boolean
  isLandingPage: boolean
  labels: string[]
  candidateAppUrls: string[]
  reportPath: string
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
  /** Which engine runs generations. */
  engine: GenerationEngineId
  /** Model names offered in the picker, matching Flow's own dropdown labels. */
  flowModels: string[]
  /** Where the Flow automation starts. Configurable because Google moves it. */
  flowUrl: string
  defaults: GenerationParams
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

export const DEFAULT_PARAMS: GenerationParams = {
  mode: 'video',
  inputMode: 'ingredients',
  aspectRatio: '16:9',
  model: DEFAULT_FLOW_MODELS[0]!,
  durationSeconds: 8,
  outputCount: 1
}

/**
 * Credit estimate, extrapolated from a single observed data point: Flow quoted
 * 15 credits for one 10-second clip. It is shown as an approximation and is
 * replaced by the real figure once a run reads Flow's own quote.
 */
const CREDITS_PER_SECOND = 1.5

export function estimateCredits(params: GenerationParams): number {
  if (params.mode === 'image') return params.outputCount
  return Math.round(params.durationSeconds * CREDITS_PER_SECOND) * params.outputCount
}

/** Strips the fields that do not apply to the current mode. */
export function normaliseParams(params: GenerationParams): GenerationParams {
  if (params.mode === 'image') {
    return { ...params, inputMode: 'ingredients', durationSeconds: params.durationSeconds }
  }
  return params
}
