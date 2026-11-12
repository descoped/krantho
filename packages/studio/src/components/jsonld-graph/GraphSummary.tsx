import type { CatalogDetailResponse, CatalogType } from '../../lib/api-types.js'
import {
  type CatalogCategory,
  classifyNodeProperties,
  entityCategory,
  type GraphLayout,
  type GraphModel,
} from '../../lib/jsonld-graph.js'

interface GraphSummaryProps {
  model: GraphModel
  layout: GraphLayout
  catalogTypes: readonly CatalogType[]
  catalogDetails: ReadonlyMap<string, CatalogDetailResponse>
}

interface SummaryStats {
  entityCount: number
  categories: ReadonlySet<CatalogCategory>
  richResultCount: number
  requiredSet: number
  requiredTotal: number
}

/**
 * Top-of-browser header showing an at-a-glance summary of the entire
 * graph: how many entities, which of the six categories are present, how
 * many rich-result-eligible entities, and overall required-property
 * coverage across every entity.
 */
export function GraphSummary({
  model,
  layout,
  catalogTypes,
  catalogDetails,
}: GraphSummaryProps): React.ReactElement {
  const stats = computeStats(model, catalogTypes, catalogDetails)
  const sectionSummary = `${layout.siteContext.length} site, ${layout.page ? 1 : 0} page, ${
    layout.primary ? 1 : 0
  } primary, ${layout.linked.length} linked`

  return (
    <header className="graph-summary">
      <div className="graph-summary-primary">
        <span className="graph-summary-metric">
          <strong>{stats.entityCount}</strong> entities
        </span>
        <span className="graph-summary-metric">
          <strong>{stats.categories.size}</strong> categories
        </span>
        <span className="graph-summary-metric">
          <strong>{stats.richResultCount}</strong> rich-result eligible
        </span>
        <span
          className={`graph-summary-metric ${stats.requiredTotal - stats.requiredSet > 0 ? 'graph-summary-metric--warning' : ''}`}
        >
          <strong>
            {stats.requiredSet}/{stats.requiredTotal}
          </strong>{' '}
          required set
          {stats.requiredTotal - stats.requiredSet > 0 && (
            <span className="graph-summary-missing">
              ({stats.requiredTotal - stats.requiredSet} missing)
            </span>
          )}
        </span>
      </div>
      <div className="graph-summary-secondary">{sectionSummary}</div>
    </header>
  )
}

function computeStats(
  model: GraphModel,
  catalogTypes: readonly CatalogType[],
  catalogDetails: ReadonlyMap<string, CatalogDetailResponse>,
): SummaryStats {
  const categories = new Set<CatalogCategory>()
  let requiredSet = 0
  let requiredTotal = 0
  let richResultCount = 0

  const catalogByType = new Map<string, CatalogType>()
  for (const ct of catalogTypes) {
    catalogByType.set(ct.type, ct)
  }

  for (const node of model.nodes) {
    const category = entityCategory(node, catalogTypes)
    if (category !== null) categories.add(category)

    const type = typeof node['@type'] === 'string' ? node['@type'] : null
    if (type !== null) {
      const catalogEntry = catalogByType.get(type)
      if (catalogEntry?.richResult) {
        richResultCount += 1
      }
      const detail = catalogDetails.get(type) ?? null
      const classifications = classifyNodeProperties(node, detail)
      for (const c of classifications) {
        if (c.importance === 'required') {
          requiredTotal += 1
          if (c.state === 'set') requiredSet += 1
        }
      }
    }
  }

  return {
    entityCount: model.nodes.length,
    categories,
    richResultCount,
    requiredSet,
    requiredTotal,
  }
}
