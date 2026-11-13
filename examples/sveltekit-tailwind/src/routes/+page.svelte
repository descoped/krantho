<script lang="ts">
  import { CMSText, CMSMarkdown } from '@krantho/ui-svelte'
  import ServiceCard from '#lib/components/ServiceCard.svelte'
  import { textFields } from '#lib/text.ts'

  let { data } = $props()

  const fm = $derived(textFields(data.fields))
  const services = $derived(data.services)
</script>

<svelte:head>
  {#if data.jsonLd}
    {@html `<script type="application/ld+json">${JSON.stringify(data.jsonLd)}</script>`}
  {/if}
  <title>{fm['title']}</title>
  <meta name="description" content={fm['description']} />
</svelte:head>

<section class="section-primary">
  <div class="section-container text-center">
    <CMSText text={fm['title']} variant="h1" class="hero-title mb-4" doc={data.doc} field="title" />
    <div class="mx-auto max-w-2xl opacity-80">
      <CMSText text={fm['description']} variant="body1" class="hero-subtitle" doc={data.doc} field="description" />
    </div>
    <div class="mt-8">
      <a href="/services" class="hero-btn">
        Our Services
      </a>
    </div>
  </div>
</section>

<section class="section-white">
  <div class="section-container">
    <CMSMarkdown html={data.html} class="prose max-w-none" doc={data.doc} body={data.body} />
  </div>
</section>

<section class="section-muted">
  <div class="section-container">
    <h2 class="section-title">Our Services</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      {#each services as service}
        <ServiceCard title={service.title} description={service.description} href={service.href} headingLevel="h3" doc={service.doc} />
      {/each}
    </div>
  </div>
</section>

<section class="section-white">
  <div class="section-container text-center">
    <h2 class="section-title">Why Acme?</h2>
    <div class="mt-6">
      <a href="/about" class="hero-btn">
        Learn more about us
      </a>
    </div>
  </div>
</section>
