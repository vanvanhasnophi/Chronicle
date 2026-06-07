# Chronicle 发行版规格

> 最后更新: 2026-06-04 | 对应 PRD v1.0 第四节"版本矩阵"

---

## 项目核心原则

Chronicle 是一个支持双模式（静态/API）的个人博客系统。以下原则不可违背：

### 1. 三大组件，职责分离

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│   template-astro │   │     manager       │   │  host (+ gen)        │
│   前台模板        │   │   Vue CMS 管理 GUI │   │  Express API 运行时   │
│                  │   │                  │   │                      │
│  • 静态部署友好  │   │  • Editor        │   │  host: 动态 API       │
│  • 接口标准化    │   │  • TemplateMgr   │   │  gen:  内容生成/构建   │
│  • 迁移友好      │   │  • ResourceMgr   │   │  shared: 共享类型     │
└──────────────────┘   └──────────────────┘   └──────────────────────┘
```

### 2. 不可违背的约束

| 原则 | 说明 |
|------|------|
| **双模式切换** | 静态模式与 API 模式通过环境变量/构建开关切换，数据获取层抽象为统一接口（`getApiUrl()`），不侵入业务逻辑 |
| **迁移友好** | 内容使用 Markdown + YAML Frontmatter 存储，目录结构与主流 SSG（Hugo/Hexo/Astro）兼容 |
| **API 格式统一** | 所有 API 响应使用 `{ code, data, message }` 信封格式 |
| **版本差异通过配置实现** | 五个发行版的差异通过 build.sh 的条件组装实现，不复制代码 |
| **零数据库依赖** | 内容、配置、索引均以文件系统存储（JSON + Markdown），Git 友好 |

### 3. 双模式切换机制

| 模式 | 模板 (template-astro) | CMS (manager) | 运行时 |
|------|----------------------|---------------|--------|
| **API 模式** | SSG 构建时 `fetch(API_BASE_URL + '/api/posts')` 拉取数据 | `fetchWithAuth('/api/admin/...')` 经过 Vite proxy 或 VITE_API_BASE_URL 转发 | host (Express) 或任何兼容 server |
| **静态模式** | `DATA_SOURCE=local` — 从本地 Content Collections 读取 .md 文件（规划中） | `VITE_API_BASE_URL=` 留空，纯本地运行 | 不需要 |

> 切换通过 `API_BASE_URL`（模板侧）和 `VITE_API_BASE_URL`（CMS 侧）两个环境变量控制，核心业务逻辑不变。

### 4. 数据格式规范

所有文章内容存储为：
```
data/posts/<uuid>/
└── <uuid>-content.md     # Markdown + YAML Frontmatter
```

> **v2 变更**: `*-compiled.html` 和 `*-toc.json` 已移除——Markdown 渲染是前端专属职责（template-astro 构建时 + manager CMS 预览时）。

`data/posts/index.json` 记录全部文章的元数据索引，结构为 `PostMeta[]`（定义见 `packages/shared/src/types/post.ts`）。

完整 `data/` 目录：
```
data/
├── posts/
│   ├── index.json
│   └── <uuid>/<uuid>-content.md
├── collections.json       # 合集树形结构（v2：直接数组，不再包裹 {collections:[]}）
├── friends.json           # 友链（v2：从 settings.json 抽取）
├── profile.json           # 作者信息
├── settings.json
├── security.json
├── branding/              # 品牌资源 + 已压缩背景图（v2：替代 background/）
├── background/            # [废弃] 旧背景图目录
└── upload/                # 媒体文件
```

---
## 核心概念：CMS 的三种运行模式

Chronicle CMS (manager) 不是只有一种形态。它根据与 server 的关系，有三种运行模式：

```
                    CMS 在哪里？
                   /              \
              Cloud                Local
          (与 server 同域)     (用户本地客户端)
                │                   │
               full            ┌────┴────┐
                           API 上传   静态上传
                              │          │
                         self-hosted   static
                         (VPS 有 Node) (纯静态托管)
