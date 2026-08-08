import { randomUUID } from 'node:crypto'
import type { Character, FlowAspectRatio, PlanMode, Scene, ScenePlan, VideoDuration } from '@shared/types'
import { VIDEO_DURATIONS } from '@shared/types'
import { getSecret } from './secrets'

/** Groq exposes an OpenAI-compatible chat completions endpoint. */
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

const REQUEST_TIMEOUT_MS = 90_000

export class PlannerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlannerError'
  }
}

export class PlannerKeyMissingError extends PlannerError {
  constructor() {
    super('Add a Groq API key in Settings before planning scenes.')
    this.name = 'PlannerKeyMissingError'
  }
}

export interface PlanRequest {
  projectId: string
  mode: PlanMode
  brief: string
  targetDurationSeconds: number
  aspectRatio: FlowAspectRatio
  model: string
}

/**
 * Flow renders in fixed clip lengths, so the planner is told to compose the
 * runtime out of those exact durations. Anything else would have to be trimmed
 * or padded later, which is worse than planning around the constraint.
 */
function systemPrompt(mode: PlanMode): string {
  const intent =
    mode === 'story'
      ? [
          'You cut an existing piece of writing into individual shots.',
          '',
          'The story below is already written. Your job is ONLY to divide it into shots and',
          'describe each one visually. Do NOT invent events, characters, locations or endings',
          'that are not in the source. Do not summarise it away either: every beat in the',
          'source must appear in some shot, in the original order.',
          'If the writing already marks its own scenes or paragraphs, respect those breaks.'
        ]
      : [
          'You plan short AI-generated videos as a sequence of individual shots.',
          '',
          'Expand the brief into a coherent sequence with a beginning, middle and end.'
        ]

  return [
    ...intent,
    '',
    'Each shot is rendered separately by a text-to-video model, then joined in order.',
    `Every shot MUST have a duration of exactly one of: ${VIDEO_DURATIONS.join(', ')} seconds.`,
    mode === 'story'
      ? 'Use as many shots as the story needs; the requested runtime is a guide, not a limit.'
      : 'The shot durations must add up to the requested total runtime, or as close as those values allow.',
    '',
    'Rules for the prompts you write:',
    '- Write each shot prompt so it stands alone: the model rendering shot 3 cannot see shots 1 and 2.',
    '- Restate setting, lighting, time of day and camera framing in every shot, so the look stays consistent.',
    '- Describe one continuous camera take per shot. No cuts inside a shot.',
    '- Refer to recurring people or creatures by their character tag, written as @tag.',
    '- Do not mention shot numbers, transitions, edits, captions, text overlays or audio cues.',
    '',
    'Return ONLY a JSON object of this exact shape:',
    '{',
    '  "characters": [{"tag": "single_word_tag", "name": "Short name", "description": "Appearance, clothing, age, manner - specific enough to redraw consistently"}],',
    '  "scenes": [{"title": "Four to six words", "prompt": "The full shot description", "durationSeconds": 8, "characterTags": ["single_word_tag"]}]',
    '}',
    '',
    'Character tags are lowercase, no spaces, underscores allowed. Omit characters entirely if the video has no recurring subject.'
  ].join('\n')
}

function userPrompt(request: PlanRequest): string {
  return [
    request.mode === 'story'
      ? `Target runtime: about ${request.targetDurationSeconds} seconds, but keep every beat.`
      : `Total runtime: ${request.targetDurationSeconds} seconds.`,
    `Aspect ratio: ${request.aspectRatio}.`,
    '',
    request.mode === 'story' ? 'Story to cut into shots:' : 'Brief:',
    request.brief.trim()
  ].join('\n')
}

interface RawPlan {
  characters?: { tag?: unknown; name?: unknown; description?: unknown }[]
  scenes?: { title?: unknown; prompt?: unknown; durationSeconds?: unknown; characterTags?: unknown }[]
}

/**
 * Turns a brief into an ordered shot list via Groq.
 *
 * The model name is caller-supplied and its errors are surfaced verbatim:
 * providers rotate model ids, and a wrong one should read as "Groq says this
 * model does not exist" rather than a generic failure.
 */
