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
        // The dev API binds IPv4 loopback. "localhost" can resolve to ::1 and
        // intermittently return 502 even while 127.0.0.1:PORT is healthy.
        target: `http://127.0.0.1:${backendPort}`,
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
