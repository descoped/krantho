import { Plus } from 'lucide-react'
import { type ReactElement, type RefObject, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { errorMessage } from '../lib/fetch.js'
import { editorPath } from '../lib/paths.js'
import { Button } from '../ui/button.js'
import { chipClass } from '../ui/chip.js'
import { Modal } from '../ui/modal.js'
import { useToast } from '../ui/toast.js'
import { useLocaleVersions, type VersionState } from './use-locale-versions.js'

export interface LocaleChipsProps {
  collection: string
  slug: string
  /** The locale of the version being edited */
  current: string
  locales: readonly string[]
  defaultLocale: string
  /** The viewer may create a locale version */
  canCreate: boolean
}

/** The document whose locale versions are opened and created */
export type LocaleVersionTarget = Pick<LocaleChipsProps, 'collection' | 'slug' | 'defaultLocale'>

/** A locale version's editor: the default locale's has no `?locale=` */
export function localeVersionPath(props: LocaleVersionTarget, locale: string): string {
  const { collection, slug, defaultLocale } = props
  return editorPath(collection, slug, locale === defaultLocale ? undefined : locale)
}

/** Create the draft, then open it */
function useCreate(
  props: LocaleVersionTarget,
  locale: string,
  create: (locale: string) => Promise<void>,
): { busy: boolean; error: string | null; confirm: () => Promise<void> } {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const toast = useToast()
  const name = locale.toUpperCase()
  async function confirm(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await create(locale)
      toast({ text: `${name} draft created from ${props.defaultLocale.toUpperCase()}.` })
      navigate(localeVersionPath(props, locale))
    } catch (err: unknown) {
      setError(errorMessage(err, `The ${name} draft could not be created`))
      setBusy(false)
    }
  }
  return { busy, error, confirm }
}

interface CreateLocaleModalProps {
  locale: string
  props: LocaleVersionTarget
  create: (locale: string) => Promise<void>
  onClose: () => void
}

/** Cancel, and Create draft — which reads "Creating…" and does nothing more while busy */
function CreateActions({
  busy,
  confirmRef,
  onCancel,
  onConfirm,
}: {
  busy: boolean
  confirmRef: RefObject<HTMLButtonElement | null>
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  return (
    <>
      <Button onClick={busy ? undefined : onCancel} aria-disabled={busy}>
        Cancel
      </Button>
      <Button
        ref={confirmRef}
        variant="primary"
        onClick={busy ? undefined : onConfirm}
        aria-disabled={busy}
      >
        {busy ? 'Creating…' : 'Create draft'}
      </Button>
    </>
  )
}

/**
 * "Create the <LOCALE> draft of <slug>?" — copies the default locale's version
 * through `useLocaleVersions().create`, then opens the new draft
 */
export function CreateLocaleModal({
  locale,
  props,
  create,
  onClose,
}: CreateLocaleModalProps): ReactElement {
  const { busy, error, confirm } = useCreate(props, locale, create)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const name = locale.toUpperCase()
  const actions = (
    <CreateActions
      busy={busy}
      confirmRef={confirmRef}
      onCancel={onClose}
      onConfirm={() => void confirm()}
    />
  )
  return (
    <Modal
      title={`Create the ${name} draft of ${props.slug}?`}
      onClose={busy ? () => undefined : onClose}
      initialFocus={confirmRef}
      busy={busy}
      actions={actions}
    >
      <p>
        Copies the {props.defaultLocale.toUpperCase()} version's fields and body into a new {name}{' '}
        draft with its own history. Nothing is published.
      </p>
      {error && (
        <p className="editor-modal-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}

/** A locale whose version is not known yet, or could not be checked: a chip that does nothing */
function QuietChip({ locale, note }: { locale: string; note: string }): ReactElement {
  const name = locale.toUpperCase()
  return (
    <span
      className={chipClass('neutral', 'editor-locale editor-locale--quiet')}
      title={note}
      data-locale={locale}
    >
      <span aria-hidden="true">{name}</span>
      <span className="visually-hidden">
        {name}: {note}
      </span>
    </span>
  )
}

/** A missing version: "+" creates its draft */
function MissingChip({ locale, onCreate }: { locale: string; onCreate: () => void }): ReactElement {
  const name = locale.toUpperCase()
  return (
    <button
      type="button"
      data-locale={locale}
      className={chipClass('neutral', 'editor-locale editor-locale--missing')}
      aria-label={`Create ${name} draft`}
      onClick={onCreate}
    >
      <Plus className="ui-chip-icon" aria-hidden="true" />
      {name}
    </button>
  )
}

/**
 * One locale: its version opens; a missing one shows "+" and creates a draft.
 * Until the versions are read only the open one is a link, so no chip turns
 * from a link into a button under focus.
 */
function LocaleChip({
  props,
  locale,
  state,
  onCreate,
}: {
  props: LocaleChipsProps
  locale: string
  state: VersionState | undefined
  onCreate: () => void
}): ReactElement | null {
  const name = locale.toUpperCase()
  const isCurrent = locale === props.current
  if (!isCurrent && state === undefined) return <QuietChip locale={locale} note="checking" />
  if (!isCurrent && state === 'unknown') {
    return <QuietChip locale={locale} note="whether this version exists could not be checked" />
  }
  if (!isCurrent && state === 'missing') {
    return props.canCreate ? <MissingChip locale={locale} onCreate={onCreate} /> : null
  }
  return (
    <Link
      to={localeVersionPath(props, locale)}
      className={chipClass(isCurrent ? 'accent' : 'neutral', 'editor-locale')}
      aria-current={isCurrent ? 'true' : undefined}
      aria-label={`${name} version`}
      data-locale={locale}
    >
      {name}
    </Link>
  )
}

/**
 * When the create dialog closes, focus goes back where it came from. A refused
 * create may have turned the "+" into a link (the version exists now) or a
 * plain chip (it could not be checked): then focus goes to that locale's chip,
 * or to the group.
 */
function useReturnFocus(
  group: RefObject<HTMLDivElement | null>,
  creating: string | null,
): (locale: string) => void {
  const [closed, setClosed] = useState<string | null>(null)
  useEffect(() => {
    if (creating !== null || closed === null) return
    setClosed(null)
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    const chip = group.current?.querySelector<HTMLElement>(`[data-locale="${closed}"]`)
    const target = chip && chip.tabIndex >= 0 ? chip : group.current
    target?.focus()
  }, [creating, closed, group])
  return setClosed
}

/** The document's locale versions; shown when the site has more than one locale */
export function LocaleChips(props: LocaleChipsProps): ReactElement | null {
  const { collection, slug, locales, defaultLocale } = props
  const versions = useLocaleVersions(collection, slug, locales, defaultLocale)
  const [creating, setCreating] = useState<string | null>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const returnFocus = useReturnFocus(groupRef, creating)
  if (locales.length < 2) return null
  const close = (locale: string): void => {
    returnFocus(locale)
    setCreating(null)
  }
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of links and buttons, not of form fields
    <div ref={groupRef} className="editor-locales" role="group" aria-label="Locales" tabIndex={-1}>
      {locales.map((locale) => (
        <LocaleChip
          key={locale}
          props={props}
          locale={locale}
          state={versions.states?.get(locale)}
          onCreate={() => setCreating(locale)}
        />
      ))}
      {creating && (
        <CreateLocaleModal
          locale={creating}
          props={props}
          create={versions.create}
          onClose={() => close(creating)}
        />
      )}
    </div>
  )
}
