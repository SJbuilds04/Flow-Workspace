import type { Character, Scene } from '@shared/types'

/**
 * Builds the prompt actually sent to Flow for one shot.
 *
 * Each shot is rendered by a separate request that cannot see the others, so
 * anything that must stay consistent has to be restated every time. The
 * planner writes `@tag` references; here they are expanded into the character's
 * name and a compact description is appended, which is what keeps a subject
 * recognisable from shot to shot.
 */
export function buildScenePrompt(scene: Scene, characters: Character[]): string {
  const cast = characters.filter((character) => scene.characterTags.includes(character.tag))

  let prompt = scene.prompt.trim()

  for (const character of cast) {
    // Word-boundary so `@keeper` does not also rewrite `@keepers_hut`.
    prompt = prompt.replace(new RegExp(`@${escapeRegExp(character.tag)}\\b`, 'gi'), character.name)
  }

  // Any tag the plan never defined would otherwise reach Flow as literal "@x".
  prompt = prompt.replace(/@([a-z0-9_]+)\b/gi, (_match, tag: string) => tag.replace(/_/g, ' '))

  if (cast.length === 0) return prompt

  const described = cast
    .filter((character) => character.description.trim())
    .map((character) => `${character.name}: ${character.description.trim().replace(/\.$/, '')}`)

  if (described.length === 0) return prompt

  return `${prompt}\n\nConsistent appearance — ${described.join('. ')}.`
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
