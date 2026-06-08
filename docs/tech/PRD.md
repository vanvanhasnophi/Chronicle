# 产品需求文档（PRD）
## 项目名称：Chronicle
### 版本：v2.0-beta

---

## 〇、项目核心原则

Chronicle 是一个支持双模式（静态/API）的个人博客系统，由三个独立组件构成：

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│   template-astro │   │     manager       │   │  host (+ gen)         │
│   Astro 前台模板  │   │   Vue CMS 管理 GUI │   │  Express API 运行时    │
│                  │   │                  │   │                      │
│  • 博客前台渲染   │   │  • 文章编辑器     │   │  host: 动态 CRUD API   │
│  • SEO / RSS     │   │  • 文件管理       │   │  gen:  SSG 构建/图片处理 │
│  • 接口标准化     │   │  • 站点配置       │   │  shared: 类型/常量/工具  │
│  • 迁移友好       │   │  • 构建触发       │   │                      │
└──────────────────┘   └──────────────────┘   └──────────────────────┘
```

以下原则不可违背：

| 原则 | 说明 |
|------|------|
| **双模式切换不得侵入业务逻辑** | 静态/API 切换通过环境变量控制（`API_BASE_URL` / `VITE_API_BASE_URL`），数据获取层抽象为 `getApiUrl()` 统一接口 |
| **迁移友好** | 内容使用 Markdown + YAML Frontmatter，目录结构与主流 SSG 兼容 |
| **API 响应格式统一** | 所有接口返回 `{ code: number, data: T, message: string }` |
| **各版本差异通过配置或条件构建实现** | 五个发行版通过 build.sh 的条件组装打包，不复制业务代码 |
| **零数据库依赖** | 全部数据存储在文件系统中（JSON + Markdown），Git 友好 |

### 双模式切换

| 模式 | 模板数据获取 | CMS 数据获取 | 运行时依赖 |
|------|------------|------------|-----------|
| **API 模式** | SSG 构建时 `fetch(API_BASE_URL + '/api/posts')` | `fetchWithAuth('/api/admin/...')` 经 Vite proxy 转发 | host (Express) |
| **静态模式** | `DATA_SOURCE=local` — 本地 Content Collections（规划中） | 纯本地操作，无远端 | 不需要 |

### Monorepo 结构

```
chronicle/
├── packages/
│   ├── shared/          # @chronicle/shared — 共享类型、常量、工具
│   ├── host/            # @chronicle/host   — API 服务器（Express）
│   ├── gen/             # @chronicle/gen    — 内容生成引擎（CLI）
│   ├── manager/         # @chronicle/manager — Vue CMS 管理后台
│   └── template-astro/  # @chronicle/template-astro — Astro 博客模板
├── data/                # 共享数据目录（posts/, upload/, settings.json）
├── scripts/build.sh     # 多规格构建脚本
├── start.sh             # 开发环境一键启动
└── install.sh           # VPS 一键部署
```

---
## 一、产品定位

**一句话定位**：
> 一个以 Notion 为内容源、设计优先的个人博客系统，支持离线写作、自托管部署和多端阅读。

**核心价值**：
1. **内容自由**：从 Notion 同步，数据本地存储，无厂商锁定
2. **设计优先**：开箱即用的精美主题，移动端完美适配
3. **灵活部署**：支持 GitHub Pages（免费）、自托管 VPS、桌面应用

**目标用户**：
| 用户类型 | 特征 | 使用场景 |
|---|---|---|
| 普通创作者 | 不懂技术，想写博客 | 下载桌面应用，一键部署到 GitHub Pages |
| Notion 用户 | 已有笔记，想发布 | 配置同步，自动生成博客 |
| 开发者 | 懂技术，想定制 | 自托管完整版，或只用同步 CLI |
| 设计师 | 在乎视觉效果 | 复刻 lite 分支，基于设计语言开发 |

---

## 二、产品架构

```
┌─────────────────────────────────────────────────────────────┐
│                        内容源层                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  Notion  │  │  本地    │  │ 其他CMS  │                  │
│  │  同步器  │  │ Markdown │  │  （扩展） │                  │
│  │  (gen)   │  │ (data/)  │  │          │                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
│       └─────────────┼─────────────┘                         │
│                     ↓                                       │
│              标准 Markdown + YAML Frontmatter               │
│              (data/posts/<uuid>/<uuid>-content.md)          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  管理层 (Manager GUI)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │     @chronicle/manager — Vue 3 SPA                    │  │
│  │  ┌────────────────┐  ┌────────────────────────┐     │  │
│  │  │  核心功能       │  │  可选组件（插件式）      │     │  │
│  │  │  - 文章 CRUD   │  │  🔌 API 上传组件        │     │  │
│  │  │  - 文件管理     │  │  🔌 静态构建组件        │     │  │
│  │  │  - 站点配置     │  └────────────────────────┘     │  │
│  │  └────────────────┘                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓ (HTTP)                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │     @chronicle/host (动态 API)                        │  │
│  │     Admin API  │  Public API  │  Auth  │  File Serve  │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓ (触发)                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │     @chronicle/gen (内容生成引擎)                      │  │
│  │     Astro Build  │  Image Process  │  Notion Sync    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                   渲染层 (Template)                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  @chronicle/template-astro — Astro SSG                │  │
│  │  - 桌面端/移动端完美适配  - SEO (sitemap/rss/og)      │  │
│  │  - 暗色模式              - Lighthouse ~100           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                        分发层                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ GitHub   │  │  VPS     │  │ Electron │  │  npm     │   │
│  │  Pages   │  │  Nginx   │  │  桌面应用  │  │  CLI     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、功能模块

