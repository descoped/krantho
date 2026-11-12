import { readFileSync } from 'node:fs'

/** The krantho release this scaffolder belongs to; every `@krantho/*` package carries the same version */
export const KRANTHO_VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as {
    version: string
  }
).version

/** The range a new project depends on: this release and the compatible ones after it */
export const KRANTHO_RANGE = `^${KRANTHO_VERSION}`
