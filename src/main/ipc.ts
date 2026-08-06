import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFile, rm } from 'node:fs/promises'
import { basename, extname } from 'node:path'
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
  ResultCode,
  Settings,
  WorkspaceBootstrap
} from '@shared/types'
import { pickAttachment, removeAttachment } from './services/attachments'
import { type GenerationEngine } from './services/generation-engine'
import { fromMediaUrl } from './services/media-url'
import { type ProfileManager, ProfileUnavailableError, SignInAbandonedError } from './services/profile-manager'
import { type WorkspaceStore } from './services/store'

interface RegisterOptions {
  store: WorkspaceStore
  profiles: ProfileManager
  engine: GenerationEngine
}

function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

function fail(error: string, code: ResultCode = 'UNKNOWN'): Result<never> {
  return { ok: false, error, code }
}

function toResult<T>(handler: () => Promise<Result<T>>): () => Promise<Result<T>> {
  return async () => {
    try {
      return await handler()
    } catch (error) {
      if (error instanceof ProfileUnavailableError) {
        return fail(error.message, 'PROFILE_UNAVAILABLE')
      }
      console.error('[ipc] handler failed', error)
      return fail(error instanceof Error ? error.message : String(error))
    }
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

function currentPlatform(): WorkspaceBootstrap['platform'] {
  const platform = process.platform
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') return platform
  return 'other'
}

export function registerIpc({ store, profiles, engine }: RegisterOptions): void {
  profiles.on('status', (status: ProfileStatus) => {
    broadcast(IpcChannels.eventProfileStatus, status)
  })

  engine.on('progress', (progress: GenerationProgress) => {
    broadcast(IpcChannels.eventGenerationProgress, progress)
  })

  const handle = <TArgs extends unknown[], TResult>(
    channel: string,
    handler: (...args: TArgs) => Promise<Result<TResult>>
  ): void => {
    ipcMain.handle(channel, (_event, ...args) => toResult(() => handler(...(args as TArgs)))())
  }

  // ---------------------------------------------------------------- workspace

  handle<[], WorkspaceBootstrap>(IpcChannels.workspaceLoad, async () => {
    const snapshot = store.snapshot()
    return ok({
      ...snapshot,
      profileStatuses: profiles.allStatuses(snapshot.accounts),
      platform: currentPlatform()
    })
  })

  // ----------------------------------------------------------------- projects

  handle<[{ name: string; glyph?: string }], Project>(IpcChannels.projectCreate, async (input) => {
    if (!input?.name?.trim()) return fail('A project needs a name.', 'INVALID_INPUT')
    return ok(await store.createProject(input.name, input.glyph ?? '◆'))
  })

  handle<[{ id: string; name: string }], Project>(IpcChannels.projectRename, async (input) => {
    const project = await store.renameProject(input.id, input.name)
    return project ? ok(project) : fail('That project no longer exists.', 'NOT_FOUND')
  })

  handle<[{ id: string }], { id: string }>(IpcChannels.projectDelete, async (input) => {
    const generations = store.snapshot().generations.filter((item) => item.projectId === input.id)
    const removed = await store.deleteProject(input.id)
    if (!removed) return fail('That project no longer exists.', 'NOT_FOUND')

    await Promise.all(generations.map((generation) => removeGenerationFiles(generation)))
    return ok({ id: input.id })
  })

  // ----------------------------------------------------------------- accounts

  handle<[], Account[]>(IpcChannels.accountList, async () => ok(store.accounts))

  handle<[], ProfileStatus[]>(IpcChannels.profileStatuses, async () => ok(profiles.allStatuses(store.accounts)))

  handle<[{ accountId: string }], ProfileStatus>(IpcChannels.profileLaunch, async (input) => {
    const account = store.findAccount(input.accountId)
    if (!account) return fail('That profile is not configured.', 'NOT_FOUND')

    try {
      await profiles.acquire(account)
      return ok(profiles.statusFor(account.id))
    } catch (error) {
      if (error instanceof ProfileUnavailableError) {
        return fail(error.message, 'PROFILE_UNAVAILABLE')
      }
      throw error
    }
  })

  handle<[{ accountId: string }], ProfileStatus>(IpcChannels.profileClose, async (input) => {
    await profiles.close(input.accountId)
    return ok(profiles.statusFor(input.accountId))
  })

  handle<[{ accountId: string }], Account>(IpcChannels.profileSignIn, async (input) => {
    const account = store.findAccount(input.accountId)
    if (!account) return fail('That profile is not configured.', 'NOT_FOUND')

    try {
      const identity = await profiles.signIn(account)
      const updated = await store.setAccountIdentity(account.id, identity)
      if (!updated) return fail('That profile is not configured.', 'NOT_FOUND')

      broadcast(IpcChannels.eventAccountUpdated, updated)
      return ok(updated)
    } catch (error) {
      if (error instanceof SignInAbandonedError) {
        return fail(error.message, 'CANCELLED')
      }
      if (error instanceof ProfileUnavailableError) {
        return fail(error.message, 'PROFILE_UNAVAILABLE')
      }
      throw error
    }
  })

  handle<[{ accountId: string }], { accountId: string }>(IpcChannels.profileSignInCancel, async (input) => {
    profiles.cancelSignIn(input.accountId)
    return ok({ accountId: input.accountId })
  })

  handle<[{ accountId: string }], Account>(IpcChannels.profileSignOut, async (input) => {
    const account = store.findAccount(input.accountId)
    if (!account) return fail('That profile is not configured.', 'NOT_FOUND')

    await profiles.signOut(account)
    const updated = await store.setAccountIdentity(account.id, null)
    if (!updated) return fail('That profile is not configured.', 'NOT_FOUND')

    broadcast(IpcChannels.eventAccountUpdated, updated)
    return ok(updated)
  })

  // -------------------------------------------------------------- attachments

  handle<[{ kind: 'image' | 'video' }], AttachmentRef | null>(IpcChannels.attachmentPick, async (input) => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    return ok(await pickAttachment(window, input.kind))
  })

  handle<[{ url: string }], { url: string }>(IpcChannels.attachmentRemove, async (input) => {
    // Clearing a reference from the composer must not delete a file that a
    // finished generation still points at, or its record dangles.
    const stillReferenced = store
      .snapshot()
      .generations.some((generation) => generation.attachments.some((attachment) => attachment.url === input.url))

    if (!stillReferenced) {
      await removeAttachment(input.url)
    }

    return ok({ url: input.url })
  })

  // -------------------------------------------------------------- generations

  handle<[GenerationRequest], Generation>(IpcChannels.generationRun, async (request) => {
    if (!request?.prompt?.trim()) return fail('Write a prompt before generating.', 'INVALID_INPUT')

    const project = store.findProject(request.projectId)
    if (!project) return fail('That project no longer exists.', 'NOT_FOUND')

    const account = store.findAccount(request.accountId)
    if (!account) {
      return fail('That profile is not configured. Choose another profile to continue.', 'PROFILE_UNAVAILABLE')
    }

    const attachments = [request.referenceImage, request.referenceVideo].filter(
      (attachment): attachment is AttachmentRef => Boolean(attachment)
    )

    const generation = await engine.run({ request, account, attachments, engine: store.settings.engine })

    await store.upsertGeneration(generation)
    broadcast(IpcChannels.eventGenerationSettled, generation)

    if (!store.settings.keepProfilesWarm) {
      await profiles.close(account.id)
    }

    if (generation.status === 'failed') {
      return fail(generation.error ?? 'The generation failed.', 'UNKNOWN')
    }

    return ok(generation)
  })

  handle<[{ id: string }], { id: string }>(IpcChannels.generationCancel, async (input) => {
    const cancelled = engine.cancel(input.id)
    return cancelled ? ok({ id: input.id }) : fail('That generation already finished.', 'NOT_FOUND')
  })

  handle<[{ id: string }], { id: string }>(IpcChannels.generationDelete, async (input) => {
    const generation = await store.deleteGeneration(input.id)
    if (!generation) return fail('That generation no longer exists.', 'NOT_FOUND')
    await removeGenerationFiles(generation)
    return ok({ id: input.id })
  })

  handle<[{ id: string }], { savedTo: string } | null>(IpcChannels.generationDownload, async (input) => {
    const generation = store.findGeneration(input.id)
    if (!generation?.outputPath) return fail('There is no file to download yet.', 'NOT_FOUND')

    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    const extension = extname(generation.outputPath).replace('.', '') || 'png'
    const suggested = `${slugify(generation.prompt) || 'flow-generation'}.${extension}`

    const result = await dialog.showSaveDialog(window ?? undefined!, {
      title: 'Save generation',
      defaultPath: suggested,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    })

    if (result.canceled || !result.filePath) return ok(null)

    await copyFile(generation.outputPath, result.filePath)
    return ok({ savedTo: result.filePath })
  })

  handle<[{ id: string }], { id: string }>(IpcChannels.generationReveal, async (input) => {
    const generation = store.findGeneration(input.id)
    if (!generation?.outputPath) return fail('There is no file to show yet.', 'NOT_FOUND')
    shell.showItemInFolder(generation.outputPath)
    return ok({ id: input.id })
  })

  // ----------------------------------------------------------------- settings

  handle<[Partial<Settings>], Settings>(IpcChannels.settingsUpdate, async (patch) => {
    const settings = await store.updateSettings(patch)
    profiles.setHeadless(!settings.showBrowserWindow)
    return ok(settings)
  })

  // ------------------------------------------------------------ window chrome

  ipcMain.on(IpcChannels.windowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on(IpcChannels.windowToggleMaximize, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })

  ipcMain.on(IpcChannels.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}

async function removeGenerationFiles(generation: Generation): Promise<void> {
  // A run can produce up to four artifacts plus their poster frames; deleting
  // only the first would leave the rest orphaned on disk.
  const targets = [
    ...generation.outputs.flatMap((output) => [
      output.path,
      output.thumbnailUrl ? fromMediaUrl(output.thumbnailUrl) : null
    ]),
    generation.outputPath ?? null,
    generation.thumbnailUrl ? fromMediaUrl(generation.thumbnailUrl) : null
  ]

  const unique = [...new Set(targets.filter((target): target is string => Boolean(target)))]
  await Promise.all(unique.map((target) => rm(target, { force: true }).catch(() => undefined)))
}

function slugify(input: string): string {
  return basename(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}
