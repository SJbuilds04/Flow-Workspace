import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { KeyRound, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react'
import {
  PLAN_TARGET_DURATIONS,
  estimateCredits,
  planDuration,
  type Scene,
  type ScenePlan,
  type VideoDuration
} from '@shared/types'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { SegmentedControl } from '@/components/composer/SegmentedControl'
import { useWorkspaceStore } from '@/store/workspace-store'
import { SceneCard } from './SceneCard'

interface StoryboardViewProps {
  projectId: string
}

/**
 * The scene planner surface: a brief goes in, an ordered shot list comes back,
 * and everything about it stays editable. Nothing here spends credits —
 * rendering is a later, separate step — so it is safe to iterate freely.
 */
export function StoryboardView({ projectId }: StoryboardViewProps): ReactNode {
  const plans = useWorkspaceStore((state) => state.plans)
  const planning = useWorkspaceStore((state) => state.planning)
  const hasKey = useWorkspaceStore((state) => state.hasPlannerKey)
  const createPlan = useWorkspaceStore((state) => state.createPlan)
  const savePlan = useWorkspaceStore((state) => state.savePlan)
  const deletePlan = useWorkspaceStore((state) => state.deletePlan)
  const setView = useWorkspaceStore((state) => state.setView)

  const plan = useMemo(() => plans.find((item) => item.projectId === projectId) ?? null, [plans, projectId])

  const [brief, setBrief] = useState('')
  const [target, setTarget] = useState<number>(60)
  const [confirmReplan, setConfirmReplan] = useState(false)

  const submit = async (): Promise<void> => {
    if (!brief.trim() || planning) return
    const created = await createPlan(projectId, brief, target)
    if (created) setBrief('')
  }

  const update = (patch: Partial<ScenePlan>): void => {
    if (!plan) return
    void savePlan({ ...plan, ...patch })
  }

  const patchScene = (sceneId: string, patch: Partial<Scene>): void => {
    if (!plan) return
    update({ scenes: plan.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene)) })
  }

  const moveScene = (sceneId: string, direction: -1 | 1): void => {
    if (!plan) return
    const index = plan.scenes.findIndex((scene) => scene.id === sceneId)
    const next = index + direction
    if (index < 0 || next < 0 || next >= plan.scenes.length) return

    const scenes = [...plan.scenes]
    const [moved] = scenes.splice(index, 1)
    if (moved) scenes.splice(next, 0, moved)
    update({ scenes })
  }

  const addScene = (): void => {
    if (!plan) return
    const scene: Scene = {
      id: crypto.randomUUID(),
      title: `Shot ${plan.scenes.length + 1}`,
      prompt: '',
      durationSeconds: 8,
      characterTags: [],
      status: 'planned',
      locked: false
    }
    update({ scenes: [...plan.scenes, scene] })
  }

  if (!hasKey) {
    return (
      <EmptyState
        icon={<KeyRound className="size-5" />}
        title="Connect Groq to plan scenes"
        description="Scene planning splits a brief into individual shots. Add a Groq API key in Settings to turn it on — planning costs no Flow credits."
        action={
          <Button variant="secondary" onClick={() => setView('settings')}>
            Open Settings
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-edge-subtle bg-surface-1 p-4">
        <label htmlFor="brief" className="text-xs font-medium text-ink-muted">
          {plan ? 'Re-plan from a new brief' : 'What should the video be?'}
        </label>

        <textarea
          id="brief"
          value={brief}
          rows={3}
          disabled={planning}
          placeholder="A 60 second cinematic short about a lighthouse keeper who finds something in the fog…"
          onChange={(event) => setBrief(event.target.value)}
          className={cn(
            'mt-2 block w-full resize-none rounded-2xl border border-edge-subtle bg-canvas-sunken/60 px-3.5 py-3',
            'text-sm leading-relaxed text-ink outline-none placeholder:text-ink-ghost',
            'transition-colors focus:border-edge-strong disabled:opacity-60'
          )}
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Target runtime"
            size="sm"
            value={target}
            disabled={planning}
            onChange={setTarget}
            options={PLAN_TARGET_DURATIONS.map((seconds) => ({ value: seconds, label: `${seconds}s` }))}
          />

          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            loading={planning}
            disabled={!brief.trim()}
            iconLeft={<Wand2 className="size-3.5" />}
            onClick={() => (plan ? setConfirmReplan(true) : void submit())}
          >
            {planning ? 'Planning…' : 'Plan scenes'}
          </Button>
        </div>
      </div>

      {plan ? (
        <>
          <PlanSummary plan={plan} onDelete={() => void deletePlan(plan.id)} />

          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {plan.scenes.map((scene, index) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  index={index}
                  total={plan.scenes.length}
                  characters={plan.characters}
                  onChange={(patch) => patchScene(scene.id, patch)}
                  onMove={(direction) => moveScene(scene.id, direction)}
                  onDelete={() => update({ scenes: plan.scenes.filter((item) => item.id !== scene.id) })}
                />
              ))}
            </AnimatePresence>
          </div>

          <Button variant="secondary" size="sm" iconLeft={<Plus className="size-3.5" />} onClick={addScene}>
            Add a shot
          </Button>
        </>
      ) : (
        !planning && (
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title="No storyboard yet"
            description="Describe the video above and Groq will split it into individual shots you can edit before anything is rendered."
          />
        )
      )}

      <Modal
        open={confirmReplan}
        onClose={() => setConfirmReplan(false)}
        title="Replace this storyboard?"
        description="Planning again discards the current shots, including any edits and locks. The generated clips themselves are kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReplan(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmReplan(false)
                void submit()
              }}
            >
              Replace storyboard
            </Button>
          </>
        }
      />
    </div>
  )
}

/** Runtime, cost and cast at a glance — the numbers worth seeing before rendering. */
function PlanSummary({ plan, onDelete }: { plan: ScenePlan; onDelete: () => void }): ReactNode {
  const runtime = planDuration(plan)
  const credits = plan.scenes.reduce(
    (total, scene) =>
      total +
      estimateCredits({
        mode: 'video',
        inputMode: 'ingredients',
        aspectRatio: plan.aspectRatio,
        model: '',
        durationSeconds: scene.durationSeconds as VideoDuration,
        outputCount: 1
      }),
    0
  )

  return (
    <motion.div
      layout
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-edge-subtle bg-surface-1 px-4 py-3"
    >
      <Metric label="Shots" value={String(plan.scenes.length)} />
      <Metric label="Runtime" value={`${runtime}s`} hint={`target ${plan.targetDurationSeconds}s`} />
      <Metric label="Est. credits" value={`≈${credits}`} />
      <Metric label="Cast" value={plan.characters.length > 0 ? String(plan.characters.length) : '—'} />

      {plan.characters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {plan.characters.map((character) => (
            <span
              key={character.id}
              title={character.description}
              className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-2xs text-ink-muted"
            >
              @{character.tag}
            </span>
          ))}
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        iconLeft={<Trash2 className="size-3.5" />}
        onClick={onDelete}
      >
        Discard
      </Button>
    </motion.div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }): ReactNode {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wider text-ink-ghost">{label}</p>
      <p className="text-sm tabular-nums text-ink">
        {/* Separate nodes so the value and its hint do not run together in the
            accessibility tree, where they would read as "18starget 30s". */}
        <span>{value}</span>
        {hint && <span className="ml-1.5 text-2xs text-ink-ghost">{hint}</span>}
      </p>
    </div>
  )
}
