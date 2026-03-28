import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const clientPort = parseInt(process.env.DASHBOARD_CLIENT_PORT || '5173', 10)
const backendPort = parseInt(process.env.DASHBOARD_PORT || '3001', 10)
const allowedHosts = ['drmaximilien.ngrok.dev']
const ngrokHost = process.env.NGROK_URL?.trim()

if (ngrokHost) {
  allowedHosts.push(ngrokHost)
}

export default defineConfig({
  root: resolve(__dirname, 'client'),
  plugins: [react({ jsxRuntime: 'automatic' })],
  server: {
    port: clientPort,
    host: true, // Allow external access
    allowedHosts,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        proxyTimeout: 0,   // no timeout — needed for long-running SSE (provision)
        timeout: 0,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
})
