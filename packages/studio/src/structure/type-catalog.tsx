import { Info } from 'lucide-react'
import { type ReactElement, useState } from 'react'
import type { CatalogType } from '../lib/api.js'
import { Button } from '../ui/button.js'
import { Chip } from '../ui/chip.js'
import { catalogGroups } from './scopes-model.js'
import { StructureCard } from './structure-card.js'
import type { Catalog } from './structure-sources.js'
import { TypeDetailModal } from './type-detail-modal.js'

/** What a type can appear as in search results, in words */
function featureText(type: CatalogType): string {
  if (!type.richResult || type.richResultStatus === 'none') return 'No search feature'
  if (type.richResultStatus === 'restricted')
    return `${type.richResult} · shown only under conditions`
  return type.richResult
}

function levels(type: CatalogType): string {
  if (type.siteLevel && type.documentLevel) return 'site or page'
  return type.siteLevel ? 'site' : 'page'
}

function TypeRow({
  type,
  onDetail,
}: {
  type: CatalogType
  onDetail: (type: string) => void
}): ReactElement {
  return (
    <li className="structure-catalog-type">
      <span className="structure-type-name">{type.label}</span>
      <Chip>{levels(type)}</Chip>
      <span className="structure-type-rich">{featureText(type)}</span>
      <Button size="sm" variant="ghost" icon={Info} onClick={() => onDetail(type.type)}>
        Details <span className="visually-hidden">of {type.label}</span>
      </Button>
    </li>
  )
}

/**
 * The catalog of Schema.org types, by category: only types whose search
 * feature the search engines still show, or that have none. A type whose
 * feature a reader retired is left out.
 */
export function TypeCatalog({ catalog }: { catalog: Catalog }): ReactElement {
  const [detail, setDetail] = useState<string | null>(null)
  return (
    <StructureCard
      id="scope-catalog"
      title="The catalog"
      lead="The Schema.org types krantho composes, by what they describe; each with the search feature it can appear in by the search engines' rules."
    >
      {catalogGroups(catalog).map((group) => (
        <div key={group.category} className="structure-catalog-group">
          <h4 className="structure-label">{group.label}</h4>
          <ul className="structure-catalog-types">
            {group.types.map((type) => (
              <TypeRow key={type.type} type={type} onDetail={setDetail} />
            ))}
          </ul>
        </div>
      ))}
      {detail && <TypeDetailModal type={detail} onClose={() => setDetail(null)} />}
    </StructureCard>
  )
}
