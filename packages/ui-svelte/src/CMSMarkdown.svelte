<script lang="ts">
import { kranthoSection, type MarkedDocument, markBodySections } from '@krantho/core/marks'

let {
  html,
  class: className = '',
  doc,
  section,
  body,
}: {
  html: string
  class?: string
  /** The document the markdown belongs to; in a preview, what it renders is marked for Live mode */
  doc?: MarkedDocument | undefined
  /** The `##` section `html` renders, by its heading */
  section?: string | undefined
  /** The markdown of a whole body `html` renders, so its lead and sections are marked */
  body?: string | undefined
} = $props()

const cssClass = $derived(`cms-markdown ${className}`.trim())
const marks = $derived(section ? kranthoSection(doc, section) : {})
const rendered = $derived(!section && body !== undefined ? markBodySections(html, body, doc) : html)
</script>

<div class={cssClass} {...marks}>
  {@html rendered}
</div>