### 3.1 Notion 同步器（核心突破点）

**定位**：独立 npm 包 + CLI 工具

**功能**：
| 功能点 | 优先级 | 说明 |
|---|---|---|
| 从 Notion 数据库拉取文章 | P0 | 支持标题、正文、标签、日期、封面图 |
| 转换为标准 Markdown | P0 | 保留代码块、引用、列表、待办等格式 |
| 图片本地化 | P0 | 下载到本地 `/images` 目录，替换链接 |
| 增量同步 | P1 | 只同步最近修改的文章 |
| 监听模式 | P1 | `--watch`，自动同步并触发构建 |
| 多数据库支持 | P2 | 一个博客可关联多个 Notion 数据库 |
| 双向同步 | P3 | 在博客中修改，同步回 Notion（复杂，暂缓） |

**CLI 使用示例**：
```bash
# 首次配置
npx notion-sync init --token xxx --database xxx

# 手动同步
npx notion-sync sync --output ./content

# 监听模式（自动同步+构建）
npx notion-sync watch --on-change "npm run build"
```

### 3.2 Vue CMS（控制面板）

**定位**：默认模板的专属控制台 + 通用博客管理

**功能**：
| 功能点 | 优先级 | 说明 |
|---|---|---|
| 文章管理（增删改查） | P0 | Markdown 编辑器，支持实时预览 |
| 构建触发 | P0 | 手动点击“构建并发布” |
| 云托管配置 | P0 | GitHub Token、仓库名、VPS 地址 |
| Notion 同步状态查看 | P1 | 显示上次同步时间、待同步文章数 |
| 默认模板配置面板 | P0 | 主题色、布局、暗色模式等（插件形式） |
| 多模板切换 | P2 | 支持其他模板（通过配置文件） |
| 部署日志 | P2 | 查看构建和部署的详细输出 |

**技术要点**：
- 核心与模板插件解耦（配置化）
- 构建命令可配置（支持其他模板）

### 3.3 Astro 默认模板（设计语言）

**定位**：官方推荐的主题，展示设计语言

