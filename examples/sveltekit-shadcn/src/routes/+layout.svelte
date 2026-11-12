<script lang="ts">
  import '../app.css'
  import { textFields } from '$lib/text'
  import type { Snippet } from 'svelte'
  import type { LayoutData } from './$types'
  import { JsonLd } from '@krantho/ui-svelte'
  import ThemeToggle from '$lib/components/ThemeToggle.svelte'
  import Footer from '$lib/components/Footer.svelte'

  let { data, children }: { data: LayoutData; children: Snippet } = $props()

  const nav = $derived(textFields(data.nav))
  const structuredData = $derived(data.structuredData)
  const jsonLdEntries = $derived(
    Object.values(structuredData ?? {}) as Record<string, unknown>[]
  )
  const navLinks = $derived([
    { label: nav['nav-home'], href: '/' },
    { label: nav['nav-about'], href: '/about' },
    { label: nav['nav-services'], href: '/services' },
    { label: nav['nav-fees'], href: '/fees' },
    { label: nav['nav-contact'], href: '/contact' }
  ])
</script>

{#each jsonLdEntries as entry}
  <JsonLd data={entry} />
{/each}

<div class="min-h-screen flex flex-col">
  <header class="site-header">
    <div class="max-w-[1120px] mx-auto px-6 py-4 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3 no-underline" style="color: inherit;">
        <span class="w-8 h-8 bg-accent rounded-lg" style="flex-shrink: 0;"></span>
        <span>
          <span class="site-logo-name">{nav['logo-name']}</span>
          <span class="site-logo-subtitle">{nav['logo-subtitle']}</span>
        </span>
      </a>
      <div class="flex items-center gap-6">
        <nav class="flex gap-6">
          {#each navLinks as link}
            <a href={link.href}>{link.label}</a>
          {/each}
        </nav>
        <ThemeToggle />
      </div>
    </div>
  </header>

  <main class="flex-1">
    {@render children()}
  </main>

  <Footer footer={textFields(data.footer)} contactInfo={textFields(data.contactInfo)} />
</div>
