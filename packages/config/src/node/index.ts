/**
 * The Node half of the package, published as `@krantho/config/node`: loading
 * a site's whole configuration, including its SEO definition files.
 */
export type { LoadConfigOptions } from './load.js'
export { loadConfig } from './load.js'
export { decodeRouteSlug, encodeRouteSlug } from './route-slug.js'
export { readSeoDefinitions } from './seo-definitions.js'
