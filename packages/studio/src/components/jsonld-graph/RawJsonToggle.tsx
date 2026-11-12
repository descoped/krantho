import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { JsonLdCode } from '../../editor/data-mode/json-ld-code.js'

interface RawJsonToggleProps {
  data: unknown
}

/**
 * Fallback toggle that reveals the raw JSON-LD (`JsonLdCode`), with Copy. Shown
 * below the structural graph view for authors who want to inspect or copy
 * the raw JSON-LD output.
 */
export function RawJsonToggle({ data }: RawJsonToggleProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <div className={`graph-raw-toggle ${open ? 'graph-raw-toggle--open' : ''}`}>
      <button
        type="button"
        className="graph-raw-toggle-button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight size={14} className="graph-raw-toggle-chevron" />
        {open ? 'Hide raw JSON-LD' : 'Show raw JSON-LD'}
      </button>
      {open && (
        <div className="graph-raw-toggle-body">
          <JsonLdCode data={data} label="Raw JSON-LD" />
        </div>
      )}
    </div>
  )
}
