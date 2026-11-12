'use client'

import type MiniSearch from 'minisearch'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { trackEvent } from './interactions'

// ⌘K / Ctrl+K command palette over product pages and the docs. The index is a
// small JSON document built from published content (app/search.json/route.ts),
// fetched the first time the palette opens.

interface Entry {
  id: string
  title: string
  description: string
  url: string
  section: string
  headings: string
  text: string
}

type Scope = 'all' | 'docs' | 'product'

const THEME_COMMANDS = [
  { id: 'theme:system', title: 'Theme: follow system', value: 'system' },
  { id: 'theme:light', title: 'Theme: light', value: 'light' },
  { id: 'theme:dark', title: 'Theme: dark', value: 'dark' },
] as const

let indexPromise: Promise<MiniSearch<Entry>> | undefined

function loadIndex(): Promise<MiniSearch<Entry>> {
  // The search library and the index load when the palette first opens, so
  // pages carry neither until a visitor searches
  indexPromise ??= Promise.all([
    import('minisearch'),
    fetch('/search.json').then((response) => response.json() as Promise<Entry[]>),
  ])
    .then(([{ default: MiniSearchClass }, entries]) => {
      const search = new MiniSearchClass<Entry>({
        fields: ['title', 'headings', 'description', 'text'],
        storeFields: ['title', 'description', 'url', 'section'],
        searchOptions: {
          boost: { title: 4, headings: 2, description: 1.5 },
          prefix: true,
          fuzzy: 0.15,
        },
      })
      search.addAll(entries)
      return search
    })
    .catch((error: unknown) => {
      indexPromise = undefined
      throw error
    })
  return indexPromise
}

interface Hit {
  id: string
  title: string
  description: string
  url: string
  section: string
}

export function SearchButton(): React.ReactElement {
  return (
    <button type="button" className="search-button" data-open-search aria-label="Search the site">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="search-button__label">Search</span>
      <kbd className="search-button__kbd">⌘K</kbd>
    </button>
  )
}

export function SearchPalette(): React.ReactElement | null {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [hits, setHits] = useState<Hit[]>([])
  const [active, setActive] = useState(0)
  const [failed, setFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  const show = useCallback(() => {
    setOpen(true)
    trackEvent('Search opened')
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        show()
      } else if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        show()
      }
    }
    const onClick = (event: MouseEvent): void => {
      if ((event.target as HTMLElement | null)?.closest('[data-open-search]')) show()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [show])

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      input.current?.focus()
      loadIndex().catch(() => setFailed(true))
    } else if (!open && element.open) {
      element.close()
    }
  }, [open])

  useEffect(() => {
    let cancelled = false
    const term = query.trim()
    if (!term) {
      setHits([])
      return
    }
    loadIndex()
      .then((search) => {
        if (cancelled) return
        const results = search
          .search(term, scope === 'all' ? {} : { filter: (result) => (scope === 'docs' ? result['section'] === 'Docs' : result['section'] !== 'Docs') })
          .slice(0, 12)
          .map((result) => ({
            id: String(result.id),
            title: String(result['title']),
            description: String(result['description'] ?? ''),
            url: String(result['url']),
            section: String(result['section']),
          }))
        setHits(results)
        setActive(0)
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
    }
  }, [query, scope])

  const themeHits = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term || !'theme dark light system'.includes(term.split(' ')[0] ?? '')) return []
    return THEME_COMMANDS.filter((command) => command.title.toLowerCase().includes(term) || term.startsWith('theme'))
  }, [query])

  const close = (): void => {
    setOpen(false)
    setQuery('')
  }

  const go = (url: string): void => {
    close()
    router.push(url)
  }

  const setTheme = (value: string): void => {
    const root = document.documentElement
    if (value === 'system') delete root.dataset['theme']
    else root.dataset['theme'] = value
    try {
      if (value === 'system') localStorage.removeItem('krantho-theme')
      else localStorage.setItem('krantho-theme', value)
    } catch {
      // Storage blocked
    }
    close()
  }

  const total = hits.length + themeHits.length

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (total ? (index + 1) % total : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (total ? (index - 1 + total) % total : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[active]
      if (hit) go(hit.url)
      else {
        const command = themeHits[active - hits.length]
        if (command) setTheme(command.value)
      }
    }
  }

  return (
    <dialog
      ref={dialog}
      className="palette"
      aria-label="Search"
      onClose={close}
      onClick={(event) => {
        if (event.target === dialog.current) close()
      }}
    >
      <div className="palette__panel" onKeyDown={onKeyDown}>
        <div className="palette__input-row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={input}
            className="palette__input"
            type="search"
            placeholder="Search docs and pages"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search"
            aria-controls="palette-results"
            aria-activedescendant={total ? `palette-hit-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="palette__esc">esc</kbd>
        </div>
        <div className="palette__scopes" role="group" aria-label="Search in">
          {(['all', 'docs', 'product'] as const).map((value) => (
            <button key={value} type="button" className="palette__scope" aria-pressed={scope === value} onClick={() => setScope(value)}>
              {value === 'all' ? 'Everything' : value === 'docs' ? 'Docs' : 'Product'}
            </button>
          ))}
        </div>
        <ul id="palette-results" className="palette__results" role="listbox" aria-label="Results">
          {hits.map((hit, index) => (
            <li key={hit.id} id={`palette-hit-${index}`} role="option" aria-selected={index === active}>
              <a
                href={hit.url}
                className="palette__hit"
                onMouseEnter={() => setActive(index)}
                onClick={(event) => {
                  event.preventDefault()
                  go(hit.url)
                }}
              >
                <span className="palette__hit-section">{hit.section}</span>
                <span className="palette__hit-title">{hit.title}</span>
                {hit.description && <span className="palette__hit-description">{hit.description}</span>}
              </a>
            </li>
          ))}
          {themeHits.map((command, offset) => (
            <li key={command.id} id={`palette-hit-${hits.length + offset}`} role="option" aria-selected={hits.length + offset === active}>
              <button type="button" className="palette__hit" onClick={() => setTheme(command.value)} onMouseEnter={() => setActive(hits.length + offset)}>
                <span className="palette__hit-section">Command</span>
                <span className="palette__hit-title">{command.title}</span>
              </button>
            </li>
          ))}
        </ul>
        {query.trim() && total === 0 && (
          <p className="palette__empty">{failed ? 'Search is unavailable right now.' : `Nothing matches “${query.trim()}”.`}</p>
        )}
        {!query.trim() && (
          <p className="palette__empty">Search the documentation and product pages. Type “theme” to switch themes.</p>
        )}
      </div>
    </dialog>
  )
}
