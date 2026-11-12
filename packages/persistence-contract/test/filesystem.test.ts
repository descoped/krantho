import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSystemAdapter } from '@krantho/persistence-fs'
import { queryContract, seedAdapter } from './query.contract.js'

/** One directory per collection in a temporary tree, as a site's collections have */
queryContract(
  'filesystem',
  async (seed) => {
    const root = await mkdtemp(join(tmpdir(), 'krantho-contract-'))
    const directories = new Map<string, string>()
    for (const collection of new Set(seed.map((doc) => doc.collection))) {
      const directory = join(root, collection)
      await mkdir(directory)
      directories.set(collection, directory)
    }
    const adapter = new FileSystemAdapter({ contentPath: root, directories, defaultLocale: 'en' })
    await seedAdapter(adapter, seed)
    return { adapter, close: () => rm(root, { recursive: true, force: true }) }
  },
  { history: false },
)
