import { useRef, useState } from 'react'
import type { SavedContent } from '../lib/api.js'
import {
  createContentItem,
  fetchContent,
  publishContentItem,
  updateContentItem,
} from '../lib/api.js'
import { ApiError } from '../lib/api-client.js'
import type { ContentItem } from '../lib/api-types.js'
import { useContentChanged } from '../shell/app-shell.js'
import { useToast } from '../ui/toast.js'
import type { Draft } from './editor-model.js'
import { type StatusChange, saveToast } from './header-model.js'
import { FieldRefusal, type SaveFailure, saveFailure } from './save-failure.js'

/** What a publication change asks for: make the saved version live, or change the status without publishing */
export type PublicationChange = 'publish' | StatusChange

const STATUS_OF: Readonly<Record<PublicationChange, string>> = {
  publish: 'published',
  unpublish: 'draft',
  archive: 'archived',
  unarchive: 'draft',
}

const DONE: Readonly<Record<StatusChange, (slug: string) => string>> = {
  unpublish: (slug) => `Unpublished ${slug}. Visitors no longer see it.`,
  archive: (slug) => `Archived ${slug}. Visitors no longer see it.`,
  unarchive: (slug) => `${slug} is a draft again. Nothing is live until you publish.`,
}

export interface ActionsInput {
  collection: string
  /** The saved document; null for a new one */
  saved: ContentItem | null
  /** The saved version the work is based on: a save sends it, so a newer one is a conflict */
  baseVersion: number | null
  /** The locale a new document is created in; the site's default locale when absent */
  newLocale: string | undefined
  draft: Draft
  newSlug: string
  /** The saved document, read again after a save, and what was sent */
  onSaved: (document: ContentItem, sent: Draft) => void
  /**
   * The saved document, read again after a publication change. Those run only
   * while nothing is unsaved (`statusBlocker`, `publishBlocker`), so the form takes it whole
   */
  onReplaced: (document: ContentItem) => void
  /** A new document was created at this slug */
  onCreated: (slug: string) => void
}

export interface EditorActions {
  busy: 'save' | 'publish' | null
  failure: SaveFailure | null
  /** Save the draft; `overwrite` names the newer version the person chose to replace */
  save: (overwrite?: number | undefined) => Promise<void>
  /** Change what visitors see; resolves true when it did */
  changePublication: (change: PublicationChange) => Promise<boolean>
}

/**
 * Whether the collection already holds a document at this slug in this
 * locale. The create endpoint would add a version to it rather than refuse
 * (an API fix is a separate change), so the editor asks first.
 */
async function slugTaken(collection: string, slug: string, locale: string | undefined) {
  try {
    const found = await fetchContent(collection, slug, locale)
    return locale === undefined || found.meta.locale === locale
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 404) return false
    throw err
  }
}

/** Create the new document, refusing a slug that is empty or already taken */
async function create(input: ActionsInput): Promise<string> {
  const { collection, draft, newLocale } = input
  const slug = input.newSlug.trim()
  if (!slug) throw new FieldRefusal('slug', 'A new document needs a slug.')
  if (await slugTaken(collection, slug, newLocale)) {
    throw new FieldRefusal(
      'slug',
      `${collection} already has a document at "${slug}". Choose another slug.`,
    )
  }
  const created = await createContentItem(collection, { slug, ...draft, locale: newLocale })
  input.onCreated(created.slug)
  return saveToast(created)
}

/** Save: a new document, or a new version of the saved one; resolves to the toast's text */
async function saveDraft(input: ActionsInput, overwrite: number | undefined): Promise<string> {
  const { collection, saved, draft } = input
  if (!saved) return create(input)
  const { slug, locale } = saved.meta
  const _version = overwrite ?? input.baseVersion ?? saved.meta.version
  const result = await updateContentItem(collection, slug, { ...draft, _version, locale })
  input.onSaved(await savedCopy(input, saved, result), draft)
  return saveToast(result)
}

/**
 * The saved document after a save: read again, or — when that read fails —
 * what was sent at the version the save answered with, so the next save is
 * based on this one and does not conflict with it
 */
async function savedCopy(
  input: ActionsInput,
  saved: ContentItem,
  result: SavedContent,
): Promise<ContentItem> {
  const { slug, locale } = saved.meta
  try {
    return await fetchContent(input.collection, slug, locale)
  } catch {
    const meta = { ...saved.meta, version: result.version, liveVersion: result.liveVersion }
    return { ...saved, ...input.draft, defaults: input.draft.defaults ?? saved.defaults, meta }
  }
}

/**
 * What Publish made live: the version the confirmation named. The API records
 * the publication as a new version with the same content, which the toast
 * names too, so neither number surprises.
 */
function publishedText(slug: string, published: number, recorded: number | null): string {
  if (recorded === null || recorded === published)
    return `Published ${slug} · v${published} is live.`
  return `Published ${slug} · v${published} is live, recorded as v${recorded}.`
}

/** Change what visitors see of the saved document; resolves to the toast's text */
async function changeLive(input: ActionsInput, change: PublicationChange): Promise<string> {
  const { collection, saved } = input
  if (!saved) throw new Error('Save the draft first.')
  const { slug, locale, version } = saved.meta
  const answer = await publishContentItem(collection, slug, { status: STATUS_OF[change], locale })
  input.onReplaced(await fetchContent(collection, slug, locale))
  return change === 'publish' ? publishedText(slug, version, answer.version) : DONE[change](slug)
}

/** Save draft and publish, with their toasts and their failures */
export function useEditorActions(input: ActionsInput): EditorActions {
  const [busy, setBusy] = useState<EditorActions['busy']>(null)
  const [failure, setFailure] = useState<SaveFailure | null>(null)
  const toast = useToast()
  const contentChanged = useContentChanged()

  // One write at a time, whatever starts it: a second would send the same version and conflict
  const running = useRef(false)

  async function run(
    kind: 'save' | 'publish',
    work: () => Promise<string>,
    fallback: string,
  ): Promise<boolean> {
    if (running.current) return false
    running.current = true
    setBusy(kind)
    setFailure(null)
    let text: string
    try {
      text = await work()
    } catch (err: unknown) {
      setFailure(saveFailure(err, fallback))
      return false
    } finally {
      running.current = false
      setBusy(null)
    }
    toast({ text })
    contentChanged()
    return true
  }

  return {
    busy,
    failure,
    save: async (overwrite) => {
      await run('save', () => saveDraft(input, overwrite), 'The draft could not be saved')
    },
    changePublication: (change) =>
      run('publish', () => changeLive(input, change), 'The change could not be made'),
  }
}
