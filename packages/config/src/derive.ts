import { isAbsolute, join, resolve as resolvePath } from 'node:path'
import { getPath, isPlainObject, setPath } from './object-path.js'

/** Paths holding a filesystem location that is resolved against the working directory */
const PATH_LEAVES = [
  'paths.dataDir',
  'paths.contentDir',
  'paths.seoGeneratedDir',
  'persistence.sqlite.path',
  'persistence.filesystem.contentPath',
  'media.local.dir',
  'seo.configDir',
] as const

function fillIfAbsent(target: Record<string, unknown>, path: string, value: unknown): void {
  if (getPath(target, path) === undefined) setPath(target, path, value)
}

/**
 * SQLite reads `:memory:` and `file:` URIs as instructions, not as locations.
 * Resolving them against the working directory would turn an in-memory database
 * into a file called `:memory:` in the project root.
 */
function isFilesystemLocation(value: string): boolean {
  return value !== ':memory:' && !value.startsWith('file:')
}

/** Public bucket URLs of the object stores that have a canonical one */
function deriveMediaPublicUrls(tree: Record<string, unknown>): void {
  const s3Bucket = getPath(tree, 'media.s3.bucket')
  const s3Region = getPath(tree, 'media.s3.region')
  const s3Endpoint = getPath(tree, 'media.s3.endpoint')
  if (typeof s3Bucket === 'string' && typeof s3Region === 'string' && s3Endpoint === undefined) {
    fillIfAbsent(tree, 'media.s3.publicUrl', `https://${s3Bucket}.s3.${s3Region}.amazonaws.com`)
  }

  const gcsBucket = getPath(tree, 'media.gcs.bucket')
  if (typeof gcsBucket === 'string') {
    fillIfAbsent(tree, 'media.gcs.publicUrl', `https://storage.googleapis.com/${gcsBucket}`)
  }
}

/**
 * Fill the leaves whose default is computed from another leaf, then turn every
 * filesystem path into an absolute one.
 *
 * Runs on the merged tree before validation, so a derived value is validated
 * like any other and a site that sets nothing gets the same absolute paths the
 * code produced before the tree existed.
 */
export function derive(merged: Record<string, unknown>, cwd: string): Record<string, unknown> {
  const tree = structuredClone(merged)

  const language = getPath(tree, 'site.language')
  if (typeof language === 'string') {
    fillIfAbsent(tree, 'site.supportedLocales', [language])
    fillIfAbsent(tree, 'site.defaultLocale', language)
  }

  const dataDir = getPath(tree, 'paths.dataDir')
  if (typeof dataDir === 'string') {
    fillIfAbsent(tree, 'persistence.sqlite.path', join(dataDir, 'content.db'))
  }

  const contentDir = getPath(tree, 'paths.contentDir')
  if (typeof contentDir === 'string') {
    fillIfAbsent(tree, 'persistence.filesystem.contentPath', contentDir)
    fillIfAbsent(tree, 'paths.seoGeneratedDir', join(contentDir, 'seo', 'generated'))
  }

  deriveMediaPublicUrls(tree)

  for (const path of PATH_LEAVES) {
    const value = getPath(tree, path)
    if (typeof value !== 'string' || isAbsolute(value)) continue
    if (!isFilesystemLocation(value)) continue
    setPath(tree, path, resolvePath(cwd, value))
  }

  return tree
}

/** Dotted paths of every scalar the developer or the environment supplied */
export function suppliedPaths(source: unknown, prefix = ''): string[] {
  if (!isPlainObject(source)) return prefix ? [prefix] : []
  const paths: string[] = []
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    const path = prefix ? `${prefix}.${key}` : key
    if (isPlainObject(value)) {
      paths.push(...suppliedPaths(value, path))
      continue
    }
    paths.push(path)
  }
  return paths
}
