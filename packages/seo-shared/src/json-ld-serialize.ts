/**
 * Serialize a JSON-LD value for embedding inside a `<script type="application/ld+json">` tag.
 *
 * Escapes `<` to `\u003c` to prevent premature tag termination — the standard
 * XSS mitigation for inline JSON-LD. Every framework component that emits a
 * JSON-LD script tag needs this exact escape; previously four copies of
 * `JSON.stringify(data).replace(/</g, '\\u003c')` were maintained independently
 * in `@krantho/seo` (two files), `@krantho/ui-react` (one file), and
 * `@krantho/ui-svelte` (one file). Consolidating here eliminates the drift risk.
 *
 * Note: the `>` and `&` characters are intentionally NOT escaped — JSON never
 * produces a bare `>` inside string values (it escapes them as part of normal
 * JSON), and `&` is safe inside `<script>` content because script bodies are
 * not parsed as HTML entities.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
