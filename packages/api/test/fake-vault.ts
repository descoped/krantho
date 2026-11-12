import type { ISecretVault } from '@krantho/persistence'

/**
 * A vault that is readable on purpose: a sealed value is `sealed:<name>:<plaintext>`,
 * and opens only under the name it was sealed with, as the real vault binds it.
 */
export const fakeVault: ISecretVault = {
  label: 'Fake',
  async seal(name, plaintext) {
    return `sealed:${name}:${plaintext}`
  },
  async open(name, sealed) {
    const prefix = `sealed:${name}:`
    return sealed.startsWith(prefix) ? sealed.slice(prefix.length) : null
  },
}

/** Store a provider's key the way the settings handler does: sealed under its setting name */
export async function storeKey(
  settings: { setSetting(key: string, value: string): Promise<void> },
  provider: string,
  key: string,
): Promise<void> {
  const name = `llm.apiKey.${provider}`
  await settings.setSetting(name, await fakeVault.seal(name, key))
}
