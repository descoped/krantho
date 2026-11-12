import { createContext, useContext } from 'react'

export interface RuntimeCapabilities {
  persistence: 'filesystem' | 'sqlite' | 'postgres'
  /** The server package hosting the API; null when the API was created without one */
  framework: 'next' | 'sveltekit' | 'node' | null
  authMode: 'none' | 'token' | 'oidc'
  schemaVersion: number | null
  features: Record<string, string>
}

/** The server packages, as people name their frameworks */
export const FRAMEWORK_LABELS: Readonly<
  Record<NonNullable<RuntimeCapabilities['framework']>, string>
> = {
  next: 'Next.js',
  sveltekit: 'SvelteKit',
  node: 'Node.js',
}

/** The framework's name, or null when the API reports none (an older or hand-built answer may omit it) */
export function frameworkLabel(caps: Pick<RuntimeCapabilities, 'framework'>): string | null {
  return caps.framework ? FRAMEWORK_LABELS[caps.framework] : null
}

const DEFAULT_CAPABILITIES: RuntimeCapabilities = {
  persistence: 'filesystem',
  framework: null,
  authMode: 'none',
  schemaVersion: null,
  features: {},
}

export const CapabilitiesContext = createContext<RuntimeCapabilities>(DEFAULT_CAPABILITIES)

export function useCapabilities(): RuntimeCapabilities {
  return useContext(CapabilitiesContext)
}

/** Check if a feature is active (any value except 'disabled') */
export function isEnabled(caps: RuntimeCapabilities, feature: string): boolean {
  const val = caps.features[feature]
  return val !== undefined && val !== 'disabled'
}

export async function fetchCapabilities(): Promise<RuntimeCapabilities> {
  try {
    const res = await fetch('/api/capabilities')
    if (!res.ok) return DEFAULT_CAPABILITIES
    return (await res.json()) as RuntimeCapabilities
  } catch {
    return DEFAULT_CAPABILITIES
  }
}
