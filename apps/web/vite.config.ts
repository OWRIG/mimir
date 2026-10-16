import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // 开发时 API 走 server（同源 cookie 由代理保证）
    proxy: { '/api': 'http://localhost:3000', '/healthz': 'http://localhost:3000' },
  },
})
