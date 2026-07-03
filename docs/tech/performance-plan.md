# Chronicle Astro 性能优化计划

> **原始基线**（2026 早期）：Lighthouse 模拟移动端（moto g power, 4x CPU slowdown）  
> FCP 4.9s (11分) · LCP 4.9s (29分) · TTI 15.9s (6分) · TBT 1800ms · 总 JS 3.3 MB

> **当前基线**（2026-07-03 重测）：  
> **FCP 4.1s (22分) · LCP 4.1s (48分) · Speed Index 4.1s (80分)**
>
> 改进：FCP -800ms, LCP -800ms。但 FCP 22 分仍为 **红色**，LCP 48 分仍为 **橙色**。"4.1 秒白屏"等待依然过长。
>
> **指标解释**：FCP=LCP=SpeedIndex 全等于 4.1s，说明页面在 4.1 秒前完全空白，然后一次性渲染全部内容。这是典型的 **render-blocking CSS 过多 + 外部字体阻塞** 模式。

---

## Phase 0：低垂果实 ✅ 已完成

### 0.1 清除 console.log
- **状态**：✅ 完成
- **实际**：Layout.astro (1 remaining SSR diagnostic), backgroundLayer.ts, localDataSource.ts 等已全部守卫

### 0.2 Service Worker 清理去阻塞化  
- **状态**：✅ 完成
- **实际**：已改为 `async`，不阻塞解析

### 0.3 Layout `is:inline` 脚本瘦身
- **状态**：✅ 完成
- **实际**：is:inline 从 5 个减少到 3 个（theme 初始化 + 2 个条件 GA）。mobile 检测 + perf mode 已提取到 `layout-init.ts`

---

## Phase 1：消灭无谓的 Vue ✅ 已完成

### 1.1 BackToTop 去 Vue 化
- **状态**：✅ 完成

### 1.2 FloatingToc 去 Vue 化
- **状态**：✅ 完成

| 指标 | 预估 | 实际 |
|------|------|------|
| JS bundle | -700KB | ✅ 达成 |
| FCP | -300~800ms | ✅ 包含在总改善中 |

---

## Phase 2：JS 按需加载 ✅ 已完成

### 2.1 Mermaid 懒加载
- **状态**：✅ 已有（DOM 检测后才 import）

### 2.2 KaTeX
- **状态**：✅ 服务端渲染，不需要客户端包

### 2.3 Article 页内联脚本外提
- **状态**：✅ 完成
- **实际**：~450 行内联 JS → `article.ts` 模块

| 指标 | 预估 | 实际 |
|------|------|------|
| FCP | -500ms~1s | ✅ 包含在总改善中 |
| HTML 内联 JS | -450 行 | ✅ 达成 |

---

## Phase 3：CSS & 资源优化 ✅ 已完成

### 3.1 全局 CSS 精简
- **状态**：✅ 完成
- **实际**：移除 Ant Design 选择器 (~33 行)、合并 light theme 重复变量

### 3.2 启用 Astro 7 原生 prefetch
- **状态**：✅ 完成
- **实际**：`prefetch: { defaultStrategy: 'hover' }`，删除 `preload.ts` (-193 行)

### 3.3 图片优化
- **状态**：✅ 完成
- **实际**：Avatar 添加 `fetchpriority="high"`

---

## Phase 4：架构债清理 ⚠️ 部分完成

### 4.1 合并重定向页面
- **状态**：✅ 完成
- **实际**：6 个重定向页面从 27-49 行简化到 ~10 行。`[...slug].astro` catch-all 在 SSG 模式下不可行（需要 `getStaticPaths`），保留独立文件。

### 4.2 去重 Collection 页面
- **状态**：❌ 延期
- **原因**：涉及复杂的闭包依赖重构

### 4.3 启用 Astro 7 内置 i18n
- **状态**：❌ 延期
- **原因**：非紧急，需要测试所有路由

---

## Phase 5：CSS 关键路径优化 🔴 当前优先级最高

> **问题**：4.1s FCP 的最大瓶颈。84KB CSS（global 23K + app 9K + post 9K + chronicle-markdown 43K）全量阻塞首次渲染。浏览器必须下载、解析完所有 CSS 才能绘制任何像素。

### 5.1 内联 Critical CSS

**影响**：首屏（导航栏 + 文章标题 + 元数据 + 第一段文字）所需的 CSS 不到 5KB。内联到 `<head>` 可让浏览器在 CSS 下载完成前就开始绘制。

**做法**：
- 提取 nav-header、post-title、post-meta、.post-body 首段的样式
- 在 Layout.astro 的 `<head>` 中内联 `<style>` 块
- 其余 CSS 用 `media="print" onload="this.media='all'"` 模式异步加载

**关键样式**（需要内联）：
```css
/* 布局骨架 */
.nav-header { position:fixed; top:0; left:0; right:0; z-index:9999; height:70px; background:var(--component-bg-blur); }
.main-content { padding-top:70px; }
#app { display:flex; flex-direction:column; min-height:100vh; }

/* 文章首屏 */
.post-title { font-size:2.5rem; }
.post-meta { display:flex; flex-wrap:wrap; gap:0.75rem; }
.post-body { max-width:800px; margin:2rem auto; }

/* 文字基础 */
body { font-family:var(--app-font-stack); color:var(--text-primary); background-color:var(--app-bg-primary); }
```

**工期**：2h

### 5.2 chronicle-markdown.css 异步加载

**问题**：`chronicle-markdown.css` 有 43KB，包含所有 markdown 元素的样式（代码块、表格、引用、文件卡片等）。绝大多数内容在首屏之下，不需要阻塞首次渲染。

