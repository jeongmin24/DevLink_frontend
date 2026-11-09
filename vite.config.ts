import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    plugins: [
      tailwindcss(),
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
    ],
    preview: {
      proxy: {},
    },
    server: {
      watch: {
        ignored: ['**/desktop/dist/**', '**/desktop/vendor/**', '**/desktop/vendor-stage-*/**'],
      },
      proxy: {
        '/api': {
          target: env.DEVLINK_API_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          configure(proxy) {
            // 로컬 동일 출처 프록시에서 백엔드 CORS 오인 방지
            // 사용자 세션과 CSRF 검증은 백엔드 정책 유지
            proxy.on('proxyReq', (proxyRequest) => {
              proxyRequest.removeHeader('origin')
            })
          },
        },
      },
    },
  }
})
