import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onCheckedChange, label, disabled, className }: SwitchProps): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-0.5',
        'transition-colors duration-300 ease-flow',
        'disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-accent/85' : 'bg-surface-3',
        className
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 620, damping: 38 }}
        className={cn('size-[18px] rounded-full bg-white shadow-float', checked ? 'ml-auto' : 'ml-0')}
      />
    </button>
  )
}