```

| 模式 | 谁在用 | CMS 代码 | 数据流 | server 位置 |
|------|--------|---------|--------|-----------|
| **Cloud CMS** | full | 与 server 捆绑部署 | 域内 `/api/*` 调用，无跨域 | VPS 上 |
| **Local · API 上传** | self-hosted (manager) | 本地客户端 | 通过 API 推送到远端 server | VPS 上 |
| **Local · 静态上传** | static (manager + build) | 本地客户端 | 本地构建 HTML → push 到静态托管 | 不需要 |

**三者共用同一套 CMS 代码**（`packages/manager/`）。Cloud 和 Local 只是部署位置和上传方式不同，功能体验一致。

---

## 版本总览

```
                          CMS 模式
                    /        |         \
              Cloud CMS  Local·API   Local·静态    无 CMS
                  │          │           │           │
               full    self-hosted    static       lite
                 │          │           │           │
              VPS server  VPS server  纯静态托管   纯静态托管
              在 VPS 上   在 VPS 上    (GitHub     (fork 即用)
                                      Pages等)
```

| # | 版本 | CMS | server | 部署到 | 一句话 |
|---|------|-----|--------|--------|--------|
| 1 | **full** | Cloud（捆绑） | ✅ VPS 常驻 | VPS | "一键部署，全功能博客系统" |
| 2 | **self-hosted** | Local·API 上传 | ✅ VPS 常驻 | VPS | "VPS 上跑服务，本地 CMS 远端管理" |
| 3 | **static** | Local·静态上传 | ❌ | GitHub Pages 等 | "本地写内容，构建静态页，推送上线" |
| 4 | **lite** | ❌ 无 | ❌ | 任意静态托管 | "fork → 改 Markdown → 自动部署" |
| 5 | **manager** | 独立客户端 | ❌ | — | "纯 CMS 工具，API/静态上传可选" |

---

## 1. full — 全自托管版

### 组件构成

```
┌─────────────────────────────────────────────┐
│                 VPS (Node.js)                │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  server  │  │ manager  │  │ template  │  │
│  │ Express  │  │ Vue SPA  │  │ Astro SSG │  │
│  │ :3000    │  │ (Cloud)  │  │ :4321     │  │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │             │              │         │
│       └──────┬──────┘              │         │
│              │                     │         │
│         ┌────▼────┐          ┌─────▼──────┐  │
│         │  data/  │          │   dist/    │  │
│         │ 共享数据 │          │  静态产物  │  │
│         └─────────┘          └────────────┘  │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │              Nginx                    │    │
│  │  /          → template dist          │    │
│  │  /manager   → manager dist (SPA)     │    │
│  │  /api/*     → proxy :3000            │    │
│  │  /server/*  → proxy :3000            │    │
│  └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘

CMS 模式：Cloud — manager 与 server 同域部署，直接调用 /api/*
```

| 组件 | 运行时 | 作用 |
|------|--------|------|
| `packages/host/` (Express) | ✅ VPS 常驻 | CRUD API、WebAuthn 认证、文件上传、构建触发、静态文件 serve |
| `packages/manager/` | ✅ VPS 构建 → Cloud SPA | CMS：Markdown 编辑、设置管理、文章管理 |
| `packages/template-astro/` | ✅ VPS 构建 → 静态 | Astro 博客前台 |
| `data/` | — | 共享数据：posts/、upload/、settings.json、security.json |
| `install.sh` | — | 一键部署：装 Node/Nginx/依赖 → 构建 → 配置 → 启动 |

### 目标用户

- 有自己的 VPS（Ubuntu/Debian）
- 了解基础 Linux 操作
- 想要完整 CMS + 博客系统，所有组件都在一台服务器上
- 通过浏览器访问 CMS 管理内容

### 开箱体验

```bash
ssh user@vps
git clone https://github.com/vanvanhasnophi/Chronicle.git /opt/Chronicle
cd /opt/Chronicle
sudo bash install.sh install
# 回答域名等问题 → 完成
# 前台: https://blog.yourdomain.com  (Astro 静态站)
# CMS:  https://admin.yourdomain.com (Cloud CMS，域内 API)
```

### 当前进度

| 项 | 状态 |
|----|------|
| server Express API | ✅ 完成（v2: `packages/host/`，PM2 `chronicle-host`） |
| manager Vue CMS | ✅ 完成 |
| template-astro | ✅ 完成 |
| monorepo 路径更新（install.sh / deploy.sh / build.sh / start.sh） | ✅ 已完成 |
| data/branding 迁移（background/ → branding/） | ✅ 已完成 |
| v1→v2 数据迁移脚本 | ✅ 完成 (`scripts/migrate-v1-to-v2.sh`) |
| README + 文档 | ✅ 已更新 |

---

## 2. self-hosted — 静态自托管版

### 组件构成

```
┌──────────────────────────────────────┐
│           用户本地 (manager)          │
│                                      │
│  ┌──────────────────────────────┐    │
│  │        manager (Local)        │    │
│  │        本地 CMS 客户端         │    │
│  │                                │    │
│  │  写文章 → API 上传 ──────────┐ │    │
│  └──────────────────────────────┘│    │
└──────────────────────────────────┼────┘
                                   │
                   POST /api/posts │
                   PUT  /api/settings
                                   │
                                   ↓
┌─────────────────────────────────────────────┐
│               VPS (Node.js + Nginx)         │
│                                              │
│  ┌──────────┐                                │
│  │  server  │  接收 API 上传，管理数据        │
│  │ Express  │                                │
│  │ :3000    │                                │
│  └────┬─────┘                                │
│       │                                       │
│  ┌────▼────┐    ┌───────────┐                │
│  │  data/  │    │ template  │                │
│  │ 存储内容│    │ Astro dist│                │
│  └─────────┘    └─────┬─────┘                │
│                       │                      │
│  ┌────────────────────▼─────────────────┐    │
│  │              Nginx                    │    │
│  │  /          → template dist          │    │
│  │  /api/*     → proxy :3000            │    │
│  └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘

CMS 模式：Local · API 上传 — manager 在本地，内容通过 API 推送到 VPS server
```

**full 和 self-hosted 的关系**：self-hosted = full - Cloud CMS + Local CMS。VPS 上始终有 server 接收和管理内容，区别在于 CMS 是在 VPS 上（Cloud）还是在本地（Local）。

| 组件 | 在哪运行 | 作用 |
|------|---------|------|
| `packages/host/` (Express) | ✅ VPS 常驻 | 接收 API 上传、管理数据、serve 前端 |
| `packages/manager/` | **用户本地**（manager 客户端） | CMS：写文章、管理内容 |
| `packages/template-astro/` | VPS 构建 → 静态 | 博客前台 |
| ❌ Cloud CMS | **不含** | CMS 不在 VPS 上，在本地 |

### 目标用户

- 有 VPS，愿意在上面跑 Node 服务
- 但 CMS 在本机操作更舒服（或出于安全考虑不想暴露 CMS 面板到公网）
- 未来通过 Electron 桌面应用获得 manager 客户端

### 开箱体验

```bash
# 1. VPS 上部署 server + template（不含 Cloud CMS）
#    （通过 install.sh 的 --without-cms 选项，或手动）

# 2. 本地打开 manager
#    方案 A：Electron 桌面应用（未来）
#    方案 B：浏览器访问本地 dev server
cd /opt/Chronicle && npm run dev:manager
#    → http://localhost:5173

# 3. 在 manager 中配置远端 server 地址
#    设置 → API 地址 → https://vps.yourdomain.com

# 4. 写文章 → 自动通过 API 上传到 VPS
#    VPS 上 server 接收、存储、触发重新构建
```

### 当前进度

| 项 | 状态 |
|----|------|
| VPS server 部署 | ✅ server 可独立部署 |
| manager 本地运行 | ✅ `npm run dev` 可用 |
| manager API 上传模式 | ❌ 需配置远端 API 地址的能力 |
| 构建脚本 | ⚠️ 需区分是否含 manager |
| Electron 桌面应用 | ❌ 未开始 |

---

## 3. static — 完整静态版

### 组件构成

```
┌──────────────────────────────────────────────┐
│              用户本地 (manager + build)       │
│                                              │
│  ┌──────────────────────────────┐            │
│  │        manager (Local)        │            │
│  │        本地 CMS 客户端         │            │
│  │                                │            │
│  │  写文章 → 本地保存到 data/     │            │
│  │  点击"构建" → 触发 Astro SSG  │            │
│  └──────────────┬───────────────┘            │
│                 │                            │
│  ┌──────────────▼───────────────┐            │
│  │       template-astro          │            │
│  │       本地 SSG 构建            │            │
│  │       DATA_SOURCE=local      │            │
│  └──────────────┬───────────────┘            │
│                 │                            │
│             dist/ (纯静态 HTML)              │
│                 │                            │
└─────────────────┼────────────────────────────┘
                  │
          git push dist/  或  rsync  或  ZIP 上传
                  │
                  ↓
┌──────────────────────────────────────────────┐
│          GitHub Pages / Vercel / OSS         │
│                                              │
│  纯静态站点，零运行时依赖                      │
└──────────────────────────────────────────────┘

CMS 模式：Local · 静态上传 — manager 本地管理内容，构建静态 HTML 后推送到托管平台
```

**static 和 lite 的关系**：static = manager (Local CMS) + lite (预构建的静态博客)。CMS 负责内容管理和构建，lite 是构建出来的产物。换句话说，用户通过 manager 写内容 → 构建出 lite 产物 → 部署。

| 组件 | 在哪运行 | 作用 |
|------|---------|------|
| `packages/manager/` | **用户本地** | CMS：写文章、管理内容、触发构建 |
| `packages/template-astro/` | **用户本地构建** | SSG 构建引擎，产出纯静态 HTML |
| ❌ server | 不需要 | 内容本地存储，不需要 API |
| ❌ Cloud CMS | 不需要 | manager 就是本地 CMS |

### 目标用户

- 没有 VPS
- 用 GitHub Pages / Vercel / Netlify 等免费静态托管
- 想要 CMS 写内容的便利，但不要服务器运维
- 未来通过 Electron 桌面应用一键部署

### 开箱体验

```bash
# 方案 A：Electron 桌面应用（未来）
# 1. 下载 Chronicle Desktop
# 2. 写文章（内置 manager CMS）
# 3. 点击"部署到 GitHub Pages" → 自动 build + push

# 方案 B：CLI（当前过渡方案）
# 1. 本地打开 manager
cd /opt/Chronicle && npm run dev:manager

# 2. 写文章（数据保存在本地 data/）

# 3. 点击"构建并发布"（或 CLI）
npm run build:static

# 4. 推送到 GitHub Pages
cd release/chronicle-pages-*/
git init && git add -A && git commit -m "deploy"
git push git@github.com:USER/USER.github.io.git main:gh-pages
```

### 当前进度

| 项 | 状态 |
|----|------|
| manager 本地运行 | ✅ `npm run dev` 可用 |
| 本地内容保存 | ⚠️ 目前保存依赖 server API |
| manager 触发 Astro 构建 | ❌ 需打通 manager → template-astro 构建流程 |
| 构建产物部署指南 | ❌ 无 |
| GitHub Actions 自动部署 | ❌ 无 |
| Electron 桌面应用 | ❌ 未开始 |

---

## 4. lite — 精简版

### 组件构成

```
┌──────────────────────────────────────┐
│         GitHub 仓库 (fork)            │
│                                      │
│  packages/template-astro/            │
│  ├── content/          ← 改这里      │
│  │   └── posts/                      │
│  │       ├── hello-world.md          │
│  │       └── my-post.md              │
│  ├── src/                            │
│  │   ├── pages/                      │
│  │   ├── components/                 │
│  │   └── config/site.yaml            │
│  └── astro.config.mjs                │
│                                      │
│  .github/workflows/deploy.yml ← 自动 │
└──────────────────┬───────────────────┘
                   │ git push
                   ↓
