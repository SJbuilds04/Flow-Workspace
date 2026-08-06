import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Boxes, ChevronDown, Frame, ImageIcon, RectangleHorizontal, Smartphone, Video } from 'lucide-react'
import {
  OUTPUT_COUNTS,
  VIDEO_DURATIONS,
  estimateCredits,
  type GenerationParams,
  type OutputCount,
  type VideoDuration
} from '@shared/types'
import { cn } from '@/lib/cn'
import { MenuItem, MenuLabel } from '@/components/ui/MenuItem'
import { Popover } from '@/components/ui/Popover'
import { SegmentedControl } from './SegmentedControl'

interface FlowControlsProps {
  params: GenerationParams
  models: string[]
  disabled?: boolean
  onChange: (patch: Partial<GenerationParams>) => void
}

/**
 * Mirrors Flow's own generation panel: output type, reference mode, ratio,
 * model, duration, output count, and the credit quote. The layout follows
 * Flow's grouping deliberately — the automation drives the same controls, so
 * keeping them aligned makes a mismatch obvious.
 */
export function FlowControls({ params, models, disabled = false, onChange }: FlowControlsProps): ReactNode {
  const isVideo = params.mode === 'video'
  const credits = estimateCredits(params)

  return (
    <div className="space-y-2.5 border-t border-edge-subtle px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Output type"
          value={params.mode}
          disabled={disabled}
          onChange={(mode) => onChange({ mode })}
          options={[
            { value: 'image', label: 'Image', icon: <ImageIcon className="size-3.5" aria-hidden /> },
            { value: 'video', label: 'Video', icon: <Video className="size-3.5" aria-hidden /> }
          ]}
        />

        <AnimatePresence initial={false}>
          {isVideo && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <SegmentedControl
                label="Reference mode"
                value={params.inputMode}
                disabled={disabled}
                onChange={(inputMode) => onChange({ inputMode })}
                options={[
                  { value: 'frames', label: 'Frames', icon: <Frame className="size-3.5" aria-hidden /> },
                  { value: 'ingredients', label: 'Ingredients', icon: <Boxes className="size-3.5" aria-hidden /> }
                ]}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <SegmentedControl
          label="Aspect ratio"
          value={params.aspectRatio}
          disabled={disabled}
          onChange={(aspectRatio) => onChange({ aspectRatio })}
          options={[
            { value: '9:16', label: '9:16', icon: <Smartphone className="size-3.5" aria-hidden /> },
            { value: '16:9', label: '16:9', icon: <RectangleHorizontal className="size-3.5" aria-hidden /> }
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Popover
          align="start"
          side="top"
          className="w-[220px]"
          trigger={
            <button
              type="button"
              disabled={disabled}
              aria-label={`Model: ${params.model}`}
              className={cn(
                'group flex h-8 min-w-[148px] items-center justify-between gap-2 rounded-xl px-3',
                'border border-edge-subtle bg-surface-1 text-xs font-medium text-ink',
                'transition-colors duration-200 ease-flow hover:border-edge hover:bg-surface-2',
                'disabled:cursor-not-allowed disabled:opacity-40'
              )}
            >
              <span className="truncate">{params.model}</span>
              <ChevronDown
                className="size-3 shrink-0 text-ink-ghost transition-transform duration-200 group-aria-expanded:rotate-180"
                aria-hidden
              />
            </button>
          }
        >
          {({ close }) => (
            <>
              <MenuLabel>Model</MenuLabel>
              {models.map((model) => (
                <MenuItem
                  key={model}
                  title={model}
                  selected={model === params.model}
                  onClick={() => {
                    onChange({ model })
                    close()
                  }}
                />
              ))}
            </>
          )}
        </Popover>

        <AnimatePresence initial={false}>
          {isVideo && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <SegmentedControl
                label="Duration"
                value={params.durationSeconds}
                disabled={disabled}
                onChange={(durationSeconds) => onChange({ durationSeconds: durationSeconds as VideoDuration })}
                options={VIDEO_DURATIONS.map((seconds) => ({ value: seconds, label: `${seconds}s` }))}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <SegmentedControl
          label="Outputs"
          value={params.outputCount}
          disabled={disabled}
          onChange={(outputCount) => onChange({ outputCount: outputCount as OutputCount })}
          options={OUTPUT_COUNTS.map((count) => ({ value: count, label: `x${count}` }))}
        />

        <p className="ml-auto shrink-0 text-2xs text-ink-ghost">
          Generating will use <span className="tabular-nums text-ink-faint">≈{credits}</span> credits
        </p>
      </div>
    </div>
  )
}
