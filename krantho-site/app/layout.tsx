import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'
import '../lib/krantho'
import config from '../krantho.config'
import { Analytics } from './analytics'
import { Interactions } from './components/interactions'
import { ScreenViewer } from './components/screen-viewer'
import './styles/tokens.css'
import './styles/base.css'
import './styles/shell.css'
import './styles/shot.css'
import './styles/diagram.css'

// The root layout reads no content: the build prerenders the 404 page through
// it, and the build cannot reach the database. Pages read their content in the
// (site) group, per request, cached until a change in /studio.

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
})
// Body text uses the system UI face (tokens.css): no download, and the display
// face is the only font preloaded. The monospace never holds the largest paint.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  preload: false,
})

const baseUrl = config.site?.baseUrl ?? 'https://krantho.com'

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: { default: 'Krantho', template: '%s — Krantho' },
  description: 'A CMS library for content sites built in your own codebase.',
  // The SVG favicon follows the OS color scheme; the PNG serves browsers
  // without SVG favicons, the Apple icon home screens
  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/icon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf7' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1120' },
  ],
}

// Runs before first paint: applies the stored theme and stack preference, so a
// shared, cached page never flashes the wrong theme or code sample.
const PREFERENCES = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('krantho-theme');if(t==='light'||t==='dark')d.dataset.theme=t;var s=localStorage.getItem('krantho-stack');d.dataset.stack=s==='sveltekit'||s==='express'?s:'next'}catch(e){d.dataset.stack='next'}})()`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  const domain = config.site?.domain
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script id="preferences" strategy="beforeInteractive">
          {PREFERENCES}
        </Script>
        {children}
        <Interactions />
        <ScreenViewer />
        {domain && <Analytics domain={domain} />}
      </body>
    </html>
  )
}
