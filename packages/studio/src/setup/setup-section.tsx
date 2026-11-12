import { Database, FileCode, type LucideIcon, RotateCw, Server } from 'lucide-react'
import { type ReactElement, type ReactNode, useId } from 'react'
import { Button } from '../ui/button.js'
import { Chip } from '../ui/chip.js'

/**
 * Where a tab's values come from: the configuration (`krantho.config.ts`,
 * `krantho.collections.ts`, the environment — read-only here), the site's
 * database (changed here), or what the running server reports.
 */
export type ValueSource = 'config' | 'database' | 'server'

const SOURCES: Readonly<Record<ValueSource, { icon: LucideIcon; label: string }>> = {
  config: { icon: FileCode, label: 'Configuration' },
  database: { icon: Database, label: 'Database' },
  server: { icon: Server, label: 'Server' },
}

/** One line saying where values come from: a chip naming the source, then the detail */
export function ValuesFrom({
  source,
  children,
}: {
  source: ValueSource
  children: ReactNode
}): ReactElement {
  const { icon, label } = SOURCES[source]
  return (
    <p className="setup-source">
      <Chip icon={icon}>{label}</Chip>
      <span>{children}</span>
    </p>
  )
}

export interface SetupSectionProps {
  title: string
  /** Where the section's values come from: one or more `ValuesFrom` lines */
  sources: ReactNode
  /** Beside the title: the section's actions */
  actions?: ReactNode | undefined
  children?: ReactNode | undefined
}

/** A region of a Setup tab, named by its heading, saying where its values come from */
export function SetupSection({
  title,
  sources,
  actions,
  children,
}: SetupSectionProps): ReactElement {
  const titleId = useId()
  return (
    <section className="setup-section" aria-labelledby={titleId}>
      <div className="setup-section-head">
        <h2 id={titleId} className="setup-section-title">
          {title}
        </h2>
        {actions && <div className="setup-actions">{actions}</div>}
      </div>
      <div className="setup-sources">{sources}</div>
      {children}
    </section>
  )
}

/** A line under a section: a quiet note, or the reason something cannot be done */
export function SetupNote({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'muted' | 'error' | undefined
}): ReactElement {
  return (
    <p className={tone === 'error' ? 'setup-note setup-note--error' : 'setup-note'}>{children}</p>
  )
}

/** What a section shows while its data is read, or when it could not be */
export function Loading({ what }: { what: string }): ReactElement {
  return <SetupNote>Reading {what}…</SetupNote>
}

/** A read that failed, with what the API said and Try again */
export function LoadError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}): ReactElement {
  return (
    <div role="alert" className="setup-row">
      <SetupNote tone="error">{message}</SetupNote>
      <Button size="sm" icon={RotateCw} onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
