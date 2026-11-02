import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/test/**', 'src/__tests__/**'],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: { lines: 80, statements: 78, functions: 73, branches: 77 },
    },
  },
})
