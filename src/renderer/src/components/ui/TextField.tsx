import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  iconLeft?: ReactNode
  iconRight?: ReactNode
  containerClassName?: string
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { iconLeft, iconRight, className, containerClassName, ...props },
  ref
) {
  return (
    <div
      className={cn(
        'group flex h-9 items-center gap-2 rounded-xl px-3',
        'border border-edge-subtle bg-surface-1',
        'transition-colors duration-200 ease-flow',
        'focus-within:border-edge-strong focus-within:bg-surface-2',
        containerClassName
      )}
    >
      {iconLeft && (
        <span className="shrink-0 text-ink-ghost transition-colors group-focus-within:text-ink-muted">{iconLeft}</span>
      )}
      <input
        ref={ref}
        className={cn('min-w-0 flex-1 text-sm text-ink outline-none placeholder:text-ink-ghost', className)}
        {...props}
      />
      {iconRight}
    </div>
  )
})
