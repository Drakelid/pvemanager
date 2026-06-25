import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000'

export default defineConfig({
  // Allow overriding the dep-optimizer cache dir (default node_modules/.vite is
  // owned by root when the image is built in Docker, so local `vite` can't write).
  cacheDir: process.env.VITE_CACHE_DIR || undefined,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Honor a port injected by the harness (e.g. preview autoPort); falls back to
    // Vite's default 5173 when unset.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/proxmox': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
      '/ws': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
      '/logs': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
})
