/** An `<img>` or `<a>` start tag; a `>` inside a quoted value does not end it */
const URL_TAG = /<(?:img|a)\s(?:"[^"]*"|'[^']*'|[^>"'])*>/gi

/** One attribute of a tag: its name and its value, quoted or not */
const ATTRIBUTE = /(\s[^\s=>"'/]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>"']+)?/g

/**
 * Rewrite the `src` and `href` of the `<img>` and `<a>` tags in a piece of raw
 * HTML, as a markdown link or image is rewritten: docs written for GitHub size
 * an image with `<img src="images/a.png" width="320">`, since markdown cannot.
 * Attributes are read one by one, so a value that mentions `src=` is not one.
 * Unquoted values are left as written.
 */
export function rewriteHtmlUrls(html: string, rewrite: (url: string) => string): string {
  return html.replace(URL_TAG, (tag) =>
    tag.replace(ATTRIBUTE, (attribute, name: string, equals: string, value?: string) => {
      const quote = value?.charAt(0)
      if (!value || (quote !== '"' && quote !== "'")) return attribute
      if (!/^\s(?:src|href)$/i.test(name)) return attribute
      return `${name}${equals}${quote}${rewrite(value.slice(1, -1))}${quote}`
    }),
  )
}
