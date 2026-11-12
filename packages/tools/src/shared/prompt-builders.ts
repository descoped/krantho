/**
 * Shared prompt-building utilities for SEO enrichment scripts.
 *
 * All enrich scripts need site context (domain, description, language)
 * injected into their LLM prompts. This module provides that context
 * so each script only supplies the task-specific prompt body.
 */

import { loadSiteConfig } from './site-config.js'

export interface SiteContext {
  domain: string
  siteDescription: string
  language: string
}

/** Load site context fields used in SEO prompts */
export function getSiteContext(): SiteContext {
  const { domain, siteDescription, language } = loadSiteConfig()
  return { domain, siteDescription, language }
}

/**
 * Build an SEO prompt with site context prepended.
 *
 * The role line is formatted as:
 *   "You are an SEO expert for {siteDescription} ({domain})."
 *
 * The body is appended after the role line with a blank line separator.
 * If the prompt needs language context, use `${ctx.language}` in the body
 * via the callback form.
 */
export function buildSeoPrompt(bodyFn: (ctx: SiteContext) => string): string {
  const ctx = getSiteContext()
  const body = bodyFn(ctx)
  return `You are an SEO expert for ${ctx.siteDescription} (${ctx.domain}).\n${body}`
}
