import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths, so the same build works from a GitHub Pages
  // subpath (/repo/), a custom domain, or straight off disk.
  base: './',
  plugins: [react()],
  server: { port: 5180, host: true },
  build: {
    rollupOptions: {
      output: {
        // Keep the charting and routing vendors in their own long-lived chunks
        // so app edits do not invalidate them.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
        },
      },
    },
  },
})
