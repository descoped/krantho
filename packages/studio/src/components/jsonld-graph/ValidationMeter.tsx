import type { PropertyClassification } from '../../lib/jsonld-graph.js'

interface ValidationMeterProps {
  classifications: readonly PropertyClassification[]
  compact?: boolean | undefined
}

/**
 * Per-entity eligibility meter. Shows "N/M required, N/M recommended"
 * as a compact progress indicator with color-coded segments.
 */
export function ValidationMeter({
  classifications,
  compact = false,
}: ValidationMeterProps): React.ReactElement {
  const required = classifications.filter((c) => c.importance === 'required')
  const recommended = classifications.filter((c) => c.importance === 'recommended')
  const requiredSet = required.filter((c) => c.state === 'set').length
  const recommendedSet = recommended.filter((c) => c.state === 'set').length

  if (required.length === 0 && recommended.length === 0) {
    return <span className="graph-validation-meter graph-validation-meter--empty" />
  }

  const allRequiredMet = requiredSet === required.length
  const meterClass = allRequiredMet
    ? 'graph-validation-meter--eligible'
    : 'graph-validation-meter--incomplete'

  if (compact) {
    return (
      <span className={`graph-validation-meter graph-validation-meter--compact ${meterClass}`}>
        {required.length > 0 && (
          <span className="graph-validation-meter-segment">
            {requiredSet}/{required.length}
          </span>
        )}
      </span>
    )
  }

  return (
    <div className={`graph-validation-meter ${meterClass}`}>
      {required.length > 0 && (
        <span className="graph-validation-meter-segment graph-validation-meter-segment--required">
          {requiredSet}/{required.length} required
        </span>
      )}
      {recommended.length > 0 && (
        <span className="graph-validation-meter-segment graph-validation-meter-segment--recommended">
          {recommendedSet}/{recommended.length} recommended
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Graph-wide summary helpers
// ---------------------------------------------------------------------------

export interface GraphValidationSummary {
  eligibleCount: number
  missingRequiredCount: number
  totalEntities: number
}

/**
 * Compute graph-wide validation stats from per-entity classifications.
 * Used by GraphSummary for the live validation display.
 */
export function computeGraphValidation(
  entityClassifications: ReadonlyMap<string, readonly PropertyClassification[]>,
): GraphValidationSummary {
  let eligibleCount = 0
  let missingRequiredCount = 0

  for (const classifications of entityClassifications.values()) {
    const required = classifications.filter((c) => c.importance === 'required')
    if (required.length === 0) continue

    const allMet = required.every((c) => c.state === 'set')
    if (allMet) {
      eligibleCount++
    } else {
      missingRequiredCount += required.filter((c) => c.state === 'missing').length
    }
  }

  return {
    eligibleCount,
    missingRequiredCount,
    totalEntities: entityClassifications.size,
  }
}
