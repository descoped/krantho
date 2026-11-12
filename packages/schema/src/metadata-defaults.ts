import { canonicalJson } from '@krantho/core'
import type { DefaultProvenance } from '@krantho/persistence'

export interface AppliedDefaults {
  metadata: Record<string, Record<string, unknown>>
  paths: string[]
  values: Record<string, unknown>
}

/** Absence is missing; explicit null, empty text, zero and false remain authored choices. */
export function applyMetadataDefaults(
  current: Record<string, Record<string, unknown>>,
  defaults: Record<string, Record<string, unknown>>,
  slots: readonly string[],
  previous: readonly DefaultProvenance[] = [],
): AppliedDefaults {
  const metadata = structuredClone(current)
  const result: AppliedDefaults = { metadata, paths: [], values: {} }
  const earlier = Object.assign({}, ...previous.map((source) => source.values)) as Record<
    string,
    unknown
  >
  for (const slot of slots) {
    const source = defaults[slot]
    if (!source) continue
    if (!Object.hasOwn(metadata, slot) && Object.keys(source).length === 0) {
      const path = `/metadata/${pointerPart(slot)}`
      result.paths.push(path)
      result.values[path] = {}
    }
    const target = metadata[slot] ?? {}
    metadata[slot] = target
    fillMissing(target, source, `/metadata/${pointerPart(slot)}`, earlier, result)
  }
  return result
}

function fillMissing(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  prefix: string,
  earlier: Readonly<Record<string, unknown>>,
  result: AppliedDefaults,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw new Error('Invalid default property')
    const path = `${prefix}/${pointerPart(key)}`
    const missing = !Object.hasOwn(target, key)
    const stillDefault =
      Object.hasOwn(earlier, path) && canonicalJson(target[key]) === canonicalJson(earlier[path])
    if (isRecord(value) && Object.keys(value).length > 0 && (missing || isRecord(target[key]))) {
      if (missing) target[key] = {}
      fillMissing(target[key] as Record<string, unknown>, value, path, earlier, result)
    } else if ((missing || stillDefault) && canonicalJson(target[key]) !== canonicalJson(value)) {
      target[key] = structuredClone(value)
      result.paths.push(path)
      result.values[path] = structuredClone(value)
    }
  }
}

export function retainDefaultProvenance(
  sources: readonly DefaultProvenance[],
  metadata: Record<string, Record<string, unknown>>,
): DefaultProvenance[] {
  return sources.flatMap((source) => {
    const paths = source.paths.filter(
      (path) => canonicalJson(valueAt({ metadata }, path)) === canonicalJson(source.values[path]),
    )
    return paths.length
      ? [
          {
            ...source,
            paths,
            values: Object.fromEntries(paths.map((path) => [path, source.values[path]])),
          },
        ]
      : []
  })
}

function valueAt(root: unknown, path: string): unknown {
  let value = root
  for (const part of path
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!isRecord(value) || !Object.hasOwn(value, part)) return undefined
    value = value[part]
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function pointerPart(part: string): string {
  return part.replaceAll('~', '~0').replaceAll('/', '~1')
}
