import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Lock, LockOpen, Trash2 } from 'lucide-react'
import { VIDEO_DURATIONS, type Character, type Scene, type VideoDuration } from '@shared/types'
import { cn } from '@/lib/cn'
import { IconButton } from '@/components/ui/IconButton'
import { SegmentedControl } from '@/components/composer/SegmentedControl'

interface SceneCardProps {
  scene: Scene
  index: number
  total: number
  characters: Character[]
  onChange: (patch: Partial<Scene>) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}

/**
 * One shot in the storyboard. Every field is editable — the planner produces a
 * starting point, and the operator is expected to rewrite it before spending
 * credits on a render.
 */
export function SceneCard({ scene, index, total, characters, onChange, onMove, onDelete }: SceneCardProps): ReactNode {
  const [prompt, setPrompt] = useState(scene.prompt)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Adopt planner rewrites, but never stomp on what is being typed.
  useEffect(() => {
    if (document.activeElement !== textareaRef.current) setPrompt(scene.prompt)
  }, [scene.prompt])

  const commitPrompt = (): void => {
    const next = prompt.trim()
    if (next && next !== scene.prompt) onChange({ prompt: next })
    else setPrompt(scene.prompt)
  }

  const cast = characters.filter((character) => scene.characterTags.includes(character.tag))

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className={cn('rounded-2xl border bg-surface-1 p-4', scene.locked ? 'border-success/30' : 'border-edge-subtle')}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-2xs font-medium tabular-nums text-ink-muted">
          {index + 1}
        </span>

        <input
          value={scene.title}
          aria-label={`Scene ${index + 1} title`}
          onChange={(event) => onChange({ title: event.target.value })}
          className="min-w-0 flex-1 rounded-md bg-transparent text-sm font-medium text-ink outline-none focus:bg-surface-2 focus:px-1.5"
        />

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            icon={scene.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            label={scene.locked ? 'Unlock scene' : 'Lock scene so it is not regenerated'}
            size="sm"
            active={scene.locked}
            onClick={() => onChange({ locked: !scene.locked })}
          />
          <IconButton
            icon={<ArrowUp className="size-3.5" />}
            label="Move earlier"
            size="sm"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <IconButton
            icon={<ArrowDown className="size-3.5" />}
            label="Move later"
            size="sm"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          />
          <IconButton
            icon={<Trash2 className="size-3.5" />}
            label="Delete scene"
            size="sm"
            tone="danger"
            onClick={onDelete}
          />
        </div>
      </div>

      <textarea
        ref={textareaRef}
        value={prompt}
        rows={3}
        aria-label={`Scene ${index + 1} prompt`}
        onChange={(event) => setPrompt(event.target.value)}
        onBlur={commitPrompt}
        className={cn(
          'mt-3 block w-full resize-y rounded-xl border border-edge-subtle bg-canvas-sunken/60 px-3 py-2.5',
          'text-xs leading-relaxed text-ink-muted outline-none',
          'transition-colors focus:border-edge-strong focus:text-ink'
        )}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SegmentedControl
          label={`Scene ${index + 1} duration`}
          size="sm"
          value={scene.durationSeconds}
          onChange={(durationSeconds) => onChange({ durationSeconds: durationSeconds as VideoDuration })}
          options={VIDEO_DURATIONS.map((seconds) => ({ value: seconds, label: `${seconds}s` }))}
        />

        {cast.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {cast.map((character) => (
              <span
                key={character.id}
                title={character.description}
                className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-2xs text-accent"
              >
                @{character.tag}
              </span>
            ))}
          </div>
        )}

        {scene.locked && <span className="ml-auto text-2xs text-success">Locked</span>}
      </div>
    </motion.article>
  )
}
