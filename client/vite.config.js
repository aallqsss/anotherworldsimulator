import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'https://anotherworldsimulator.onrender.com',
      '/socket.io': {
        target: 'https://anotherworldsimulator.onrender.com',
        ws: true
      }
    }
  }
})
