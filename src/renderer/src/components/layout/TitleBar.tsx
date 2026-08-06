import type { ReactNode } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useWorkspaceStore } from '@/store/workspace-store'
import { AccountSelector } from '@/components/account/AccountSelector'

/**
 * Frameless-window chrome. The whole strip is a drag region except for the
 * interactive islands, which opt out via `.no-drag`.
 */
export function TitleBar(): ReactNode {
  const platform = useWorkspaceStore((state) => state.platform)
  const isMac = platform === 'darwin'

  return (
    <header
      className={cn(
        'drag-region relative z-40 flex h-[var(--titlebar-height)] shrink-0 items-center justify-between',
        'border-b border-edge-subtle/70 bg-canvas/60 backdrop-blur-glass',
        isMac ? 'pl-[86px] pr-3' : 'pl-4 pr-3'
      )}
    >
      <div className="flex items-center gap-2 text-2xs font-medium tracking-wide text-ink-ghost">
        <span>Flow Workspace</span>
      </div>

      <div className="no-drag flex items-center gap-1.5">
        <AccountSelector />
        {!isMac && <WindowControls />}
      </div>
    </header>
  )
}

function WindowControls(): ReactNode {
  const controls = [
    { label: 'Minimize', icon: <Minus className="size-3.5" />, action: () => window.flow.window.minimize() },
    { label: 'Maximize', icon: <Square className="size-3" />, action: () => window.flow.window.toggleMaximize() },
    { label: 'Close', icon: <X className="size-3.5" />, action: () => window.flow.window.close(), danger: true }
  ]

  return (
    <div className="ml-1 flex items-center">
      {controls.map((control) => (
        <button
          key={control.label}
          type="button"
          aria-label={control.label}
          onClick={control.action}
          className={cn(
            'flex h-8 w-11 items-center justify-center rounded-lg text-ink-faint',
            'transition-colors duration-150 ease-flow hover:text-ink',
            control.danger ? 'hover:bg-danger/80 hover:text-white' : 'hover:bg-surface-2'
          )}
        >
          {control.icon}
        </button>
      ))}
    </div>
  )
}
