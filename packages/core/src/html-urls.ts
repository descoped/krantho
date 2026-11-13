/** An `<img>` or `<a>` start tag */
const URL_TAG = /<(?:img|a)\s[^>]*>/gi

/** A quoted `src` or `href` attribute inside a tag */
const URL_ATTRIBUTE = /(\s(?:src|href)\s*=\s*)(?:"([^"]*)"|'([^']*)')/i

/**
 * Rewrite the `src` and `href` of the `<img>` and `<a>` tags in a piece of raw
 * HTML, as a markdown link or image is rewritten: docs written for GitHub size
 * an image with `<img src="images/a.png" width="320">`, since markdown cannot.
 * Unquoted attribute values are left as written.
 */
export function rewriteHtmlUrls(html: string, rewrite: (url: string) => string): string {
  return html.replace(URL_TAG, (tag) =>
    tag.replace(URL_ATTRIBUTE, (_attribute, name: string, double?: string, single?: string) =>
      double !== undefined ? `${name}"${rewrite(double)}"` : `${name}'${rewrite(single ?? '')}'`,
    ),
  )
}
