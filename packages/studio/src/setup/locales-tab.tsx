import { Plus, Trash2 } from 'lucide-react'
import { type ReactElement, useState } from 'react'
import { type LocaleSettings, updateLocaleSettings } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { errorMessage } from '../lib/fetch.js'
import { Button } from '../ui/button.js'
import { Chip } from '../ui/chip.js'
import { type DataColumn, DataTable } from '../ui/data-table.js'
import { useToast } from '../ui/toast.js'
import { ConfirmModal } from './confirm-modal.js'
import { LocaleCoverage } from './locale-coverage.js'
import { addableLocales, addedLocale, removedLocale } from './locales-model.js'
import { SelectInput } from './setup-inputs.js'
import { LoadError, Loading, SetupNote, SetupSection, ValuesFrom } from './setup-section.js'
import { useSingleFlight } from './use-busy-action.js'
import { useLocaleSettings } from './use-locale-settings.js'

/** Where the locales come from: the configuration lists them and sets the default; Setup chooses the active ones */
function LocaleSources({ settings }: { settings: LocaleSettings }): ReactElement {
  if (settings.source === 'database') {
    return (
      <ValuesFrom source="database">
        The active locales are chosen here among the configured ones and stored in the site's
        database. The default locale is <code>site.defaultLocale</code> in the configuration.
      </ValuesFrom>
    )
  }
  return (
    <ValuesFrom source="config">
      The locales are <code>site.supportedLocales</code> and the default locale is{' '}
      <code>site.defaultLocale</code>, in <code>krantho.config.ts</code> or the environment. Setup
      chooses which of the configured locales are active; the default is set only in the
      configuration.
    </ValuesFrom>
  )
}

interface LocaleRow {
  code: string
  isDefault: boolean
}

type Change = (supportedLocales: string[], done: string) => void

function columns(
  admin: boolean,
  busy: boolean,
  onRemove: (code: string) => void,
): DataColumn<LocaleRow>[] {
  const actions = (row: LocaleRow): ReactElement | null =>
    admin && !row.isDefault ? (
      <span className="setup-row-actions">
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          aria-disabled={busy}
          aria-label={`Remove ${row.code}`}
          onClick={() => onRemove(row.code)}
        >
          Remove
        </Button>
      </span>
    ) : null
  const isDefault = (row: LocaleRow): ReactElement | null =>
    row.isDefault ? <Chip tone="accent">Default</Chip> : null
  return [
    { id: 'locale', header: 'Locale', primary: true, cell: (row) => <code>{row.code}</code> },
    { id: 'default', header: 'Default', cell: isDefault },
    { id: 'actions', header: 'Actions', cell: actions },
  ]
}

/** Switch on one of the configured locales that is not active; only those are offered */
function AddLocale({
  settings,
  busy,
  change,
}: {
  settings: LocaleSettings
  busy: boolean
  change: Change
}): ReactElement {
  const addable = addableLocales(settings)
  const [chosen, setChosen] = useState('')
  const code = addable.includes(chosen) ? chosen : addable[0]
  if (code === undefined) {
    return <SetupNote>Every locale in the configuration is active.</SetupNote>
  }
  return (
    <form
      className="setup-inline-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        change(addedLocale(settings, code), `Added ${code}.`)
      }}
    >
      <SelectInput
        label="Configured locale"
        value={code}
        onChange={setChosen}
        hint="A locale in site.supportedLocales that is not active"
        options={addable.map((option) => ({ value: option, label: option }))}
      />
      <Button type="submit" variant="primary" icon={Plus} aria-disabled={busy}>
        Add locale
      </Button>
    </form>
  )
}

/** A change to the locales, saved through the one locale source; one at a time */
function useLocaleChange(set: (settings: LocaleSettings) => void): {
  busy: boolean
  change: Change
} {
  const toast = useToast()
  const { busy, once } = useSingleFlight()
  const change: Change = (supportedLocales, done) => {
    void once(async () => {
      try {
        set(await updateLocaleSettings(supportedLocales))
        toast({ text: done })
      } catch (err: unknown) {
        toast({ text: errorMessage(err, 'The locales could not be saved'), tone: 'error' })
      }
    })
  }
  return { busy, change }
}

/** Remove, behind a danger confirmation: only the setting changes, the documents stay */
function RemoveLocale({
  code,
  settings,
  onSaved,
  onClose,
}: {
  code: string
  settings: LocaleSettings
  onSaved: (settings: LocaleSettings) => void
  onClose: () => void
}): ReactElement {
  const toast = useToast()
  async function remove(): Promise<void> {
    onSaved(await updateLocaleSettings(removedLocale(settings, code)))
    toast({ text: `Removed ${code}.` })
    onClose()
  }
  return (
    <ConfirmModal
      title={`Remove the locale ${code}?`}
      confirmLabel="Remove locale"
      danger
      onConfirm={remove}
      onClose={onClose}
    >
      <p>
        The site stops serving <code>{code}</code>. Documents already in that locale are kept, not
        deleted. Only the list of locales changes.
      </p>
    </ConfirmModal>
  )
}

function LocaleList({
  settings,
  set,
}: {
  settings: LocaleSettings
  set: (settings: LocaleSettings) => void
}): ReactElement {
  const admin = useAuth().hasRole('admin')
  const { busy, change } = useLocaleChange(set)
  const [removing, setRemoving] = useState<string | null>(null)
  const rows = settings.supportedLocales.map((code) => ({
    code,
    isDefault: code === settings.defaultLocale,
  }))
  return (
    <SetupSection title="Locales" sources={<LocaleSources settings={settings} />}>
      <DataTable
        caption="Locales"
        columns={columns(admin, busy, setRemoving)}
        rows={rows}
        rowKey={(row) => row.code}
      />
      {admin ? (
        <AddLocale settings={settings} busy={busy} change={change} />
      ) : (
        <SetupNote>Only admins change the locales.</SetupNote>
      )}
      {removing && (
        <RemoveLocale
          code={removing}
          settings={settings}
          onSaved={set}
          onClose={() => setRemoving(null)}
        />
      )}
    </SetupSection>
  )
}

/** Setup › Locales: the site's locales, which of the configured ones are active, then translation coverage */
export function LocalesTab(): ReactElement {
  const { loaded, reload, set } = useLocaleSettings()
  if (loaded.state === 'loading') return <Loading what="the locales" />
  if (loaded.state === 'error') return <LoadError message={loaded.message} onRetry={reload} />
  const settings = loaded.data
  return (
    <div className="setup-stack">
      <LocaleList settings={settings} set={set} />
      {settings.supportedLocales.length > 1 && <LocaleCoverage settings={settings} />}
    </div>
  )
}
