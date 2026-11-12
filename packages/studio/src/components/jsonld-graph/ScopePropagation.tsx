import { useId } from 'react'

interface ScopePropagationProps {
  value: 'document' | 'site'
  onChange: (scope: 'document' | 'site') => void
}

/**
 * Radio selector for choosing where to save site-level entity edits:
 * - "This document" — creates a doc-scope override
 * - "All documents" — writes to the site scope directly
 *
 * Default is "All documents" because site-level entities typically
 * reflect site identity that should propagate globally.
 */
export function ScopePropagation({ value, onChange }: ScopePropagationProps): React.ReactElement {
  const groupName = useId()

  return (
    <div className="graph-scope-propagation">
      <span className="graph-scope-propagation-label">Apply changes to:</span>
      <label className="graph-scope-propagation-option">
        <input
          type="radio"
          name={groupName}
          value="document"
          checked={value === 'document'}
          onChange={() => onChange('document')}
        />
        This document
      </label>
      <label className="graph-scope-propagation-option">
        <input
          type="radio"
          name={groupName}
          value="site"
          checked={value === 'site'}
          onChange={() => onChange('site')}
        />
        All documents (site-level)
      </label>
    </div>
  )
}
