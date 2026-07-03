# Chronicle Astro 性能优化计划

> 基线：Lighthouse 模拟移动端（moto g power, 4x CPU slowdown）  
> FCP 4.9s (11分) · LCP 4.9s (29分) · TTI 15.9s (6分) · TBT 生产环境 1800ms · 总 JS 3.3 MB

## Phase 0：低垂果实（今天，删代码就行）

### 0.1 清除 70+ `console.log`

**影响**：主线程阻塞，生产日志泄露  
**文件**：Layout.astro (25)、preload.ts (14)、backgroundLayer.ts (10) 等  
**做法**：全部删除或 `if (import.meta.env.DEV)` 守卫  
**工期**：20min

### 0.2 Service Worker 清理去阻塞化

**影响**：每页都同步执行 SW 注销逻辑，阻塞首次渲染  
**位置**：Layout.astro line 155-173，标记为 `is:inline`  
**做法**：移到延迟 `<script>` 标签，或改成 `async` module  
**工期**：10min

### 0.3 Layout `is:inline` 脚本瘦身

**影响**：6 个 `is:inline` 同步执行  
**现状**：
- ✅ 保留：theme 初始化（防 FOUC，line 254）
- ❌ 可移除：SW 清理 (155)、perf mode (304)、mobile 检测 (281)
- ⚠️ 条件保留：GA (122-128，有 GA ID 才渲染)

**做法**：theme 保留，其余合并为一个 defer module script  
**工期**：30min

| 指标 | 预估改善 |
|------|----------|
| FCP | -200~500ms |
| TBT | -50~100ms |

---

## Phase 1：消灭无谓的 Vue（今天/明天）

### 1.1 BackToTop 去 Vue 化

**问题**：首页和博客列表只为 1 个 BTT 按钮加载 700KB Vue runtime  
**做法**：`BackToTop.vue` → vanilla JS（~20 行）+ 一段 CSS  
**关键功能**：滚动 ≥300px 显示、点击 `scrollTo({top:0})`、`astro:page-load` 重绑  
**受影响的页面**：`/`, `/en`, `/blogs`, `/en/blogs`

**工期**：1h

### 1.2 FloatingToc 去 Vue 化

**问题**：文章页 TOC 侧栏用 `v-for` 渲染静态列表，不需要 Vue 响应式  
**做法**：SSR 渲染 HTML 骨架，vanilla JS 负责滚动高亮 + 折叠动画  
**关键功能**：`tocController` 已经是 vanilla TS，只需替换模板渲染层  
**受影响的页面**：文章页 (有 TOC 时)

**工期**：3h

| 指标 | 预估改善 |
|------|----------|
| JS bundle | -700KB (Vue runtime + CornerButton 等不再 import) |
| FCP | -300~800ms（少解析 700KB JS） |
| TTI | -2~4s |

---

## Phase 2：JS 按需加载（本周）

### 2.1 Mermaid 真正懒加载

**问题**：`import('mermaid')` 拉进全部 30+ 图表类型（435KB cytoscape + 146KB architecture + …），即使文章没有 Mermaid  
**做法**：
```js
// 只在 DOM 中存在 .language-mermaid 时才 import
if (document.querySelector('code.language-mermaid, code[class*="mermaid"]')) {
  import('mermaid').then(renderAll)
}
```
**工期**：30min

### 2.2 KaTeX 真正懒加载

**问题**：259KB KaTeX 全量加载，即使文章没有数学公式  
**做法**：同上，DOM 检测到 `.katex` 或 `$` 定界符才 import  
**工期**：30min

### 2.3 Article 页内联脚本外提

**问题**：474 行内联 JS（复制代码、图片预览、Mermaid 交互）阻塞 HTML 解析  
**做法**：提取为 `article.ts` 模块，`<script type="module" src="...">`  
**工期**：2h

| 指标 | 预估改善 |
|------|----------|
| FCP | -500ms~1s（首次渲染不等 JS） |
| TTI | -2~5s（少解析 2.5MB 未使用的 Mermaid/KaTeX） |

---

## Phase 3：CSS & 资源优化（本周/下周）

### 3.1 全局 CSS 精简

**问题**：820 行 global.css，亮色主题变量重复两份，Ant Design 覆盖 30 行  
**做法**：合并重复的亮色主题、移除未使用的 Ant Design 规则  
**工期**：1h

### 3.2 启用 Astro 7 原生 prefetch

**问题**：`prefetch: false` + 自定义 `preload.ts`（193 行，14 条 log）  
**做法**：
```js
// astro.config.mjs
prefetch: { defaultStrategy: 'hover' }
```
删除 `preload.ts` 和 index/search 页面中的 `import('../../utils/preload.ts')`  
**工期**：30min

### 3.3 主页背景图优化

**问题**：背景图未设置 `fetchpriority`、没有 `srcset`、未用 `loading="lazy"`  
**做法**：添加 `fetchpriority="high"` 给 LCP 图片，其他 `loading="lazy"`  
**工期**：30min

---

## Phase 4：架构债清理（下周）

### 4.1 合并 7 个重复重定向页面

**问题**：`index.astro`, `about.astro`, `blogs.astro`, `collection.astro`, `friends.astro`, `search.astro`, `post.astro` 是 40 行完全相同的重定向模板 ×7  
**做法**：单个 `[...slug].astro` catch-all 路由 + locale 检测  
**工期**：1h

### 4.2 去重 Collection 页面

**问题**：`collection.astro` 和 `[lang]/collection.astro` 共享 95% 代码  
**做法**：提取共用 JS 为模块，两个页面只做 i18n 包装  
**工期**：2h

### 4.3 启用 Astro 7 内置 i18n

**问题**：自定义 `middleware.ts` + `routeLocale.ts` + 7 个重定向页维护成本高  
**做法**：评估迁移到 `astro.config.mjs` 的 `i18n` 配置  
**工期**：1d（需要测试所有路由）

---

## 整体预估

| Phase | 内容 | FCP 改善 | JS 减少 | 工期 |
|-------|------|----------|---------|------|
| 0 | 删 log、去阻塞脚本 | -300ms | - | 1h |
| 1 | 去 Vue | -500ms | -700KB | 4h |
| 2 | JS 懒加载 | -1s | -2.5MB（未使用） | 3h |
| 3 | CSS/资源 | -200ms | - | 2h |
| 4 | 架构清理 | - | -150 行 | 1.5d |

**Phase 2 收益最大**：如果文章没有 Mermaid/KaTeX，TTI 直接砍掉 10s+。  

**Phase 1 覆盖面最广**：首页、博客不再拉 Vue，这些是流量最大的页面。

建议顺序：0 → 1 → 2 → 3 → 4。Phase 0 做完就能看到 FCP 改善，Phase 1 验证去 Vue 效果，Phase 2 解决剩余的大头。
