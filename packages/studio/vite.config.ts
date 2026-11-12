import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/studio/',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // React core — loaded on every page
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          )
            return 'vendor-react'
          // React Router — loaded on every page
          if (id.includes('react-router')) return 'vendor-router'
          // ReactFlow + dagre — only loaded by canvas view
          if (id.includes('@xyflow/') || id.includes('dagre')) return 'vendor-reactflow'
          // Markdown/HTML — editor and preview pages
          if (id.includes('marked') || id.includes('dompurify')) return 'vendor-markdown'
          // Media — image editor page
          if (id.includes('react-image-crop')) return 'vendor-media'
          // Diff viewer — Data mode history
          if (id.includes('react-diff-viewer') || id.includes('/diff/')) return 'vendor-diff'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3333',
    },
  },
})
