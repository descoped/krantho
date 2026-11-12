import type { ReactElement } from 'react'
import { SYSTEM_FIELDS, typePill } from '../field-model.js'
import { PanelCard, PanelNote } from './panel-card.js'
import type { PanelDocument } from './panel-document.js'
import type { PanelSelection } from './selection.js'

/**
 * The schema's fields as a list, for a read-only form: its inputs are
 * disabled and cannot take focus, so this is the keyboard's way to show a
 * field in the panel
 */
export function FieldsCard({
  doc,
  onSelect,
}: {
  doc: PanelDocument
  onSelect: (selection: PanelSelection) => void
}): ReactElement {
  const properties = doc.schema.schema.properties ?? {}
  const names = Object.keys(properties).filter((name) => !SYSTEM_FIELDS.has(name))
  return (
    <PanelCard title="Fields">
      <PanelNote>The form is read-only. Choose a field to see what reads it.</PanelNote>
      <ul className="side-rows" aria-label="Fields">
        {names.map((name) => (
          <li key={name}>
            <button
              type="button"
              className="side-row"
              onClick={() => onSelect({ kind: 'field', name })}
            >
              <span className="side-row-name">{name}</span>{' '}
              <span className="side-row-state">{typePill(properties[name] ?? {}, name)}</span>
            </button>
          </li>
        ))}
      </ul>
    </PanelCard>
  )
}
