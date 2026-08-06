import type { ReactNode } from 'react'
import { ChevronDown, LogIn, LogOut, Power, RotateCw } from 'lucide-react'
import type { Account, ProfileState } from '@shared/types'
import { cn } from '@/lib/cn'
import { MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/MenuItem'
import { Popover } from '@/components/ui/Popover'
import { StatusDot } from '@/components/ui/StatusDot'
import { useWorkspaceStore } from '@/store/workspace-store'

const STATE_LABEL: Record<ProfileState, string> = {
  idle: 'Not running',
  launching: 'Starting…',
  ready: 'Browser ready',
  unavailable: 'Unavailable',
  'signing-in': 'Waiting for sign-in…'
}

/** What to say under an account name: the connected identity wins over run state. */
function describeAccount(account: Account, state: ProfileState, message?: string): string {
  if (state === 'signing-in') return STATE_LABEL['signing-in']
  if (message) return message
  if (account.identity) return account.identity.email ?? 'Google account connected'
  return `Not connected · ${STATE_LABEL[state]}`
}

/**
 * Top-right profile switcher. Selecting an account persists the choice and warms
 * that profile's persistent Playwright context so the next generation runs
 * through it.
 */
export function AccountSelector(): ReactNode {
  const accounts = useWorkspaceStore((state) => state.accounts)
  const settings = useWorkspaceStore((state) => state.settings)
  const statuses = useWorkspaceStore((state) => state.profileStatuses)
  const setActiveAccount = useWorkspaceStore((state) => state.setActiveAccount)
  const launchProfile = useWorkspaceStore((state) => state.launchProfile)
  const closeProfile = useWorkspaceStore((state) => state.closeProfile)
  const signInProfile = useWorkspaceStore((state) => state.signInProfile)
  const signOutProfile = useWorkspaceStore((state) => state.signOutProfile)

  const active: Account | undefined =
    accounts.find((account) => account.id === settings?.activeAccountId) ?? accounts[0]

  if (!active) return null

  const activeState = statuses[active.id]?.state ?? 'idle'

  return (
    <Popover
      align="end"
      className="w-[288px]"
      trigger={
        <button
          type="button"
          aria-label={`Active profile: ${active.name}`}
          className={cn(
            'group flex h-8 items-center gap-2 rounded-xl pl-2.5 pr-2',
            'border border-edge-subtle bg-surface-1',
            'transition-all duration-200 ease-flow',
            'hover:border-edge hover:bg-surface-2'
          )}
        >
          <StatusDot tone={active.tone} state={activeState} />
          <span className="max-w-[120px] truncate text-xs font-medium text-ink">{active.name}</span>
          <ChevronDown
            className="size-3 text-ink-ghost transition-transform duration-200 group-aria-expanded:rotate-180"
            aria-hidden
          />
        </button>
      }
    >
      {({ close }) => (
        <>
          <MenuLabel>Profiles</MenuLabel>

          {accounts.map((account) => {
            const status = statuses[account.id]
            const state = status?.state ?? 'idle'
            return (
              <MenuItem
                key={account.id}
                icon={<StatusDot tone={account.tone} state={state} />}
                title={account.name}
                description={describeAccount(account, state, status?.message)}
                selected={account.id === active.id}
                onClick={() => {
                  close()
                  void setActiveAccount(account.id)
                }}
              />
            )
          })}

          <MenuSeparator />

          {active.identity ? (
            <MenuItem
              icon={<LogOut className="size-3.5" />}
              title="Sign out of Google"
              description={`Clears the session in ${active.name}`}
              onClick={() => {
                close()
                void signOutProfile(active.id)
              }}
            />
          ) : (
            <MenuItem
              icon={<LogIn className="size-3.5" />}
              title="Connect a Google account"
              description="Opens a browser window to sign in"
              disabled={activeState === 'signing-in'}
              onClick={() => {
                close()
                void signInProfile(active.id)
              }}
            />
          )}

          {activeState === 'ready' ? (
            <MenuItem
              icon={<Power className="size-3.5" />}
              title="Close browser context"
              description={`Shuts down the ${active.name} profile`}
              onClick={() => {
                close()
                void closeProfile(active.id)
              }}
            />
          ) : (
            <MenuItem
              icon={<RotateCw className="size-3.5" />}
              title={activeState === 'unavailable' ? 'Retry launch' : 'Start browser context'}
              description={`Warms up the ${active.name} profile`}
              disabled={activeState === 'launching' || activeState === 'signing-in'}
              onClick={() => {
                close()
                void launchProfile(active.id)
              }}
            />
          )}
        </>
      )}
    </Popover>
  )
}
