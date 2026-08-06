import type { ReactNode } from 'react'
import { ChevronDown, Crop } from 'lucide-react'
import { ASPECT_RATIOS, findAspectRatio, type AspectRatioId } from '@shared/types'
import { cn } from '@/lib/cn'
import { MenuItem, MenuLabel } from '@/components/ui/MenuItem'
import { Popover } from '@/components/ui/Popover'

interface AspectRatioSelectorProps {
  value: AspectRatioId
  onChange: (value: AspectRatioId) => void
  disabled?: boolean
}

export function AspectRatioSelector({ value, onChange, disabled }: AspectRatioSelectorProps): ReactNode {
  const active = findAspectRatio(value)

  return (
    <Popover
      align="start"
      side="top"
      className="w-[232px]"
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label={`Aspect ratio: ${active.label}`}
          className={cn(
            'group flex h-8 items-center gap-2 rounded-xl px-2.5',
            'text-xs text-ink-muted transition-all duration-200 ease-flow',
            'hover:bg-surface-2 hover:text-ink',
            'disabled:cursor-not-allowed disabled:opacity-40'
          )}
        >
          <Crop className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
          <span className="font-medium tabular-nums">{active.label}</span>
          <ChevronDown
            className="size-3 text-ink-ghost transition-transform duration-200 group-aria-expanded:rotate-180"
            aria-hidden
          />
        </button>
      }
    >
      {({ close }) => (
        <>
          <MenuLabel>Aspect ratio</MenuLabel>
          {ASPECT_RATIOS.map((ratio) => (
            <MenuItem
              key={ratio.id}
              icon={<RatioGlyph width={ratio.width} height={ratio.height} />}
              title={ratio.label}
              description={`${ratio.description} · ${ratio.width}×${ratio.height}`}
              selected={ratio.id === value}
              onClick={() => {
                onChange(ratio.id)
                close()
              }}
            />
          ))}
        </>
      )}
    </Popover>
  )
}

/** Miniature proportional frame so the list reads at a glance. */
function RatioGlyph({ width, height }: { width: number; height: number }): ReactNode {
  const scale = 14 / Math.max(width, height)
  return (
    <span
      aria-hidden
      className="block rounded-[3px] border border-current opacity-70"
      style={{ width: Math.max(4, width * scale), height: Math.max(4, height * scale) }}
    />
  )
}
