import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174, strictPort: true },
  preview: { port: 4174 },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks so a gallery update only re-downloads app code.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\/]node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'react'
          if (id.includes('react-router')) return 'router'
          if (id.includes('@tanstack')) return 'query'
          if (id.includes('@radix-ui') || id.includes('@floating-ui')) return 'radix'
          return 'vendor'
        },
      },
    },
  },
})
