import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  ExternalLink,
  type LucideIcon,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { type ReactElement, useId, useMemo } from 'react'
import { Link } from 'react-router'
import { buttonClass } from '../ui/button.js'
import { Chip, type ChipTone } from '../ui/chip.js'
import { EmptyState } from '../ui/empty-state.js'
import { cardState, type MissingProperty, type RichCard, richCards } from './rich-results-model.js'
import { catalogOf } from './structure-model.js'
import type { TabProps } from './structure-page.js'
import { siteOnlyTypes } from './structure-sources.js'

const STATES: Readonly<
  Record<ReturnType<typeof cardState>, { label: string; tone: ChipTone; icon: LucideIcon }>
> = {
  eligible: { label: 'Eligible', tone: 'success', icon: CircleCheck },
  partly: { label: 'Partly eligible', tone: 'warning', icon: CircleMinus },
  'not-eligible': { label: 'Not eligible', tone: 'danger', icon: CircleX },
  conditional: { label: 'Shown on conditions', tone: 'neutral', icon: CircleDashed },
  unused: { label: 'Not used yet', tone: 'neutral', icon: Circle },
}

/** How many pages lack a property, naming the first few */
function pagesText(line: MissingProperty): string {
  const shown = line.pages.slice(0, 3).map((page) => page.path)
  const more = line.pages.length - shown.length
  return `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}`
}

function MissingLine({ line, feature }: { line: MissingProperty; feature: string }): ReactElement {
  const fixLabel = line.site ? 'in Site entities' : `on ${line.pages[0]?.path ?? 'the page'}`
  return (
    <li className="structure-missing">
      <span className="structure-missing-text">
        <code>
          {line.type}.{line.property}
        </code>{' '}
        missing on {line.pages.length} page{line.pages.length === 1 ? '' : 's'}: {pagesText(line)}
        {line.site && ' — a site entity, so one value fixes every page'}
      </span>
      <Link to={line.fix} className={buttonClass('secondary', 'sm')}>
        <Wrench className="ui-button-icon" aria-hidden="true" />
        Fix{' '}
        <span className="visually-hidden">
          {feature}: {line.property} {fixLabel}
        </span>
      </Link>
    </li>
  )
}

/** What the feature lacks across the pages, each with its Fix; or that nothing is missing */
function MissingList({ card }: { card: RichCard }): ReactElement {
  if (card.applicable === 0) {
    const types = card.types.length > 0 ? ` (${card.types.join(' or ')})` : ''
    return <p className="structure-note">No page of this site is of this type yet{types}.</p>
  }
  if (card.missing.length === 0) return <p className="structure-note">Nothing is missing.</p>
  return (
    <ul className="structure-missing-list" aria-label={`What ${card.feature} is missing`}>
      {card.missing.map((line) => (
        <MissingLine key={`${line.type}.${line.property}`} line={line} feature={card.feature} />
      ))}
    </ul>
  )
}

function FeatureCard({ card }: { card: RichCard }): ReactElement {
  const titleId = useId()
  const state = STATES[cardState(card)]
  return (
    <section className="structure-card structure-rich-card" aria-labelledby={titleId}>
      <div className="structure-card-head">
        <h3 id={titleId} className="structure-card-title">
          {card.feature} <span className="structure-card-sub">· {card.readerName}</span>
        </h3>
        <Chip tone={state.tone} icon={state.icon}>
          {state.label}
        </Chip>
      </div>
      <p className="structure-rich-count">
        <span className="structure-figure-value">
          {card.eligible} / {card.applicable}
        </span>{' '}
        live page{card.applicable === 1 ? '' : 's'} eligible
        {card.status === 'restricted' && ": shown only under the rule's conditions"}
      </p>
      {card.conditions.map((condition) => (
        <p key={condition} className="structure-note">
          Condition: {condition}.
        </p>
      ))}
      <MissingList card={card} />
      <a href={card.source} target="_blank" rel="noreferrer" className="structure-link">
        {card.readerName}'s rule
        <ExternalLink aria-hidden="true" />
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    </section>
  )
}

/**
 * Rich results: one card per search feature the search engines' own rules
 * show — status, eligible out of applicable (none yet for a feature no page
 * uses), what is missing with a Fix, and the rule's source. A feature a
 * reader has retired is never listed.
 */
export function RichResultsTab({ base, state }: TabProps): ReactElement {
  const { findings } = state
  const siteTypes = useMemo(() => siteOnlyTypes(base.catalog), [base.catalog])
  const catalog = catalogOf(base)
  const cards = useMemo(
    () =>
      findings.state === 'ready'
        ? richCards(findings.data.pages, findings.data.readers, siteTypes, catalog?.types)
        : [],
    [findings, siteTypes, catalog],
  )
  if (findings.state === 'loading') return <p className="structure-note">Reading the live pages…</p>
  if (findings.state === 'error')
    return <p className="structure-note structure-note--error">{findings.message}</p>
  return (
    <>
      <p className="structure-tab-lead">
        The features the search engines still show, by their own rules, checked on every live page
        in the default locale. A page is eligible when its entity has everything the rule requires.
      </p>
      {cards.length === 0 ? (
        <EmptyState icon={Sparkles} title="No rich result to show">
          The search engines' rules, as krantho reads them, list no feature they still show.
        </EmptyState>
      ) : (
        <div className="structure-rich-grid">
          {cards.map((card) => (
            <FeatureCard key={card.key} card={card} />
          ))}
        </div>
      )}
    </>
  )
}
