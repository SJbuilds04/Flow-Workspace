import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FolderPlus, Search, Settings, SquareStack, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { TextField } from '@/components/ui/TextField'
import { NewProjectDialog } from '@/components/projects/NewProjectDialog'
import { ProjectRow } from '@/components/projects/ProjectRow'
import { Logo } from './Logo'
import { useWorkspaceStore } from '@/store/workspace-store'

export function Sidebar(): ReactNode {
  const projects = useWorkspaceStore((state) => state.projects)
  const generations = useWorkspaceStore((state) => state.generations)
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId)
  const view = useWorkspaceStore((state) => state.view)
  const search = useWorkspaceStore((state) => state.search)

  const setSearch = useWorkspaceStore((state) => state.setSearch)
  const selectProject = useWorkspaceStore((state) => state.selectProject)
  const setView = useWorkspaceStore((state) => state.setView)
  const createProject = useWorkspaceStore((state) => state.createProject)
  const renameProject = useWorkspaceStore((state) => state.renameProject)
  const deleteProject = useWorkspaceStore((state) => state.deleteProject)

  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const generation of generations) {
      map.set(generation.projectId, (map.get(generation.projectId) ?? 0) + 1)
    }
    return map
  }, [generations])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return projects
    return projects.filter((project) => project.name.toLowerCase().includes(query))
  }, [projects, search])

  const deleteTarget = projects.find((project) => project.id === pendingDelete) ?? null

  return (
    <aside
      className={cn(
        'relative z-30 flex h-full w-[264px] shrink-0 flex-col',
        'border-r border-edge-subtle/70 bg-canvas-sunken/50 backdrop-blur-glass'
      )}
      aria-label="Workspace navigation"
    >
      <div className="px-4 pb-3 pt-5">
        <Logo />
      </div>

      <div className="px-3 pb-3">
        <Button
          variant="secondary"
          size="md"
          className="w-full justify-start"
          iconLeft={<FolderPlus className="size-4 shrink-0 text-ink-faint" />}
          onClick={() => setCreating(true)}
        >
          New project
        </Button>
      </div>

      <div className="px-3 pb-2">
        <TextField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search projects"
          aria-label="Search projects"
          iconLeft={<Search className="size-3.5" />}
          iconRight={
            search ? (
              <IconButton
                icon={<X className="size-3" />}
                label="Clear search"
                size="sm"
                tooltip={false}
                onClick={() => setSearch('')}
              />
            ) : undefined
          }
        />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Projects">
        <p className="px-2.5 pb-1.5 pt-3 text-2xs font-medium uppercase tracking-wider text-ink-ghost">Projects</p>

        <div className="flex flex-col gap-0.5">
          <AnimatePresence initial={false}>
            {filtered.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                active={view === 'project' && project.id === activeProjectId}
                generationCount={counts.get(project.id) ?? 0}
                onSelect={() => selectProject(project.id)}
                onRename={(name) => void renameProject(project.id, name)}
                onDelete={() => setPendingDelete(project.id)}
              />
            ))}
          </AnimatePresence>
        </div>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-2 px-3 py-10 text-center"
          >
            <SquareStack className="size-5 text-ink-ghost" aria-hidden />
            <p className="text-xs text-ink-faint">
              {search ? `No projects match “${search.trim()}”` : 'No projects yet'}
            </p>
          </motion.div>
        )}
      </nav>

      <div className="border-t border-edge-subtle/70 p-3">
        <button
          type="button"
          onClick={() => setView('settings')}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm',
            'transition-colors duration-200 ease-flow',
            view === 'settings'
              ? 'border border-edge-subtle bg-surface-2 text-ink'
              : 'border border-transparent text-ink-muted hover:bg-surface-1 hover:text-ink'
          )}
        >
          <Settings className="size-4 shrink-0 text-ink-faint" aria-hidden />
          Settings
        </button>
      </div>

      <NewProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={async (name, glyph) => {
          await createProject(name, glyph)
        }}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setPendingDelete(null)}
        title={`Delete “${deleteTarget?.name ?? ''}”?`}
        description="This removes the project and every generation inside it, including the files on disk. It cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingDelete) void deleteProject(pendingDelete)
                setPendingDelete(null)
              }}
            >
              Delete project
            </Button>
          </>
        }
      />
    </aside>
  )
}
