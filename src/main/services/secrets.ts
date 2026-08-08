import { app, safeStorage } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * API keys live here, encrypted at rest with the OS keychain via
 * `safeStorage`, in their own file — deliberately *not* in `workspace.json`,
 * which is plain JSON the user may copy, sync or attach to a bug report.
 *
 * The key is never handed back to the renderer. Callers ask whether one exists;
 * only the main process ever reads the value.
 */
export type SecretName = 'groqApiKey'

function secretPath(name: SecretName): string {
  return join(app.getPath('userData'), `${name}.enc`)
}

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export async function setSecret(name: SecretName, value: string): Promise<void> {
  const trimmed = value.trim()
  if (!trimmed) {
    await clearSecret(name)
    return
  }

  if (!encryptionAvailable()) {
    throw new Error(
      'This system has no secure storage available, so an API key cannot be saved safely. Set GROQ_API_KEY in the environment instead.'
    )
  }

  await writeFile(secretPath(name), safeStorage.encryptString(trimmed))
}

export async function getSecret(name: SecretName): Promise<string | null> {
  // An environment variable wins, so CI and headless runs never need a keychain.
  const fromEnv = name === 'groqApiKey' ? process.env['GROQ_API_KEY'] : undefined
  if (fromEnv?.trim()) return fromEnv.trim()

  const path = secretPath(name)
  if (!existsSync(path) || !encryptionAvailable()) return null

  try {
    return safeStorage.decryptString(await readFile(path))
  } catch {
    // A key encrypted under a different OS user or machine cannot be read back.
    return null
  }
}

export async function hasSecret(name: SecretName): Promise<boolean> {
  return (await getSecret(name)) !== null
}

export async function clearSecret(name: SecretName): Promise<void> {
  await rm(secretPath(name), { force: true })
}
