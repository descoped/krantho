<script lang="ts">
import { kranthoField, type MarkedDocument } from '@krantho/core/marks'

let {
  src,
  alt = '',
  width,
  height,
  lazy = true,
  class: className = '',
  doc,
  field,
}: {
  src: string
  alt?: string
  width?: number | undefined
  height?: number | undefined
  lazy?: boolean
  class?: string
  /** The document the image belongs to; in a preview, `field` is marked for Live mode */
  doc?: MarkedDocument | undefined
  field?: string | undefined
} = $props()

const marks = $derived(field ? kranthoField(doc, field) : {})

const cssClass = $derived(`cms-image ${className}`.trim())
</script>

<img
  {src}
  {alt}
  {width}
  {height}
  loading={lazy ? 'lazy' : undefined}
  class={cssClass}
  {...marks}
/>
