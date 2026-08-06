import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}
    >
      <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-edge-subtle bg-surface-1 text-ink-faint">
        {icon}
      </div>
      <h3 className="text-balance text-base font-medium tracking-tight text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-balance text-sm leading-relaxed text-ink-faint">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  )
}
