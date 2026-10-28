import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The demo runs entirely in the browser; the Vitest suite exercises the pure
// domain module only, so the default node environment is enough.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4102,
    strictPort: true,
  },
  preview: {
    port: 4102,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
})