**做法**：
- 在 `[id].astro` 中，将 `import '@chronicle/shared/src/styles/chronicle-markdown.css'` 从 frontmatter 移到 `<head>` 中带 `media="print" onload` 的 link
- 或使用 `is:raw` + 手动 link 标签

**工期**：30min

### 5.3 CSS 总体积评估

| 文件 | 大小 | 可否延迟 |
|------|------|----------|
| global.css | 23KB | 首屏部分内联，其余延迟 |
| app.css | 9KB | 部分可延迟（菜单、设置弹窗样式） |
| post.css | 9KB | 首屏部分内联，其余延迟 |
| chronicle-markdown.css | 43KB | **全部可延迟**（内容在首屏之下） |
| KaTeX CSS | ~20KB (外部) | 只在有数学公式的页面加载 |
| **合计** | **~84KB** | **首屏实际需要 ~5KB** |

| 指标 | 预估改善 |
|------|----------|
| FCP | -1s~2s（5KB vs 84KB 阻塞 CSS） |
| LCP | -1s~2s |

---

## Phase 6：字体加载优化

### 6.1 自托管 Noto Serif SC

**问题**：当前通过 Google Fonts 加载 `Noto Serif SC`：
```html
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@200..900&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
```
即使有 `preconnect`，仍需 DNS + TCP + TLS + 请求（4 个 RTT）。本地开发时也要等 Google 服务器响应。

**做法**：
- 下载 `Noto Serif SC` 可变字体 woff2 到 `public/fonts/`
- 创建 `noto-serif-sc.css` 定义 `@font-face`（与 inter.css 模式一致）
- 替换 Google Fonts link 为本地路径
- `font-display: swap` 确保文字立即可见（系统字体回退）

**字体文件**：
- `NotoSerifSC[wght].woff2` — 可变字体，约 12MB（全字重 200-900）
- 子集化（只保留简体中文常用字 + 拉丁字符）可降到 ~3-5MB
- 或只下载 400 + 700 两个字重（不用可变字体），约 2MB

**工期**：1h（完整版）/ 3h（含子集化）

### 6.2 字体加载策略审查

**当前状态**：
- Inter：✅ 自托管，`font-display: swap`，variable woff2
- Noto Serif SC：❌ Google Fonts 外部加载，`preload` + `onload` 模式

**preload + onload 模式的问题**：
- `preload` 的 `as="style"` 在 Chrome 中有 Highest 优先级，会与关键 CSS 争抢带宽
- 外部域名（fonts.googleapis.com）即使有 preconnect，仍需要额外的网络往返
- `onload` 回调在资源加载完才触发，但页面可能在此之前已经开始渲染

**改进方案**：
1. 自托管后使用普通 `<link rel="stylesheet">` + `media="print" onload="this.media='all'"`（不争抢 preload 扫描器的带宽）
2. 或者使用 `<link rel="stylesheet">` 直接放在 head 中（让浏览器按正常优先级加载）
3. 对于 `font-display: swap` 的字体，直接 link 优于 preload+onload（不抢占关键 CSS 的带宽）

**工期**：30min

| 指标 | 预估改善 |
|------|----------|
| FCP (外部域名用户) | -500ms~1s（无外部 DNS/TLS 延迟） |
| FCP (本地开发) | -200~500ms（无外部请求超时风险） |

---

## Phase 7：缓存与交付优化

### 7.1 静态资源强缓存

**问题**：字体文件（Inter Variable woff2）、CSS bundle、JS bundle 应该永久缓存。当前需要确认 Astro 构建是否添加了 hash。

**做法**：
- 确认 `astro.config.mjs` 中 `build.assets` 配置
- 确认字体文件 URL 带 hash 或版本号（以便 safe cache-busting）
- Nginx/CDN 配置 `Cache-Control: public, max-age=31536000, immutable`（针对带 hash 的资源）

**工期**：30min

### 7.2 HTML 压缩

**问题**：Astro 默认不压缩 HTML 输出。

**做法**：
- 检查是否已有 `compressHTML: true` 配置
- 或使用 Vite 插件压缩 HTML

**工期**：15min

---

## 更新后的整体预估

| Phase | 内容 | FCP 改善 | LCP 改善 | 工期 |
|-------|------|----------|----------|------|
| 0-3 | ✅ 已完成 | -800ms | -800ms | — |
| 4 | ⚠️ 部分完成 | — | — | 剩余 3h |
| **5** | **CSS 关键路径** | **-1s~2s** | **-1s~2s** | **2.5h** |
| **6** | **字体自托管** | **-500ms~1s** | — | **1.5h** |
| 7 | 缓存/压缩 | — | -200ms（重复访问） | **1h** |

**Phase 5 + 6 预计总改善**：FCP 从 4.1s → 2.0-2.5s（改善约 40-50%），LCP 从 4.1s → 2.5-3.0s。

**核心洞察**：FCP = LCP = SpeedIndex = 4.1s，三者完全相等，意味着页面是一次性全量渲染的。打破这个瓶颈的关键是 **让浏览器提前绘制首屏内容**（Phase 5 内联 Critical CSS），而不是等全部 84KB CSS 下载解析完再一起画。

---

## 建议执行顺序

**本轮**：Phase 5 → Phase 6 → Phase 7

- Phase 5（CSS critical）收益最大，是 FCP 突破 2s 的关键
- Phase 6（字体自托管）消除外部依赖，减少波动
- Phase 7（缓存）提升重复访问体验
