<script lang="ts">
  import { CMSText } from '@krantho/ui-svelte'
  import ServiceCard from '#lib/components/ServiceCard.svelte'
  import { textFields } from '#lib/text.ts'

  let { data } = $props()

  const fm = $derived(textFields(data.fields))
  const cards = $derived(data.cards)
</script>

<svelte:head>
  {#if data.jsonLd}
    {@html `<script type="application/ld+json">${JSON.stringify(data.jsonLd)}</script>`}
  {/if}
  <title>{fm['title']}</title>
  <meta name="description" content={fm['description']} />
</svelte:head>

<section class="section-white">
  <div class="section-container">
    <CMSText text={fm['title']} variant="h1" class="mb-4 font-heading text-3xl font-bold" doc={data.doc} field="title" />
    <CMSText text={fm['description']} variant="body1" class="mb-10 text-lg text-muted-foreground max-w-2xl" doc={data.doc} field="description" />
  </div>
</section>

<section class="section-muted">
  <div class="section-container">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      {#each cards as card}
        <ServiceCard title={card.title} description={card.description} href={card.href} doc={card.doc} />
      {/each}
    </div>
  </div>
</section>
