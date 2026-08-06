import type { CompositionConfig } from '../services/composition'

/**
 * The main process has no DOM lib, but `page.evaluate` callbacks are typechecked
 * in this project's scope. Declaring only the surface the composition document
 * exposes keeps those callbacks type-safe without pulling all of `lib.dom`.
 */
declare global {
  const window: {
    flowRenderStill(config: CompositionConfig): Promise<string>
    flowRenderPoster(config: CompositionConfig): Promise<string>
    flowRenderClip(config: CompositionConfig): Promise<string>
  }
}

export {}