┌──────────────────────────────────────┐
│         任意静态托管平台               │
│                                      │
│  预构建的纯静态博客                    │
│  CMS 的静态上传产物                    │
└──────────────────────────────────────┘
```

**lite 就是预构建的静态页面。** 它是 static 版 manager「静态上传」后的产物。用户可以直接 fork 后改 Markdown 来用，无需接触 CMS。

| 组件 | 包含? | 作用 |
|------|-------|------|
| `packages/template-astro/` | ✅ | 博客框架，唯一组件 |
| ❌ server | 不含 | 不需要后端 |
| ❌ manager (CMS) | 不含 | 不需要 CMS |
| GitHub Actions | ✅ 需模板 | push 自动构建部署 |

### 与 static 的关系

```
static = manager (Local CMS) + lite (博客框架)
           ↑                        ↑
      内容管理                   预构建静态页面
      (完整产品)                 (也可独立使用)
```

用户二选一：
- **用 static**：有 CMS，写内容爽 → 构建出 lite → 部署
- **用 lite**：不要 CMS，直接改 Markdown → push → GitHub Actions 自动部署

### 目标用户

- 不需要 CMS，习惯 Git + Markdown 工作流
- 纯前端开发者，会改 Astro 配置
- 对标 Jekyll / Hugo / Hexo 的用户

### 开箱体验

```bash
# 1. Fork lite 分支
#    GitHub 上点击 Fork → 选择 lite 分支

