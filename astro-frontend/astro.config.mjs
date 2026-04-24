import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import icon from 'astro-icon';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  // 开启更积极的预加载策略，模拟 SPA 的秒开体验
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport'
  },
  integrations: [icon()],
  server: { port: 4321 },
  // Astro原生i18n配置
  i18n: {
    defaultLocale: 'zh-CN',
    locales: ['en', 'zh-CN'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false
    }
  },
  vite: {
    define: {
      __VERSION__: JSON.stringify(pkg.version),
      __YEAR__: new Date().getFullYear()
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true
        }
      }
    }
  }
});