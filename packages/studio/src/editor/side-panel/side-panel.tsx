import { ArrowLeft, PanelRightClose } from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Button, IconButton } from '../../ui/button.js'
import { MetadataEditor } from '../metadata-editor.js'
import type { EditorModeId } from '../modes.js'
import { FieldView } from './field-view.js'
import { FieldsCard } from './fields-card.js'
import { PageSectionsCard } from './page-sections-card.js'
import type { PanelDocument } from './panel-document.js'
import { ReachCard } from './reach-card.js'
import { SearchAndSharing } from './search-and-sharing.js'
import { AmbiguousSectionView, LeadView, SectionView } from './section-view.js'
import { NOTHING_SELECTED, type PanelSelection, selectionTitle } from './selection.js'
import type { PanelSelectionControl } from './use-panel-selection.js'
import './side-panel.css'

export interface SidePanelProps {
  /** The panel's id, which its collapse button controls */
  id: string
  /** Hide the panel: the canvas takes its width */
  onCollapse: () => void
  onOpenGraph?: (() => void) | undefined
  /** The open mode: Structure shows the fields in its form, Live shows the page itself */
  mode: EditorModeId
  groupActions?: ((slot: string) => ReactNode) | undefined

  doc: PanelDocument
  control: PanelSelectionControl
  /** Focus a field in Structure mode: the Edit of an advice */
  onEditField: (name: string) => void
  /** Switch to Data mode; null while it is open */
  onOpenData: (() => void) | null
}

/** What the panel shows for the selection */
function PanelBody(props: SidePanelProps): ReactElement {
  const { doc, control, onEditField, onOpenData } = props
  const { selection } = control
  const fromPanel = (next: PanelSelection): void => control.select(next, true)
  // Structure's form holds the metadata; Live has the page for its sections, and the header for its locales
  const editable = props.mode !== 'structure'
  const overview = props.mode !== 'live'
  const metadata = {
    contract: doc.schema.contract,
    metadata: doc.draft.metadata,
    fields: doc.draft.fields,
    onOpenData: onOpenData ? (props.onOpenGraph ?? onOpenData) : null,
    groupActions: props.groupActions,
    defaults: doc.defaults,
    readOnly: doc.readOnly,
    errors: doc.fieldErrors,
    onMetadata: doc.onMetadata,
  }
  switch (selection.kind) {
    case 'field':
      return <FieldView doc={doc} name={selection.name} />
    case 'section':
      if (selection.ambiguous) return <AmbiguousSectionView doc={doc} heading={selection.heading} />
      return <SectionView doc={doc} heading={selection.heading} index={selection.index} />
    case 'lead':
      return <LeadView doc={doc} />
    default:
      return (
        <>
          {editable && <MetadataEditor scope="metadata" {...metadata} system={doc.meta} />}
          <SearchAndSharing
            doc={doc}
            onEditField={onEditField}
            renderFields={
              editable
                ? (checks) => <MetadataEditor scope="sharing" checks={checks} {...metadata} />
                : null
            }
          />
          {doc.readOnly && doc.meta && <FieldsCard doc={doc} onSelect={fromPanel} />}
          {overview && <PageSectionsCard doc={doc} onSelect={fromPanel} />}
          {overview && <ReachCard doc={doc} />}
        </>
      )
  }
}

/** The heading takes focus when the panel asks for it — after a change made from inside the panel */
function useHeadingFocus(focusTick: number): RefObject<HTMLHeadingElement | null> {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusTick > 0) ref.current?.focus()
  }, [focusTick])
  return ref
}

/** What a screen reader hears when the panel's content changes — nothing on first show */
function useAnnouncement(title: string): string {
  const [said, setSaid] = useState('')
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaid(`Side panel: ${title}`)
  }, [title])
  return said
}

/**
 * The editor's side panel, beside the canvas: with nothing selected, Page &
 * sections, Search and sharing and Reach (Live shows neither Page & sections
 * nor Reach: the page and the header hold them); otherwise the selected field, section or
 * lead. Esc or Page overview returns to nothing selected.
 */
export function SidePanel(props: SidePanelProps): ReactElement {
  const { control } = props
  const title = selectionTitle(control.selection)
  const headingRef = useHeadingFocus(control.focusTick)
  const announcement = useAnnouncement(title)
  const selected = control.selection.kind !== 'none'
  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Escape' || event.defaultPrevented || !selected) return
    event.preventDefault()
    control.select(NOTHING_SELECTED, true)
  }
  return (
    <aside id={props.id} className="side-panel" aria-label="Side panel" onKeyDown={onKeyDown}>
      <div className="side-panel-head">
        <h2 ref={headingRef} tabIndex={-1} className="side-panel-title">
          {title}
        </h2>
        {selected && (
          <Button
            size="sm"
            variant="ghost"
            icon={ArrowLeft}
            onClick={() => control.select(NOTHING_SELECTED, true)}
          >
            Page overview
          </Button>
        )}
        <IconButton
          id={`${props.id}-hide`}
          icon={PanelRightClose}
          label="Hide side panel"
          size="sm"
          aria-expanded="true"
          aria-controls={props.id}
          onClick={props.onCollapse}
        />
      </div>
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
      <div className="side-panel-body">
        <PanelBody {...props} />
      </div>
    </aside>
  )
}
