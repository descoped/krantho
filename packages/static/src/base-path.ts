/**
 * The path a site is served under, from its address (`site.baseUrl`):
 * `https://owner.github.io/docs-site` is served under `/docs-site`, and a site
 * at its host's root (`https://docs.example.com`) under none, `''`. Next.js
 * takes it as `basePath`; the content's root-relative links get it too.
 *
 * Pure and dependency-free, so `next.config.ts` can import it from
 * `@krantho/static/base-path` without loading the server.
 */
export function basePathOf(baseUrl: string): string {
  let path: string
  try {
    path = new URL(baseUrl).pathname
  } catch {
    throw new Error(`site.baseUrl is not an absolute URL: ${baseUrl}`)
  }
  return path.replace(/\/+$/, '')
}