**功能**：
| 功能点 | 优先级 | 说明 |
|---|---|---|
| 文章列表页 | P0 | 分页、标签筛选、搜索 |
| 文章详情页 | P0 | 目录、上一篇/下一篇、评论（可配置） |
| 响应式设计 | P0 | 桌面端 + 移动端完美适配 |
| 暗色模式 | P0 | 自动检测系统偏好，支持手动切换 |
| 代码高亮 | P0 | 支持主流语言，可复制 |
| SEO 优化 | P0 | 自动生成 sitemap、rss、og:image |
| 性能优化 | P0 | 图片懒加载、预加载、Lighthouse 100 |
| 自定义页面 | P1 | 关于、友链、归档时间轴 |
| 多语言 | P2 | i18n 支持 |

### 3.4 Express 服务（后端 API）

**定位**：Web 模式下的后端服务，拆分为两个独立可组合的包

| 包 | 定位 | 职责 |
|---|------|------|
| `@chronicle/host` | 托管服务器（常驻进程） | Admin API、Public API、认证、文件管理、静态文件 serve |
| `@chronicle/gen` | 内容生成引擎（按需执行） | Astro SSG 构建、图片处理（sharp）、Notion 同步、搜索索引、文件监听 |

**功能**：
| 功能点 | 优先级 | 所属包 | 说明 |
|---|---|---|---|
| 文章 API | P0 | host | 分页、详情、按标签筛选（Public API） |
| CMS API | P0 | host | 供 Vue CMS 调用的增删改查接口（Admin API） |
| 构建 API | P0 | host → gen | host 接收触发，调用 gen 执行构建 |
| 认证 | P1 | host | `x-chronicle-auth` header + WebAuthn Passkey |
| 静态文件托管 | P0 | host | 托管构建产物（可选，也可用 Nginx） |
| 图片处理 | P0 | gen | sharp 压缩、缩略图、背景图 |
| Webhook | P1 | host | 接收外部更新信号，触发 gen |
| Notion 同步 | P2 | gen | 拉取 Notion 数据 → 转 Markdown → 本地化 |

### 3.5 Electron 桌面应用

**定位**：离线写作 + 一键部署工具

**功能**：
| 功能点 | 优先级 | 说明 |
|---|---|---|
| 内置 Vue CMS | P0 | 完整的管理功能 |
| 内置默认模板 | P0 | 开箱即用，无需额外下载 |
| 本地构建 | P0 | 完全离线生成静态站点 |
| 一键部署到 GitHub Pages | P0 | 内置 gh-pages 逻辑 |
| 自托管部署 | P1 | 通过 rsync/API 同步到 VPS |
| 自动更新 | P1 | 检查新版本，提示更新 |
| 模板独立更新 | P2 | 不更新应用，只更新模板 |

---

## 四、版本矩阵

详见 [versions.md](./versions.md) 完整规格文档。

| # | 版本名称 | CMS 模式 | server | 部署方式 | 用户群体 |
|---|---------|---------|--------|---------|---------|
| 1 | **full**（全自托管版） | Cloud（捆绑） | ✅ VPS 常驻 | VPS + install.sh | 有 VPS 的开发者 |
| 2 | **self-hosted**（静态自托管版） | Local·API 上传 | ✅ VPS 常驻 | manager + VPS server | 有 VPS，CMS 只在本机 |
| 3 | **static**（完整静态版） | Local·静态上传 | ❌ | manager → push GitHub Pages | 无 VPS，用免费托管 |
| 4 | **lite**（精简版） | ❌ 无 | ❌ | fork → 改 md → 自动部署 | 纯前端开发者 |
| 5 | **manager**（独立 CMS） | 纯本地客户端 | ❌ | 本地运行，可选 API/静态组件 | 已有博客前台，只需 CMS |

**发布流程**：
- `main` 分支：全量源码（monorepo）
- `scripts/build.sh`：构建所有 5 种规格的发行版
- 打 tag（如 `v2.0.0`）：触发 GitHub Actions 构建并发布到 Release
- `lite` 分支：仅含 `packages/template-astro/` + 示例内容，fork 即用

---

## 五、技术栈

