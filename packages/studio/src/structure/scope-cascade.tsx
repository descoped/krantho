import { ArrowDown, FileText, Globe, Layers, type LucideIcon, Route } from 'lucide-react'
import { type ReactElement, useId } from 'react'
import type { CascadeCounts } from './scopes-model.js'

export type ScopeId = 'site' | 'collection' | 'route' | 'document'

interface ScopeStep {
  id: ScopeId
  title: string
  says: string
  icon: LucideIcon
  /** What the scope holds, counted from the stored configuration */
  count: (counts: CascadeCounts) => string
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`

const STEPS: readonly ScopeStep[] = [
  {
    id: 'site',
    title: 'Site',
    says: 'Who the site is',
    icon: Globe,
    count: (c) => plural(c.siteEntities, 'site entity', 'site entities'),
  },
  {
    id: 'collection',
    title: 'Collection',
    says: 'What kind of page',
    icon: Layers,
    count: (c) => plural(c.collections, 'collection archetype', 'collection archetypes'),
  },
  {
    id: 'route',
    title: 'URL pattern',
    says: 'Overrides by route',
    icon: Route,
    count: (c) => plural(c.routes, 'URL pattern', 'URL patterns'),
  },
  {
    id: 'document',
    title: 'Document',
    says: "One page's own say, which wins over everything above",
    icon: FileText,
    count: (c) =>
      plural(c.documents, 'page with its own settings', 'pages with their own settings'),
  },
]

/** The id of a scope's card in the cascade, what the card before it links to */
export const cascadeId = (id: ScopeId): string => `cascade-${id}`

/** The id of a scope's section below the cascade */
export const scopeSectionId = (id: ScopeId): string => `scope-${id}`

function Step({
  step,
  next,
  counts,
}: {
  step: ScopeStep
  next: ScopeStep | undefined
  counts: CascadeCounts | null
}): ReactElement {
  const Icon = step.icon
  return (
    <li id={cascadeId(step.id)} className="structure-cascade-step">
      <span className="structure-cascade-icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="structure-cascade-title">
        <a href={`#${scopeSectionId(step.id)}`} className="structure-link">
          {step.title}
        </a>
      </span>
      <span className="structure-cascade-says">{step.says}</span>
      <span className="structure-cascade-count">{counts ? step.count(counts) : 'Not read'}</span>
      {next && (
        <a href={`#${cascadeId(next.id)}`} className="structure-cascade-next">
          <ArrowDown aria-hidden="true" />
          Then: {next.title}
        </a>
      )}
    </li>
  )
}

/**
 * The cascade of four scopes, broadest first, each card leading to the next:
 * the narrowest scope wins. Site and collection are seeded from
 * krantho.config.ts at startup; edits persist.
 */
export function ScopeCascade({ counts }: { counts: CascadeCounts | null }): ReactElement {
  const titleId = useId()
  return (
    <section className="structure-cascade" aria-labelledby={titleId}>
      <h3 id={titleId} className="structure-card-title">
        Four scopes, the narrowest wins
      </h3>
      <ol className="structure-cascade-steps">
        {STEPS.map((step, index) => (
          <Step key={step.id} step={step} next={STEPS[index + 1]} counts={counts} />
        ))}
      </ol>
      <p className="structure-note">
        Site and collection are seeded from krantho.config.ts when the site starts; edits made here
        persist.
      </p>
    </section>
  )
}
