import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: process.env.VITE_API ?? 'http://localhost:8000', changeOrigin: true } } },
  build: {
    rolldownOptions: {
      output: {
        // bibliotecas pesadas em chunks próprios, baixados só pelas rotas que as usam
        codeSplitting: { groups: [
          { name: 'mapa', test: /node_modules\/(leaflet|react-leaflet|@react-leaflet|react-dom\/server)/ },
          { name: 'graficos', test: /node_modules\/(recharts|d3-|victory-vendor)/ },
        ] },
      },
    },
  },
  test: {
    environment: 'jsdom',
    coverage: { include: ['src/**/*.{ts,tsx}'], exclude: ['src/**/*.test.*', 'src/main.tsx', 'src/test/**', 'src/api/types.ts'] },
  },
})
