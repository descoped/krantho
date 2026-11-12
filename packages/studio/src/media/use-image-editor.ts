import { useEffect, useState } from 'react'
import { fetchMediaItem, type MediaHotspot, type MediaItem, updateMedia } from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { useToast } from '../ui/toast.js'
import { type PercentRegion, toMediaCrop, toPercentRegion } from './image-editor-model.js'

export type EditorTool = 'crop' | 'hotspot'

type Loaded =
  | { state: 'loading' }
  | { state: 'missing'; message: string }
  | { state: 'ready'; item: MediaItem }

export interface ImageEditor {
  loaded: Loaded
  tool: EditorTool
  setTool: (tool: EditorTool) => void
  crop: PercentRegion | undefined
  setCrop: (crop: PercentRegion | undefined) => void
  aspect: number | undefined
  setAspect: (aspect: number | undefined) => void
  hotspot: MediaHotspot | null
  setHotspot: (hotspot: MediaHotspot | null) => void
  dirty: boolean
  busy: boolean
  /** The viewer's role cannot change the file: nothing is drawn or saved */
  readOnly: boolean
  /** Changes after each save, so the previews are read again */
  version: number
  save: () => Promise<void>
  reset: () => Promise<void>
}

function useItem(id: string): [Loaded, (item: MediaItem) => void] {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  useEffect(() => {
    let active = true
    setLoaded({ state: 'loading' })
    fetchMediaItem(id)
      .then((item) => active && setLoaded({ state: 'ready', item }))
      .catch(
        (err: unknown) =>
          active &&
          setLoaded({ state: 'missing', message: errorMessage(err, 'The file could not be read') }),
      )
    return () => {
      active = false
    }
  }, [id])
  return [loaded, (item) => setLoaded({ state: 'ready', item })]
}

/** Crop and hotspot as drawn, starting from what the file has saved */
function useDrawing(loaded: Loaded): {
  crop: PercentRegion | undefined
  hotspot: MediaHotspot | null
  set: (crop: PercentRegion | undefined, hotspot: MediaHotspot | null) => void
} {
  const [crop, setCrop] = useState<PercentRegion | undefined>(undefined)
  const [hotspot, setHotspot] = useState<MediaHotspot | null>(null)
  const item = loaded.state === 'ready' ? loaded.item : null
  useEffect(() => {
    setCrop(item?.crop ? toPercentRegion(item.crop) : undefined)
    setHotspot(item?.hotspot ?? null)
  }, [item])
  return {
    crop,
    hotspot,
    set: (nextCrop, nextHotspot) => {
      setCrop(nextCrop)
      setHotspot(nextHotspot)
    },
  }
}

/** Save a crop and hotspot on the file, saying how it went; `onSaved` gets the saved file */
function useSaveFraming(
  id: string,
  readOnly: boolean,
  onSaved: (item: MediaItem) => void,
): {
  busy: boolean
  write: (
    crop: PercentRegion | undefined,
    hotspot: MediaHotspot | null,
    done: string,
  ) => Promise<void>
} {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function write(
    crop: PercentRegion | undefined,
    hotspot: MediaHotspot | null,
    done: string,
  ): Promise<void> {
    // A role that cannot edit never writes, whatever reaches here
    if (readOnly) return
    setBusy(true)
    try {
      onSaved(await updateMedia(id, { crop: toMediaCrop(crop), hotspot }))
      toast({ text: done })
    } catch (err: unknown) {
      toast({ text: errorMessage(err, 'The crop could not be saved'), tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return { busy, write }
}

/**
 * The image editor's state: the file, the drawn crop and hotspot, and Save and
 * Reset. Read-only, the drawing never changes and nothing is written.
 */
export function useImageEditor(id: string, readOnly: boolean): ImageEditor {
  const [loaded, setItem] = useItem(id)
  const drawing = useDrawing(loaded)
  const [tool, setTool] = useState<EditorTool>('crop')
  const [aspect, setAspect] = useState<number | undefined>(undefined)
  const [dirty, setDirty] = useState(false)
  const [version, setVersion] = useState(0)
  const { busy, write } = useSaveFraming(id, readOnly, (item) => {
    setItem(item)
    setDirty(false)
    setVersion((v) => v + 1)
  })
  const draw = (crop: PercentRegion | undefined, hotspot: MediaHotspot | null): void => {
    if (readOnly) return
    drawing.set(crop, hotspot)
    setDirty(true)
  }
  return {
    loaded,
    tool,
    setTool,
    crop: drawing.crop,
    setCrop: (crop) => draw(crop, drawing.hotspot),
    aspect,
    setAspect: (next) => {
      setAspect(next)
      drawing.set(undefined, drawing.hotspot)
    },
    hotspot: drawing.hotspot,
    setHotspot: (hotspot) => draw(drawing.crop, hotspot),
    dirty,
    busy,
    readOnly,
    version,
    save: () => write(drawing.crop, drawing.hotspot, 'Crop and hotspot saved.'),
    reset: () => write(undefined, null, 'Crop and hotspot removed; the original framing is back.'),
  }
}
