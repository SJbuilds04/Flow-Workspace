import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Download, Film, FolderOpen, ImageIcon, MoreHorizontal, Play, Trash2 } from 'lucide-react'
import { findFlowAspect, type Generation } from '@shared/types'
import { cn } from '@/lib/cn'
import { formatDateTime, formatDuration, formatRelative } from '@/lib/format'
import { IconButton } from '@/components/ui/IconButton'
import { MenuItem, MenuSeparator } from '@/components/ui/MenuItem'
import { Popover } from '@/components/ui/Popover'
import { Tooltip } from '@/components/ui/Tooltip'

interface GenerationCardProps {
  generation: Generation
  onDownload: () => void
  onReveal: () => void
  onDelete: () => void
  onOpen: () => void
}

export function GenerationCard({ generation, onDownload, onReveal, onDelete, onOpen }: GenerationCardProps): ReactNode {
  const [imageFailed, setImageFailed] = useState(false)
  const ratio = findFlowAspect(generation.aspectRatio)
  const failed = generation.status === 'failed' || generation.status === 'cancelled'
  const thumbnail = generation.thumbnailUrl ?? generation.outputUrl

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}
      whileHover={{ y: -3 }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl',
        'border border-edge-subtle bg-surface-1',
        'transition-colors duration-300 ease-flow hover:border-edge hover:bg-surface-2'
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={failed || !generation.outputUrl}
        aria-label={`Open generation: ${generation.prompt}`}
        className={cn('relative block w-full overflow-hidden bg-canvas-sunken', 'disabled:cursor-default')}
        style={{ aspectRatio: `${ratio.width} / ${ratio.height}` }}
      >
        {thumbnail && !imageFailed && !failed ? (
          <>
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="size-full object-cover transition-transform duration-500 ease-flow group-hover:scale-[1.03]"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </>
        ) : (
          // Every card in History is settled, so a shimmer here would read as
          // "still working" on something that has already finished.
          <div className="flex size-full flex-col items-center justify-center gap-2">
            {failed ? (
              <AlertCircle className="size-5 text-danger/70" aria-hidden />
            ) : (
              <>
                {generation.mode === 'video' ? (
                  <Film className="size-5 text-ink-ghost" aria-hidden />
                ) : (
                  <ImageIcon className="size-5 text-ink-ghost" aria-hidden />
                )}
                <span className="text-2xs text-ink-ghost">Ready — open to play</span>
              </>
            )}
          </div>
        )}

        {generation.mode === 'video' && !failed && (
          <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 backdrop-blur-sm">
            <Play className="size-2.5 fill-white text-white" aria-hidden />
            <span className="text-2xs font-medium text-white">Video</span>
          </span>
        )}

        <span className="absolute right-2.5 top-2.5 rounded-lg bg-black/50 px-1.5 py-0.5 text-2xs font-medium tabular-nums text-white/85 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
          {ratio.label}
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted transition-colors duration-300 group-hover:text-ink">
          {generation.prompt}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Tooltip label={formatDateTime(generation.createdAt)} side="bottom">
            <span className="min-w-0 truncate text-2xs text-ink-ghost">
              {formatRelative(generation.createdAt)}
              {generation.durationMs ? ` · ${formatDuration(generation.durationMs)}` : ''}
            </span>
          </Tooltip>

          <div className="flex shrink-0 items-center gap-0.5">
            {!failed && generation.outputPath && (
              <IconButton
                icon={<Download className="size-3.5" />}
                label="Download"
                size="sm"
                onClick={onDownload}
                className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
              />
            )}

            <Popover
              align="end"
              className="w-44"
              trigger={
                <IconButton
                  icon={<MoreHorizontal className="size-3.5" />}
                  label="More actions"
                  size="sm"
                  tooltip={false}
                  className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
                />
              }
            >
              {({ close }) => (
                <>
                  {!failed && generation.outputPath && (
                    <>
                      <MenuItem
                        icon={<Download className="size-3.5" />}
                        title="Download"
                        onClick={() => {
                          close()
                          onDownload()
                        }}
                      />
                      <MenuItem
                        icon={<FolderOpen className="size-3.5" />}
                        title="Show in folder"
                        onClick={() => {
                          close()
                          onReveal()
                        }}
                      />
                      <MenuSeparator />
                    </>
                  )}
                  <MenuItem
                    icon={<Trash2 className="size-3.5" />}
                    title="Delete"
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
        </div>

        {failed && generation.error && (
          <p className="rounded-lg bg-danger-soft px-2 py-1.5 text-2xs leading-relaxed text-danger">
            {generation.error}
          </p>
        )}
      </div>
    </motion.article>
  )
}
