import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  cssVariables: { cssVarPrefix: 'acme' },
  colorSchemes: { light: true, dark: true },
  palette: {
    primary: { main: '#1a2744' },
    secondary: { main: '#c8953e' },
    background: { default: '#ffffff', paper: '#ffffff' },
  },
  typography: {
    fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
    h1: {
      fontFamily: "'Inter', system-ui, sans-serif",
      fontWeight: 800,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontFamily: "'Inter', system-ui, sans-serif",
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontFamily: "'Inter', system-ui, sans-serif",
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontFamily: "'Inter', system-ui, sans-serif",
      fontWeight: 600,
    },
    h5: {
      fontFamily: "'Inter', system-ui, sans-serif",
      fontWeight: 600,
    },
    h6: {
      fontFamily: "'Inter', system-ui, sans-serif",
      fontWeight: 600,
    },
    button: {
      fontFamily: "'Inter', system-ui, sans-serif",
      fontWeight: 600,
      textTransform: 'none' as const,
    },
  },
  shape: { borderRadius: 8 },
})
