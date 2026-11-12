import { isEmpty } from '../types/values.js'
import { idOf, typesOf } from '../validate/graph-nodes.js'
import type { Finding, GraphNode } from '../validate/types.js'
import { isPropertyOfType } from '../vocabulary/index.js'
import { ruleFor } from './registry.js'
import type { ProfileRule, ReaderProfile } from './types.js'

function has(node: GraphNode, property: string): boolean {
  return !isEmpty(node[property])
}

function feature(profile: ReaderProfile, rule: ProfileRule): string {
  return `${profile.name}'s ${rule.feature ?? rule.type}`
}

/** What the rule's status says about the node */
function statusFindings(
  profile: ReaderProfile,
  rule: ProfileRule,
  base: Omit<Finding, 'severity' | 'code' | 'message'>,
): Finding[] {
  if (rule.status === 'retired') {
    const message = `${profile.name} no longer shows ${rule.feature ?? rule.type}; ${rule.type} stays valid Schema.org.`
    return [{ ...base, severity: 'warning', code: 'profile-retired-feature', message }]
  }
  if (rule.status === 'restricted') {
    const message = `${feature(profile, rule)} is shown only when: ${(rule.conditions ?? []).join('; ')}`
    return [{ ...base, severity: 'info', code: 'profile-restricted-feature', message }]
  }
  return []
}

/**
 * A reader's findings for one node, by its rule for the node's type (or the
 * nearest ancestor's): a property the feature needs is a warning — the graph
 * is still conformant, the page is not eligible — a recommended one is
 * information, and a feature the reader retired or restricts is said so.
 * Each finding cites the rule's documentation.
 */
export function profileFindings(node: GraphNode, profile: ReaderProfile): Finding[] {
  const type = typesOf(node)[0]
  if (!type) return []
  const rule = ruleFor(profile, type)
  if (!rule || rule.status === 'none') return []
  const base = { profile: profile.id, nodeId: idOf(node), type, source: rule.source }
  const findings = statusFindings(profile, rule, base)
  if (rule.status === 'retired') return findings

  // A rule written for a type may name properties only some of its subtypes
  // have (servesCuisine for LocalBusiness); a node is asked only for its own.
  const applies = (property: string): boolean => isPropertyOfType(property, type)
  for (const property of (rule.required ?? []).filter(applies)) {
    if (has(node, property)) continue
    const message = `${type} needs "${property}" for ${feature(profile, rule)}.`
    findings.push({ ...base, property, severity: 'warning', code: 'profile-required', message })
  }
  for (const group of (rule.oneOf ?? [])
    .map((g) => g.filter(applies))
    .filter((g) => g.length > 0)) {
    if (group.some((property) => has(node, property))) continue
    const message = `${type} needs one of ${group.map((p) => `"${p}"`).join(', ')} for ${feature(profile, rule)}.`
    findings.push({ ...base, severity: 'warning', code: 'profile-required', message })
  }
  for (const property of (rule.recommended ?? []).filter(applies)) {
    if (has(node, property)) continue
    const message = `${profile.name} recommends "${property}" on ${type} for ${rule.feature ?? 'its results'}.`
    findings.push({ ...base, property, severity: 'info', code: 'profile-recommended', message })
  }
  return findings
}
