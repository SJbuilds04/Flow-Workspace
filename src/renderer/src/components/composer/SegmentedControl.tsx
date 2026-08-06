import { useId, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export interface SegmentOption<T extends string | number> {
  value: T
  label: string
  icon?: ReactNode
}

interface SegmentedControlProps<T extends string | number> {
  value: T
  options: readonly SegmentOption<T>[]
  onChange: (value: T) => void
  /** Accessible name for the whole group. */
  label: string
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * The pill-group Flow uses for every discrete choice — output type, ratio,
 * duration, count. The selected background is a shared layout element so it
 * slides between options rather than blinking.
 */
export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled = false,
  size = 'md',
  className
}: SegmentedControlProps<T>): ReactNode {
  const groupId = useId()

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-xl border border-edge-subtle bg-surface-1 p-0.5',
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex items-center justify-center gap-1.5 rounded-[10px] font-medium',
              'transition-colors duration-200 ease-flow',
              'disabled:cursor-not-allowed disabled:opacity-40',
              size === 'sm' ? 'h-7 px-2.5 text-2xs' : 'h-8 px-3 text-xs',
              selected ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
            )}
          >
            {selected && (
              <motion.span
                layoutId={`segment-${groupId}`}
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                className="absolute inset-0 rounded-[10px] border border-edge bg-surface-3"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {option.icon}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
