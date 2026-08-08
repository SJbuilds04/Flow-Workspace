import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ImagePlus, X } from 'lucide-react'
import type { AttachmentRef, Character, ScenePlan } from '@shared/types'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useWorkspaceStore } from '@/store/workspace-store'

interface ReferencePanelProps {
  plan: ScenePlan
  onChange: (patch: Partial<ScenePlan>) => void
}

/**
 * Reference images for the cast and for the overall look.
 *
 * Every shot is an independent generation, so a photo is the strongest lever
 * on keeping a face or a location recognisable across them — much stronger
 * than describing the same person in words seven times.
 */
export function ReferencePanel({ plan, onChange }: ReferencePanelProps): ReactNode {
  const pickImage = useWorkspaceStore((state) => state.pickReferenceImage)

  const setCharacterImage = async (character: Character): Promise<void> => {
    const image = await pickImage()
    if (!image) return
    onChange({
      characters: plan.characters.map((item) => (item.id === character.id ? { ...item, referenceImage: image } : item))
    })
  }

  const clearCharacterImage = (character: Character): void => {
    onChange({
      characters: plan.characters.map((item) => (item.id === character.id ? { ...item, referenceImage: null } : item))
    })
  }

  const addStyleReference = async (): Promise<void> => {
    const image = await pickImage()
    if (!image) return
    onChange({ styleReferences: [...(plan.styleReferences ?? []), image] })
  }

  const removeStyleReference = (image: AttachmentRef): void => {
    onChange({ styleReferences: (plan.styleReferences ?? []).filter((item) => item.id !== image.id) })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-edge-subtle bg-surface-1 p-4">
      <div>
        <p className="text-sm text-ink">References</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
          Attached to every shot they appear in. A photo holds a look far better than a description repeated across
          separate generations.
        </p>
      </div>

      {plan.characters.length > 0 && (
        <div>
          <p className="mb-2 text-2xs uppercase tracking-wider text-ink-ghost">Cast</p>
          <div className="flex flex-wrap gap-2">
            {plan.characters.map((character) => (
              <div
                key={character.id}
                className="flex items-center gap-2.5 rounded-xl border border-edge-subtle bg-surface-2 py-1.5 pl-1.5 pr-2"
              >
                <button
                  type="button"
                  aria-label={`Set a reference photo for ${character.name}`}
                  onClick={() => void setCharacterImage(character)}
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg',
                    'border border-dashed border-edge bg-canvas-sunken text-ink-ghost',
                    'transition-colors hover:border-edge-strong hover:text-ink-muted'
                  )}
                >
                  {character.referenceImage ? (
                    <img src={character.referenceImage.url} alt="" className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-4" aria-hidden />
                  )}
                </button>

                <div className="min-w-0">
                  <p className="truncate font-mono text-2xs text-accent">@{character.tag}</p>
                  <p className="truncate text-2xs text-ink-ghost">
                    {character.referenceImage ? 'Photo attached' : 'No photo'}
                  </p>
                </div>

                {character.referenceImage && (
                  <IconButton
                    icon={<X className="size-3" />}
                    label={`Remove ${character.name}'s photo`}
                    size="sm"
                    tooltip={false}
                    onClick={() => clearCharacterImage(character)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-2xs uppercase tracking-wider text-ink-ghost">Look &amp; location</p>

        <div className="flex flex-wrap items-center gap-2">
          <AnimatePresence initial={false}>
            {(plan.styleReferences ?? []).map((image) => (
              <motion.div
                key={image.id}
                layout
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                className="group relative size-14 overflow-hidden rounded-xl border border-edge-subtle"
              >
                <img src={image.url} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  aria-label={`Remove ${image.fileName}`}
                  onClick={() => removeStyleReference(image)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-4 text-white" aria-hidden />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          <Button
            variant="secondary"
            size="sm"
            iconLeft={<ImagePlus className="size-3.5" />}
            onClick={() => void addStyleReference()}
          >
            Add reference
          </Button>
        </div>
      </div>
    </div>
  )
}
