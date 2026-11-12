import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { MIME_TYPES } from './mime-types.js'

/** Error message when Studio SPA is not built — shared across all server adapters */
export const STUDIO_NOT_AVAILABLE_MESSAGE =
  'Studio not available. Build it with: pnpm --filter @krantho/studio run build'

let studioDistDir: string | undefined

/**
 * Resolve the path to @krantho/studio's dist directory.
 *
 * Resolves from the app's own dependencies first: the app installs @krantho/studio,
 * and resolving from the app root (not from this module) keeps working when a
 * bundler inlines this package. Walking up from cwd covers a workspace checkout,
 * or a deployed function where the SPA was traced under `packages/studio/dist`.
 */
function getStudioDistDir(): string {
  studioDistDir ??= resolveStudioDist() ?? findStudioDistFromCwd()
  return studioDistDir
}

function resolveStudioDist(): string | undefined {
  try {
    const require = createRequire(join(process.cwd(), 'package.json'))
    return dirname(require.resolve('@krantho/studio/dist/index.html'))
  } catch {
    return undefined
  }
}

function findStudioDistFromCwd(): string {
  let dir = process.cwd()
  while (dir !== resolve(dir, '..')) {
    const candidate = join(dir, 'node_modules', '@krantho', 'admin', 'dist', 'index.html')
    if (existsSync(candidate)) return join(candidate, '..')
    // Also check sibling packages (monorepo symlink layout)
    const sibling = join(dir, 'packages', 'admin', 'dist', 'index.html')
    if (existsSync(sibling)) return join(sibling, '..')
    dir = resolve(dir, '..')
  }

  throw new Error(
    '@krantho/studio is not installed or not built. Run: pnpm --filter @krantho/studio run build',
  )
}

/** Where the Studio build puts its content-hashed JS, CSS and fonts */
const BUILD_ASSETS_PREFIX = '/studio/assets/'

/**
 * Whether a path names a file of the Studio build's `assets/` directory. Those
 * files are content-hashed and immutable, and hold no data — the same files
 * ship in the published `@krantho/studio` package.
 */
export function isStudioBuildAsset(requestPath: string): boolean {
  return requestPath.startsWith(BUILD_ASSETS_PREFIX)
}

/**
 * Serve admin static assets from @krantho/studio/dist/.
 *
 * Returns a Response for the requested file, or the SPA index.html
 * for client-side routing paths. A missing build asset answers 404, never
 * index.html. Returns null if admin is not available.
 */
export function serveStudioAsset(requestPath: string): Response | null {
  let distDir: string
  try {
    distDir = getStudioDistDir()
  } catch {
    return null
  }

  // Strip /studio prefix to get the asset path
  const assetPath = requestPath.replace(/^\/studio\/?/, '') || 'index.html'
  const filePath = resolve(join(distDir, assetPath))

  // Security: prevent path traversal
  const safeRoot = distDir.endsWith(sep) ? distDir : distDir + sep
  if (!filePath.startsWith(safeRoot) && filePath !== resolve(distDir)) {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const content = readFileSync(filePath)
    const ext = extname(filePath)
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'

    // Build assets are content-hashed and immutable; everything else must revalidate
    const cacheControl = isStudioBuildAsset(requestPath)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'

    return new Response(content, {
      status: 200,
      headers: { 'content-type': contentType, 'cache-control': cacheControl },
    })
  } catch {
    // A missing chunk must fail as one; index.html in its place is no module
    if (isStudioBuildAsset(requestPath)) {
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    }
    // File not found — serve index.html for SPA client-side routing
    try {
      const indexContent = readFileSync(join(distDir, 'index.html'))
      return new Response(indexContent, {
        status: 200,
        headers: { 'content-type': 'text/html', 'cache-control': 'no-cache' },
      })
    } catch {
      return null
    }
  }
}
