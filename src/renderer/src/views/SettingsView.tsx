import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { ArrowLeft, Check, Eye, Flame, Gauge, LogIn, LogOut, Plus, Stethoscope, X } from 'lucide-react'
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
          <FlowEntryEditor url={settings.flowUrl} />
        </Section>

        <Section
          title="Scene planner"
          description="Groq splits a brief into individual shots. Planning costs no Flow credits — only rendering does."
        >
          <PlannerKeyEditor />

          <Field label="Planner model">
            <TextField
              value={settings.plannerModel}
              aria-label="Planner model"
              spellCheck={false}
              containerClassName="w-56"
              onChange={(event) => void updateSettings({ plannerModel: event.target.value })}
            />
          </Field>
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

        <Section
          title="Browser profiles"
          description="Each account runs in its own persistent Playwright context. Generations always run through the profile marked “Generating here” — starting a browser does not change that."
        >
          <div className="divide-y divide-edge-subtle overflow-hidden rounded-2xl border border-edge-subtle">
            {accounts.map((account) => (
              <ProfileRow
                key={account.id}
                account={account}
                status={statuses[account.id]}
                isActive={account.id === settings.activeAccountId}
              />
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
 * The key crosses the bridge once, on the way in, and is stored encrypted by
 * the OS keychain. It is never read back out to the renderer — the UI only
 * ever learns whether one exists.
 */
function PlannerKeyEditor(): ReactNode {
  const hasKey = useWorkspaceStore((state) => state.hasPlannerKey)
  const setPlannerKey = useWorkspaceStore((state) => state.setPlannerKey)
  const clearPlannerKey = useWorkspaceStore((state) => state.clearPlannerKey)

  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    if (!value.trim() || saving) return
    setSaving(true)
    const stored = await setPlannerKey(value)
    setSaving(false)
    if (stored) setValue('')
  }

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-1 px-4 py-3.5">
      <p className="flex items-center gap-2 text-sm text-ink">
        Groq API key
        {hasKey && (
          <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-2xs font-medium text-success">Saved</span>
        )}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-faint">
        Stored encrypted by your OS keychain, never in the workspace file.{' '}
        <code className="text-ink-ghost">GROQ_API_KEY</code> in the environment takes precedence if set.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <TextField
          type="password"
          value={value}
          aria-label="Groq API key"
          spellCheck={false}
          autoComplete="off"
          placeholder={hasKey ? 'Replace the saved key' : 'gsk_…'}
          containerClassName="flex-1"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save()
          }}
        />
        <Button variant="secondary" size="sm" loading={saving} disabled={!value.trim()} onClick={save}>
          Save
        </Button>
        {hasKey && (
          <Button variant="ghost" size="sm" onClick={() => void clearPlannerKey()}>
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Flow's entrance moves, and `labs.google/fx/tools/flow` serves a marketing
 * page rather than the tool. The diagnostic opens Flow in the active profile
 * and reports where it actually landed, whether the profile has a session, and
 * which in-product links it found — so the right URL gets discovered instead
 * of guessed.
 */
function FlowEntryEditor({ url }: { url: string }): ReactNode {
  const updateSettings = useWorkspaceStore((state) => state.updateSettings)
  const diagnoseFlow = useWorkspaceStore((state) => state.diagnoseFlow)
  const activeAccountId = useWorkspaceStore((state) => state.settings?.activeAccountId)
  const report = useWorkspaceStore((state) => state.flowDiagnostics)

  const [draft, setDraft] = useState(url)
  const [running, setRunning] = useState(false)

  const commit = (): void => {
    const next = draft.trim()
    if (!next || next === url) {
      setDraft(url)
      return
    }
    void updateSettings({ flowUrl: next })
  }

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-1 px-4 py-3.5">
      <p className="text-sm text-ink">Flow URL</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-faint">
        Where automation starts. If runs fail saying they landed on the landing page, diagnose and set this to the
        address the app itself loads at.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <TextField
          value={draft}
          aria-label="Flow URL"
          spellCheck={false}
          containerClassName="flex-1"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          loading={running}
          iconLeft={<Stethoscope className="size-3.5" />}
          onClick={async () => {
            if (!activeAccountId) return
            setRunning(true)
            await diagnoseFlow(activeAccountId)
            setRunning(false)
          }}
        >
          Diagnose
        </Button>
      </div>

      {report && (
        <div className="mt-3 space-y-2 rounded-xl border border-edge-subtle bg-canvas-sunken/60 p-3">
          <DiagnosticRow label="Landed on" value={report.finalUrl} />
          <DiagnosticRow label="Signed in" value={report.signedIn ? 'Yes' : 'No — connect a Google account'} />
          <DiagnosticRow
            label="Page type"
            value={report.isLandingPage ? 'Marketing landing page (not the app)' : 'Looks like the app'}
          />
          {report.candidateAppUrls.length > 0 && (
            <div>
              <p className="text-2xs uppercase tracking-wider text-ink-ghost">Candidate app URLs</p>
              <div className="mt-1 flex flex-col gap-1">
                {report.candidateAppUrls.slice(0, 6).map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => {
                      setDraft(candidate)
                      void updateSettings({ flowUrl: candidate })
                    }}
                    className="truncate rounded-lg px-1.5 py-1 text-left font-mono text-2xs text-accent transition-colors hover:bg-surface-2"
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="pt-1 text-2xs text-ink-ghost">
            Full report saved to <span className="font-mono">{report.reportPath}</span>
          </p>
        </div>
      )}
    </div>
  )
}

function DiagnosticRow({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex gap-2 text-2xs">
      <span className="w-20 shrink-0 uppercase tracking-wider text-ink-ghost">{label}</span>
      <span className="min-w-0 flex-1 break-all text-ink-muted">{value}</span>
    </div>
  )
}

/**
 * One browser profile.
 *
 * The active profile is called out explicitly, because starting a profile's
 * browser is *not* the same as generating through it — that routing is a
 * separate choice, and conflating the two silently sends work to the wrong
 * Google account.
 */
function ProfileRow({
  account,
  status,
  isActive
}: {
  account: Account
  status?: ProfileStatus
  isActive: boolean
}): ReactNode {
  const launchProfile = useWorkspaceStore((state) => state.launchProfile)
  const closeProfile = useWorkspaceStore((state) => state.closeProfile)
  const signInProfile = useWorkspaceStore((state) => state.signInProfile)
  const cancelSignIn = useWorkspaceStore((state) => state.cancelSignIn)
  const signOutProfile = useWorkspaceStore((state) => state.signOutProfile)
  const setActiveAccount = useWorkspaceStore((state) => state.setActiveAccount)

  const state = status?.state ?? 'idle'
  const signingIn = state === 'signing-in'
  const identity = account.identity

  const runLabel =
    status?.message ?? (state === 'ready' ? 'Browser running' : state === 'launching' ? 'Starting…' : 'Browser idle')

  return (
    <div className={cn('flex items-start gap-3 px-4 py-3.5', isActive ? 'bg-accent-soft/40' : 'bg-surface-1')}>
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
          {isActive && (
            <span className="shrink-0 rounded-md bg-accent/20 px-1.5 py-0.5 text-2xs font-medium text-accent">
              Generating here
            </span>
          )}
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
        {!isActive && !signingIn && (
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Check className="size-3.5" />}
            onClick={() => void setActiveAccount(account.id)}
          >
            Generate here
          </Button>
        )}

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
