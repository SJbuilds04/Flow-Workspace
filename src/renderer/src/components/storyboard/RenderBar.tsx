import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, Square, X } from 'lucide-react'
import type { RenderJob, ScenePlan } from '@shared/types'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { StatusDot } from '@/components/ui/StatusDot'
import { useWorkspaceStore } from '@/store/workspace-store'

interface RenderBarProps {
  plan: ScenePlan
}

/**
 * Starts and watches a whole-storyboard render.
 *
 * Work is spread across every connected profile at once, so this shows what
 * each one is doing rather than a single progress bar — when a profile runs
 * out of credits its shot moves elsewhere, and that hand-off should be visible
 * rather than mysterious.
 */
export function RenderBar({ plan }: RenderBarProps): ReactNode {
  const accounts = useWorkspaceStore((state) => state.accounts)
  const settings = useWorkspaceStore((state) => state.settings)
  const updateSettings = useWorkspaceStore((state) => state.updateSettings)
  const queue = useWorkspaceStore((state) => state.queue)
  const renderPlan = useWorkspaceStore((state) => state.renderPlan)
  const cancelQueue = useWorkspaceStore((state) => state.cancelQueue)
  const cancelJob = useWorkspaceStore((state) => state.cancelJob)
  const clearSettled = useWorkspaceStore((state) => state.clearSettledJobs)

  const jobs = queue.jobs.filter((job) => job.planId === plan.id)
  const active = jobs.filter((job) => job.status === 'queued' || job.status === 'running')
  const done = jobs.filter((job) => job.status === 'completed').length
  const failed = jobs.filter((job) => job.status === 'failed').length

  const connected = accounts.filter((account) => account.identity)
  const now = Date.now()

  // An empty selection means "all connected", so a profile added later is
  // included by default rather than silently left out.
  const selectedIds = settings?.renderAccountIds ?? []
  const isSelected = (id: string): boolean => selectedIds.length === 0 || selectedIds.includes(id)

  const chosen = connected.filter((account) => isSelected(account.id))
  const usable = chosen.filter(
    (account) => !account.creditsExhaustedUntil || new Date(account.creditsExhaustedUntil).getTime() <= now
  )

  const toggleAccount = (id: string): void => {
    const current = selectedIds.length > 0 ? selectedIds : connected.map((account) => account.id)
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]

    // Rendering with nothing selected is never what someone means.
    if (next.length === 0) return
    void updateSettings({ renderAccountIds: next })
  }

  const remaining = plan.scenes.filter((scene) => !scene.locked && scene.status !== 'completed').length

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-1 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">Render storyboard</p>
          <p className="mt-0.5 text-2xs text-ink-faint">
            {connected.length === 0
              ? 'No profile has a Google account connected yet.'
              : `${remaining} shot${remaining === 1 ? '' : 's'} to render across ${usable.length} of ${connected.length} profile${connected.length === 1 ? '' : 's'}`}
            {chosen.length > usable.length && ' · some are out of credits'}
          </p>
        </div>

        {active.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Square className="size-3 fill-current" aria-hidden />}
            onClick={() => void cancelQueue()}
          >
            Stop all
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={usable.length === 0 || remaining === 0}
            iconLeft={<Play className="size-3.5 fill-current" aria-hidden />}
            onClick={() => void renderPlan(plan.id)}
          >
            Render {remaining > 0 ? `${remaining} shot${remaining === 1 ? '' : 's'}` : 'all'}
          </Button>
        )}
      </div>

      {connected.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-2xs uppercase tracking-wider text-ink-ghost">Render on</p>

          <div className="flex flex-wrap items-center gap-1.5">
            {connected.map((account) => {
              const parked = account.creditsExhaustedUntil && new Date(account.creditsExhaustedUntil).getTime() > now
              const working = jobs.find((job) => job.status === 'running' && job.accountId === account.id)
              const on = isSelected(account.id)

              return (
                <button
                  key={account.id}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`Render on ${account.name}`}
                  title={parked ? 'Out of credits until the daily reset' : undefined}
                  onClick={() => toggleAccount(account.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-2xs',
                    'transition-colors duration-200 ease-flow',
                    !on && 'border-edge-subtle bg-transparent text-ink-ghost line-through opacity-60 hover:opacity-90',
                    on && parked && 'border-danger/25 bg-danger-soft text-danger',
                    on && !parked && working && 'border-accent/30 bg-accent-soft text-accent',
                    on && !parked && !working && 'border-edge bg-surface-2 text-ink-muted hover:border-edge-strong'
                  )}
                >
                  <StatusDot tone={account.tone} state={working ? 'ready' : 'idle'} size="sm" />
                  {account.name}
                  {on && parked && ' · no credits'}
                  {on && working && ' · rendering'}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {jobs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-1.5 border-t border-edge-subtle pt-3">
              <div className="flex items-center justify-between text-2xs text-ink-ghost">
                <span>
                  {done} done{failed > 0 && ` · ${failed} failed`}
                  {active.length > 0 && ` · ${active.length} in flight`}
                </span>
                {active.length === 0 && (
                  <button type="button" onClick={() => void clearSettled()} className="hover:text-ink-muted">
                    Clear
                  </button>
                )}
              </div>

              {jobs.map((job) => (
                <JobRow key={job.id} job={job} onCancel={() => void cancelJob(job.id)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function JobRow({ job, onCancel }: { job: RenderJob; onCancel: () => void }): ReactNode {
  const settled = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'

  return (
    <motion.div layout className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-2xs">
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          job.status === 'completed' && 'bg-success',
          job.status === 'failed' && 'bg-danger',
          job.status === 'running' && 'animate-pulse bg-accent',
          job.status === 'queued' && 'bg-ink-ghost',
          job.status === 'cancelled' && 'bg-ink-ghost/50'
        )}
      />
      <span className="shrink-0 text-ink-muted">{job.sceneTitle}</span>
      <span className="min-w-0 flex-1 truncate text-ink-ghost">{job.error ?? job.stage ?? job.status}</span>
      {!settled && (
        <IconButton icon={<X className="size-3" />} label="Cancel shot" size="sm" tooltip={false} onClick={onCancel} />
      )}
    </motion.div>
  )
}
