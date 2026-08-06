import type { ReactNode } from 'react'
import { ChevronDown, Film, Sparkles } from 'lucide-react'
import { MODELS, findModel, type ModelId } from '@shared/types'
import { cn } from '@/lib/cn'
import { MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/MenuItem'
import { Popover } from '@/components/ui/Popover'

interface ModelSelectorProps {
  value: ModelId
  onChange: (value: ModelId) => void
  disabled?: boolean
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps): ReactNode {
  const active = findModel(value)
  const imageModels = MODELS.filter((model) => model.kind === 'image')
  const videoModels = MODELS.filter((model) => model.kind === 'video')

  return (
    <Popover
      align="start"
      side="top"
      className="w-[288px]"
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label={`Model: ${active.name}`}
          className={cn(
            'group flex h-8 items-center gap-2 rounded-xl px-2.5',
            'text-xs text-ink-muted transition-all duration-200 ease-flow',
            'hover:bg-surface-2 hover:text-ink',
            'disabled:cursor-not-allowed disabled:opacity-40'
          )}
        >
          {active.kind === 'video' ? (
            <Film className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
          ) : (
            <Sparkles className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
          )}
          <span className="max-w-[132px] truncate font-medium">{active.name}</span>
          <ChevronDown
            className="size-3 text-ink-ghost transition-transform duration-200 group-aria-expanded:rotate-180"
            aria-hidden
          />
        </button>
      }
    >
      {({ close }) => (
        <>
          <MenuLabel>Image</MenuLabel>
          {imageModels.map((model) => (
            <MenuItem
              key={model.id}
              icon={<Sparkles className="size-3.5" />}
              title={model.name}
              description={model.description}
              trailing={<span className="shrink-0 text-2xs tabular-nums text-ink-ghost">{model.latency}</span>}
              selected={model.id === value}
              onClick={() => {
                onChange(model.id)
                close()
              }}
            />
          ))}

          <MenuSeparator />
          <MenuLabel>Video</MenuLabel>
          {videoModels.map((model) => (
            <MenuItem
              key={model.id}
              icon={<Film className="size-3.5" />}
              title={model.name}
              description={model.description}
              trailing={<span className="shrink-0 text-2xs tabular-nums text-ink-ghost">{model.latency}</span>}
              selected={model.id === value}
              onClick={() => {
                onChange(model.id)
                close()
              }}
            />
          ))}
        </>
      )}
    </Popover>
  )
}
