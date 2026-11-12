// Local MUI theme that defers ALL visual styling to shared CSS variables.
// MUI provides component overrides only.
// Font sizes, colors, and dark/light mode are controlled by globals.css.
import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: { main: '#1a2744' },
    secondary: { main: '#c8953e' },
  },
  typography: {
    fontFamily: 'var(--font-body)',
    h1: { fontFamily: 'var(--font-heading)' },
    h2: { fontFamily: 'var(--font-heading)' },
    h3: { fontFamily: 'var(--font-heading)' },
    h4: { fontFamily: 'var(--font-heading)' },
    h5: { fontFamily: 'var(--font-heading)' },
    h6: { fontFamily: 'var(--font-heading)' },
    button: {
      fontFamily: 'var(--font-heading)',
      fontWeight: 600,
      textTransform: 'none' as const,
    },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          margin: 0,
          color: 'var(--foreground)',
          backgroundColor: 'var(--background)',
          fontFamily: 'var(--font-body)',
          lineHeight: 1.7,
          transition: 'background-color 0.2s, color 0.2s',
        },
        'h1, h2, h3, h4, h5, h6': {
          margin: 0,
          fontFamily: 'var(--font-heading)',
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          color: 'inherit',
        },
        p: { margin: 0 },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: { color: 'inherit' },
        h1: { fontSize: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' },
        h2: { fontSize: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' },
        h3: { fontSize: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' },
        h4: { fontSize: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' },
        h5: { fontSize: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' },
        h6: { fontSize: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { color: 'inherit' },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: 'var(--border)' },
      },
    },
  },
})
