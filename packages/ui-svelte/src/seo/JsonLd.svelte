<script lang="ts">
import { serializeJsonLd } from '@krantho/seo-shared'

let { data }: { data: Record<string, unknown> } = $props()
const json = $derived(serializeJsonLd(data))
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${json}</script>`}
</svelte:head>
