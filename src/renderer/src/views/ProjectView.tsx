import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, FolderPlus, ListVideo, Pencil, Wand } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { ProfileNotice } from '@/components/account/ProfileNotice'
import { PromptComposer } from '@/components/composer/PromptComposer'
import { SegmentedControl } from '@/components/composer/SegmentedControl'
import { GenerationGrid } from '@/components/history/GenerationGrid'
import { StoryboardView } from '@/components/storyboard/StoryboardView'
import { emptyDraft, useWorkspaceStore } from '@/store/workspace-store'

export function ProjectView(): ReactNode {
  const projects = useWorkspaceStore((state) => state.projects)
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId)
  const generations = useWorkspaceStore((state) => state.generations)
  const drafts = useWorkspaceStore((state) => state.drafts)
  const settings = useWorkspaceStore((state) => state.settings)
  const activeRun = useWorkspaceStore((state) => state.activeRun)
  const renameProject = useWorkspaceStore((state) => state.renameProject)
  const projectTab = useWorkspaceStore((state) => state.projectTab)
  const setProjectTab = useWorkspaceStore((state) => state.setProjectTab)

  const project = projects.find((item) => item.id === activeProjectId) ?? null

  const projectGenerations = useMemo(
    () => (project ? generations.filter((generation) => generation.projectId === project.id) : []),
    [generations, project]
  )

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<FolderPlus className="size-5" />}
          title="No project selected"
          description="Create a project from the sidebar to start generating. Each project keeps its own prompts, references and history."
        />
      </div>
    )
  }

  const draft = drafts[project.id] ?? emptyDraft(settings)
  const run = activeRun?.projectId === project.id ? activeRun : null

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-8 pb-16 pt-10">
        <ProjectHeader
          key={project.id}
          name={project.name}
          glyph={project.glyph}
          updatedAt={project.updatedAt}
          generationCount={projectGenerations.length}
          onRename={(name) => void renameProject(project.id, name)}
        />

        <div className="mt-7">
          <SegmentedControl
            label="Project mode"
            value={projectTab}
            onChange={setProjectTab}
            options={[
              { value: 'compose', label: 'Compose', icon: <Wand className="size-3.5" aria-hidden /> },
              { value: 'storyboard', label: 'Storyboard', icon: <ListVideo className="size-3.5" aria-hidden /> }
            ]}
          />
        </div>

        {projectTab === 'storyboard' ? (
          <div className="mt-6">
            <StoryboardView projectId={project.id} />
          </div>
        ) : (
          <>
            <div className="mt-6">
              <ProfileNotice />
              <PromptComposer projectId={project.id} draft={draft} run={run} />
            </div>

            <section className="mt-14" aria-label="Generation history">
              <div className="mb-5 flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-medium tracking-tight text-ink">History</h2>
                {projectGenerations.length > 0 && (
                  <span className="text-2xs tabular-nums text-ink-ghost">
                    {projectGenerations.length} generation{projectGenerations.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              <GenerationGrid generations={projectGenerations} busy={Boolean(run)} />
            </section>
          </>
        )}
      </div>
    </div>
  )
}

interface ProjectHeaderProps {
  name: string
  glyph: string
  updatedAt: string
  generationCount: number
  onRename: (name: string) => void
}

function ProjectHeader({ name, glyph, updatedAt, generationCount, onRename }: ProjectHeaderProps): ReactNode {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => setDraft(name), [name])

  useEffect(() => {
    if (!editing) return
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [editing])

  const commit = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== name) onRename(next)
    else setDraft(name)
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="group/header flex items-start gap-4"
    >
      <span
        aria-hidden
        className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-2xl border border-edge-subtle bg-surface-1 text-base text-accent"
      >
        {glyph}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
                if (event.key === 'Escape') {
                  setDraft(name)
                  setEditing(false)
                }
              }}
              aria-label="Project name"
              className={cn(
                'w-full min-w-0 rounded-lg bg-surface-2 px-2 py-0.5',
                'font-display text-2xl font-semibold tracking-tight text-ink outline-none',
                'ring-1 ring-accent-ring'
              )}
            />
          ) : (
            <>
              <h1 className="min-w-0 truncate font-display text-2xl font-semibold tracking-tight text-ink">{name}</h1>
              <IconButton
                icon={<Pencil className="size-3.5" />}
                label="Rename project"
                size="sm"
                onClick={() => setEditing(true)}
                className="opacity-0 transition-opacity duration-200 group-hover/header:opacity-100 focus-visible:opacity-100"
              />
            </>
          )}
        </div>

        <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-faint">
          <span>
            {generationCount > 0
              ? `${generationCount} generation${generationCount === 1 ? '' : 's'}`
              : 'No generations yet'}
          </span>
          <span className="size-0.5 rounded-full bg-ink-ghost" aria-hidden />
          <span>Updated {formatRelative(updatedAt)}</span>
        </p>
      </div>

      {editing && (
        <Button variant="secondary" size="sm" iconLeft={<Check className="size-3.5" />} onMouseDown={commit}>
          Save
        </Button>
      )}
    </motion.header>
  )
}
