import { describe, expect, it } from 'vitest'
import { KranthoConfigError, resolveConfig } from '../src/index.js'

const site = {
  domain: 'example.com',
  name: 'Example',
  language: 'en',
  baseUrl: 'https://example.com',
}

const resolve = (profiles: unknown) =>
  resolveConfig({ site, llm: { profiles } } as never, {}, { cwd: '/srv/site' })

describe('llm.profiles', () => {
  it('is empty unless the code sets it', () => {
    expect(resolveConfig({ site }, {}, { cwd: '/srv/site' }).llm.profiles).toEqual({})
  })

  it('keeps the settings of each model', () => {
    const config = resolve({
      'gpt-5-mini': { reasoningEffort: 'low', reasoningHeadroom: 512 },
      'gpt-4o': { temperature: 0.2 },
    })
    expect(config.llm.profiles).toEqual({
      'gpt-5-mini': { reasoningEffort: 'low', reasoningHeadroom: 512 },
      'gpt-4o': { temperature: 0.2 },
    })
  })

  it.each([
    ['an effort the API does not take', { 'gpt-5': { reasoningEffort: 'extreme' } }],
    ['a negative headroom', { 'gpt-5': { reasoningHeadroom: -1 } }],
    ['a temperature out of range', { 'gpt-4o': { temperature: 3 } }],
    ['a setting that does not exist', { 'gpt-5': { thinking: true } }],
  ])('refuses %s', (_name, profiles) => {
    expect(() => resolve(profiles)).toThrow(KranthoConfigError)
  })
})
