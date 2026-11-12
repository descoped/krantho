import { readFileSync } from 'node:fs'
import type { LeafSpec } from './leaves.js'
import { envNameFor, LEAVES } from './leaves.js'
import { setPath } from './object-path.js'

/** A problem found while reading one environment variable */
export interface EnvIssue {
  /** Variable that carried the bad value */
  env: string
  /** Configuration path it feeds */
  path: string
  message: string
}

/** The overlay built from the environment, with the paths it set */
export interface EnvOverlay {
  values: Record<string, unknown>
  /** Configuration paths this overlay supplies, mapped to the variable that supplied them */
  origins: Map<string, string>
  issues: EnvIssue[]
}

const TRUE_WORDS = new Set(['true', '1', 'yes', 'on'])
const FALSE_WORDS = new Set(['false', '0', 'no', 'off'])

function parseLeafValue(leaf: LeafSpec, raw: string): { value: unknown } | { message: string } {
  switch (leaf.kind) {
    case 'int': {
      if (!/^-?\d+$/.test(raw.trim())) {
        return { message: `expected an integer, got ${JSON.stringify(raw)}` }
      }
      return { value: Number.parseInt(raw.trim(), 10) }
    }
    case 'boolean': {
      const word = raw.trim().toLowerCase()
      if (TRUE_WORDS.has(word)) return { value: true }
      if (FALSE_WORDS.has(word)) return { value: false }
      return {
        message: `expected a boolean (true/false, 1/0, yes/no, on/off), got ${JSON.stringify(raw)}`,
      }
    }
    case 'list': {
      return {
        value: raw
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      }
    }
    default:
      return { value: raw }
  }
}

/**
 * Read a leaf's raw string from the environment.
 *
 * The variable itself wins; a secret leaf also accepts a `_FILE` suffix naming
 * a file to read the value from. An empty value counts as unset.
 */
function readRaw(
  leaf: LeafSpec,
  name: string,
  env: Record<string, string | undefined>,
): { raw: string; from: string } | { message: string; from: string } | null {
  const direct = env[name]
  if (direct !== undefined && direct !== '') return { raw: direct, from: name }

  if (!leaf.secret) return null
  const fileName = `${name}_FILE`
  const filePath = env[fileName]
  if (filePath === undefined || filePath === '') return null

  try {
    const contents = readFileSync(filePath, 'utf8').trim()
    if (contents === '') return { message: `file ${filePath} is empty`, from: fileName }
    return { raw: contents, from: fileName }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { message: `cannot read ${filePath}: ${reason}`, from: fileName }
  }
}

/** Build the configuration overlay the environment contributes to the given leaves */
export function buildEnvOverlay(
  env: Record<string, string | undefined>,
  leaves: readonly LeafSpec[] = LEAVES,
): EnvOverlay {
  const values: Record<string, unknown> = {}
  const origins = new Map<string, string>()
  const issues: EnvIssue[] = []

  for (const leaf of leaves) {
    const name = envNameFor(leaf)
    if (name === null) continue

    const read = readRaw(leaf, name, env)
    if (read === null) continue
    if ('message' in read) {
      issues.push({ env: read.from, path: leaf.path, message: read.message })
      continue
    }

    const parsed = parseLeafValue(leaf, read.raw)
    if ('message' in parsed) {
      issues.push({ env: read.from, path: leaf.path, message: parsed.message })
      continue
    }

    setPath(values, leaf.path, parsed.value)
    origins.set(leaf.path, read.from)
  }

  return { values, origins, issues }
}
