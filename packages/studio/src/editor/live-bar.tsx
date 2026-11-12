import type { ReactElement } from 'react'
import { Button } from '../ui/button.js'
import type { FoundMark } from './live-marks.js'
import type { LiveFrame } from './use-live-frame.js'

/** No element of the page carries the document's marks */
function NoMarks(): ReactElement {
  return (
    <p className="live-toolbar side-note" role="status">
      No element of this page carries the document’s marks: edit it in Structure mode.
    </p>
  )
}

/** The way in: click the text. The keyboard's way is Structure mode, which edits the same content */
function LiveToolbar({ marks }: { marks: readonly FoundMark[] }): ReactElement {
  if (marks.length === 0) return <NoMarks />
  return (
    <p className="live-toolbar side-note">
      Click text on the page to edit it. To edit with the keyboard, use Structure.
    </p>
  )
}

/** What shows above the frame: how to edit, the loading status, or where the frame has gone */
export function LiveBar({
  frame,
  onReload,
}: {
  frame: LiveFrame
  onReload: () => void
}): ReactElement {
  const { state } = frame
  if (state.kind === 'ready') {
    return <LiveToolbar marks={frame.marks} />
  }
  if (state.kind === 'moved') {
    // An alert: it replaces the inline editor, and Back to the page takes the focus it held
    return (
      <div className="live-toolbar live-moved" role="alert">
        <p>
          The preview moved to <code>{state.path}</code>
        </p>
        <Button size="sm" onClick={onReload}>
          Back to the page
        </Button>
      </div>
    )
  }
  return (
    <p className="live-toolbar side-note" role="status">
      Loading the draft preview…
    </p>
  )
}
