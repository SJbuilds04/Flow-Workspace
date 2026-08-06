import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ImageIcon } from 'lucide-react'
import type { Generation } from '@shared/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { useWorkspaceStore } from '@/store/workspace-store'
import { GenerationCard } from './GenerationCard'
import { GenerationViewer } from './GenerationViewer'

interface GenerationGridProps {
  generations: Generation[]
  busy: boolean
}

export function GenerationGrid({ generations, busy }: GenerationGridProps): ReactNode {
  const [openId, setOpenId] = useState<string | null>(null)
  const downloadGeneration = useWorkspaceStore((state) => state.downloadGeneration)
  const revealGeneration = useWorkspaceStore((state) => state.revealGeneration)
  const deleteGeneration = useWorkspaceStore((state) => state.deleteGeneration)

  const openGeneration = useMemo(
    () => generations.find((generation) => generation.id === openId) ?? null,
    [generations, openId]
  )

  if (generations.length === 0 && !busy) {
    return (
      <EmptyState
        icon={<ImageIcon className="size-5" />}
        title="Nothing generated yet"
        description="Write a prompt above and hit Generate. Everything you make lands here, ready to download."
      />
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <AnimatePresence initial={false}>
          {busy && <PendingCard key="pending" />}

          {generations.map((generation) => (
            <GenerationCard
              key={generation.id}
              generation={generation}
              onOpen={() => setOpenId(generation.id)}
              onDownload={() => void downloadGeneration(generation.id)}
              onReveal={() => void revealGeneration(generation.id)}
              onDelete={() => void deleteGeneration(generation.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      <GenerationViewer
        generation={openGeneration}
        onClose={() => setOpenId(null)}
        onDownload={(id) => void downloadGeneration(id)}
        onReveal={(id) => void revealGeneration(id)}
      />
    </>
  )
}

/** Placeholder that occupies the slot the running generation will fill. */
function PendingCard(): ReactNode {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}
      className="flex flex-col overflow-hidden rounded-2xl border border-edge-subtle bg-surface-1"
    >
      <div className="skeleton aspect-[16/9] w-full" />
      <div className="space-y-2 p-3.5">
        <div className="skeleton h-2.5 w-4/5 rounded-full" />
        <div className="skeleton h-2.5 w-2/5 rounded-full" />
      </div>
    </motion.div>
  )
}
