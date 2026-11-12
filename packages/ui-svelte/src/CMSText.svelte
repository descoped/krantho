<script lang="ts">
import { variantToTag } from '@krantho/core'
import { kranthoField, type MarkedDocument } from '@krantho/core/marks'

let {
  text,
  variant = 'body1',
  color,
  align,
  weight,
  size,
  component,
  class: className = '',
  doc,
  field,
}: {
  text: string
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body1' | 'body2' | 'caption'
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'inherit' | undefined
  align?: 'left' | 'center' | 'right' | 'justify' | undefined
  weight?: 'light' | 'regular' | 'medium' | 'bold' | undefined
  size?: 'small' | 'medium' | 'large' | undefined
  component?: string | undefined
  class?: string
  /** The document the text belongs to; in a preview, `field` is marked for Live mode */
  doc?: MarkedDocument | undefined
  field?: string | undefined
} = $props()

const marks = $derived(field ? kranthoField(doc, field) : {})

const tag = $derived(component ?? variantToTag(variant))
const cssClass = $derived(
  [
    'cms-text',
    `cms-variant-${variant}`,
    color && `cms-color-${color}`,
    align && `cms-align-${align}`,
    weight && `cms-weight-${weight}`,
    size && `cms-size-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<svelte:element this={tag} class={cssClass} {...marks}>{text}</svelte:element>
