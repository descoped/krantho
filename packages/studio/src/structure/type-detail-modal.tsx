import { ExternalLink } from 'lucide-react'
import { type ReactElement, useEffect, useState } from 'react'
import { type CatalogDetailResponse, fetchCatalogType, type ReaderRule } from '../lib/api.js'
import { Button } from '../ui/button.js'
import { Modal } from '../ui/modal.js'

type Detail =
  | { state: 'loading' }
  | { state: 'ready'; detail: CatalogDetailResponse }
  | { state: 'error' }

function useTypeDetail(type: string): Detail {
  const [detail, setDetail] = useState<Detail>({ state: 'loading' })
  useEffect(() => {
    let active = true
    fetchCatalogType(type).then(
      (answer) => active && setDetail({ state: 'ready', detail: answer }),
      () => active && setDetail({ state: 'error' }),
    )
    return () => {
      active = false
    }
  }, [type])
  return detail
}

function Properties({ detail }: { detail: CatalogDetailResponse }): ReactElement {
  if (detail.properties.length === 0)
    return <p className="structure-note">The catalog lists no property for it.</p>
  return (
    <table className="structure-table">
      <caption className="visually-hidden">The properties of {detail.type.label}</caption>
      <thead>
        <tr>
          <th scope="col">Property</th>
          <th scope="col">Importance</th>
          <th scope="col">Filled from</th>
        </tr>
      </thead>
      <tbody>
        {detail.properties.map((property) => (
          <tr key={property.property}>
            <th scope="row">
              <code>{property.property}</code>
              {property.hint && <span className="structure-muted"> · {property.hint}</span>}
            </th>
            <td>{property.importance}</td>
            <td>
              {property.autoMapField ? <code>{property.autoMapField}</code> : property.source}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const list = (values: readonly string[] | undefined): string => (values ?? []).join(', ')

/** A reader's rule: its feature and status, what it requires and recommends, and its source */
function Rule({ rule }: { rule: ReaderRule }): ReactElement {
  return (
    <li className="structure-rule">
      <strong>{rule.readerName}</strong> · {rule.feature ?? 'No search feature'} ·{' '}
      {rule.status === 'restricted'
        ? 'shown only under conditions'
        : rule.status === 'active'
          ? 'shown'
          : 'no search feature'}
      {(rule.required?.length ?? 0) > 0 && <span> · requires {list(rule.required)}</span>}
      {rule.oneOf?.map((group) => (
        <span key={group.join()}> · one of {list(group)}</span>
      ))}
      {(rule.recommended?.length ?? 0) > 0 && <span> · recommends {list(rule.recommended)}</span>}
      {rule.conditions?.map((condition) => (
        <span key={condition}> · {condition}</span>
      ))}{' '}
      <a href={rule.source} target="_blank" rel="noreferrer" className="structure-link">
        Source, verified {rule.verifiedAt}
        <ExternalLink aria-hidden="true" />
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    </li>
  )
}

/** A type of the catalog: its properties, and each active reader's rule — never a retired one */
export function TypeDetailModal({
  type,
  onClose,
}: {
  type: string
  onClose: () => void
}): ReactElement {
  const detail = useTypeDetail(type)
  const rules =
    detail.state === 'ready' ? detail.detail.rules.filter((rule) => rule.status !== 'retired') : []
  return (
    <Modal
      title={detail.state === 'ready' ? detail.detail.type.label : type}
      onClose={onClose}
      actions={<Button onClick={onClose}>Close</Button>}
    >
      {detail.state === 'loading' && <p className="structure-note">Reading the type…</p>}
      {detail.state === 'error' && <p className="structure-note">The type could not be read.</p>}
      {detail.state === 'ready' && (
        <>
          <p className="structure-modal-lead">{detail.detail.type.description}</p>
          <h3 className="structure-label">Properties</h3>
          <Properties detail={detail.detail} />
          <h3 className="structure-label">The search engines' rules</h3>
          {rules.length === 0 ? (
            <p className="structure-note">
              No active search engine has a rule for it beyond Schema.org.
            </p>
          ) : (
            <ul className="structure-rules">
              {rules.map((rule) => (
                <Rule key={rule.reader} rule={rule} />
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  )
}
