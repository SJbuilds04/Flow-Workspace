import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Eye, Flame, Gauge } from 'lucide-react'
import { ASPECT_RATIOS, MODELS, type AspectRatioId, type ModelId } from '@shared/types'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { StatusDot } from '@/components/ui/StatusDot'
import { Switch } from '@/components/ui/Switch'
import { useWorkspaceStore } from '@/store/workspace-store'

export function SettingsView(): ReactNode {
  const settings = useWorkspaceStore((state) => state.settings)
  const accounts = useWorkspaceStore((state) => state.accounts)
  const statuses = useWorkspaceStore((state) => state.profileStatuses)
  const updateSettings = useWorkspaceStore((state) => state.updateSettings)
  const setView = useWorkspaceStore((state) => state.setView)
  const launchProfile = useWorkspaceStore((state) => state.launchProfile)
  const closeProfile = useWorkspaceStore((state) => state.closeProfile)

  if (!settings) return null

  return (
    <div className="h-full overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto w-full max-w-2xl px-8 pb-20 pt-10"
      >
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<ArrowLeft className="size-3.5" />}
          onClick={() => setView('project')}
          className="-ml-3 mb-6"
        >
          Back to workspace
        </Button>

        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1.5 text-sm text-ink-faint">Defaults for new generations and how browser profiles behave.</p>

        <Section title="Defaults" description="Applied to every new project and every cleared prompt.">
          <Field label="Model">
            <select
              value={settings.defaultModelId}
              aria-label="Default model"
              onChange={(event) => void updateSettings({ defaultModelId: event.target.value as ModelId })}
              className={selectClass}
            >
              {MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Aspect ratio">
            <select
              value={settings.defaultAspectRatio}
              aria-label="Default aspect ratio"
              onChange={(event) => void updateSettings({ defaultAspectRatio: event.target.value as AspectRatioId })}
              className={selectClass}
            >
              {ASPECT_RATIOS.map((ratio) => (
                <option key={ratio.id} value={ratio.id}>
                  {ratio.label} — {ratio.description}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Browser profiles" description="Each account runs in its own persistent Playwright context.">
          <div className="divide-y divide-edge-subtle overflow-hidden rounded-2xl border border-edge-subtle">
            {accounts.map((account) => {
              const state = statuses[account.id]?.state ?? 'idle'
              const message = statuses[account.id]?.message
              return (
                <div key={account.id} className="flex items-center gap-3 bg-surface-1 px-4 py-3">
                  <StatusDot tone={account.tone} state={state} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{account.name}</p>
                    <p className="truncate text-2xs text-ink-ghost">
                      {message ?? (state === 'ready' ? 'Running' : state === 'launching' ? 'Starting…' : 'Not running')}
                    </p>
                  </div>
                  {state === 'ready' ? (
                    <Button variant="ghost" size="sm" onClick={() => void closeProfile(account.id)}>
                      Stop
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={state === 'launching'}
                      onClick={() => void launchProfile(account.id)}
                    >
                      {state === 'unavailable' ? 'Retry' : 'Start'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>

          <ToggleRow
            icon={<Eye className="size-4" />}
            title="Show the browser window"
            description="Run profiles headed instead of headless. Useful when a site needs you to sign in."
            checked={settings.showBrowserWindow}
            onChange={(showBrowserWindow) => void updateSettings({ showBrowserWindow })}
          />

          <ToggleRow
            icon={<Flame className="size-4" />}
            title="Keep profiles warm"
            description="Leave the browser context running after a generation so the next one starts instantly."
            checked={settings.keepProfilesWarm}
            onChange={(keepProfilesWarm) => void updateSettings({ keepProfilesWarm })}
          />
        </Section>

        <Section title="Appearance" description="Flow Workspace is dark-only by design.">
          <ToggleRow
            icon={<Gauge className="size-4" />}
            title="Reduce motion"
            description="Shortens transitions across the app. The system setting is respected regardless."
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => void updateSettings({ reduceMotion })}
          />
        </Section>
      </motion.div>
    </div>
  )
}

const selectClass = cn(
  'h-9 w-56 rounded-xl border border-edge-subtle bg-surface-1 px-3 text-sm text-ink',
  'outline-none transition-colors duration-200 ease-flow hover:border-edge focus:border-edge-strong',
  '[&>option]:bg-canvas-raised [&>option]:text-ink'
)

function Section({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: ReactNode
}): ReactNode {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium tracking-tight text-ink">{title}</h2>
      <p className="mt-1 text-xs text-ink-faint">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-edge-subtle bg-surface-1 px-4 py-3">
      <span className="text-sm text-ink">{label}</span>
      {children}
    </div>
  )
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange
}: {
  icon: ReactNode
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}): ReactNode {
  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-edge-subtle bg-surface-1 px-4 py-3.5">
      <span className="mt-0.5 shrink-0 text-ink-faint">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} label={title} className="mt-1" />
    </div>
  )
}
