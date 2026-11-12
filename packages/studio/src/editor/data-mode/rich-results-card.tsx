import { CircleCheck, CircleMinus } from 'lucide-react'
import type { ReactElement } from 'react'
import type { Loaded } from '../../site/use-loaded.js'
import { Chip } from '../../ui/chip.js'
import type { RichFeature, RichResults } from '../rich-results.js'
import { DataCard, DataNote } from './data-card.js'

/** Why there is no list, when the live page was not checked */
function unchecked(rich: RichResults): string | null {
  switch (rich.state) {
    case 'not-live':
      return 'Checked once the page is live: the search engines read the live page.'
    case 'other-locale':
      return "Checked for the default locale's live page only."
    case 'unlisted':
      return "Not among the site's checked live pages."
    case 'error':
      return 'The rich results could not be read.'
    default:
      return null
  }
}

function Feature({ feature }: { feature: RichFeature }): ReactElement {
  return (
    <li className="data-rich">
      {feature.eligible ? (
        <CircleCheck className="data-rich-icon data-rich-icon--eligible" aria-hidden="true" />
      ) : (
        <CircleMinus className="data-rich-icon" aria-hidden="true" />
      )}
      <span className="data-rich-name">{feature.feature}</span>
      <span className="data-rich-reader">
        {feature.reader} · <code>{feature.type}</code>
      </span>
      <Chip tone={feature.eligible ? 'success' : 'neutral'}>
        {feature.eligible ? 'Eligible' : 'Not eligible'}
      </Chip>
    </li>
  )
}

function Features({ rich }: { rich: Loaded<RichResults> }): ReactElement {
  if (rich.state === 'loading') return <DataNote>Reading the rich results…</DataNote>
  if (rich.state === 'error') return <DataNote tone="error">{rich.message}</DataNote>
  const reason = unchecked(rich.data)
  if (reason) return <DataNote>{reason}</DataNote>
  const features = rich.data.state === 'listed' ? rich.data.features : []
  if (features.length === 0) {
    return <DataNote>No search feature the readers still show applies to this page.</DataNote>
  }
  return (
    <ul className="data-rich-list" aria-label="Rich results">
      {features.map((feature) => (
        <Feature key={`${feature.reader}-${feature.feature}-${feature.type}`} feature={feature} />
      ))}
    </ul>
  )
}

/** The rich results the live page can appear in, by the search engines' own rules only */
export function RichResultsCard({ rich }: { rich: Loaded<RichResults> }): ReactElement {
  return (
    <DataCard
      title="Rich results"
      lead="From the search engines' own rules: only the features they still show. What keeps the page from one is under Findings."
    >
      <Features rich={rich} />
    </DataCard>
  )
}
