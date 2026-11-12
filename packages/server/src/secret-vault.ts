import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { KranthoConfig, SecretsProvider } from '@krantho/config'
import type { ISecretVault } from '@krantho/persistence'

const IV_BYTES = 12
const TAG_BYTES = 16

/** The shortest key the vault accepts: HKDF derives a subkey, it does not stretch a weak secret */
const MIN_KEY_LENGTH = 32

/** Subkey label: a key derived for stored secrets is never the key another purpose uses */
const KEY_PURPOSE = 'krantho stored secrets'

/**
 * The vault that encrypts with a key from the environment: AES-256-GCM under a
 * subkey derived (HKDF) from `key`, a fresh IV for each value, and the setting
 * name as authenticated data, so a sealed value copied to another setting does
 * not open.
 */
export function createLocalSecretVault(key: string): ISecretVault {
  const subkey = Buffer.from(hkdfSync('sha256', key, '', KEY_PURPOSE, 32))
  return {
    label: 'Local key',
    async seal(name, plaintext) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', subkey, iv)
      cipher.setAAD(Buffer.from(name))
      const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')
    },
    async open(name, sealed) {
      const raw = Buffer.from(sealed, 'base64url')
      if (raw.length < IV_BYTES + TAG_BYTES) return null
      try {
        const decipher = createDecipheriv('aes-256-gcm', subkey, raw.subarray(0, IV_BYTES))
        decipher.setAAD(Buffer.from(name))
        decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES))
        const body = raw.subarray(IV_BYTES, raw.length - TAG_BYTES)
        return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
      } catch {
        return null
      }
    },
  }
}

/**
 * Build the vault `secrets.provider` selects, or undefined when the provider has
 * no key to work with — a site then stores no secrets in its database. The local
 * vault refuses a signing-secret fallback shorter than `secrets.local.key` may be.
 *
 * A new vault (a cloud key service) is one provider name in `@krantho/config`, one
 * package that implements `ISecretVault`, and one case here, loaded by a literal
 * dynamic import like the media file stores.
 */
export async function createSecretVault(
  config: Pick<KranthoConfig, 'secrets' | 'auth'>,
): Promise<ISecretVault | undefined> {
  const provider: SecretsProvider = config.secrets.provider
  switch (provider) {
    case 'local': {
      const key = config.secrets.local.key ?? config.auth.jwtSecret
      return key && key.length >= MIN_KEY_LENGTH ? createLocalSecretVault(key) : undefined
    }
  }
}
