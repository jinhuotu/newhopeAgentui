import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/** 启动日志里隐藏 Hyper-V / WSL 等虚拟网卡地址（常见 172.16/12） */
function filterVirtualNetworkUrls(): Plugin {
  return {
    name: 'filter-virtual-network-urls',
    configureServer(server) {
      const originalPrintUrls = server.printUrls.bind(server)
      server.printUrls = () => {
        const network = server.resolvedUrls?.network
        if (network) {
          server.resolvedUrls!.network = network.filter((url) => {
            try {
              const { hostname } = new URL(url)
              return !/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
            } catch {
              return true
            }
          })
        }
        originalPrintUrls()
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), filterVirtualNetworkUrls()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8100',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
})
