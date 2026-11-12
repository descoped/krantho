import type { ReaderProfile } from './types.js'

/**
 * Bing. Its webmaster guidelines publish no structured-data rule set beyond
 * Schema.org (its help pages render client-side and were not readable
 * programmatically when checked, 2026-10-02), so the profile adds no rules:
 * Bing reads the Schema.org baseline every graph meets. A rule is added only
 * with a source it can cite.
 */
export const bingProfile: ReaderProfile = {
  id: 'bing',
  name: 'Bing',
  rules: [],
}
