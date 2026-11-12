import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Eye } from 'lucide-react'
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { formatShortDateTime } from '../../lib/format.js'
import { lockHolderName } from '../../lib/locks.js'
import { Button, IconButton } from '../../ui/button.js'
import { Chip } from '../../ui/chip.js'
import type { VersionEntry } from './history-model.js'
import { SnapshotPreview } from './snapshot-preview.js'

export interface VersionTimelineProps {
  versions: readonly VersionEntry[]
  collection: string
  slug: string
  locale: string
  saved: { version: number; liveVersion: number | null }
  unsaved: boolean
  actions: (index: number) => ReactNode
}

/** Full metadata and actions stay behind a disclosure, outside the timeline's height. */
function SnapshotDetails(props: {
  entry: VersionEntry
  actions: ReactNode
  onPreview: () => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLFieldSetElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent): void => {
      const target = event.target as Element | null
      if (target?.closest('.ui-modal-layer') || ref.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  return (
    <fieldset
      ref={ref}
      className="snapshot-disclosure"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.stopPropagation()
        setOpen(false)
        trigger.current?.focus()
      }}
    >
      <Button
        ref={trigger}
        size="sm"
        variant="ghost"
        aria-label="Snapshot details"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        v{props.entry.version} · Details
        {open ? (
          <ChevronUp size={14} aria-hidden="true" />
        ) : (
          <ChevronDown size={14} aria-hidden="true" />
        )}
      </Button>
      {open && (
        <section id={id} className="snapshot-popover" aria-label="Selected snapshot">
          <strong>Snapshot v{props.entry.version}</strong>
          <time dateTime={props.entry.createdAt}>{formatShortDateTime(props.entry.createdAt)}</time>
          <span>
            {props.entry.changedBy ? lockHolderName(props.entry.changedBy) : 'Unknown author'}
          </span>
          <div className="snapshot-actions">
            <Button size="sm" variant="ghost" icon={Eye} onClick={props.onPreview}>
              Preview snapshot
            </Button>
            {props.actions}
          </div>
        </section>
      )}
    </fieldset>
  )
}

/** Discrete revisions on a compact ruler: the square selects, the viewport scrolls. */
export function VersionTimeline(props: VersionTimelineProps): ReactElement {
  const [selection, setSelection] = useState<{ saved: number; version: number } | null>(null)
  const selected =
    selection?.saved === props.saved.version ? selection.version : props.saved.version
  const [preview, setPreview] = useState<number | null>(null)
  // One snapshot has nothing to move between: the ruler starts closed
  const [expandedChoice, setExpanded] = useState<boolean | null>(null)
  const expanded = expandedChoice ?? props.versions.length > 1
  const viewport = useRef<HTMLDivElement>(null)
  const id = useId()
  const index = Math.max(
    0,
    props.versions.findIndex((v) => v.version === selected),
  )
  const entry = props.versions[index]
  const chronological = [...props.versions].reverse()
  const position = chronological.length - 1 - index
  const dragging = useRef(false)
  const reveal = (): void => {
    const scroller = viewport.current
    const stop = scroller?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!scroller || !stop) return
    const left = stop.offsetLeft - (scroller.clientWidth - stop.offsetWidth) / 2
    scroller.scrollTo?.({ left, behavior: 'instant' })
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: selection and reopening reveal the selected tick
  useEffect(() => {
    if (expanded && !dragging.current) reveal()
  }, [position, expanded])
  const choose = (at: number): void => {
    const version = chronological[at]
    if (version) setSelection({ saved: props.saved.version, version: version.version })
  }
  return (
    <>
      <div className="snapshot-heading">
        <Button
          size="sm"
          variant="ghost"
          icon={Clock}
          aria-label={expanded ? 'Collapse snapshot timeline' : 'Expand snapshot timeline'}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          Snapshots <small>{props.versions.length}</small>
          {expanded ? (
            <ChevronUp size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
        </Button>
        {props.unsaved && <Chip tone="accent">Unsaved changes</Chip>}
        {entry && (
          <SnapshotDetails
            entry={entry}
            actions={props.actions(index)}
            onPreview={() => setPreview(entry.version)}
          />
        )}
      </div>
      {expanded && (
        <div id={id} className="snapshot-navigation">
          <IconButton
            icon={ChevronLeft}
            label="Older snapshot"
            size="sm"
            disabled={position <= 0}
            onClick={() => choose(position - 1)}
          />
          <div ref={viewport} className="snapshot-viewport">
            <div
              className="snapshot-ruler"
              style={
                {
                  minWidth: `${Math.max(1, chronological.length) * 104}px`,
                  '--snapshot-edge': `${50 / Math.max(1, chronological.length)}%`,
                } as CSSProperties
              }
            >
              <ol className="snapshot-markers" aria-label="Saved snapshots">
                {chronological.map((version, i) => (
                  <li key={version.version}>
                    <button
                      type="button"
                      className="snapshot-stop"
                      aria-label={`Select snapshot v${version.version}`}
                      aria-pressed={i === position}
                      title={formatShortDateTime(version.createdAt)}
                      onClick={() => choose(i)}
                    >
                      <span className="snapshot-label">
                        v{version.version}
                        {version.version === props.saved.version && <span>Current</span>}
                        {version.version === props.saved.liveVersion && (
                          <span className="snapshot-live">Live</span>
                        )}
                      </span>
                      <span className="snapshot-tick" aria-hidden="true" />
                      <time dateTime={version.createdAt}>
                        {new Date(version.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    </button>
                  </li>
                ))}
              </ol>
              {chronological.length > 1 && (
                <input
                  className="snapshot-slider"
                  onPointerDown={() => {
                    dragging.current = true
                  }}
                  onPointerUp={() => {
                    dragging.current = false
                    reveal()
                  }}
                  onPointerCancel={() => {
                    dragging.current = false
                    reveal()
                  }}
                  type="range"
                  aria-label="Snapshot selection"
                  min={0}
                  max={chronological.length - 1}
                  step={1}
                  value={position}
                  aria-valuetext={`v${entry?.version}: ${formatShortDateTime(entry?.createdAt ?? '')}`}
                  onChange={(event) => choose(Number(event.target.value))}
                />
              )}
              {chronological.length === 1 && (
                <span className="snapshot-single" aria-hidden="true" />
              )}
            </div>
          </div>
          <IconButton
            icon={ChevronRight}
            label="Newer snapshot"
            size="sm"
            disabled={position >= chronological.length - 1}
            onClick={() => choose(position + 1)}
          />
        </div>
      )}
      {preview !== null && (
        <SnapshotPreview
          collection={props.collection}
          slug={props.slug}
          locale={props.locale}
          version={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  )
}
