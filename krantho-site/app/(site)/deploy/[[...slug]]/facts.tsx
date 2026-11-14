import { kranthoField } from '@krantho/core/marks'
import { type Summary, list, text } from '../../../../lib/content'

// What a host's enum fields mean, shown beside the values. These describe
// krantho's configuration (`cache.pages` in @krantho/config), not any one host,
// so they live with the template rather than in each document.

export const CACHE_STRATEGIES: Record<string, string> = {
  none: 'No page cache: a server renders every request, a static build renders each page once.',
  'next-isr': 'Next.js keeps each page until a change invalidates it.',
  cdn: 'The CDN keeps each page until a change purges it.',
}

const KINDS: Record<string, string> = {
  platform: 'Platform',
  cdn: 'CDN',
  server: 'Server',
}

export function kindLabel(kind: string): string {
  return KINDS[kind] ?? kind
}

export function strategyOf(host: Summary): { value: string; explanation: string } {
  const value = text(host, 'cache-strategy')
  return { value, explanation: CACHE_STRATEGIES[value] ?? '' }
}

/** A list field as a comma-separated line, or an em dash when empty */
export function joined(host: Summary, name: string): string {
  const values = list(host, name)
  return values.length > 0 ? values.join(', ') : '—'
}

/** The facts panel of a host page: kind, cache strategy and what runs on it */
export function HostFacts({ host }: { host: Summary }): React.ReactElement {
  const strategy = strategyOf(host)
  const rows: [string, string][] = [
    ['Frameworks', 'frameworks'],
    ['Databases', 'databases'],
    ['Media stores', 'media-stores'],
  ]
  return (
    <aside className="facts" aria-label="Facts">
      <dl className="facts__list">
        <div className="facts__row">
          <dt className="facts__label">Kind</dt>
          <dd {...kranthoField(host, 'kind')}>{kindLabel(text(host, 'kind'))}</dd>
        </div>
        <div className="facts__row">
          <dt className="facts__label">Page cache</dt>
          <dd>
            <code className="strategy" {...kranthoField(host, 'cache-strategy')}>
              {strategy.value}
            </code>
            {strategy.explanation && <span className="facts__note">{strategy.explanation}</span>}
          </dd>
        </div>
        {rows.map(([label, field]) => (
          <div key={label} className="facts__row">
            <dt className="facts__label">{label}</dt>
            <dd {...kranthoField(host, field)}>{joined(host, field)}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
