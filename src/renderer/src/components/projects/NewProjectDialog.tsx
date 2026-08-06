import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TextField } from '@/components/ui/TextField'

const GLYPHS = ['◆', '◈', '●', '▲', '✦', '❋', '⬡', '✳']

interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, glyph: string) => Promise<void> | void
}

export function NewProjectDialog({ open, onClose, onCreate }: NewProjectDialogProps): ReactNode {
  const [name, setName] = useState('')
  const [glyph, setGlyph] = useState<string>(GLYPHS[0] as string)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setGlyph(GLYPHS[Math.floor(Math.random() * GLYPHS.length)] as string)
    setSubmitting(false)
  }, [open])

  const submit = async (): Promise<void> => {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    await onCreate(name.trim(), glyph)
    setSubmitting(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      description="Projects keep prompts, references and generations together."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={submitting} disabled={!name.trim()}>
            Create project
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="project-name" className="text-xs font-medium text-ink-muted">
            Name
          </label>
          <TextField
            id="project-name"
            value={name}
            placeholder="Spring campaign"
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
          />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-ink-muted">Glyph</span>
          <div className="flex flex-wrap gap-1.5">
            {GLYPHS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Use glyph ${option}`}
                aria-pressed={glyph === option}
                onClick={() => setGlyph(option)}
                className={cn(
                  'flex size-9 items-center justify-center rounded-xl text-sm',
                  'border transition-all duration-200 ease-flow',
                  glyph === option
                    ? 'border-accent/50 bg-accent-soft text-accent'
                    : 'border-edge-subtle bg-surface-1 text-ink-faint hover:border-edge hover:text-ink-muted'
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
