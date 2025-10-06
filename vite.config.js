import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/tasks': 'http://localhost:3000',
      '/submit': 'http://localhost:3000',
      '/update-time': 'http://localhost:3000',
      '/delete-task': 'http://localhost:3000',
      '/update-name': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist'
  }
})

