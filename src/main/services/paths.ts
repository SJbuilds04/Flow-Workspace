import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Every path the app writes to lives under `userData`, so uninstalling the app
 * removes the workspace cleanly and nothing leaks into the user's documents.
 */
export const paths = {
  root: (): string => app.getPath('userData'),
  profiles: (): string => join(app.getPath('userData'), 'profiles'),
  profile: (directory: string): string => join(app.getPath('userData'), 'profiles', directory),
  uploads: (): string => join(app.getPath('userData'), 'uploads'),
  outputs: (): string => join(app.getPath('userData'), 'outputs'),
  outputsFor: (projectId: string): string => join(app.getPath('userData'), 'outputs', projectId)
}

/** All media the renderer may load must sit inside one of these roots. */
export function mediaRoots(): string[] {
  return [paths.uploads(), paths.outputs()]
}

export async function ensureAppDirectories(): Promise<void> {
  await Promise.all([
    mkdir(paths.profiles(), { recursive: true }),
    mkdir(paths.uploads(), { recursive: true }),
    mkdir(paths.outputs(), { recursive: true })
  ])
}