# 2. 克隆
git clone git@github.com:YOURNAME/chronicle-lite.git && cd chronicle-lite

# 3. 改站点配置
#    编辑 src/config/site.yaml

# 4. 写文章
#    在 content/posts/ 下创建 .md 文件

# 5. 推送
git add -A && git commit -m "new post"
git push

# 6. GitHub Actions 自动构建部署到 GitHub Pages
```

### 当前进度

| 项 | 状态 |
|----|------|
| Astro Content Collections (本地 .md 数据源) | ❌ **核心阻塞** — 模板当前只支持 API 数据源 |
| 示例文章 | ❌ 无 `content/` 目录 |
| lite 分支 | ❌ 未创建 |
| GitHub Actions 部署模板 | ❌ 无 |
| 站点配置文件 | ❌ 配置硬编码在 API settings 中 |

**lite 当前不可用。** 需要给 template-astro 添加 `DATA_SOURCE=local` 模式，通过 Astro Content Collections 加载本地 Markdown。

---

## 5. manager — 独立 CMS 客户端

### 组件构成

```
┌──────────────────────────────────────────────┐
│            manager (独立 CMS 客户端)          │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │           核心 (必选)                  │    │
│  │  - 文章 CRUD                          │    │
│  │  - Markdown 编辑器 + 实时预览         │    │
│  │  - 设置管理（主题、字体、feature flags）│    │
│  │  - 本地数据存储                        │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │       可选组件 (插件式安装)            │    │
│  │                                      │    │
│  │  🔌 API 上传组件                      │    │
│  │     → 内容通过 API 推到远端 server    │    │
│  │     → 用于 self-hosted，亦可连接 full │    │
│  │                                      │    │
│  │  🔌 静态构建组件                      │    │
│  │     → 集成 template-astro 本地构建    │    │
│  │     → 一键推送到 GitHub Pages / Vercel│    │
│  │     → 用于 static                    │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

