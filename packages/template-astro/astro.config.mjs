import { defineConfig } from 'astro/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import icon from 'astro-icon';
import vue from '@astrojs/vue';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
  output: 'static',
  // 禁用Astro内置预加载，使用自定义智能预加载策略
  prefetch: false,
  integrations: [
    icon(),
    vue()
  ],
  server: { port: 4321 },
  // 禁用Astro原生i18n配置，使用自定义i18n实现
  // i18n: {
  //   defaultLocale: 'zh-CN',
  //   locales: ['en', 'zh-CN'],
  //   routing: {
  //     prefixDefaultLocale: false,
  //     redirectToDefaultLocale: false
  //   }
  // },
  vite: {
    define: {
      __VERSION__: JSON.stringify(pkg.version),
      __YEAR__: new Date().getFullYear(),
      'process.env.DATA_SOURCE': JSON.stringify(process.env.DATA_SOURCE || 'remote'),
      'process.env.CHRONICLE_DATA_DIR': JSON.stringify(process.env.CHRONICLE_DATA_DIR || ''),
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true
        },
        '/server/data/background': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true
        }
      }
    }
    ,
    plugins: [
      // 在构建时排除 src/archive 目录下的所有模块
      (function excludeArchivePlugin() {
        const archiveMarker = '/src/archive/';
        return {
          name: 'exclude-archive',
          enforce: 'pre',
          load(id) {
            if (!id) return null;
            try {
              const normalized = id.replace(/\\\\/g, '/');
              if (normalized.includes(archiveMarker) || normalized.endsWith('/src/archive')) {
                return 'export default {}';
              }
            } catch (e) {
              return null;
            }
            return null;
          }
        };
      })()
    ]
  }
});