import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Screens that load several sources before they settle need more than the
// default second under a full, parallel run.
configure({ asyncUtilTimeout: 5000 })

// No test reaches the network. A screen's requests can outlive its test (a
// chain still loading when the test ends); once a test file unstubs its fake
// API they meet this fetch, which never answers, instead of the real one.
globalThis.fetch = () => new Promise<Response>(() => undefined)

// Auto-cleanup after each test so mounted components don't leak, and no
// stored preference (a collapsed nav, a theme) carries into the next test.
// Node's own localStorage, unavailable without --localstorage-file, can shadow
// jsdom's, so the storage may be missing.
afterEach(() => {
  cleanup()
  globalThis.localStorage?.clear()
})

// jsdom doesn't implement scrollIntoView — stub it to prevent errors
// when GraphBrowser follows a reference and tries to scroll the target
// card into view.
Element.prototype.scrollIntoView = () => {}

// jsdom doesn't implement sessionStorage by default in all environments.
// vitest + jsdom should have it, but guard just in case.
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    },
  })
}
