import { forwardRef, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/cn'
import { Tooltip } from './Tooltip'

export interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  icon: ReactNode
  /** Required: icon-only controls need an accessible name. */
  label: string
  tooltip?: boolean
  size?: 'sm' | 'md'
  tone?: 'default' | 'danger'
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, tooltip = true, size = 'md', tone = 'default', active = false, className, disabled, ...props },
  ref
) {
  const button = (
    <motion.button
      ref={ref}
      type="button"
      aria-label={label}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.06 }}
      whileTap={disabled ? undefined : { scale: 0.93 }}
      transition={{ type: 'spring', stiffness: 560, damping: 30 }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg',
        'transition-colors duration-200 ease-flow',
        'disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'size-7' : 'size-8',
        tone === 'danger'
          ? 'text-ink-faint hover:bg-danger-soft hover:text-danger'
          : 'text-ink-faint hover:bg-surface-2 hover:text-ink',
        active && 'bg-surface-2 text-ink',
        className
      )}
      {...props}
    >
      {icon}
    </motion.button>
  )

  if (!tooltip) return button
  return <Tooltip label={label}>{button}</Tooltip>
})
