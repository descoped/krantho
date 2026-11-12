import { MonitorX, RotateCw } from 'lucide-react'
import { type ReactElement, type RefObject, useEffect, useRef } from 'react'
import { Button } from '../ui/button.js'
import { focusIsLost } from './live-focus.js'
import type { FrameState } from './live-frame-state.js'
import '../ui/empty-state.css'

export interface LiveEmptyProps {
  title: string
  detail: string
  /** The URL a load tried; none when the preview was ruled out beforehand */
  tried?: string | undefined
  onReload?: (() => void) | undefined
  onStructure: () => void
  /**
   * A load was tried and failed — possibly after the page was shown, with
   * focus in the frame or the inline editor that are now gone: the state is an
   * alert, and its heading takes focus that would otherwise be lost
   */
  announce?: boolean | undefined
}

/** Focus the heading when focus would otherwise be lost: on the page itself, or nowhere */
function useCatchFocus(announce: boolean): RefObject<HTMLHeadingElement | null> {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (announce && focusIsLost()) ref.current?.focus()
  }, [announce])
  return ref
}

/**
 * Live mode's empty state, in the shape of Studio's empty state with a real
 * heading. A preview that was tried says so, with the URL it tried and Reload
 * the preview; one ruled out beforehand says why. Structure mode always edits
 * every field and section.
 */
export function LiveEmpty(props: LiveEmptyProps): ReactElement {
  const { title, detail, tried, onReload, onStructure, announce = false } = props
  const heading = useCatchFocus(announce)
  return (
    <div className="live-empty" role={announce ? 'alert' : undefined}>
      <div className="ui-empty-state">
        <span className="ui-empty-state-icon" aria-hidden="true">
          <MonitorX />
        </span>
        <h2 ref={heading} tabIndex={-1} className="ui-empty-state-title">
          {title}
        </h2>
        <div className="ui-empty-state-body">
          <p>{detail}</p>
          {tried && (
            <p>
              Tried <code className="live-empty-url">{tried}</code>
            </p>
          )}
          <p>Every field and section can still be edited in Structure mode.</p>
        </div>
        <div className="ui-empty-state-action">
          {onReload && (
            <Button icon={RotateCw} onClick={onReload}>
              Reload the preview
            </Button>
          )}
          <Button onClick={onStructure}>Switch to Structure mode</Button>
        </div>
      </div>
    </div>
  )
}

const SIGN_IN_EXPIRED =
  'The preview answered with an error — for example, your sign-in expired. Reload Studio and try again.'

/** What an error answer says: the page the site has none of, a refusal, or the status it gave */
function answered(path: string, status: number): { title: string; detail: string } {
  const title = 'The page preview did not load'
  if (status === 404) {
    return {
      title: 'The site has no page for this document',
      detail: `${path} answered 404: the site’s page templates do not render this document.`,
    }
  }
  const refused = status === 401 || status === 403
  if (status >= 400 && !refused) return { title, detail: `${path} answered ${status}.` }
  // A refusal, or an answer whose status the browser does not report
  return { title, detail: SIGN_IN_EXPIRED }
}

/** The heading and the reason of a preview that was tried and failed */
export function failure(state: FrameState): { title: string; detail: string } {
  if (state.kind === 'failed' && state.why === 'error') return answered(state.path, state.status)
  const why = state.kind === 'failed' ? state.why : 'unreadable'
  if (why === 'left') {
    return {
      title: 'The preview left the page',
      detail:
        'It went to a page Studio cannot read — another site, or the browser’s own error page.',
    }
  }
  const title = 'The page preview did not load'
  if (why === 'timeout') return { title, detail: 'The preview took too long to load.' }
  return {
    title,
    detail: 'Studio cannot read the preview: it did not load, or it is not on this site’s origin.',
  }
}
