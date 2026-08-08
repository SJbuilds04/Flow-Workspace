import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * FFmpeg is expected on PATH rather than bundled.
 *
 * The prebuilt binaries on npm ship GPL builds, and shipping one inside an MIT
 * project would force the whole project's licence. Requiring a system install
 * keeps the repo's licensing clean and is normal for tools that shell out to
 * FFmpeg.
 */
export class FfmpegMissingError extends Error {
  constructor() {
    super(
      'FFmpeg was not found. Install it and make sure `ffmpeg` is on your PATH — on Windows: `winget install Gyan.FFmpeg`, macOS: `brew install ffmpeg`, Linux: your package manager.'
    )
    this.name = 'FfmpegMissingError'
  }
}

export class StitchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StitchError'
  }
}

export async function ffmpegVersion(): Promise<string | null> {
  try {
    const { stdout } = await run('ffmpeg', ['-version'], { timeout: 10_000 })
    return stdout.split('\n')[0]?.trim() ?? 'ffmpeg'
  } catch {
    return null
  }
}

export interface StitchRequest {
  /** Absolute paths of the clips, already in the order they should play. */
  clips: string[]
  outputPath: string
}

/**
 * Joins clips into a single file.
 *
 * Flow returns every shot from the same model at the same ratio, so the streams
 * match and the concat demuxer can copy them without re-encoding — which is
 * both near-instant and lossless. If a stream turns out to be incompatible,
 * fall back to a real re-encode rather than failing.
 */
export async function stitchClips({ clips, outputPath }: StitchRequest): Promise<string> {
  if (clips.length === 0) throw new StitchError('There are no rendered shots to join yet.')

  const missing = clips.filter((clip) => !existsSync(clip))
  if (missing.length > 0) {
    throw new StitchError(`${missing.length} shot file(s) are missing from disk. Re-render them and try again.`)
  }

  if (!(await ffmpegVersion())) throw new FfmpegMissingError()

  await mkdir(join(outputPath, '..'), { recursive: true })
  await rm(outputPath, { force: true })

  const listPath = `${outputPath}.concat.txt`
  // The concat demuxer takes a file list; single quotes are escaped per its
  // own quoting rules, not the shell's.
  await writeFile(listPath, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join('\n'), 'utf-8')

  try {
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath], {
      timeout: 10 * 60_000,
      maxBuffer: 1024 * 1024 * 16
    })
    return outputPath
  } catch (copyError) {
    try {
      await run(
        'ffmpeg',
        [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '18',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          outputPath
        ],
        { timeout: 20 * 60_000, maxBuffer: 1024 * 1024 * 16 }
      )
      return outputPath
    } catch (encodeError) {
      throw new StitchError(describe(encodeError) || describe(copyError) || 'FFmpeg could not join the shots.')
    }
  } finally {
    await rm(listPath, { force: true })
  }
}

function describe(error: unknown): string {
  const stderr = (error as { stderr?: string })?.stderr
  if (typeof stderr === 'string' && stderr.trim()) {
    // FFmpeg's last line is the actual complaint; the rest is banner noise.
    const lines = stderr.trim().split('\n')
    return lines[lines.length - 1]?.trim() ?? ''
  }
  return error instanceof Error ? error.message : ''
}
