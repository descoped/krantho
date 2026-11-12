import type { Metadata } from 'next'
import './globals.css'

// Pages set their own title and description; these apply where one is missing
export const metadata: Metadata = {
  title: 'Krantho Example — Strategy & Digital Transformation',
  description: 'Strategy, digital transformation, and advisory services for forward-thinking businesses.',
}

// Runs before first paint: applies the stored theme (or the system's), so a cached page
// never shows the other one first. The class is set on <html> before React hydrates it.
const THEME_SCRIPT = "(function(){try{var t=localStorage.getItem('theme'),r=document.documentElement,d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);r.classList.remove('light','dark');r.classList.add(d?'dark':'light')}catch(e){}})()"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  )
}
