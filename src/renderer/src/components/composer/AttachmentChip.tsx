import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Film, X } from 'lucide-react'
import type { AttachmentRef } from '@shared/types'
import { formatBytes, truncate } from '@/lib/format'
import { IconButton } from '@/components/ui/IconButton'

interface AttachmentChipProps {
  attachment: AttachmentRef
  onRemove: () => void
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps): ReactNode {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.94, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 4 }}
      transition={{ type: 'spring', stiffness: 520, damping: 36 }}
      className="group flex items-center gap-2.5 rounded-xl border border-edge-subtle bg-surface-1 py-1.5 pl-1.5 pr-1"
    >
      <div className="size-8 shrink-0 overflow-hidden rounded-lg bg-canvas-sunken">
        {attachment.kind === 'image' ? (
          <img src={attachment.url} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-ink-faint">
            <Film className="size-3.5" aria-hidden />
          </div>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-2xs font-medium text-ink">{truncate(attachment.fileName, 26)}</p>
        <p className="text-2xs text-ink-ghost">
          {attachment.kind === 'image' ? 'Reference image' : 'Reference video'} · {formatBytes(attachment.sizeBytes)}
        </p>
      </div>

      <IconButton
        icon={<X className="size-3" />}
        label="Remove attachment"
        size="sm"
        tooltip={false}
        onClick={onRemove}
      />
    </motion.div>
  )
}
