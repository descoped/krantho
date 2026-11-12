'use client'

import { track } from '@plausible-analytics/tracker'
import { useEffect } from 'react'

// One listener for the controls that server-rendered HTML carries: copy buttons
// on code blocks, stack tabs, the theme switch and install-command copies. The
// state lives on <html> (data-theme, data-stack) so CSS renders it, and in
// localStorage so it survives the next visit.

function remember(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the choice still applies to this page
  }
}

/** A named Plausible event; a no-op where analytics is not running */
export function trackEvent(name: string, props?: Record<string, string>): void {
  try {
    track(name, props ? { props } : {})
  } catch {
    // Analytics runs only on the production host
  }
}

async function copyFrom(button: HTMLElement): Promise<void> {
  const explicit = button.dataset['copyText']
  let value = explicit
  if (value === undefined) {
    const block = button.closest('.code-block')
    const panels = block ? Array.from(block.querySelectorAll('pre')) : []
    const visible = panels.find((pre) => pre.offsetParent !== null) ?? panels[0]
    value = visible?.textContent ?? ''
  }
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    return
  }
  const label = button.querySelector('span')
  const previous = label?.textContent
  button.dataset['copied'] = 'true'
  if (label) label.textContent = 'Copied'
  window.setTimeout(() => {
    button.dataset['copied'] = 'false'
    if (label && previous) label.textContent = previous
  }, 1600)
  trackEvent(button.dataset['copyEvent'] ?? 'Code copied')
}

function chooseStack(stack: string): void {
  document.documentElement.dataset['stack'] = stack
  remember('krantho-stack', stack)
  trackEvent('Stack chosen', { stack })
}

function chooseTheme(theme: string): void {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') {
    root.dataset['theme'] = theme
    remember('krantho-theme', theme)
  } else {
    delete root.dataset['theme']
    remember('krantho-theme', null)
  }
  trackEvent('Theme changed', { theme })
}

/**
 * The stored theme and stack, applied where the inline script in app/layout.tsx
 * did not run — Next.js leaves beforeInteractive scripts out of its 404 page.
 */
function applyStoredPreferences(): void {
  const root = document.documentElement
  if (root.dataset['stack']) return
  try {
    const theme = localStorage.getItem('krantho-theme')
    if (theme === 'light' || theme === 'dark') root.dataset['theme'] = theme
    const stack = localStorage.getItem('krantho-stack')
    root.dataset['stack'] = stack === 'sveltekit' || stack === 'express' ? stack : 'next'
  } catch {
    root.dataset['stack'] = 'next'
  }
}

export function Interactions(): null {
  useEffect(() => {
    applyStoredPreferences()
  }, [])

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const copy = target.closest<HTMLElement>('[data-copy]')
      if (copy) {
        void copyFrom(copy)
        return
      }
      const tab = target.closest<HTMLElement>('[data-stack-tab]')
      if (tab?.dataset['stackTab']) {
        chooseStack(tab.dataset['stackTab'])
        return
      }
      const theme = target.closest<HTMLElement>('[data-theme-choice]')
      if (theme?.dataset['themeChoice']) {
        chooseTheme(theme.dataset['themeChoice'])
        return
      }
      const tracked = target.closest<HTMLElement>('[data-track]')
      if (tracked?.dataset['track']) trackEvent(tracked.dataset['track'])
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  return null
}
