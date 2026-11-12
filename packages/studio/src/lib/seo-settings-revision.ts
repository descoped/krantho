import { useSyncExternalStore } from 'react'

/**
 * A count of the changes to SEO settings made from Studio — a graph saved, an
 * enrichment run — so a view that reads the settings reads them again
 */
let revision = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function read(): number {
  return revision
}

/** SEO settings changed: every view that reads them reads them again */
export function seoSettingsChanged(): void {
  revision += 1
  for (const listener of listeners) listener()
}

/** The count of SEO settings changes, moving on with each */
export function useSeoSettingsRevision(): number {
  return useSyncExternalStore(subscribe, read, read)
}
