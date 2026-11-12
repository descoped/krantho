'use client'

import Link from 'next/link'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import ThemeToggle from './ThemeToggle'

interface HeaderProps {
  fields: Record<string, string>
}

export default function Header({ fields }: HeaderProps) {
  return (
    <Box component="header" className="site-header">
      <Box
        sx={{
          maxWidth: 1120,
          mx: 'auto',
          px: 3,
          py: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: 'var(--radius)', bgcolor: 'var(--accent)', flexShrink: 0 }} />
          <Box>
            <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              <Typography component="span" className="site-logo-name">
                {fields['logo-name']}
              </Typography>
            </Link>
            <Typography component="span" className="site-logo-subtitle" sx={{ ml: '0.5rem' }}>
              {fields['logo-subtitle']}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Box component="nav" sx={{ display: 'flex', gap: 3 }}>
            <Link href="/">{fields['nav-home']}</Link>
            <Link href="/about">{fields['nav-about']}</Link>
            <Link href="/services">{fields['nav-services']}</Link>
            <Link href="/fees">{fields['nav-fees']}</Link>
            <Link href="/contact">{fields['nav-contact']}</Link>
          </Box>
          <ThemeToggle />
        </Box>
      </Box>
    </Box>
  )
}
