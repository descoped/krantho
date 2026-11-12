<script lang="ts">
  import { browser } from '$app/environment'

  type Theme = 'light' | 'dark' | 'system'

  let theme: Theme = $state('system')

  if (browser) {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored) theme = stored
  }

  function applyTheme(t: Theme): void {
    if (!browser) return
    const root = document.documentElement
    localStorage.setItem('theme', t)
    root.classList.remove('light', 'dark')

    if (t === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.add(prefersDark ? 'dark' : 'light')
    } else {
      root.classList.add(t)
    }
  }

  $effect(() => {
    applyTheme(theme)
  })

  function cycle(): void {
    if (theme === 'light') theme = 'dark'
    else if (theme === 'dark') theme = 'system'
    else theme = 'light'
  }

  const icon = $derived(theme === 'light' ? '\u2600' : theme === 'dark' ? '\u263E' : '\u25D0')
  const label = $derived(theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System')
</script>

<button
  onclick={cycle}
  aria-label="Theme: {label}"
  title="Theme: {label}"
  class="theme-toggle"
>
  <span>{icon}</span>
  <span class="theme-label">{label}</span>
</button>

<style>
  .theme-toggle {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius);
    color: inherit;
    cursor: pointer;
    padding: 4px 10px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .theme-label { font-size: 12px; }
</style>
