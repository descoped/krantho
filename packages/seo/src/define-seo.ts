import type { Decorator } from './decorators/index.js'
import { registerDecorator } from './decorators/index.js'
import type { ReaderProfile } from './profiles/index.js'
import { registerProfile } from './profiles/index.js'
import type { TypeDefinition } from './types/index.js'
import { registerType } from './types/index.js'

/** What a site adds to krantho's structured data */
export interface SeoExtensions {
  /** How the site's own Schema.org types are built, or how a built-in one is built differently */
  readonly types?: readonly TypeDefinition[] | undefined
  /** Readers besides Google and Bing; activate one with `seo.readers` */
  readonly profiles?: readonly ReaderProfile[] | undefined
  /** Page structures krantho does not know, decorated after the built-in ones */
  readonly decorators?: readonly Decorator[] | undefined
}

/**
 * Register a site's own types, reader profiles and page-structure decorators,
 * all or none: when one is refused (an unknown or retired type, a rule without
 * a source), the ones registered before it are removed and the error is
 * thrown. Call it once, in a module the server loads before it renders pages.
 * Returns a function that restores what was registered before.
 */
export function defineSeo(extensions: SeoExtensions): () => void {
  const restores: Array<() => void> = []
  const restoreAll = (): void => {
    for (const restore of restores.reverse()) restore()
  }
  try {
    for (const type of extensions.types ?? []) restores.push(registerType(type))
    for (const profile of extensions.profiles ?? []) restores.push(registerProfile(profile))
    for (const decorator of extensions.decorators ?? []) restores.push(registerDecorator(decorator))
  } catch (error) {
    restoreAll()
    throw error
  }
  return restoreAll
}
