<script lang="ts">
import JsonLd from './JsonLd.svelte'

let {
  items,
}: {
  items: Array<{ '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }>
} = $props()

const jsonLd = $derived(
  items.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items,
      }
    : null,
)
</script>

{#if jsonLd}
  <JsonLd data={jsonLd} />
{/if}
