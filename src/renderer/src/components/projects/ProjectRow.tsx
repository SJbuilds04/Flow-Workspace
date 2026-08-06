import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { Project } from '@shared/types'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/format'
import { IconButton } from '@/components/ui/IconButton'
import { MenuItem, MenuSeparator } from '@/components/ui/MenuItem'
import { Popover } from '@/components/ui/Popover'

interface ProjectRowProps {
  project: Project
  active: boolean
  generationCount: number
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

export function ProjectRow({
  project,
  active,
  generationCount,
  onSelect,
  onRename,
  onDelete
}: ProjectRowProps): ReactNode {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(project.name)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!editing) return
    setDraft(project.name)
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [editing, project.name])

  const commit = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== project.name) onRename(next)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -6, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="group relative"
    >
      {active && (
        <motion.span
          layoutId="project-active"
          transition={{ type: 'spring', stiffness: 520, damping: 42 }}
          className="absolute inset-0 rounded-xl border border-edge-subtle bg-surface-2"
        />
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => !editing && onSelect()}
        onKeyDown={(event) => {
          if (editing) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect()
          }
        }}
        className={cn(
          'relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2',
          'transition-colors duration-200 ease-flow',
          !active && 'hover:bg-surface-1'
        )}
      >
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-lg text-xs',
            'transition-colors duration-200',
            active ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-faint group-hover:text-ink-muted'
          )}
          aria-hidden
        >
          {project.glyph}
        </span>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
                if (event.key === 'Escape') setEditing(false)
              }}
              onClick={(event) => event.stopPropagation()}
              className="w-full rounded-md bg-surface-3 px-1.5 py-0.5 text-sm text-ink outline-none ring-1 ring-accent-ring"
              aria-label="Project name"
            />
          ) : (
            <>
              <p className={cn('truncate text-sm leading-tight', active ? 'text-ink' : 'text-ink-muted')}>
                {project.name}
              </p>
              <p className="mt-0.5 truncate text-2xs text-ink-ghost">
                {generationCount > 0
                  ? `${generationCount} generation${generationCount === 1 ? '' : 's'}`
                  : formatRelative(project.updatedAt)}
              </p>
            </>
          )}
        </div>

        {!editing && (
          <div
            className={cn(
              'shrink-0 opacity-0 transition-opacity duration-200',
              'group-hover:opacity-100 group-focus-within:opacity-100'
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <Popover
              align="start"
              className="w-44"
              trigger={
                <IconButton
                  icon={<MoreHorizontal className="size-4" />}
                  label="Project options"
                  size="sm"
                  tooltip={false}
                />
              }
            >
              {({ close }) => (
                <>
                  <MenuItem
                    icon={<Pencil className="size-3.5" />}
                    title="Rename"
                    onClick={() => {
                      close()
                      setEditing(true)
                    }}
                  />
                  <MenuSeparator />
                  <MenuItem
                    icon={<Trash2 className="size-3.5" />}
                    title="Delete project"
                    tone="danger"
                    onClick={() => {
                      close()
                      onDelete()
                    }}
                  />
                </>
              )}
            </Popover>
          </div>
        )}
      </div>
    </motion.div>
  )
}
