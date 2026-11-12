import { useRef, useState } from 'react'
import {
  duplicateMedia,
  type MediaItem,
  moveMediaToFolder,
  replaceMedia,
  updateMedia,
} from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { useToast } from '../ui/toast.js'
import { documentsText } from './media-model.js'

/** An action on the open file: busy while it runs, a toast for how it went */
export interface Action<A extends unknown[]> {
  busy: boolean
  run: (...args: A) => Promise<void>
}

/**
 * Run a write, saying how it went: the success text from its result, or the
 * API's error. Only one run at a time.
 */
function useAction<A extends unknown[], R>(
  write: (...args: A) => Promise<R>,
  success: (result: R) => string,
  failure: string,
  onDone: (result: R) => void,
): Action<A> {
  const [busy, setBusy] = useState(false)
  // A ref, not the state: two clicks in one tick both see the state before it updates
  const running = useRef(false)
  const toast = useToast()
  async function run(...args: A): Promise<void> {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      const result = await write(...args)
      toast({ text: success(result) })
      onDone(result)
    } catch (err: unknown) {
      toast({ text: errorMessage(err, failure), tone: 'error' })
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return { busy, run }
}

/** What the drawer saves on the file: its name, alt text and tags */
export interface Details {
  filename: string
  altText: string
  tags: string[]
}

export function useSaveDetails(
  item: MediaItem,
  onSaved: (item: MediaItem) => void,
): Action<[Details]> {
  return useAction(
    (details: Details) =>
      updateMedia(item.id, {
        altText: details.altText,
        tags: details.tags,
        ...(details.filename !== item.filename ? { filename: details.filename } : {}),
      }),
    () => 'Saved on the media file.',
    'The file could not be saved',
    onSaved,
  )
}

/** Save only the alt text, leaving the file's name and tags as they are */
export function useSaveAlt(item: MediaItem, onSaved: (item: MediaItem) => void): Action<[string]> {
  return useAction(
    (altText: string) => updateMedia(item.id, { altText }),
    () => 'Alt text saved on the media file.',
    'The alt text could not be saved',
    onSaved,
  )
}

/**
 * Replace the file behind the id. The id stays, so documents that hold it
 * show the new file; documents holding the old store URL are rewritten.
 */
export function useReplace(item: MediaItem, onReplaced: (item: MediaItem) => void): Action<[File]> {
  return useAction(
    (file: File) => replaceMedia(item.id, file),
    (replaced) => {
      const rewritten = replaced._referencesUpdated ?? 0
      const note =
        rewritten > 0
          ? ` ${documentsText(rewritten)} that held its old URL now ${rewritten === 1 ? 'holds' : 'hold'} the new one.`
          : ''
      return `${item.filename} replaced; it keeps its id, so pages that use it show the new file.${note}`
    },
    'The file could not be replaced',
    onReplaced,
  )
}

export function useDuplicate(item: MediaItem, onDuplicated: (copy: MediaItem) => void): Action<[]> {
  return useAction(
    () => duplicateMedia(item.id),
    (copy) => `Duplicated as ${copy.filename}, with a new id.`,
    'The file could not be duplicated',
    onDuplicated,
  )
}

export function useMove(
  item: MediaItem,
  onMoved: (item: MediaItem) => void,
): Action<[string | null]> {
  return useAction(
    (folder: string | null) => moveMediaToFolder(item.id, folder),
    () => 'Moved.',
    'The file could not be moved',
    onMoved,
  )
}

/**
 * Copy text to the clipboard, announced either way: `what` names it in the
 * toast ("Markdown", "ID"); when the browser refuses, the error toast carries
 * the text to copy by hand.
 */
export function useCopy(): (text: string, what: string) => void {
  const toast = useToast()
  return (text, what) => {
    const refused = (): void =>
      toast({ text: `Could not copy. Copy it yourself: ${text}`, tone: 'error' })
    if (!navigator.clipboard) {
      refused()
      return
    }
    navigator.clipboard
      .writeText(text)
      .then(() => toast({ text: `${what} copied: ${text}` }), refused)
  }
}
