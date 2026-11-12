import { Check, Copy } from 'lucide-react'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/button.js'
import './json-ld-code.css'

/** What Copy last did: nothing yet, copied, or failed (no clipboard, or permission refused) */
type CopyState = 'idle' | 'copied' | 'failed'

const COPY_STATUS: Readonly<Record<CopyState, string>> = {
  idle: '',
  copied: 'JSON-LD copied',
  failed: 'Could not copy. Select the text and copy it yourself.',
}

/** Copy to the clipboard; says what happened for a moment, to a screen reader too */
function useCopy(text: string): { state: CopyState; copy: () => void } {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  function settle(next: CopyState): void {
    setState(next)
    if (timer.current) clearTimeout(timer.current)
    if (next === 'copied') timer.current = setTimeout(() => setState('idle'), 2000)
  }
  function copy(): void {
    if (!navigator.clipboard) {
      settle('failed')
      return
    }
    navigator.clipboard.writeText(text).then(
      () => settle('copied'),
      () => settle('failed'),
    )
  }
  return { state, copy }
}

/** JSON-LD as formatted source in the code face, with Copy */
export function JsonLdCode({ data, label }: { data: unknown; label: string }): ReactElement {
  const text = JSON.stringify(data, null, 2)
  const { state, copy } = useCopy(text)
  const copied = state === 'copied'
  return (
    <div className="json-ld-code">
      <div className="json-ld-code-head">
        <span className="json-ld-code-label">{label}</span>
        <Button size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <span
          className={state === 'failed' ? 'json-ld-code-status' : 'visually-hidden'}
          role="status"
        >
          {COPY_STATUS[state]}
        </span>
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region is reachable by keyboard */}
      <section className="json-ld-code-source" tabIndex={0} aria-label={label}>
        <pre>
          <code>{text}</code>
        </pre>
      </section>
    </div>
  )
}
