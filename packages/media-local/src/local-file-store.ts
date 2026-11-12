import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LocalMediaSection } from '@krantho/config'
import type { IFileStore, StoredFile } from '@krantho/persistence'

/** Flat keys only: no separators, no leading dot — nothing can escape the directory */
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/** File store on local disk; the host framework serves `dir` at `urlPrefix` */
export class LocalFileStore implements IFileStore {
  readonly label = 'Local disk'
  readonly location: string
  private readonly urlPrefix: string

  constructor(section: LocalMediaSection) {
    this.location = section.dir
    this.urlPrefix = section.urlPrefix
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<StoredFile> {
    const path = this.pathOf(key)
    await mkdir(this.location, { recursive: true })
    await writeFile(path, bytes)
    return this.stored(key)
  }

  async get(key: string): Promise<Uint8Array | null> {
    const path = this.pathOf(key)
    try {
      return new Uint8Array(await readFile(path))
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async copy(fromKey: string, toKey: string, _contentType: string): Promise<StoredFile> {
    const from = this.pathOf(fromKey)
    const to = this.pathOf(toKey)
    await mkdir(this.location, { recursive: true })
    await copyFile(from, to)
    return this.stored(toKey)
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true })
  }

  private pathOf(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error(`Invalid file key: ${key}`)
    return join(this.location, key)
  }

  private stored(key: string): StoredFile {
    return { key, url: `${this.urlPrefix}/${key}` }
  }
}

export function createLocalFileStore(section: LocalMediaSection): IFileStore {
  return new LocalFileStore(section)
}
