type SeoModule = typeof import('@krantho/seo')

let cached: Promise<SeoModule> | null = null

/**
 * Lazily load and cache the optional @krantho/seo package. The specifier is a
 * literal the bundler can see, so a build that has the package installed packs
 * it with the server code; a deployment that ships only traced files (Vercel,
 * Next.js standalone output) would otherwise leave it out.
 */
export function loadSeoModule(): Promise<SeoModule> {
  if (cached) return cached
  cached = import('@krantho/seo')
  return cached
}
