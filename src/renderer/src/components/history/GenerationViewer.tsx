import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, FolderOpen, X } from 'lucide-react'
import { findAspectRatio, findModel, type Generation } from '@shared/types'
import { formatDateTime, formatDuration } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'

interface GenerationViewerProps {
  generation: Generation | null
  onClose: () => void
  onDownload: (id: string) => void
  onReveal: (id: string) => void
}

/** Full-bleed preview for a finished generation. */
export function GenerationViewer({ generation, onClose, onDownload, onReveal }: GenerationViewerProps): ReactNode {
  useEffect(() => {
    if (!generation) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [generation, onClose])

  const model = generation ? findModel(generation.modelId) : null
  const ratio = generation ? findAspectRatio(generation.aspectRatio) : null

  return createPortal(
    <AnimatePresence>
      {generation && generation.outputUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Generation preview"
          className="fixed inset-0 z-[960] flex flex-col"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex items-center justify-between gap-4 px-6 py-4"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{model?.name}</p>
              <p className="truncate text-2xs text-white/45">
                {ratio?.label} · {formatDateTime(generation.createdAt)}
                {generation.durationMs ? ` · ${formatDuration(generation.durationMs)}` : ''}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<FolderOpen className="size-3.5" />}
                onClick={() => onReveal(generation.id)}
              >
                Show in folder
              </Button>
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Download className="size-3.5" />}
                onClick={() => onDownload(generation.id)}
              >
                Download
              </Button>
              <IconButton icon={<X className="size-4" />} label="Close preview" tooltip={false} onClick={onClose} />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6 pb-4"
          >
            {model?.kind === 'video' ? (
              <video
                key={generation.outputUrl}
                src={generation.outputUrl}
                poster={generation.thumbnailUrl}
                controls
                autoPlay
                loop
                className="max-h-full max-w-full rounded-2xl shadow-pop"
              />
            ) : (
              <img
                src={generation.outputUrl}
                alt={generation.prompt}
                className="max-h-full max-w-full rounded-2xl object-contain shadow-pop"
              />
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-6"
          >
            <p className="max-h-24 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white/75">
              {generation.prompt}
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
