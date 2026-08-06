import { dialog, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { AttachmentRef } from '@shared/types'
import { fromMediaUrl, toMediaUrl } from './media-url'
import { paths } from './paths'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp']
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v', 'mkv']

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  mkv: 'video/x-matroska'
}

export function mimeTypeFor(filePath: string): string {
  const ext = extname(filePath).replace('.', '').toLowerCase()
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream'
}

/**
 * Opens a native picker and copies the chosen file into the managed uploads
 * folder. Copying (rather than referencing the original) means a generation's
 * inputs stay reproducible even if the user moves or deletes the source file.
 */
export async function pickAttachment(
  window: BrowserWindow | null,
  kind: 'image' | 'video'
): Promise<AttachmentRef | null> {
  const extensions = kind === 'image' ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS
  const result = await dialog.showOpenDialog(window ?? undefined!, {
    title: kind === 'image' ? 'Choose a reference image' : 'Choose a reference video',
    buttonLabel: 'Use file',
    properties: ['openFile'],
    filters: [
      { name: kind === 'image' ? 'Images' : 'Videos', extensions },
      { name: 'All files', extensions: ['*'] }
    ]
  })

  const sourcePath = result.filePaths[0]
  if (result.canceled || !sourcePath) return null

  return importAttachment(sourcePath, kind)
}

export async function importAttachment(sourcePath: string, kind: 'image' | 'video'): Promise<AttachmentRef> {
  await mkdir(paths.uploads(), { recursive: true })

  const id = randomUUID()
  const fileName = basename(sourcePath)
  const storedName = `${id}${extname(sourcePath).toLowerCase() || (kind === 'image' ? '.png' : '.mp4')}`
  const destination = join(paths.uploads(), storedName)

  await copyFile(sourcePath, destination)
  const stats = await stat(destination)

  return {
    id,
    kind,
    fileName,
    path: destination,
    url: toMediaUrl('uploads', destination),
    sizeBytes: stats.size,
    mimeType: mimeTypeFor(destination)
  }
}

/** Deletes an uploaded file. Silently succeeds when the file is already gone. */
export async function removeAttachment(url: string): Promise<void> {
  const filePath = fromMediaUrl(url)
  if (!filePath) return
  await rm(filePath, { force: true })
}
