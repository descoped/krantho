import { describe, expect, it } from 'vitest'
import type { KranthoConfigInput } from '../src/index.js'
import { KranthoConfigError, resolveConfig } from '../src/index.js'

const CWD = '/srv/site'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

const COMPLETE = {
  KRANTHO_AUTH_WORKLOAD_ISSUER: 'https://token.actions.githubusercontent.com',
  KRANTHO_AUTH_WORKLOAD_AUDIENCE: 'https://example.com',
  KRANTHO_AUTH_WORKLOAD_SUBJECTS: 'repo:org/repo:*, repo:org/other:ref:refs/heads/main',
}

function issuesOf(env: Record<string, string>, code: KranthoConfigInput = {}): string[] {
  try {
    resolveConfig({ site, ...code }, env, { cwd: CWD })
  } catch (err) {
    if (err instanceof KranthoConfigError) return [...err.issues]
    throw err
  }
  return []
}

describe('auth.workload', () => {
  it('is off by default', () => {
    const { workload } = resolveConfig({ site }, {}, { cwd: CWD }).auth
    expect(workload.issuer).toBeUndefined()
    expect(workload.audience).toBeUndefined()
    expect(workload.subjects).toEqual([])
  })

  it('reads the three leaves from the environment', () => {
    const { workload } = resolveConfig({ site }, COMPLETE, { cwd: CWD }).auth
    expect(workload.issuer).toBe('https://token.actions.githubusercontent.com')
    expect(workload.audience).toBe('https://example.com')
    expect(workload.subjects).toEqual(['repo:org/repo:*', 'repo:org/other:ref:refs/heads/main'])
  })

  it('reads the leaves from code', () => {
    const { workload } = resolveConfig(
      {
        site,
        auth: {
          workload: {
            issuer: 'https://issuer.example.com',
            audience: 'https://example.com',
            subjects: ['repo:org/repo:*'],
          },
        },
      },
      {},
      { cwd: CWD },
    ).auth
    expect(workload.subjects).toEqual(['repo:org/repo:*'])
  })

  it('names every missing leaf when the configuration is partial', () => {
    const issues = issuesOf({
      KRANTHO_AUTH_WORKLOAD_ISSUER: 'https://token.actions.githubusercontent.com',
    })
    expect(issues).toHaveLength(2)
    expect(issues.join('\n')).toContain('KRANTHO_AUTH_WORKLOAD_AUDIENCE')
    expect(issues.join('\n')).toContain('KRANTHO_AUTH_WORKLOAD_SUBJECTS')
  })

  it('names the issuer and audience when only subjects are set', () => {
    const issues = issuesOf({ KRANTHO_AUTH_WORKLOAD_SUBJECTS: 'repo:org/repo:*' })
    expect(issues.join('\n')).toContain('KRANTHO_AUTH_WORKLOAD_ISSUER')
    expect(issues.join('\n')).toContain('KRANTHO_AUTH_WORKLOAD_AUDIENCE')
  })

  it('refuses an issuer that is not an https URL', () => {
    expect(issuesOf({ ...COMPLETE, KRANTHO_AUTH_WORKLOAD_ISSUER: 'not a url' })).toHaveLength(1)
    const issues = issuesOf({
      ...COMPLETE,
      KRANTHO_AUTH_WORKLOAD_ISSUER: 'http://token.example.com',
    })
    expect(issues.join('\n')).toContain('https')
  })

  it.each(['*', 'repo:*:main', '**', 'repo:org/*/x'])(
    'refuses the subject pattern %s',
    (pattern) => {
      const issues = issuesOf({ ...COMPLETE, KRANTHO_AUTH_WORKLOAD_SUBJECTS: pattern })
      expect(issues.join('\n')).toContain(pattern)
    },
  )
})
