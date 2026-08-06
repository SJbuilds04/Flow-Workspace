import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Toaster } from '@/components/ui/Toaster'
import { Sidebar } from '@/components/layout/Sidebar'
import { TitleBar } from '@/components/layout/TitleBar'
import { ProjectView } from '@/views/ProjectView'
import { SettingsView } from '@/views/SettingsView'
import { subscribeToMainEvents, useWorkspaceStore } from '@/store/workspace-store'

export function App(): ReactNode {
  const status = useWorkspaceStore((state) => state.status)
  const bootError = useWorkspaceStore((state) => state.bootError)
  const view = useWorkspaceStore((state) => state.view)
  const reduceMotion = useWorkspaceStore((state) => state.settings?.reduceMotion ?? false)
  const bootstrap = useWorkspaceStore((state) => state.bootstrap)

  useEffect(() => {
    void bootstrap()
    return subscribeToMainEvents()
  }, [bootstrap])

  useEffect(() => {
    document.documentElement.dataset['reduceMotion'] = String(reduceMotion)
  }, [reduceMotion])

  if (status === 'loading') return <BootScreen />
  if (status === 'error') return <BootError message={bootError} onRetry={() => void bootstrap()} />

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <main className="relative min-w-0 flex-1" data-testid="main-area">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              {view === 'settings' ? <SettingsView /> : <ProjectView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <Toaster />
    </div>
  )
}

function BootScreen(): ReactNode {
  return (
    <div className="flex h-full items-center justify-center" data-testid="boot-screen">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="flex items-center gap-3 text-sm text-ink-faint"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading workspace…
      </motion.div>
    </div>
  )
}

function BootError({ message, onRetry }: { message: string | null; onRetry: () => void }): ReactNode {
  return (
    <div className="flex h-full items-center justify-center p-8" data-testid="boot-error">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl border border-danger/25 bg-danger-soft text-danger">
          <AlertTriangle className="size-5" aria-hidden />
        </div>
        <h1 className="text-base font-medium text-ink">Flow Workspace couldn’t start</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-faint">
          {message ?? 'The workspace file could not be read.'}
        </p>
        <Button variant="secondary" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  )
}
