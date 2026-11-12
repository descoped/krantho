import { describe, expect, it } from 'vitest'
import { productionWarnings, resolveConfig } from '../src/index.js'

const CWD = '/srv/site'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

const oidc = {
  KRANTHO_AUTH: 'oidc',
  OIDC_ISSUER_URL: 'https://idp.example.com',
  OIDC_CLIENT_ID: 'client',
  OIDC_REDIRECT_URI: 'https://example.com/api/auth/callback',
}

function warningsFor(env: Record<string, string>, nodeEnv: string | undefined): string[] {
  return productionWarnings(resolveConfig({ site }, env, { cwd: CWD }), nodeEnv)
}

describe('productionWarnings', () => {
  it('warns that auth mode none makes every visitor an admin', () => {
    const warnings = warningsFor({}, 'production')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('auth.mode is "none"')
  })

  it('warns that an unset signing secret breaks sessions across instances', () => {
    const warnings = warningsFor(oidc, 'production')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('KRANTHO_JWT_SECRET')
  })

  it('is silent for a production config with auth and a signing secret', () => {
    expect(warningsFor({ ...oidc, KRANTHO_JWT_SECRET: 'x'.repeat(64) }, 'production')).toEqual([])
  })

  it('warns that the assistant under auth mode none spends the credential for every visitor', () => {
    const warnings = warningsFor({ KRANTHO_ASSISTANT_ENABLED: 'true' }, 'production')
    expect(warnings).toHaveLength(2)
    expect(warnings[1]).toContain('assistant.enabled with auth.mode "none"')
    expect(warningsFor({ ...oidc, KRANTHO_ASSISTANT_ENABLED: 'true' }, 'production')).toHaveLength(
      1,
    )
    expect(warningsFor({ KRANTHO_ASSISTANT_ENABLED: 'true' }, 'development')).toEqual([])
  })

  it('is silent outside production', () => {
    expect(warningsFor({}, 'development')).toEqual([])
    expect(warningsFor(oidc, undefined)).toEqual([])
  })
})
