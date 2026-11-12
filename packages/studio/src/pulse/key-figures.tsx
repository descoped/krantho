import { Braces, FileText, type LucideIcon, TextSearch } from 'lucide-react'
import { type ReactElement, type ReactNode, useId } from 'react'
import type { Source } from '../lib/source.js'
import { Meter } from '../ui/meter.js'
import type { CoverageFigure, LiveFigure, StructuredDataFigure } from './pulse-model.js'
import './key-figures.css'

interface FigureProps {
  icon: LucideIcon
  label: string
  /** The number, or null when its source could not be read */
  value: number | null
  /** What the number is out of, said after it ("of 12 pages") */
  total?: string | undefined
  detail: string
  children?: ReactNode
}

/** One key figure: a caption, the number in the mono face, what it is out of, a detail line */
function Figure({ icon: Icon, label, value, total, detail, children }: FigureProps): ReactElement {
  // Named by its caption; said explicitly, as not every accessibility tree derives it
  const captionId = useId()
  return (
    <li className="pulse-figure">
      <figure className="pulse-figure-body" aria-labelledby={captionId}>
        <figcaption id={captionId} className="pulse-figure-label">
          <Icon aria-hidden="true" />
          {label}
        </figcaption>
        {value === null ? (
          <p className="pulse-figure-value pulse-figure-value--unavailable">Unavailable</p>
        ) : (
          <p className="pulse-figure-value">
            <span className="pulse-figure-number">{value}</span>
            {total && <span className="pulse-figure-total">{total}</span>}
          </p>
        )}
        {children}
        <p className="pulse-figure-detail">{detail}</p>
      </figure>
    </li>
  )
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function LivePagesFigure({ figure }: { figure: LiveFigure }): ReactElement {
  const detail =
    figure.pages === 0
      ? 'No pages yet'
      : figure.ahead === 0
        ? 'None with unpublished changes'
        : `${figure.ahead} with unpublished changes`
  return (
    <Figure
      icon={FileText}
      label="Live pages"
      value={figure.live}
      total={`of ${plural(figure.pages, 'page', 'pages')}`}
      detail={detail}
    >
      <Meter
        max={figure.pages}
        segments={[
          { value: figure.live - figure.ahead, tone: 'live' },
          { value: figure.ahead, tone: 'ahead' },
        ]}
      />
    </Figure>
  )
}

function CoverageFigureItem({ figure }: { figure: CoverageFigure }): ReactElement {
  const detail =
    figure.pages === 0
      ? 'No pages yet'
      : `${figure.fallback} fall back to description · ${figure.missing} missing`
  return (
    <Figure
      icon={TextSearch}
      label="Meta descriptions"
      value={figure.covered}
      total={`of ${plural(figure.pages, 'page', 'pages')} set`}
      detail={detail}
    >
      <Meter
        max={figure.pages}
        segments={[
          { value: figure.covered, tone: 'live' },
          { value: figure.fallback, tone: 'ahead' },
          { value: figure.missing, tone: 'danger' },
        ]}
      />
    </Figure>
  )
}

function StructuredDataItem({ source }: { source: Source<StructuredDataFigure> }): ReactElement {
  if (source.state !== 'ok') {
    return (
      <Figure
        icon={Braces}
        label="Valid structured data"
        value={null}
        detail="The site's SEO findings could not be read"
      />
    )
  }
  const figure = source.value
  const detail =
    figure.pages === 0
      ? 'No live pages yet'
      : figure.mainTypes.length > 0
        ? `Main types: ${figure.mainTypes.join(', ')}`
        : 'No types search engines show as rich results'
  return (
    <Figure
      icon={Braces}
      label="Valid structured data"
      value={figure.valid}
      total={`of ${plural(figure.pages, 'live page', 'live pages')}`}
      detail={detail}
    >
      <Meter
        max={figure.pages}
        segments={[
          { value: figure.valid, tone: 'live' },
          { value: figure.pages - figure.valid, tone: 'danger' },
        ]}
      />
    </Figure>
  )
}

export interface KeyFiguresProps {
  live: LiveFigure
  coverage: CoverageFigure
  /** Off when the site has no SEO: the figure is left out */
  structuredData: Source<StructuredDataFigure>
}

/** Pulse's key figures, each counted from an API source; one without a source is left out */
export function KeyFigures({ live, coverage, structuredData }: KeyFiguresProps): ReactElement {
  return (
    <section className="pulse-figures-section" aria-labelledby="pulse-figures-title">
      <h2 id="pulse-figures-title" className="visually-hidden">
        Key figures
      </h2>
      <ul className="pulse-figures">
        <LivePagesFigure figure={live} />
        <CoverageFigureItem figure={coverage} />
        {structuredData.state !== 'off' && <StructuredDataItem source={structuredData} />}
      </ul>
    </section>
  )
}
