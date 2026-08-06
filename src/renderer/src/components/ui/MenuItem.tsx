import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  trailing?: ReactNode
  selected?: boolean
  tone?: 'default' | 'danger'
}

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { icon, title, description, trailing, selected = false, tone = 'default', className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      data-menu-item=""
      data-selected={selected || undefined}
      // Without this the computed name folds in the description, so two
      // unrelated rows can end up sharing a prefix. The description stays
      // visible; only the name is pinned to the title.
      aria-label={typeof title === 'string' ? title : undefined}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left',
        'transition-colors duration-150 ease-flow',
        'hover:bg-surface-2 focus-visible:bg-surface-2',
        'disabled:pointer-events-none disabled:opacity-40',
        tone === 'danger' ? 'text-danger hover:bg-danger-soft' : 'text-ink',
        className
      )}
      {...props}
    >
      {icon && (
        <span className="flex size-4 shrink-0 items-center justify-center text-ink-faint group-hover:text-ink-muted">
          {icon}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm leading-tight">{title}</span>
        {description && <span className="mt-0.5 block truncate text-2xs text-ink-faint">{description}</span>}
      </span>

      {trailing}
      {selected && <Check className="size-3.5 shrink-0 text-accent" aria-hidden />}
    </button>
  )
})

export function MenuSeparator(): ReactNode {
  return <div role="separator" className="my-1 h-px bg-edge-subtle" />
}

export function MenuLabel({ children }: { children: ReactNode }): ReactNode {
  return <div className="px-2.5 pb-1 pt-2 text-2xs font-medium uppercase tracking-wider text-ink-ghost">{children}</div>
}
