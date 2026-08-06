import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { ArrowLeft, Eye, Flame, Gauge, LogIn, LogOut, Plus, X } from 'lucide-react'
import {
  FLOW_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  type Account,
  type FlowAspectRatio,
  type GenerationEngineId,
  type ProfileStatus,
  type VideoDuration
} from '@shared/types'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { StatusDot } from '@/components/ui/StatusDot'
import { Switch } from '@/components/ui/Switch'
import { TextField } from '@/components/ui/TextField'
import { useWorkspaceStore } from '@/store/workspace-store'

export function SettingsView(): ReactNode {
  const settings = useWorkspaceStore((state) => state.settings)
  const accounts = useWorkspaceStore((state) => state.accounts)
  const statuses = useWorkspaceStore((state) => state.profileStatuses)
  const updateSettings = useWorkspaceStore((state) => state.updateSettings)
  const setView = useWorkspaceStore((state) => state.setView)

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

        <Section
          title="Generation engine"
          description="Google Flow drives the real labs.google app in the selected profile. Local preview renders offline and needs no account."
        >
          <Field label="Engine">
            <select
              value={settings.engine}
              aria-label="Generation engine"
              onChange={(event) => void updateSettings({ engine: event.target.value as GenerationEngineId })}
              className={selectClass}
            >
              <option value="google-flow">Google Flow</option>
              <option value="local-preview">Local preview</option>
            </select>
          </Field>

          <Field label="Default model">
            <select
              value={settings.defaults.model}
              aria-label="Default model"
              onChange={(event) =>
                void updateSettings({ defaults: { ...settings.defaults, model: event.target.value } })
              }
              className={selectClass}
            >
              {settings.flowModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </Field>

          <ModelListEditor models={settings.flowModels} />
        </Section>

        <Section title="Defaults" description="Applied to every new project and every cleared prompt.">
          <Field label="Aspect ratio">
            <select
              value={settings.defaults.aspectRatio}
              aria-label="Default aspect ratio"
              onChange={(event) =>
                void updateSettings({
                  defaults: { ...settings.defaults, aspectRatio: event.target.value as FlowAspectRatio }
                })
              }
              className={selectClass}
            >
              {FLOW_ASPECT_RATIOS.map((ratio) => (
                <option key={ratio.id} value={ratio.id}>
                  {ratio.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Default duration">
            <select
              value={settings.defaults.durationSeconds}
              aria-label="Default duration"
              onChange={(event) =>
                void updateSettings({
                  defaults: { ...settings.defaults, durationSeconds: Number(event.target.value) as VideoDuration }
                })
              }
              className={selectClass}
            >
              {VIDEO_DURATIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds}s
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Browser profiles" description="Each account runs in its own persistent Playwright context.">
          <div className="divide-y divide-edge-subtle overflow-hidden rounded-2xl border border-edge-subtle">
            {accounts.map((account) => (
              <ProfileRow key={account.id} account={account} status={statuses[account.id]} />
            ))}
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

/**
 * Flow renames and rotates its models, and the automation picks one by the
 * visible label in Flow's own dropdown. Keeping the list editable means a
 * rename is a thirty-second fix here rather than a code change — and a run that
 * fails because the name is gone reports what Flow actually offered.
 */
function ModelListEditor({ models }: { models: string[] }): ReactNode {
  const updateSettings = useWorkspaceStore((state) => state.updateSettings)
  const [draft, setDraft] = useState('')

  const add = (): void => {
    const name = draft.trim()
    if (!name || models.includes(name)) {
      setDraft('')
      return
    }
    void updateSettings({ flowModels: [...models, name] })
    setDraft('')
  }

  const remove = (name: string): void => {
    if (models.length <= 1) return
    void updateSettings({ flowModels: models.filter((model) => model !== name) })
  }

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-1 px-4 py-3.5">
      <p className="text-sm text-ink">Model names</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-faint">
        These must match the labels in Flow&rsquo;s model dropdown exactly.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {models.map((model) => (
          <span
            key={model}
            className="flex items-center gap-1 rounded-lg border border-edge-subtle bg-surface-2 py-1 pl-2.5 pr-1 text-xs text-ink"
          >
            {model}
            <IconButton
              icon={<X className="size-3" />}
              label={`Remove ${model}`}
              size="sm"
              tooltip={false}
              disabled={models.length <= 1}
              onClick={() => remove(model)}
            />
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <TextField
          value={draft}
          placeholder="Add a model name"
          aria-label="New model name"
          containerClassName="flex-1"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
        />
        <Button variant="secondary" size="sm" iconLeft={<Plus className="size-3.5" />} onClick={add}>
          Add
        </Button>
      </div>
    </div>
  )
}

/**
 * One browser profile: who is signed into it, whether the browser is up, and
 * the two actions that matter — connect an account, and start/stop the context.
 */
function ProfileRow({ account, status }: { account: Account; status?: ProfileStatus }): ReactNode {
  const launchProfile = useWorkspaceStore((state) => state.launchProfile)
  const closeProfile = useWorkspaceStore((state) => state.closeProfile)
  const signInProfile = useWorkspaceStore((state) => state.signInProfile)
  const cancelSignIn = useWorkspaceStore((state) => state.cancelSignIn)
  const signOutProfile = useWorkspaceStore((state) => state.signOutProfile)

  const state = status?.state ?? 'idle'
  const signingIn = state === 'signing-in'
  const identity = account.identity

  const runLabel =
    status?.message ?? (state === 'ready' ? 'Browser running' : state === 'launching' ? 'Starting…' : 'Browser idle')

  return (
    <div className="flex items-start gap-3 bg-surface-1 px-4 py-3.5">
      {identity?.avatarUrl ? (
        <img src={identity.avatarUrl} alt="" className="mt-0.5 size-7 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="mt-1.5">
          <StatusDot tone={account.tone} state={state} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm text-ink">
          {account.name}
          {identity && (
            <span className="shrink-0 rounded-md bg-success-soft px-1.5 py-0.5 text-2xs font-medium text-success">
              Connected
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-2xs text-ink-ghost">
          {signingIn
            ? 'Finish signing in with the browser window that opened.'
            : identity
              ? (identity.email ?? 'Google account connected')
              : 'No Google account connected'}
        </p>
        {!signingIn && <p className="mt-0.5 truncate text-2xs text-ink-ghost/70">{runLabel}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {signingIn ? (
          <Button variant="ghost" size="sm" onClick={() => void cancelSignIn(account.id)}>
            Cancel
          </Button>
        ) : identity ? (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<LogOut className="size-3.5" />}
            onClick={() => void signOutProfile(account.id)}
          >
            Sign out
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<LogIn className="size-3.5" />}
            onClick={() => void signInProfile(account.id)}
          >
            Connect Google
          </Button>
        )}

        {state === 'ready' ? (
          <Button variant="ghost" size="sm" onClick={() => void closeProfile(account.id)}>
            Stop
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={state === 'launching' || signingIn}
            onClick={() => void launchProfile(account.id)}
          >
            {state === 'unavailable' ? 'Retry' : 'Start'}
          </Button>
        )}
      </div>
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
