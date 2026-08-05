import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: ['crm.strategee.us'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Don't proxy /api-reference (it's a frontend route)
        bypass(req) {
          if (req.url?.startsWith('/api-reference')) return req.url;
        },
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/webhooks': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
