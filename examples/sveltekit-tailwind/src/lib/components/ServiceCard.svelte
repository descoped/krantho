<script lang="ts">
  import { kranthoField, type MarkedDocument } from '@krantho/core/marks'

  let {
    title,
    description,
    href = '#',
    headingLevel = 'h2',
    doc,
  }: {
    title: string
    description: string
    href?: string
    headingLevel?: 'h2' | 'h3'
    /** The service the card shows; its title and ingress are marked in a preview */
    doc?: MarkedDocument | undefined
  } = $props()
</script>

<a class="service-card block" {href}>
  <svelte:element this={headingLevel} class="text-xl font-semibold mb-2" {...kranthoField(doc, 'title')}>{title}</svelte:element>
  <p class="text-muted-foreground" {...kranthoField(doc, 'ingress')}>{description}</p>
</a>
