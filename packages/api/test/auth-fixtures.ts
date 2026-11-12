import type { AuthSection, DeepPartial } from '@krantho/config'
import { DEFAULTS } from '@krantho/config'

/** Build an auth section for a test: the shipped defaults with overrides applied. */
export function authSection(overrides: DeepPartial<AuthSection> = {}): AuthSection {
  return {
    ...DEFAULTS.auth,
    ...overrides,
    token: { ...DEFAULTS.auth.token, ...overrides.token },
    oidc: { ...DEFAULTS.auth.oidc, ...overrides.oidc },
    workload: { ...DEFAULTS.auth.workload, ...overrides.workload },
    session: { ...DEFAULTS.auth.session, ...overrides.session },
  }
}
