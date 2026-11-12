import { kranthoField } from '@krantho/core/marks'
import Link from 'next/link'
import { text, type Doc, type Summary } from '../../../../lib/content'
import { routeOf } from '../../../../lib/routes'
import { Markdown } from '../../../components/markdown'

// The glossary on /docs/glossary: every published glossary entry (title = term,
// `definition` = the short definition, body = the longer text, `docs-page` = where
// the term is explained in full), alphabetical, grouped by first letter. Each
// entry's id is its slug, so routeOf('glossary', slug) links straight to it.

interface LetterGroup {
  letter: string
  entries: Doc[]
}

function groupByLetter(entries: Doc[]): LetterGroup[] {
  const sorted = [...entries].sort((a, b) =>
    text(a, 'title').localeCompare(text(b, 'title'), 'en', { sensitivity: 'base' }),
  )
  const groups: LetterGroup[] = []
  for (const entry of sorted) {
    const first = text(entry, 'title').charAt(0).toUpperCase()
    const letter = /[A-Z]/.test(first) ? first : '#'
    const group = groups.at(-1)
    if (group?.letter === letter) group.entries.push(entry)
    else groups.push({ letter, entries: [entry] })
  }
  return groups
}

const letterId = (letter: string): string => `letter-${letter === '#' ? 'other' : letter.toLowerCase()}`

function Entry({ entry, bySlug }: { entry: Doc; bySlug: Map<string, Summary> }): React.ReactElement {
  const target = bySlug.get(text(entry, 'docs-page'))
  const body = entry.rawContent.trim()
  return (
    <div className="glossary__entry" id={entry.slug}>
      <dt className="glossary__term">
        <a href={`#${entry.slug}`} className="glossary__anchor" {...kranthoField(entry, 'title')}>
          {text(entry, 'title')}
        </a>
      </dt>
      <dd className="glossary__detail">
        {text(entry, 'definition') && (
          <p className="glossary__definition" {...kranthoField(entry, 'definition')}>
            {text(entry, 'definition')}
          </p>
        )}
        {body && <Markdown source={body} className="prose glossary__body" body={entry} />}
        {target && (
          <Link href={routeOf('docs', target.slug)} className="link-arrow glossary__more" {...kranthoField(entry, 'docs-page')}>
            {text(target, 'title')}
          </Link>
        )}
      </dd>
    </div>
  )
}

export function Glossary({ entries, bySlug }: { entries: Doc[]; bySlug: Map<string, Summary> }): React.ReactElement | null {
  if (entries.length === 0) return null
  const groups = groupByLetter(entries)
  return (
    <div className="glossary">
      <nav className="glossary__letters" aria-label="Glossary letters">
        {groups.map((group) => (
          <a key={group.letter} href={`#${letterId(group.letter)}`} className="glossary__letter-link">
            {group.letter}
          </a>
        ))}
      </nav>
      {groups.map((group) => (
        <section key={group.letter} className="glossary__group" aria-labelledby={letterId(group.letter)}>
          <h2 id={letterId(group.letter)} className="glossary__letter">
            {group.letter}
          </h2>
          <dl className="glossary__list">
            {group.entries.map((entry) => (
              <Entry key={entry.slug} entry={entry} bySlug={bySlug} />
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
