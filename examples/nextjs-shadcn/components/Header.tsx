import Link from 'next/link'
import ThemeToggle from './ThemeToggle'

interface HeaderProps {
  fields: Record<string, string>
}

export default function Header({ fields }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-accent" />
          <div>
            <Link href="/">
              <span className="site-logo-name">{fields['logo-name']}</span>
            </Link>
            <span className="site-logo-subtitle">{fields['logo-subtitle']}</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <nav className="flex gap-6">
            <Link href="/">{fields['nav-home']}</Link>
            <Link href="/about">{fields['nav-about']}</Link>
            <Link href="/services">{fields['nav-services']}</Link>
            <Link href="/fees">{fields['nav-fees']}</Link>
            <Link href="/contact">{fields['nav-contact']}</Link>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
