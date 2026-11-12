import type { MetadataRoute } from 'next'

// The web app manifest, served at /manifest.webmanifest. krantho.com is a site to
// read, not an app to install, so it opens in the browser; the icons are the
// mark on fjord night (public/brand/).

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Krantho',
    short_name: 'Krantho',
    description: 'A CMS library for content sites built in your own codebase.',
    start_url: '/',
    display: 'browser',
    background_color: '#0a1120',
    theme_color: '#0a1120',
    icons: [
      { src: '/brand/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/brand/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