export async function planScenes(request: PlanRequest): Promise<ScenePlan> {
  const apiKey = await getSecret('groqApiKey')
  if (!apiKey) throw new PlannerKeyMissingError()

  if (!request.brief.trim()) {
    throw new PlannerError(
      request.mode === 'story' ? 'Paste the story you want cut into shots.' : 'Describe the video you want.'
    )
  }

  const body = {
    model: request.model,
    temperature: 0.7,
    // Ask for JSON explicitly so we are parsing a document, not prose.
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt(request.mode) },
      { role: 'user', content: userPrompt(request) }
    ]
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (error) {
    throw new PlannerError(
      controller.signal.aborted
        ? 'Groq took too long to answer. Try again, or a smaller runtime.'
        : `Couldn't reach Groq: ${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new PlannerError(await describeHttpFailure(response, request.model))
  }

  const payload = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[]
  } | null

  const content = payload?.choices?.[0]?.message?.content
  if (!content) throw new PlannerError('Groq returned an empty response.')

  return buildPlan(request, parsePlan(content))
}

async function describeHttpFailure(response: Response, model: string): Promise<string> {
  const detail = await response
    .json()
    .then((body: unknown) => (body as { error?: { message?: string } })?.error?.message ?? '')
    .catch(() => '')

  if (response.status === 401) return 'Groq rejected the API key. Check it in Settings.'
  if (response.status === 429) return `Groq rate-limited the request${detail ? `: ${detail}` : '.'}`
  if (response.status === 404 || response.status === 400) {
    return `Groq rejected the model "${model}"${detail ? `: ${detail}` : '.'} Update the planner model in Settings.`
  }
  return `Groq returned ${response.status}${detail ? `: ${detail}` : '.'}`
}

function parsePlan(content: string): RawPlan {
  try {
    return JSON.parse(content) as RawPlan
  } catch {
    throw new PlannerError('Groq did not return valid JSON. Try again, or switch planner model in Settings.')
  }
}

/** Nearest legal Flow clip length. */
function nearestDuration(value: unknown): VideoDuration {
  const seconds = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(seconds)) return 8

  return VIDEO_DURATIONS.reduce((best, candidate) =>
    Math.abs(candidate - seconds) < Math.abs(best - seconds) ? candidate : best
  )
}

function toTag(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value : ''
  const cleaned = raw
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || fallback
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/**
 * Normalises whatever the model produced into the app's own shape. Everything
 * here is defensive: a plan that is 90% right should be editable in the
 * storyboard, not rejected outright.
 */
function buildPlan(request: PlanRequest, raw: RawPlan): ScenePlan {
  const createdAt = new Date().toISOString()

  const characters: Character[] = (raw.characters ?? [])
    .map((entry, index) => {
      const name = text(entry?.name, `Character ${index + 1}`)
      return {
        id: randomUUID(),
        tag: toTag(entry?.tag, toTag(name, `character_${index + 1}`)),
        name,
        description: text(entry?.description),
        createdAt
      }
    })
    .filter((character) => character.description.length > 0 || character.name.length > 0)

  const knownTags = new Set(characters.map((character) => character.tag))

  const scenes: Scene[] = (raw.scenes ?? [])
    .map((entry, index): Scene | null => {
      const prompt = text(entry?.prompt)
      if (!prompt) return null

      const tags = Array.isArray(entry?.characterTags)
        ? entry.characterTags.map((tag) => toTag(tag, '')).filter((tag) => tag && knownTags.has(tag))
        : []

      return {
        id: randomUUID(),
        title: text(entry?.title, `Shot ${index + 1}`),
        prompt,
        durationSeconds: nearestDuration(entry?.durationSeconds),
        characterTags: [...new Set(tags)],
        status: 'planned' as const,
        locked: false
      }
    })
    .filter((scene): scene is Scene => scene !== null)

  if (scenes.length === 0) {
    throw new PlannerError('Groq returned no usable scenes. Try rephrasing the brief.')
  }

  return {
    id: randomUUID(),
    projectId: request.projectId,
    mode: request.mode,
    brief: request.brief.trim(),
    targetDurationSeconds: request.targetDurationSeconds,
    aspectRatio: request.aspectRatio,
    scenes,
    characters,
    plannerModel: request.model,
    createdAt,
    updatedAt: createdAt
  }
}
