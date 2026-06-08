import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'

// read package.json at config-time so we can inject version into the build
const pkgPath = new URL('./package.json', import.meta.url)
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Electron needs relative base for file:// loading, server deploy uses absolute /
  base: process.env.ELECTRON ? './' : '/',
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __YEAR__: JSON.stringify(new Date().getFullYear())
  },
  server: {
    fs: {
      strict: false
    },
    proxy: {
        '/api': {
            target: 'http://localhost:3000',
            changeOrigin: true
      },
      '/server/data/branding': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/server/data/manager-background': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
        // Image proxy removed to improve performance. 
        // Images are now served directly via symlink in public/server/data/upload
        // '/server/data/upload': {
        //     target: 'http://localhost:3000',
        //     changeOrigin: true
        // }
    }
  }
})
