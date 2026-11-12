import { kranthoField } from '@krantho/core/marks'
import { all, type Doc, text } from '../../../../lib/content'
import { RELEASE_VERSION } from '../../../../krantho.collections'

// Releases in changelog order, and their dates as readers expect them. `date` is
// an ISO date (YYYY-MM-DD) edited in /studio; anything else is shown as written.

/** The release date as YYYY-MM-DD when it is one — YAML may hand over a Date or a timestamp */
function isoDate(doc: Doc): string {
  const value = doc.fields['date']
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : ''
  const raw = text(doc, 'date').trim()
  return raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? raw
}

function time(doc: Doc): number {
  const parsed = Date.parse(isoDate(doc))
  return Number.isFinite(parsed) ? parsed : 0
}

/** Every published release, newest first */
export async function releasesNewestFirst(): Promise<Doc[]> {
  const releases = await all('releases')
  return [...releases].sort(
    (a, b) =>
      time(b) - time(a) ||
      text(b, 'version').localeCompare(text(a, 'version'), 'en', { numeric: true }),
  )
}

const FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
})

export function ReleaseDate({ doc }: { doc: Doc }): React.ReactElement | null {
  const raw = isoDate(doc)
  if (!raw) return null
  const parsed = Date.parse(raw)
  const marks = kranthoField(doc, 'date')
  if (!Number.isFinite(parsed)) {
    return (
      <span className="release-date" {...marks}>
        {raw}
      </span>
    )
  }
  return (
    <time className="release-date" dateTime={raw} {...marks}>
      {FORMAT.format(parsed)}
    </time>
  )
}

/** The release tag an entry describes (`v0.7.7`), when its version is a semver release */
export function releaseTag(doc: Doc): string | undefined {
  const version = text(doc, 'version')
  return RELEASE_VERSION.test(version) ? `v${version}` : undefined
}

/**
 * The GitHub page that lists krantho's releases; each entry links to its release there.
 */
export const GITHUB_RELEASES_URL = 'https://github.com/descoped/krantho/releases'

/** The release on GitHub */
export function GithubRelease({ doc }: { doc: Doc }): React.ReactElement | null {
  const tag = releaseTag(doc)
  if (!tag) return null
  return (
    <a href={`${GITHUB_RELEASES_URL}/tag/${tag}`} className="link-arrow timeline__more">
      {tag} on GitHub
    </a>
  )
}

export function Version({ doc }: { doc: Doc }): React.ReactElement | null {
  const tag = releaseTag(doc)
  return tag ? (
    <span className="version-badge" {...kranthoField(doc, 'version')}>
      {tag}
    </span>
  ) : null
}
