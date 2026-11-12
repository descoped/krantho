import { diffLines, diffWords } from 'diff'
import type { DocumentChange, FieldChange } from '../../lib/api-assistant.js'

interface Part {
  value: string
  added?: boolean
  removed?: boolean
}

/** Inserted and removed text, marked for sight and for screen readers */
function DiffParts({ parts }: { parts: readonly Part[] }): React.ReactElement {
  return (
    <>
      {parts.map((part, index) => {
        const key = `${index}-${part.added ? 'a' : part.removed ? 'r' : 'c'}`
        if (part.added) {
          return (
            <ins key={key} className="assistant-diff-added">
              <span className="assistant-sr-only">added: </span>
              {part.value}
            </ins>
          )
        }
        if (part.removed) {
          return (
            <del key={key} className="assistant-diff-removed">
              <span className="assistant-sr-only">removed: </span>
              {part.value}
            </del>
          )
        }
        return <span key={key}>{part.value}</span>
      })}
    </>
  )
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

/** A field's change: a word diff for text, the values side by side otherwise */
function fieldParts(change: FieldChange): Part[] {
  const { before, after } = change
  if ((typeof before === 'string' || isEmpty(before)) && typeof after === 'string') {
    return diffWords(isEmpty(before) ? '' : (before as string), after)
  }
  const parts: Part[] = []
  if (!isEmpty(before)) parts.push({ value: asText(before), removed: true })
  if (!isEmpty(after)) parts.push({ value: asText(after), added: true })
  return parts
}

/** What a proposal or a draft write changes in one document */
export function DocumentChangeView({ change }: { change: DocumentChange }): React.ReactElement {
  const { ref } = change
  const origin = change.baseVersion === 0 ? 'new document' : `from v${change.baseVersion}`
  return (
    <div className="assistant-change">
      <p className="assistant-change-heading">
        {ref.collection}/{ref.slug}{' '}
        <span className="assistant-muted">
          ({ref.locale}, {origin})
        </span>
      </p>
      <dl className="assistant-change-list">
        {change.status && (
          <div className="assistant-change-row">
            <dt>status</dt>
            <dd>
              {change.status.before} → {change.status.after}
            </dd>
          </div>
        )}
        {change.fields.map((field) => (
          <div key={field.name} className="assistant-change-row">
            <dt>{field.name}</dt>
            <dd className="assistant-change-value">
              <DiffParts parts={fieldParts(field)} />
            </dd>
          </div>
        ))}
        {change.body && (
          <div className="assistant-change-row">
            <dt>body</dt>
            <dd>
              <pre className="assistant-change-body">
                <DiffParts parts={diffLines(change.body.before, change.body.after)} />
              </pre>
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
