/**
 * Canonical IPC channel names. Both sides import from here so a renamed channel
 * is a compile error rather than a silent no-op.
 */
export const IpcChannels = {
  workspaceLoad: 'workspace:load',

  projectCreate: 'project:create',
  projectRename: 'project:rename',
  projectDelete: 'project:delete',

  accountList: 'account:list',
  profileStatuses: 'profile:statuses',
  profileLaunch: 'profile:launch',
  profileClose: 'profile:close',
  profileSignIn: 'profile:sign-in',
  profileSignInCancel: 'profile:sign-in-cancel',
  profileSignOut: 'profile:sign-out',
  flowDiagnose: 'flow:diagnose',

  generationRun: 'generation:run',
  generationCancel: 'generation:cancel',
  generationDelete: 'generation:delete',
  generationDownload: 'generation:download',
  generationReveal: 'generation:reveal',

  attachmentPick: 'attachment:pick',
  attachmentRemove: 'attachment:remove',

  settingsUpdate: 'settings:update',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',

  // main -> renderer
  eventGenerationProgress: 'event:generation-progress',
  eventGenerationSettled: 'event:generation-settled',
  eventProfileStatus: 'event:profile-status',
  eventAccountUpdated: 'event:account-updated',
  eventWindowState: 'event:window-state'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export const MEDIA_PROTOCOL = 'flow-media'
