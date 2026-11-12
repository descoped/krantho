import { ancestorsOf, getVocabularyType } from '../vocabulary/index.js'
import type { ProfileRule, ReaderProfile } from './types.js'

const profiles = new Map<string, ReaderProfile>()

/**
 * Register a reader's rule set. A site registers its own readers the same way
 * krantho registers Google's and Bing's; a later registration under one id
 * replaces the earlier one. Throws for a rule whose type the vocabulary does
 * not have, or without a source and verification date. Returns a function
 * that restores the previous registration.
 */
export function registerProfile(profile: ReaderProfile): () => void {
  for (const rule of profile.rules) {
    if (!getVocabularyType(rule.type)) {
      throw new Error(`registerProfile(${profile.id}): "${rule.type}" is not a Schema.org type.`)
    }
    if (!rule.source || !/^\d{4}-\d{2}-\d{2}$/.test(rule.verifiedAt)) {
      throw new Error(
        `registerProfile(${profile.id}): the ${rule.type} rule needs a source and a verifiedAt date.`,
      )
    }
  }
  const previous = profiles.get(profile.id)
  profiles.set(profile.id, profile)
  return () => {
    if (profiles.get(profile.id) !== profile) return
    if (previous) profiles.set(profile.id, previous)
    else profiles.delete(profile.id)
  }
}

/** The reader profile registered under the id */
export function getProfile(id: string): ReaderProfile | undefined {
  return profiles.get(id)
}

/** Every registered reader profile */
export function registeredProfiles(): readonly ReaderProfile[] {
  return [...profiles.values()]
}

/** How many inheritance steps separate a type from an ancestor; Infinity when it is none */
function distance(type: string, ancestor: string): number {
  if (type === ancestor) return 0
  let level: readonly string[] = [type]
  for (let steps = 1; level.length > 0 && steps < 32; steps++) {
    level = level.flatMap((t) => getVocabularyType(t)?.parents ?? [])
    if (level.includes(ancestor)) return steps
  }
  return Number.POSITIVE_INFINITY
}

/** The profile's rule for a type: its own, or the one for its nearest ancestor */
export function ruleFor(profile: ReaderProfile, type: string): ProfileRule | undefined {
  const ancestors = ancestorsOf(type)
  let best: ProfileRule | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const rule of profile.rules) {
    if (!ancestors.has(rule.type)) continue
    const d = distance(type, rule.type)
    if (d < bestDistance) {
      best = rule
      bestDistance = d
    }
  }
  return best
}
