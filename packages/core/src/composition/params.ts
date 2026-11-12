/**
 * Resolve dynamic :param segments in a string using provided params.
 *
 * @example
 * ```ts
 * resolveParams('blog/:slug', { slug: 'my-post' })  // 'blog/my-post'
 * resolveParams(':slug', { slug: 'hello' })          // 'hello'
 * resolveParams('home', {})                          // 'home' (no params)
 * ```
 */
export function resolveParams(template: string, params?: Record<string, string>): string {
  if (!params || !template.includes(':')) {
    return template
  }

  return template.replace(/:(\w+)/g, (match, key) => {
    const value = params[key as string]
    if (value === undefined) {
      throw new Error(`Missing param "${key}" for template "${template}"`)
    }
    return value
  })
}
