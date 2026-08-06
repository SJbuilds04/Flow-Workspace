import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface LogoProps {
  collapsed?: boolean
  className?: string
}

/**
 * The mark is drawn rather than imported so it stays crisp at any size and
 * needs no asset pipeline.
 */
export function Logo({ collapsed = false, className }: LogoProps): ReactNode {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <motion.div
        whileHover={{ rotate: 8, scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className="relative flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-accent/90 to-[#5aa9ff]/80 shadow-[0_4px_16px_-4px_rgba(139,123,255,0.6)]"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden>
          <path d="M5 8.5c3.6-4 6.4 4 11-.5" stroke="white" strokeWidth="2.1" strokeLinecap="round" opacity="0.95" />
          <path d="M5 15.5c3.6-4 6.4 4 11-.5" stroke="white" strokeWidth="2.1" strokeLinecap="round" opacity="0.55" />
        </svg>
      </motion.div>

      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold tracking-tight text-ink">Flow</p>
          <p className="-mt-0.5 truncate text-2xs tracking-wide text-ink-ghost">Workspace</p>
        </div>
      )}
    </div>
  )
}
