import { useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Film, ImagePlus, Square } from 'lucide-react'
import { DEFAULT_FLOW_MODELS } from '@shared/types'
import { cn } from '@/lib/cn'
import { useAutoResize } from '@/hooks/useAutoResize'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { useWorkspaceStore, type ActiveRun, type Draft } from '@/store/workspace-store'
import { AttachmentChip } from './AttachmentChip'
import { FlowControls } from './FlowControls'

interface PromptComposerProps {
  projectId: string
  draft: Draft
  run: ActiveRun | null
}

export function PromptComposer({ projectId, draft, run }: PromptComposerProps): ReactNode {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const patchDraft = useWorkspaceStore((state) => state.patchDraft)
  const pickAttachment = useWorkspaceStore((state) => state.pickAttachment)
  const clearAttachment = useWorkspaceStore((state) => state.clearAttachment)
  const generate = useWorkspaceStore((state) => state.generate)
  const cancelRun = useWorkspaceStore((state) => state.cancelRun)
  const models = useWorkspaceStore((state) => state.settings?.flowModels ?? [...DEFAULT_FLOW_MODELS])

  useAutoResize(textareaRef, draft.prompt)

  const busy = Boolean(run)
  const canGenerate = draft.prompt.trim().length > 0 && !busy
  const hasAttachments = Boolean(draft.referenceImage || draft.referenceVideo)

  const submit = (): void => {
    if (!canGenerate) return
    void generate(projectId)
  }

  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      className={cn(
        'relative overflow-hidden rounded-3xl',
        'glass-raised hairline-top',
        'transition-shadow duration-300 ease-flow',
        'focus-within:shadow-[0_0_0_1px_rgba(139,123,255,0.28),0_28px_70px_-30px_rgba(0,0,0,0.95)]'
      )}
    >
      <AnimatePresence initial={false}>
        {hasAttachments && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-2 px-4 pt-4">
              {draft.referenceImage && (
                <AttachmentChip
                  attachment={draft.referenceImage}
                  onRemove={() => void clearAttachment(projectId, 'image')}
                />
              )}
              {draft.referenceVideo && (
                <AttachmentChip
                  attachment={draft.referenceVideo}
                  onRemove={() => void clearAttachment(projectId, 'video')}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <textarea
        ref={textareaRef}
        value={draft.prompt}
        disabled={busy}
        rows={1}
        aria-label="Prompt"
        placeholder={
          draft.mode === 'video'
            ? `Describe the ${draft.durationSeconds}s shot you want…`
            : 'Describe the image you want…'
        }
        onChange={(event) => patchDraft(projectId, { prompt: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
        className={cn(
          'block max-h-[320px] w-full resize-none bg-transparent',
          'px-5 pb-3 pt-5 text-base leading-relaxed text-ink',
          'outline-none placeholder:text-ink-ghost',
          'disabled:opacity-60'
        )}
      />

      <div className="flex items-end justify-between gap-3 px-3 pb-3 pt-1">
        <div className="flex min-w-0 flex-wrap items-center gap-0.5">
          <Tooltip label={draft.referenceImage ? 'Replace reference image' : 'Add reference image'}>
            <button
              type="button"
              disabled={busy}
              aria-label="Add reference image"
              onClick={() => void pickAttachment(projectId, 'image')}
              className={cn(
                'flex size-8 items-center justify-center rounded-xl transition-all duration-200 ease-flow',
                'hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
                draft.referenceImage ? 'text-accent' : 'text-ink-muted'
              )}
            >
              <ImagePlus className="size-4 shrink-0" aria-hidden />
            </button>
          </Tooltip>

          <Tooltip label={draft.referenceVideo ? 'Replace reference video' : 'Add reference video'}>
            <button
              type="button"
              disabled={busy}
              aria-label="Add reference video"
              onClick={() => void pickAttachment(projectId, 'video')}
              className={cn(
                'flex size-8 items-center justify-center rounded-xl transition-all duration-200 ease-flow',
                'hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
                draft.referenceVideo ? 'text-accent' : 'text-ink-muted'
              )}
            >
              <Film className="size-4 shrink-0" aria-hidden />
            </button>
          </Tooltip>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <AnimatePresence>
            {!busy && draft.prompt.trim().length > 0 && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="hidden text-2xs text-ink-ghost sm:block"
              >
                Enter to generate
              </motion.span>
            )}
          </AnimatePresence>

          {busy ? (
            <Button
              variant="secondary"
              size="md"
              iconLeft={<Square className="size-3 fill-current" aria-hidden />}
              onClick={() => void cancelRun()}
            >
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              disabled={!canGenerate}
              onClick={submit}
              iconRight={<ArrowUp className="size-4 shrink-0" aria-hidden />}
            >
              Generate
            </Button>
          )}
        </div>
      </div>

      <FlowControls params={draft} models={models} disabled={busy} onChange={(patch) => patchDraft(projectId, patch)} />

      <AnimatePresence>
        {run && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-edge-subtle"
          >
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="relative flex size-1.5 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
              </span>
              <p className="min-w-0 flex-1 truncate text-xs text-ink-muted">{run.stage}</p>
              <span className="shrink-0 text-2xs tabular-nums text-ink-ghost">{Math.round(run.progress * 100)}%</span>
            </div>

            <div className="h-0.5 w-full bg-surface-2">
              <motion.div
                className="h-full bg-gradient-to-r from-accent to-[#5aa9ff]"
                initial={{ width: '0%' }}
                animate={{ width: `${Math.max(3, run.progress * 100)}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
