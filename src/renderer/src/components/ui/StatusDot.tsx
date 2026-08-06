import type { ReactNode } from 'react'
import type { AccountTone, ProfileState } from '@shared/types'
import { cn } from '@/lib/cn'

const TONE_COLORS: Record<AccountTone, string> = {
  green: 'bg-[#3ecf8e]',
  purple: 'bg-[#a78bfa]',
  blue: 'bg-[#5aa9ff]'
}

const TONE_GLOW: Record<AccountTone, string> = {
  green: 'shadow-[0_0_10px_rgba(62,207,142,0.55)]',
  purple: 'shadow-[0_0_10px_rgba(167,139,250,0.55)]',
  blue: 'shadow-[0_0_10px_rgba(90,169,255,0.55)]'
}

interface StatusDotProps {
  tone: AccountTone
  state?: ProfileState
  size?: 'sm' | 'md'
  className?: string
}

/**
 * The account colour dot. Profile state is expressed through the dot's own
 * treatment — dimmed when idle, pulsing while launching, ringed when
 * unavailable — so the account list stays a single column of glyphs.
 */
export function StatusDot({ tone, state = 'idle', size = 'md', className }: StatusDotProps): ReactNode {
  const dimension = size === 'sm' ? 'size-1.5' : 'size-2'

  if (state === 'unavailable') {
    return (
      <span
        className={cn(
          'relative inline-flex shrink-0 rounded-full ring-1 ring-danger/60',
          dimension,
          'bg-danger/40',
          className
        )}
      />
    )
  }

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 rounded-full transition-all duration-300 ease-flow',
        dimension,
        TONE_COLORS[tone],
        state === 'ready' ? TONE_GLOW[tone] : 'opacity-55',
        state === 'launching' && 'animate-pulse opacity-90',
        className
      )}
    />
  )
}