| 模块 | 技术选型 | 包名 | 说明 |
|---|---|---|---|
| 博客前台 | Astro 6 + Vue 3 Islands | `@chronicle/template-astro` | 静态站点生成，性能优秀 |
| 管理后台 | Vue 3 + Vite 7 | `@chronicle/manager` | SPA，轻量响应式 |
| 后端 API | Express 4 (Node.js) | `@chronicle/host` | REST API，WebAuthn |
| 内容生成 | Node.js + sharp | `@chronicle/gen` | SSG 构建、图片处理、同步 |
| 共享层 | TypeScript | `@chronicle/shared` | 类型定义、常量、工具函数 |
| 桌面应用 | Electron | `packages/electron/`（规划中） | 跨平台桌面应用 |
| 部署 | GitHub Actions | `.github/workflows/` | 多规格自动构建发布 |
| 存储 | 文件系统 + Git | `data/` | 零数据库，Markdown + JSON |
| 包管理 | pnpm workspaces | `pnpm-workspace.yaml` | Monorepo 管理 |

---

## 六、里程碑

### Phase 1：基础重构 ✅ 已完成
- [x] Monorepo 化（`packages/shared` / `host` / `gen` / `manager` / `template-astro`）
- [x] `server/` → `packages/host/` 迁移（git mv，历史保留）
- [x] `@chronicle/shared` 共享类型/常量/工具包
- [x] `@chronicle/gen` 内容生成引擎骨架
- [x] 构建脚本适配新结构（5 个发行版路径全部更新）
- [x] 启动/部署/CI 脚本全部更新
- [x] 默认模板移动端适配（已完成）
- [ ] Vitest 测试框架配置
- [ ] 核心 service 单元测试

### Phase 2：API 分层 + 静态部署就绪（进行中，2-3 周）
- [ ] Public API / Admin API 路由分离
- [ ] API 响应格式统一为 `{ code, data, message }`
- [ ] 搜索静态化（构建时生成 search-index.json）
- [ ] 缩略图静态化（构建时预生成）
- [ ] 纯静态部署验证（dist/ 零 Express 依赖）
- [ ] Notion 同步器 CLI（基础导入功能）
- [ ] 双模式 API 适配（静态模式 `DATA_SOURCE=local`）

### Phase 3：桌面应用 + 同步增强（2-3 周）
- [ ] Electron 打包 Vue CMS
- [ ] 内置默认模板 + 一键部署到 GitHub Pages
- [ ] GitHub Actions 自动构建 Release
- [ ] Notion 增量同步 + 监听模式（`--watch`）

### Phase 4：插件化改造（可选，1 周）
- [ ] Manager API 上传组件（用于 self-hosted）
- [ ] Manager 静态构建组件（用于 static）
- [ ] 构建/预览命令可配置

### Phase 5：生态建设（长期）
- [ ] 文档完善 + 视频教程
- [ ] Docker 镜像
- [ ] 社区模板适配贡献

---

## 七、成功指标

| 指标 | 目标 | 衡量方式 |
|---|---|---|
| GitHub Stars | 1,000 | GitHub 统计 |
| npm 下载量 | 10,000/月 | npm 统计 |
| 桌面应用下载 | 5,000 | GitHub Release 下载数 |
| 用户反馈 | 正向为主 | Issues / Discussions |

---

## 八、风险与应对

| 风险 | 可能性 | 应对策略 |
|---|---|---|
| Notion API 限流 | 中 | 实现本地缓存 + 增量同步 |
| 富文本格式丢失 | 中 | 优先保证核心格式（标题、段落、代码块） |
| Electron 应用体积大 | 低 | 使用 `electron-builder` 优化 |
| 用户不愿意配置 Token | 高 | 提供视频教程 + 简化 OAuth 流程 |
| 竞品出现 | 低 | 差异化在于“设计语言 + 自托管” |

---

## 九、总结

这个项目的核心差异化在于：

1. **Notion 同步是钩子**：解决“进得来出不去”的痛点
2. **设计语言是惊喜**：开箱即用的精美主题
3. **自托管是保障**：数据所有权在用户手里
4. **桌面应用是体验**：离线可用，一键部署

**不是颠覆行业，而是在独立创作者工具这个细分市场，提供一个“离线优先、设计优先、内容自由”的最佳选择。**