import type { EnrichStatusResponse } from '../../lib/api-types.js'
import type { EnrichStep } from '../../lib/enrichment-job.js'
import { lockHolderName } from '../../lib/locks.js'

/**
 * Enrichment of one document (`POST /api/seo/enrich`, scope `item`): what may
 * run, and what each step did. It works on the default locale's version and
 * is run by an admin, as the API allows.
 */

/** What a step did to the document */
export interface StepOutcome {
  step: EnrichStep
  state: 'generated' | 'skipped' | 'error'
  text: string
}

/** The document a job enriches */
export interface EnrichTarget {
  collection: string
  slug: string
}

/** A job's answer for the document: generated, skipped with the reason, or failed */
export function stepOutcome(
  step: EnrichStep,
  status: EnrichStatusResponse,
  target: EnrichTarget,
): StepOutcome {
  const item = status.items.find(
    (i) => i.collection === target.collection && i.slug === target.slug,
  )
  if (!item) return { step, state: 'skipped', text: 'Not part of the job' }
  if (item.status === 'complete') return { step, state: 'generated', text: item.result ?? 'Filled' }
  if (item.status === 'error') return { step, state: 'error', text: item.error ?? 'Failed' }
  return { step, state: 'skipped', text: item.result ?? 'Nothing missing' }
}

/** What enrichment needs that the editor knows */
export interface EnrichFacts {
  /** A saved document: enrichment reads it from the store */
  saved: boolean
  /** The API runs enrichment for admins only */
  admin: boolean
  /** Someone else holds the edit lock */
  lockedBy: string | null
  /** The role cannot edit */
  canEdit: boolean
  /** Unsaved changes in the form, which a new version would overtake */
  dirty: boolean
  /** The open version is the default locale's, which enrichment reads and writes */
  defaultLocale: boolean
  /** The site's default locale; null while the site's locales are unknown */
  defaultLocaleName: string | null
}

/** Why enrichment cannot run now, or null when it can */
export function enrichBlocker(facts: EnrichFacts): string | null {
  if (!facts.saved) return 'Save the page first: enrichment works on saved documents.'
  if (!facts.canEdit || !facts.admin) return 'Enrichment is run by an admin.'
  if (facts.lockedBy) {
    return `${lockHolderName(facts.lockedBy)} is editing: enrichment waits until they finish.`
  }
  if (facts.defaultLocaleName === null) {
    return "The site's locales could not be read: enrichment works on the default locale's version only."
  }
  if (!facts.defaultLocale) {
    return `Enrichment reads and writes the ${facts.defaultLocaleName.toUpperCase()} version: open it to enrich.`
  }
  if (facts.dirty) {
    return 'Save or discard your changes first: enrichment saves a new version of the document.'
  }
  return null
}

/** Whether any step wrote to the document's content: the editor reads the document again */
export function changedContent(outcomes: readonly StepOutcome[]): boolean {
  return outcomes.some((o) => o.step === 'meta-descriptions' && o.state === 'generated')
}
