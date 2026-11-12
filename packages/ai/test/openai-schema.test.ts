import { describe, expect, it } from 'vitest'
import type { ChatTool } from '../src/chat-types.js'
import { declareOpenObjects, decodeOpenObjects } from '../src/openai-schema.js'

const tool = (inputSchema: Record<string, unknown>): ChatTool => ({
  name: 't',
  description: 'A tool',
  inputSchema,
})

describe('declareOpenObjects', () => {
  it('declares an object property without named properties as a JSON string and records where', () => {
    const declared = declareOpenObjects(
      tool({
        type: 'object',
        properties: {
          slug: { type: 'string' },
          fields: { type: 'object', description: 'Values' },
          empty: { type: 'object', properties: {} },
        },
        required: ['slug'],
      }),
    )
    expect(declared.parameters).toEqual({
      type: 'object',
      properties: {
        slug: { type: 'string' },
        fields: { type: 'string', description: 'Values Pass a JSON object, encoded as a string.' },
        empty: { type: 'string', description: 'Pass a JSON object, encoded as a string.' },
      },
      required: ['slug'],
    })
    expect(declared.paths).toEqual([['fields'], ['empty']])
  })

  it('finds an open object inside a property that names its own properties', () => {
    const declared = declareOpenObjects(
      tool({
        type: 'object',
        properties: {
          change: {
            type: 'object',
            properties: { values: { type: 'object' }, note: { type: 'string' } },
          },
        },
      }),
    )
    expect(declared.paths).toEqual([['change', 'values']])
    expect(declared.parameters).toMatchObject({
      properties: {
        change: { properties: { values: { type: 'string' }, note: { type: 'string' } } },
      },
    })
  })

  it('leaves a schema with named properties and no open objects as it is', () => {
    const schema = {
      type: 'object',
      properties: { slug: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
    }
    expect(declareOpenObjects(tool(schema))).toEqual({ parameters: schema, paths: [] })
  })

  it('sends no parameters for a tool that takes no arguments', () => {
    expect(declareOpenObjects(tool({ type: 'object', properties: {} }))).toEqual({
      parameters: undefined,
      paths: [],
    })
    expect(declareOpenObjects(tool({ type: 'object' })).parameters).toBeUndefined()
  })
})

describe('decodeOpenObjects', () => {
  it('decodes a declared string to the object it holds, at any depth', () => {
    expect(
      decodeOpenObjects(
        { slug: 's', fields: '{"title":"New"}', change: { values: '{"a":1}', note: 'n' } },
        [['fields'], ['change', 'values']],
      ),
    ).toEqual({ slug: 's', fields: { title: 'New' }, change: { values: { a: 1 }, note: 'n' } })
  })

  it('keeps an object the model sent anyway', () => {
    expect(decodeOpenObjects({ fields: { title: 'T' } }, [['fields']])).toEqual({
      fields: { title: 'T' },
    })
  })

  it('keeps a string that is not a JSON object, for the tool to reject', () => {
    const input = { a: 'not json', b: '[1,2]', c: '"text"', d: '42' }
    expect(decodeOpenObjects(input, [['a'], ['b'], ['c'], ['d']])).toEqual(input)
  })

  it('ignores a path whose parent is missing or is not an object', () => {
    expect(
      decodeOpenObjects({ change: 'x' }, [
        ['change', 'values'],
        ['other', 'values'],
      ]),
    ).toEqual({
      change: 'x',
    })
  })

  it('changes nothing without paths', () => {
    const input = { fields: '{"a":1}' }
    expect(decodeOpenObjects(input, [])).toBe(input)
  })
})
