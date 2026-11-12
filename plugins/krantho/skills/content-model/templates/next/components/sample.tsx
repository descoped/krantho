import { all, type Doc, text } from '@/lib/content'
import { Html } from './html'

const STACK_LABELS: Record<string, string> = {
  next: 'Next.js',
  sveltekit: 'SvelteKit',
  express: 'Express',
  any: 'Any stack',
}

/** The code inside a snippet's body: its first fenced block, or the whole body */
function codeOf(doc: Doc): string {
  const match = doc.rawContent.match(/```[^\n]*\n([\s\S]*?)```/)
  return (match?.[1] ?? doc.rawContent).replace(/\n$/, '')
}

/** The variants of a code sample: snippets sharing `sample`, in order */
export async function variantsOf(name: string): Promise<Doc[]> {
  return (await all('snippets')).filter((snippet) => text(snippet, 'sample') === name)
}

/**
 * One code sample, with a labeled block per stack. Without JavaScript every
 * variant shows; a small client script can turn the labels into tabs that
 * follow the visitor's stored stack choice (set before first paint, like the
 * theme), since cached pages are the same for every visitor.
 */
export async function Sample({ name }: { name: string }): Promise<React.ReactElement | null> {
  const variants = await variantsOf(name)
  if (variants.length === 0) return null
  return (
    <div className="sample" data-sample={name}>
      {variants.map((variant) => {
        const stack = text(variant, 'stack')
        const filename = text(variant, 'filename')
        return (
          <figure key={variant.slug} data-stack={stack}>
            <figcaption>
              {filename || text(variant, 'title')}
              {stack !== 'any' && <span className="stack">{STACK_LABELS[stack] ?? stack}</span>}
            </figcaption>
            <pre>
              <code className={`language-${text(variant, 'language') || 'ts'}`}>
                {codeOf(variant)}
              </code>
            </pre>
          </figure>
        )
      })}
    </div>
  )
}

const SAMPLE_PARAGRAPH = /<p>\{\{sample:([\w-]+)\}\}<\/p>/g

/**
 * Body HTML with `{{sample:<name>}}` paragraphs replaced by the sample. Editors
 * write the placeholder on a line of its own in the markdown body.
 */
export function BodyWithSamples({ html }: { html: string }): React.ReactElement {
  const parts = html.split(SAMPLE_PARAGRAPH)
  // split() with one capture group alternates: html, name, html, name, …
  return (
    <div className="prose">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Sample key={`${part}-${index}`} name={part} />
        ) : (
          <Html key={`html-${index}`} html={part} className="" />
        ),
      )}
    </div>
  )
}