**manager 是一个纯粹的本地 CMS 客户端。** 它可以独立使用，也可以通过可选组件获得云端（API 上传）和构建（静态上传）能力。

| 组件 | 包含? | 作用 |
|------|-------|------|
| manager 核心 | ✅ 始终 | 本地 CMS：写文章、管理内容 |
| `+` API 上传组件 | 🔌 可选 | 连接远端 server，API 推送内容 |
| `+` 静态构建组件 | 🔌 可选 | 集成 template-astro 本地构建 + 部署 |
| ❌ server | 不含 | manager 只管内容，不 serve 网站 |
| ❌ template-astro | 不含 | 静态构建组件会集成它 |

### manager 与各版本的关系

```
manager 核心
    │
    ├─ 单独使用 ──────────→ manager 版 (纯 CMS 客户端)
    │
    ├─ + API 上传组件 ────→ self-hosted 版的 CMS 部分
    │
    ├─ + 静态构建组件 ────→ static 版的 CMS 部分
    │
    └─ 部署到 VPS 同域 ───→ full 版的 Cloud CMS
```

**所有版本的 CMS 都来自同一套 manager 代码。** 区别仅在于：
- **full**：manager 构建后部署在 VPS 上（Cloud 模式）
- **self-hosted**：manager 在本地 + API 上传组件
- **static**：manager 在本地 + 静态构建组件
- **manager**：就是它自己，可选装插件

