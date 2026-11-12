import type { ContentContract } from '@krantho/persistence'

interface CollectionBinding {
  name: string
  source: 'filesystem' | 'database'
  directory?: string | undefined
  path?: string | false | undefined
}

/** Code adoption retains the complete portable contract, including nested constraints and groups. */
export function exportContractAsZod(binding: CollectionBinding, contract: ContentContract): string {
  const groupEntries = Object.entries(contract.metadata)
  const imports = groupEntries.length
    ? 'defineCollection, defineDocumentArchetype, defineMetadataArchetype, fromPortableJsonSchema'
    : 'defineCollection, defineDocumentArchetype, fromPortableJsonSchema'
  const groups = groupEntries.map(
    ([slot, group]) =>
      `    ${JSON.stringify(slot)}: { required: ${group.required}, archetype: defineMetadataArchetype({\n` +
      `      id: ${JSON.stringify(group.id)}, label: ${JSON.stringify(group.label)},\n` +
      `      schema: fromPortableJsonSchema(${JSON.stringify(group.schema, null, 2)}),\n` +
      '    }) },',
  )
  const routing = binding.path === undefined ? '' : `  path: ${JSON.stringify(binding.path)},\n`
  const directory =
    binding.directory === undefined ? '' : `  directory: ${JSON.stringify(binding.directory)},\n`
  return `import { ${imports} } from '@krantho/schema'

// Review the collection directory before adopting this definition in your repository.
export const collection_${binding.name.replace(/[^a-zA-Z0-9_$]/g, '_')} = defineCollection({
  name: ${JSON.stringify(binding.name)}, source: ${JSON.stringify(binding.source)},
${directory}${routing}  archetype: defineDocumentArchetype({
    id: ${JSON.stringify(contract.id)}, label: ${JSON.stringify(contract.label)},
    body: ${JSON.stringify(contract.body)}, sections: ${JSON.stringify(contract.sections)},
    fields: fromPortableJsonSchema(${JSON.stringify(contract.fields, null, 2)}),
    metadata: {
${groups.join('\n')}
    },
  }),
})
`
}
