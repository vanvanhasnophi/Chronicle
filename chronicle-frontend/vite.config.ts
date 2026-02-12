import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    fs: {
      strict: false
    },
    proxy: {
        '/api': {
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
