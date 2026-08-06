import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { StatusDot } from '@/components/ui/StatusDot'
import { useWorkspaceStore } from '@/store/workspace-store'

/**
 * Shown when the selected profile could not be launched. The point of this
 * surface is to offer the one thing that actually unblocks the user: picking a
 * different profile, inline, without hunting through menus.
 */
export function ProfileNotice(): ReactNode {
  const notice = useWorkspaceStore((state) => state.profileNotice)
  const accounts = useWorkspaceStore((state) => state.accounts)
  const statuses = useWorkspaceStore((state) => state.profileStatuses)
  const dismiss = useWorkspaceStore((state) => state.dismissProfileNotice)
  const setActiveAccount = useWorkspaceStore((state) => state.setActiveAccount)
  const launchProfile = useWorkspaceStore((state) => state.launchProfile)

  const alternatives = accounts.filter((account) => account.id !== notice?.accountId)
  const blocked = accounts.find((account) => account.id === notice?.accountId)

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          role="alert"
          className="overflow-hidden"
        >
          <div className="mb-6 flex items-start gap-3.5 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {blocked ? `${blocked.name} isn’t available right now` : 'That profile isn’t available'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{notice.message}</p>

              {alternatives.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-2xs uppercase tracking-wider text-ink-ghost">Switch to</span>
                  {alternatives.map((account) => (
                    <Button
                      key={account.id}
                      size="sm"
                      variant="secondary"
                      iconLeft={
                        <StatusDot tone={account.tone} state={statuses[account.id]?.state ?? 'idle'} size="sm" />
                      }
                      onClick={() => void setActiveAccount(account.id)}
                    >
                      {account.name}
                    </Button>
                  ))}
                  {blocked && (
                    <Button size="sm" variant="ghost" onClick={() => void launchProfile(blocked.id)}>
                      Retry {blocked.name}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <IconButton icon={<X className="size-3.5" />} label="Dismiss" tooltip={false} size="sm" onClick={dismiss} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
