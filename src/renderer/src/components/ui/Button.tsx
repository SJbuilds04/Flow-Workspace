import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-canvas font-medium shadow-float hover:bg-white disabled:bg-ink/40 disabled:text-canvas/60',
  secondary: 'glass text-ink hover:bg-surface-2 hover:border-edge active:bg-surface-3 disabled:text-ink-ghost',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-2 disabled:text-ink-ghost',
  danger: 'bg-danger-soft text-danger hover:bg-danger/20 border border-danger/25 disabled:opacity-50'
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-base gap-2 rounded-2xl'
}

export interface ButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof HTMLMotionProps<'button'>>,
    Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, iconLeft, iconRight, className, children, disabled, ...props },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={isDisabled}
      whileHover={isDisabled ? undefined : { y: -1 }}
      whileTap={isDisabled ? undefined : { scale: 0.98, y: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap',
        'transition-colors duration-200 ease-flow',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : iconLeft}
      {children}
      {iconRight}
    </motion.button>
  )
})
