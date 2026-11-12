<script lang="ts">
  import { CMSMarkdown } from '@krantho/ui-svelte'
  import { kranthoField } from '@krantho/core/marks'
  import { textFields } from '$lib/text'

  let { data } = $props()

  const fm = $derived(textFields(data.fields))
</script>

<svelte:head>
  {#if data.jsonLd}
    {@html `<script type="application/ld+json">${JSON.stringify(data.jsonLd)}</script>`}
  {/if}
  <title>{fm['title']}</title>
  <meta name="description" content={fm['meta-description'] ?? fm['description']} />
</svelte:head>

<section class="section-white">
  <div class="section-container">
    <a href="/services" class="mb-4 block text-sm text-muted-foreground hover:underline">&larr; All Services</a>
    <h1 class="mb-4 font-heading text-3xl font-bold" {...kranthoField(data.doc, 'title')}>{fm['title']}</h1>
    <p class="mb-8 text-lg text-muted-foreground" {...kranthoField(data.doc, 'ingress')}>{fm['ingress']}</p>
  </div>
</section>

<section class="section-muted">
  <div class="section-container">
    <CMSMarkdown html={data.html} class="prose prose-lg max-w-none" doc={data.doc} body={data.body} />
  </div>
</section>
