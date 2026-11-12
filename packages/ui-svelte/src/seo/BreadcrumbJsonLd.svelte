<script lang="ts">
import JsonLd from './JsonLd.svelte'

let { pathname, siteUrl = '' }: { pathname: string; siteUrl?: string } = $props()

const breadcrumbs = $derived.by(() => {
  const segments = pathname.split('/').filter(Boolean)
  return segments.map((segment, index) => ({
    '@type': 'ListItem' as const,
    position: index + 1,
    name: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
    item: `${siteUrl}/${segments.slice(0, index + 1).join('/')}`,
  }))
})

const jsonLd = $derived(
  breadcrumbs.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs,
      }
    : null,
)
</script>

{#if jsonLd}
  <JsonLd data={jsonLd} />
{/if}
