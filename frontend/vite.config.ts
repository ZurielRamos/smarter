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
  optimizeDeps: {
    // Pre-bundlea las deps pesadas para evitar re-bundles en caliente
    // (que disparan full reloads) al navegar a rutas lazy por primera vez.
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'recharts',
      'framer-motion',
      '@tanstack/react-table',
      'react-virtuoso',
      'socket.io-client',
      'cmdk',
      'react-easy-crop',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      'axios',
      'lucide-react',
      'sonner',
    ],
  },
  server: {
    allowedHosts: ['smarter.strategee.us'],
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
