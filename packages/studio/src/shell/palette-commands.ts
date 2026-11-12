import {
  Archive,
  FilePlus,
  type LucideIcon,
  Network,
  UploadCloud,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { CollectionInfo } from '../lib/api.js'
import { createCheckpoint, fetchCollections } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { isEnabled, useCapabilities } from '../lib/capabilities.js'
import { collectionLabel } from '../lib/format.js'
import { FILL_MISSING_PATH, newDocumentPath } from '../lib/paths.js'

/** A command the palette lists when there is no query */
export interface PaletteCommand {
  id: string
  label: string
  detail: string
  icon: LucideIcon
  run: () => void | Promise<void>
}

export interface CommandActions {
  /** Close the palette */
  close: () => void
  /** Ask before publishing every draft ahead of live */
  confirmPublishAll: () => Promise<void>
}

/** The first collection whose documents render as pages, once the collections have loaded */
function usePageCollection(): CollectionInfo | null {
  const [collection, setCollection] = useState<CollectionInfo | null>(null)
  useEffect(() => {
    let active = true
    fetchCollections()
      .then((collections) => {
        if (active) setCollection(collections.find((c) => c.pages) ?? null)
      })
      .catch(() => {
        // Without collections there is no New page command
      })
    return () => {
      active = false
    }
  }, [])
  return collection
}

/** What decides the commands: the viewer's role, the site's capabilities, the page collection */
interface CommandContext {
  canEdit: boolean
  checkpoints: boolean
  seo: boolean
  pages: CollectionInfo | null
  /** Close the palette and open a path */
  go: (path: string) => () => void
  confirmPublishAll: () => Promise<void>
}

function contentCommands({
  canEdit,
  pages,
  go,
  confirmPublishAll,
}: CommandContext): PaletteCommand[] {
  if (!canEdit) return []
  const commands: PaletteCommand[] = []
  if (pages) {
    commands.push({
      id: 'new-page',
      label: 'New page',
      detail: `In ${collectionLabel(pages.name)}`,
      icon: FilePlus,
      run: go(newDocumentPath(pages.name)),
    })
  }
  commands.push({
    id: 'publish-all',
    label: 'Publish all drafts ahead of live',
    detail: 'Asks before publishing',
    icon: UploadCloud,
    run: confirmPublishAll,
  })
  return commands
}

function siteCommands({ canEdit, checkpoints, seo, go }: CommandContext): PaletteCommand[] {
  const commands: PaletteCommand[] = []
  if (canEdit && checkpoints) {
    commands.push({
      id: 'checkpoint',
      label: 'Create checkpoint',
      detail: 'A restorable copy of the whole content store',
      icon: Archive,
      run: async () => {
        await createCheckpoint()
        go('/setup/checkpoints')()
      },
    })
  }
  if (canEdit && seo) {
    commands.push({
      id: 'enrich',
      label: 'Enrich missing SEO',
      detail: "Opens Structure's Fill what's missing",
      icon: WandSparkles,
      run: go(FILL_MISSING_PATH),
    })
  }
  if (seo) {
    commands.push({
      id: 'structure',
      label: 'Structure',
      detail: 'How search engines and assistants read the site',
      icon: Network,
      run: go('/structure'),
    })
  }
  return commands
}

/**
 * The palette's commands, each hidden when the site's capabilities or the
 * viewer's role rule it out.
 */
export function usePaletteCommands({ close, confirmPublishAll }: CommandActions): PaletteCommand[] {
  const navigate = useNavigate()
  const caps = useCapabilities()
  const { hasRole } = useAuth()
  const pages = usePageCollection()
  const canEdit = hasRole('editor')
  const checkpoints = isEnabled(caps, 'checkpoints')
  const seo = isEnabled(caps, 'seo')

  return useMemo(() => {
    const go = (path: string) => (): void => {
      close()
      void navigate(path)
    }
    const context = { canEdit, checkpoints, seo, pages, go, confirmPublishAll }
    return [...contentCommands(context), ...siteCommands(context)]
  }, [canEdit, checkpoints, seo, pages, close, confirmPublishAll, navigate])
}
