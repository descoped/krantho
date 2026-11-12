import { Upload } from 'lucide-react'
import { type DragEvent, type ReactElement, useRef, useState } from 'react'
import { ActionButton } from '../editor/action-button.js'
import { type MediaItem, uploadMedia } from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { filesText } from './media-model.js'
import './drop-zone.css'

/** Where an upload run is: files go up one at a time, each failing on its own */
type Progress =
  | { state: 'idle' }
  | { state: 'uploading'; done: number; total: number; name: string }
  | { state: 'finished'; uploaded: number }
  /** Files were dropped by a role that cannot upload */
  | { state: 'refused' }

interface Failure {
  name: string
  error: string
}

/** Upload the files in order; report each before it starts, and keep every failure */
async function uploadAll(
  files: readonly File[],
  onProgress: (progress: Progress) => void,
): Promise<{ uploaded: MediaItem[]; failures: Failure[] }> {
  const uploaded: MediaItem[] = []
  const failures: Failure[] = []
  for (const [index, file] of files.entries()) {
    onProgress({ state: 'uploading', done: index, total: files.length, name: file.name })
    try {
      uploaded.push(await uploadMedia(file))
    } catch (err: unknown) {
      failures.push({ name: file.name, error: errorMessage(err, 'Upload failed') })
    }
  }
  onProgress({ state: 'finished', uploaded: uploaded.length })
  return { uploaded, failures }
}

function progressText(progress: Progress): string {
  if (progress.state === 'uploading') {
    return `Uploading ${progress.done + 1} of ${progress.total}: ${progress.name}…`
  }
  if (progress.state === 'finished') return `Uploaded ${filesText(progress.uploaded)}.`
  if (progress.state === 'refused') return 'Your role cannot upload files.'
  return ''
}

/** The upload run: progress, failures, and a start that refuses a second run while one is going */
function useUpload(onUploaded: (items: MediaItem[]) => void): {
  progress: Progress
  failures: Failure[]
  start: (files: readonly File[]) => void
  refuse: () => void
} {
  const [progress, setProgress] = useState<Progress>({ state: 'idle' })
  const [failures, setFailures] = useState<Failure[]>([])
  const busy = progress.state === 'uploading'
  function start(files: readonly File[]): void {
    if (busy || files.length === 0) return
    setFailures([])
    void uploadAll(files, setProgress).then((result) => {
      setFailures(result.failures)
      if (result.uploaded.length > 0) onUploaded(result.uploaded)
    })
  }
  return { progress, failures, start, refuse: () => setProgress({ state: 'refused' }) }
}

export interface DropZoneProps {
  /** Called once a run has uploaded at least one file */
  onUploaded: (items: MediaItem[]) => void
  /** Why this viewer cannot upload; null when they can */
  blocked: string | null
  /** Accept several files at once */
  multiple?: boolean | undefined
}

/**
 * Files dragged over the zone: highlighted while over, handed on when dropped.
 * Blocked, a drop is still taken (so it can be refused aloud) but never highlighted.
 */
function useFileDrop(
  onFiles: (files: File[]) => void,
  blocked: boolean,
): {
  over: boolean
  handlers: {
    onDragOver: (event: DragEvent<HTMLElement>) => void
    onDragLeave: () => void
    onDrop: (event: DragEvent<HTMLElement>) => void
  }
} {
  const [over, setOver] = useState(false)
  return {
    over,
    handlers: {
      onDragOver: (event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        if (!blocked) setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (event) => {
        event.preventDefault()
        setOver(false)
        onFiles([...event.dataTransfer.files])
      },
    },
  }
}

/** The run's progress, announced politely, and each failure as an alert */
function UploadStatus({
  progress,
  failures,
}: {
  progress: Progress
  failures: readonly Failure[]
}): ReactElement {
  return (
    <>
      <p className="media-drop-progress" role="status">
        {progressText(progress)}
      </p>
      <ul className="media-drop-failures" role="alert">
        {failures.map((failure) => (
          <li key={failure.name}>
            {failure.name}: {failure.error}
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Drop images here, or Choose files from the keyboard. Files go up one at a
 * time; the progress is announced as it moves, and each failure as an alert.
 */
export function DropZone({ onUploaded, blocked, multiple = true }: DropZoneProps): ReactElement {
  const input = useRef<HTMLInputElement>(null)
  const { progress, failures, start, refuse } = useUpload(onUploaded)
  const { over, handlers } = useFileDrop(
    (files) => (blocked ? refuse() : start(files)),
    blocked !== null,
  )
  const choose = multiple ? 'Choose files' : 'Choose a file'
  return (
    <section
      className={`media-drop${over ? ' media-drop--over' : ''}`}
      aria-label="Upload"
      {...handlers}
    >
      <Upload className="media-drop-icon" aria-hidden="true" />
      <p>{multiple ? 'Drop images here, or' : 'Drop an image here, or'}</p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        aria-label={choose}
        onChange={(event) => {
          start([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
      <ActionButton size="sm" reason={blocked} onClick={() => input.current?.click()}>
        {choose}
      </ActionButton>
      <UploadStatus progress={progress} failures={failures} />
    </section>
  )
}
