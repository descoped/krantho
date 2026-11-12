import { ExternalLink } from 'lucide-react'
import { type ReactElement, useEffect, useState } from 'react'
import { ActionButton } from '../editor/action-button.js'
import { type CatalogType, fetchSchema, saveSeoConfig } from '../lib/api.js'
import { catalogTag } from '../lib/catalog-offer.js'
import { errorMessage } from '../lib/fetch.js'
import { collectionLabel } from '../lib/format.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'
import { useToast } from '../ui/toast.js'
import { ImpactNote } from './archetype-impact.js'
import { type ArchetypeRow, archetypeChoices, SETTINGS_UNREAD, withTypes } from './scopes-model.js'
import type { Catalog } from './structure-sources.js'
import { useArchetypeImpact } from './use-archetype-impact.js'

/** Fields of a collection's schema no structured data reads: the system's own */
const SYSTEM_FIELDS = new Set([
  'status',
  'locale',
  'slug',
  'version',
  'source',
  'changedBy',
  'createdAt',
  'updatedAt',
])

/** The collection's own fields: what the types' properties can be filled from */
function useCollectionFields(collection: string): string[] | null {
  const [fields, setFields] = useState<string[] | null>(null)
  useEffect(() => {
    let active = true
    fetchSchema(collection).then(
      (schema) => {
        const names = Object.keys(schema.schema.properties ?? {})
        if (active) setFields(names.filter((name) => !SYSTEM_FIELDS.has(name)))
      },
      () => active && setFields(null),
    )
    return () => {
      active = false
    }
  }, [collection])
  return fields
}

/** What a type can appear as in search results; a retired feature is never named */
function featureText(type: CatalogType): string {
  const tag = catalogTag(type)
  if (tag === 'retired') return 'No longer shown in search results'
  const feature = type.richResult ?? 'No search feature'
  return tag ? `${feature} · ${tag}` : feature
}

function TypeOption(props: {
  type: CatalogType
  checked: boolean
  onToggle: (type: string) => void
}): ReactElement {
  const { type } = props
  return (
    <div className="structure-type-option">
      <label>
        <input type="checkbox" checked={props.checked} onChange={() => props.onToggle(type.type)} />
        <span className="structure-type-name">{type.label}</span>
        <span className="structure-type-rich">{featureText(type)}</span>
      </label>
      {type.docsUrl && (
        <a href={type.docsUrl} target="_blank" rel="noreferrer" className="structure-link">
          Docs
          <ExternalLink aria-hidden="true" />
          <span className="visually-hidden"> for {type.label} (opens in a new tab)</span>
        </a>
      )}
    </div>
  )
}

function TypePicker(props: {
  catalog: Catalog
  chosen: ReadonlySet<string>
  onToggle: (type: string) => void
}): ReactElement {
  return (
    <div className="structure-type-picker">
      {archetypeChoices(props.catalog, props.chosen).map((group) => (
        <fieldset key={group.category} className="structure-type-group">
          <legend>{group.label}</legend>
          {group.types.map((type) => (
            <TypeOption
              key={type.type}
              type={type}
              checked={props.chosen.has(type.type)}
              onToggle={props.onToggle}
            />
          ))}
        </fieldset>
      ))}
    </div>
  )
}

export interface ArchetypeModalProps {
  row: ArchetypeRow
  catalog: Catalog
  onClose: () => void
  onSaved: () => void
}

/** The chosen types, toggled one at a time, and whether they differ from the saved ones */
function useChoice(saved: readonly string[]): {
  chosen: ReadonlySet<string>
  types: string[]
  changed: boolean
  toggle: (type: string) => void
} {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(saved))
  const types = [...chosen]
  const changed = types.length !== saved.length || types.some((type) => !saved.includes(type))
  function toggle(type: string): void {
    setChosen((current) => {
      const next = new Set(current)
      if (!next.delete(type)) next.add(type)
      return next
    })
  }
  return { chosen, types, changed, toggle }
}

/** Save the chosen types to the collection's settings; says what happened */
function useSave(props: ArchetypeModalProps): { saving: boolean; save: (types: string[]) => void } {
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const name = props.row.collection.name
  async function save(types: string[]): Promise<void> {
    const { stored } = props.row
    if (stored.state !== 'read') {
      toast({ text: SETTINGS_UNREAD, tone: 'error' })
      return
    }
    setSaving(true)
    try {
      await saveSeoConfig(`collection:${name}`, withTypes(stored.config, types))
      const label = collectionLabel(name)
      toast({ text: `${label}'s archetype saved. Its pages' structured data has changed.` })
      props.onSaved()
      props.onClose()
    } catch (err: unknown) {
      toast({ text: errorMessage(err, 'The archetype could not be saved'), tone: 'error' })
      setSaving(false)
    }
  }
  return { saving, save: (types) => void save(types) }
}

/**
 * Change a collection's archetype: the Schema.org types every page of it
 * states, with the impact on its pages read as the choice changes
 */
export function ArchetypeModal(props: ArchetypeModalProps): ReactElement {
  const name = props.row.collection.name
  const { chosen, types, changed, toggle } = useChoice(props.row.types ?? [])
  const { saving, save } = useSave(props)
  const impact = useArchetypeImpact(name, types, changed)
  const fields = useCollectionFields(name)
  const reason = saving ? 'Saving…' : changed ? null : 'Change the types first.'
  const actions = (
    <>
      <Button onClick={props.onClose}>Cancel</Button>
      <ActionButton variant="primary" reason={reason} onClick={() => save(types)}>
        {saving ? 'Saving…' : 'Save'}
      </ActionButton>
    </>
  )
  return (
    <Modal
      title={`Change ${collectionLabel(name)}'s archetype`}
      onClose={props.onClose}
      busy={saving}
      actions={actions}
    >
      <p className="structure-modal-lead">
        The Schema.org types every page of {collectionLabel(name)} states. They are saved to the
        collection's SEO settings, which have no versions: its pages' structured data changes at
        once. A page's own settings still win.
      </p>
      {fields && fields.length > 0 && (
        <p className="structure-note">
          The types' properties can be filled from its fields: {fields.join(', ')}.
        </p>
      )}
      <TypePicker catalog={props.catalog} chosen={chosen} onToggle={toggle} />
      <ImpactNote impact={impact} collection={name} />
    </Modal>
  )
}
