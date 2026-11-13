import { execFile } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** The file in the content directory that holds each content file's last change */
export const CONTENT_DATES_FILE = 'dates.json'

/**
 * When each content file last changed, keyed by its path relative to the
 * content directory with forward slashes (`docs/install.md`), as ISO 8601.
 */
export type ContentDates = Readonly<Record<string, string>>

/** The key a content file has in {@link ContentDates} */
export function contentDateKey(contentDir: string, filePath: string): string {
  return relative(contentDir, filePath).split(sep).join('/')
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run('git', args, { cwd })
    return stdout.trim()
  } catch {
    return null
  }
}

/** Every markdown file under `dir`, recursively */
async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name))
}

/**
 * Each markdown file's last git commit date, keyed by its path relative to
 * `contentDir`. Null when the history is missing or shallow (a CI checkout
 * without `fetch-depth: 0`): every file would then carry the latest commit's
 * date. A file that is not committed yet is left out.
 */
export async function readContentDates(contentDir: string): Promise<ContentDates | null> {
  const shallow = await git(contentDir, ['rev-parse', '--is-shallow-repository'])
  if (shallow !== 'false') return null

  const dates: Record<string, string> = {}
  for (const file of await markdownFiles(contentDir)) {
    const date = await git(contentDir, ['log', '-1', '--format=%cI', '--', file])
    if (date) dates[contentDateKey(contentDir, file)] = new Date(date).toISOString()
  }
  return dates
}

/**
 * Write `<contentDir>/dates.json`: each markdown file's last git commit date
 * ({@link readContentDates}).
 *
 * Run at build time, where the repository's history is available; the server
 * reads the file when it imports content, so a page that was never edited in
 * Studio carries the date its file last changed, not the date of the
 * import. Answers null and writes nothing without the full history.
 */
export async function generateContentDates(contentDir: string): Promise<ContentDates | null> {
  const dates = await readContentDates(contentDir)
  if (!dates) return null
  await writeFile(
    join(contentDir, CONTENT_DATES_FILE),
    `${JSON.stringify(dates, null, 2)}\n`,
    'utf-8',
  )
  return dates
}

/**
 * The content's version: when the last commit that touched the content
 * directory was made, in seconds since the epoch. It grows with every content
 * change, including a deleted file. Null without the full history.
 */
export async function contentVersion(contentDir: string): Promise<number | null> {
  const shallow = await git(contentDir, ['rev-parse', '--is-shallow-repository'])
  if (shallow !== 'false') return null
  const seconds = Number(await git(contentDir, ['log', '-1', '--format=%ct', '--', '.']))
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null
}

/** The commit the content is built from (`git rev-parse HEAD`), or null outside a git checkout */
export async function contentCommit(contentDir: string): Promise<string | null> {
  const commit = await git(contentDir, ['rev-parse', 'HEAD'])
  return commit && /^[0-9a-f]{40}$/.test(commit) ? commit : null
}

/** Read `<contentDir>/dates.json`, or no dates when the build wrote none */
export async function loadContentDates(contentDir: string): Promise<ContentDates> {
  try {
    const raw: unknown = JSON.parse(await readFile(join(contentDir, CONTENT_DATES_FILE), 'utf-8'))
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
    return Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

/** When a content file last changed, by its path; undefined dates the import now */
export type ContentDateOf = (filePath: string) => string | undefined

/** Each directory's dates, read once per process: the loader and a static build's files open the same ones */
const directoryDates = new Map<string, Promise<ContentDates | null>>()

function datesOf(directory: string): Promise<ContentDates | null> {
  let dates = directoryDates.get(directory)
  if (!dates) {
    dates = readContentDates(directory)
    directoryDates.set(directory, dates)
  }
  return dates
}

/**
 * Look up a content file's last commit date, by its path, across the
 * directories a site reads its files from. A file outside them, or every file
 * without the full history, has none. Each directory's history is read once
 * per process.
 */
export async function gitDateLookup(directories: readonly string[]): Promise<ContentDateOf> {
  const dates = new Map<string, string>()
  for (const directory of new Set(directories.map((dir) => resolve(dir)))) {
    const found = await datesOf(directory)
    for (const [key, date] of Object.entries(found ?? {})) dates.set(join(directory, key), date)
  }
  return (filePath) => dates.get(resolve(filePath))
}

/** Look up a content file's date in the dates the build wrote for `contentDir` */
export async function contentDateLookup(contentDir: string): Promise<ContentDateOf> {
  const dates = await loadContentDates(contentDir)
  return (filePath) => dates[contentDateKey(contentDir, filePath)]
}
