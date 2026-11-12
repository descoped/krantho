import type { MediaProvider, MediaSection } from '@krantho/config'
import type { IFileStore } from '@krantho/persistence'

/**
 * Build the file store `media.provider` selects.
 *
 * Each store is its own optional peer, loaded by a literal dynamic import so
 * bundlers and Next/Vercel file tracing can follow it; an app installs only
 * the store it uses.
 */
export async function createFileStore(media: MediaSection): Promise<IFileStore> {
  switch (media.provider) {
    case 'local': {
      const mod = await load('local', '@krantho/media-local', () => import('@krantho/media-local'))
      return mod.createLocalFileStore(media.local)
    }
    case 'vercel-blob': {
      const mod = await load(
        'vercel-blob',
        '@krantho/media-vercel-blob',
        () => import('@krantho/media-vercel-blob'),
      )
      return mod.createVercelBlobFileStore(media.vercelBlob)
    }
    case 's3': {
      const mod = await load('s3', '@krantho/media-s3', () => import('@krantho/media-s3'))
      return mod.createS3FileStore(media.s3)
    }
    case 'gcs': {
      const mod = await load('gcs', '@krantho/media-gcs', () => import('@krantho/media-gcs'))
      return mod.createGcsFileStore(media.gcs)
    }
    case undefined:
      throw new Error('media.provider is not set')
  }
}

async function load<T>(
  provider: MediaProvider,
  pkg: string,
  importer: () => Promise<T>,
): Promise<T> {
  try {
    return await importer()
  } catch (err) {
    throw new Error(
      `media.provider is "${provider}", but ${pkg} could not be loaded. ` +
        'Add it to the dependencies of the app that runs krantho.',
      { cause: err },
    )
  }
}
