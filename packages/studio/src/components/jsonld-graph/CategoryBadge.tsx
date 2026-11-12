import { CATEGORY_LABELS, type CatalogCategory } from '../../lib/jsonld-graph.js'

interface CategoryBadgeProps {
  category: CatalogCategory | null
}

/**
 * Small colored pill showing the 6-category catalog classification for an
 * entity. Renders nothing when the category is null (unknown type).
 */
export function CategoryBadge({ category }: CategoryBadgeProps): React.ReactElement | null {
  if (category === null) return null
  return (
    <span className={`graph-category-badge graph-category-${category}`}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}
