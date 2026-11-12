import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { z } from 'zod'
import {
  compileContentContract,
  defineDocumentArchetype,
  defineMetadataArchetype,
} from '../src/archetypes.js'
import { defineCollection } from '../src/collection.js'
import { exportContractAsZod } from '../src/contract-codegen.js'
import { fromPortableJsonSchema } from '../src/portable-schema.js'

it('exports metadata identity, nested constraints, body policy and routing for code adoption', () => {
  const contract = compileContentContract(
    defineDocumentArchetype({
      id: 'site/news',
      label: 'News',
      fields: z.object({ headline: z.string().min(5) }),
      body: 'required',
      sections: ['Context'],
      metadata: {
        editorial: {
          required: true,
          archetype: defineMetadataArchetype({
            id: 'site/editorial',
            label: 'Editorial',
            schema: z.object({ contact: z.object({ email: z.email() }) }),
          }),
        },
      },
    }),
  )
  const code = exportContractAsZod(
    { name: 'news-items', source: 'database', path: '/news/:slug' },
    contract,
  )
  expect(code).toContain('export const collection_news_items')
  expect(code).toContain('id: "site/editorial"')
  expect(code).toContain('"minLength": 5')
  expect(code).toContain('"format": "email"')
  expect(code).toContain('body: "required"')
  expect(code).toContain('path: "/news/:slug"')
  expect(code).toContain('required: true')
  const executable = code
    .replace(/^import .*$/gm, '')
    .replace('export const ', 'const ')
    .replaceAll(' as z.ZodObject', '')
  const adopted = runInNewContext(`${executable}\ncollection_news_items`, {
    z,
    fromPortableJsonSchema,
    defineCollection,
    defineDocumentArchetype,
    defineMetadataArchetype,
  })
  expect(compileContentContract(adopted.archetype)).toEqual(contract)
})
