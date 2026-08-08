import { useEffect, useState, type ReactNode } from 'react'
import { Film, FolderOpen } from 'lucide-react'
import type { ScenePlan } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { useWorkspaceStore } from '@/store/workspace-store'

/**
 * Joins the rendered shots into one file, in storyboard order.
 *
 * FFmpeg is expected on PATH rather than bundled: the prebuilt npm binaries
 * are GPL, and shipping one inside an MIT project would force that licence on
 * the whole thing.
 */
export function StitchBar({ plan }: { plan: ScenePlan }): ReactNode {
  const projects = useWorkspaceStore((state) => state.projects)
  const stitchPlan = useWorkspaceStore((state) => state.stitchPlan)

  const [ffmpeg, setFfmpeg] = useState<{ available: boolean; version: string | null } | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.flow.stitch.status().then((result) => {
      if (!cancelled && result.ok) setFfmpeg(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const project = projects.find((item) => item.id === plan.projectId)
  const rendered = plan.scenes.filter((scene) => scene.status === 'completed' && scene.generationId).length
  const total = plan.scenes.length

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-1 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">Join into one video</p>
          <p className="mt-0.5 text-2xs text-ink-faint">
            {ffmpeg && !ffmpeg.available
              ? 'FFmpeg not found on PATH — install it to enable joining.'
              : rendered === 0
                ? 'No shots rendered yet.'
                : `${rendered} of ${total} shots rendered · joined in storyboard order`}
          </p>
        </div>

        {project?.stitchedUrl && (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<FolderOpen className="size-3.5" />}
            onClick={() => void window.flow.stitch.reveal({ projectId: project.id })}
          >
            Show file
          </Button>
        )}

        <Button
          variant="secondary"
          size="sm"
          loading={working}
          disabled={rendered === 0 || ffmpeg?.available === false}
          iconLeft={<Film className="size-3.5" />}
          onClick={async () => {
            setWorking(true)
            await stitchPlan(plan.id)
            setWorking(false)
          }}
        >
          {rendered < total ? `Join ${rendered} rendered` : 'Join all shots'}
        </Button>
      </div>

      {project?.stitchedUrl && (
        <video
          key={project.stitchedUrl}
          src={project.stitchedUrl}
          controls
          className="mt-3 max-h-80 w-full rounded-xl border border-edge-subtle bg-canvas-sunken"
        />
      )}
    </div>
  )
}