### 目标用户

- 已有博客前台，只需要 CMS 能力
- 想把 CMS 作为纯写作工具
- 开发者想集成到自己的工作流中

### 开箱体验

```bash
# 1. 下载 / 克隆 manager
git clone https://github.com/vanvanhasnophi/Chronicle.git
cd Chronicle/packages/manager

# 2. 启动
npm install && npm run dev
# → http://localhost:5173

# 3. (可选) 安装 API 上传组件
#    配置 → 远端 server 地址 → 保存

# 4. (可选) 安装静态构建组件
#    配置 → GitHub Pages 仓库 → 点击"部署"
```

### 当前进度

| 项 | 状态 |
|----|------|
| manager 核心（CMS CRUD + 编辑） | ✅ 完成 |
| 独立本地运行 | ✅ 完成 |
| 本地数据存储（不依赖 server） | ⚠️ 目前通过 Vite proxy 到 server |
| API 上传组件（可选） | ❌ 需提取为可配置插件 |
| 静态构建组件（可选） | ❌ 需集成 template-astro 构建链 |
| 独立构建产物 | ✅ `npm run build:manager` |

---

## 附录 A：CMS 模式决策树

```
              你是否把 CMS 部署在 VPS 上？
                     /        \
                    是         否
                    │           │
                    │      ┌────┴────┐
                    │   你的 VPS 上有 Node server？
                    │     /           \
                    │   是             否
                    │    │              │
                   full  │           static
                         │         (manager +
                    self-hosted    静态构建 →
                    (manager +     GitHub Pages)
                    API 上传 →
                    VPS server)
```

| 你的情况 | 选这个 | CMS 在哪 | 内容如何发布 |
|----------|--------|---------|------------|
| 有 VPS，CMS 挂公网 | full | VPS 上（Cloud） | 域内 API |
| 有 VPS，CMS 只在本机 | self-hosted | 本地 manager | API 推到 VPS |
| 无 VPS，用免费托管 | static | 本地 manager | 构建 → push |
| 不用 CMS，Git + md | lite | 无 | git push |
| 只要 CMS 工具 | manager | 本地 manager | 自己决定 |

## 附录 B：当前整体进度

```
full         ██████████  95%  文档、v1 迁移脚本已完善
self-hosted  ███░░░░░░░  30%  需 manager API 上传组件
static       ███░░░░░░░  30%  需 manager 静态构建组件
lite         █░░░░░░░░░  10%  阻塞：模板需本地数据源
manager      █████░░░░░  55%  核心完成，缺可选组件
─────────────────────────────────
总体         █████░░░░░  45%  v2 迁移完成，进入 Phase 2
```

| 优先级 | 阻塞项 | 影响版本 |
|--------|--------|---------|
| 🔴 P0 | template-astro 本地 Content Collection（`DATA_SOURCE=local`） | lite, static |
| 🔴 P0 | manager 独立本地数据存储（不依赖 server API） | manager, static |
| 🟡 P1 | manager API 上传可选组件 | self-hosted |
| 🟡 P1 | manager 静态构建可选组件 | static |
| 🟢 P2 | lite 分支 + GitHub Actions 部署模板 | lite |
| 🔵 P3 | Electron 桌面应用 | static, self-hosted |

## 附录 C：与 PRD 版本矩阵的对照

| PRD 版本 | 对应 variant | CMS 模式 | PRD 获取入口 | 状态 |
|----------|-------------|---------|-------------|------|
| 全自托管版 | full | Cloud | `git clone` + install.sh | ⚠️ 需更新 |
| 静态自托管版 | self-hosted | Local·API | 桌面应用 + VPS | ❌ 缺 manager 插件 |
| 完整静态版 | static | Local·静态 | 桌面应用 → 一键部署 | ❌ 缺 manager 插件 |
| 精简版 | lite | 无 | fork `lite` 分支 | ❌ 缺本地数据源 |
| CLI 同步器 | — | — | `npm install` | ❌ 未开始 |
