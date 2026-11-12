import { describe, expect, it } from 'vitest'
import type { KranthoConfigInput } from '../src/index.js'
import {
  KranthoConfigError,
  REDACTED,
  redact,
  resolveConfig,
  toPublicConfig,
  WEBHOOK_EVENTS,
} from '../src/index.js'

const CWD = '/srv/site'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

function issuesOf(webhooks: unknown): string[] {
  try {
    resolveConfig({ site, webhooks } as KranthoConfigInput, {}, { cwd: CWD })
  } catch (err) {
    if (err instanceof KranthoConfigError) return [...err.issues]
    throw err
  }
  return []
}

describe('webhooks', () => {
  it('has none by default', () => {
    expect(resolveConfig({ site }, {}, { cwd: CWD }).webhooks).toEqual([])
  })

  it('takes a list of targets from code', () => {
    const webhooks = [
      { url: 'https://hooks.example.com/a', events: ['publish', 'update'] as const },
      { url: 'http://localhost:9000/b', events: ['create'] as const, secret: 's3cret' },
    ]
    const config = resolveConfig(
      { site, webhooks: webhooks.map((hook) => ({ ...hook, events: [...hook.events] })) },
      {},
      { cwd: CWD },
    )
    expect(config.webhooks).toEqual(webhooks)
    expect(config.sources.get('webhooks')).toBe('code')
  })

  it('names the events a webhook can subscribe to', () => {
    expect([...WEBHOOK_EVENTS]).toEqual(['create', 'update', 'publish', 'delete'])
  })

  it('rejects a URL that is not absolute', () => {
    const issues = issuesOf([{ url: '/hooks', events: ['publish'] }])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('webhooks.0.url')
  })

  it('rejects a URL that is not http or https', () => {
    const issues = issuesOf([{ url: 'ftp://hooks.example.com', events: ['publish'] }])
    expect(issues[0]).toContain('webhooks.0.url: must be an absolute http or https URL')
  })

  it('rejects an empty list of events', () => {
    const issues = issuesOf([{ url: 'https://hooks.example.com', events: [] }])
    expect(issues[0]).toContain('webhooks.0.events: must list at least one event')
  })

  it('rejects an unknown event', () => {
    const issues = issuesOf([{ url: 'https://hooks.example.com', events: ['restore'] }])
    expect(issues[0]).toContain('webhooks.0.events.0')
  })

  it('rejects an empty secret and an unknown key', () => {
    expect(
      issuesOf([{ url: 'https://hooks.example.com', events: ['publish'], secret: '' }]),
    ).toHaveLength(1)
    expect(
      issuesOf([{ url: 'https://hooks.example.com', events: ['publish'], retries: 3 }]),
    ).toHaveLength(1)
  })

  it('keeps webhooks and their secrets out of the public config', () => {
    const config = resolveConfig(
      {
        site,
        webhooks: [
          { url: 'https://hooks.example.com/x', events: ['publish'], secret: 'marker-secret' },
        ],
      },
      {},
      { cwd: CWD },
    )
    const dumped = JSON.stringify(toPublicConfig(config))
    expect(dumped).not.toContain('marker-secret')
    expect(dumped).not.toContain('hooks.example.com')
    expect(toPublicConfig(config)).not.toHaveProperty('webhooks')
  })

  it('redacts a webhook secret and keeps the rest', () => {
    const config = resolveConfig(
      {
        site,
        webhooks: [
          { url: 'https://hooks.example.com/x', events: ['publish'], secret: 'marker-secret' },
          { url: 'https://hooks.example.com/y', events: ['delete'] },
        ],
      },
      {},
      { cwd: CWD },
    )
    const dumped = redact(config) as { webhooks: Array<Record<string, unknown>> }
    expect(dumped.webhooks).toEqual([
      { url: 'https://hooks.example.com/x', events: ['publish'], secret: REDACTED },
      { url: 'https://hooks.example.com/y', events: ['delete'] },
    ])
    expect(config.webhooks[0]?.secret).toBe('marker-secret')
  })
})
