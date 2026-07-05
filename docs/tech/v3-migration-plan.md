# Chronicle Aurora 迁移计划

## 概述

Chronicle 旧仓库（`chronicle`）在完成最后的质量更新后归档为 `chronicle-legacy`。新仓库 **Chronicle Aurora** 从 `3.0.0` 重新开始，代号 `aurora`，`4.0.0` 去代号。新仓库放弃 VPS 运行时模式，改为**本地编辑 + git 推送 + 静态部署**的纯 Jamstack 架构。

## 架构变化

```
旧仓库                              新仓库
──────                              ──────
┌──────────┐                        ┌──────────┐
│ Manager   │──fetchWithAuth──▶     │ 本地编辑器 │──git push──▶
│ (Vue SPA) │                        │ (Electron) │
└──────────┘                        └──────────┘
      │                                    │
┌──────────┐                        ┌──────────┐
│ Host API  │ ◀── 删除             │ CI/CD     │──deploy──▶ CDN
│ (Express) │                       │ (Actions) │
└──────────┘                        └──────────┘
      │                                    │
┌──────────┐                        ┌──────────┐
│ data/     │                        │ data/     │ 直接是 YAML 源
│ (JSON)    │                        │ (YAML)    │
└──────────┘                        └──────────┘
      ▲                                    ▲
      │ convert                             │ 直接编辑
┌──────────┐                        ┌──────────┐
│ site/     │                        │ 文件系统   │
│ (YAML/MD) │                        │          │
└──────────┘                        └──────────┘
```

## 让渡功能

Chronicle 不再自建基础设施，以下功能交给免费的权威方案：

| 功能 | 让渡给 | 原因 |
|------|--------|------|
| 版本控制、备份 | Git (GitHub/Gitea) | 业界标准，零成本 |
| 认证、鉴权 | Git 仓库权限 | SSH key + collaborator 比自建更安全 |
| 构建、部署 | GitHub Actions / CI | 免维护，免费额度充足 |
| CDN、HTTPS | Vercel / Cloudflare | 比自建 Nginx 快且免费 |
| 评论渲染 | 浏览器 (SSR + Hydration) | 保留 Chronicle 自有逻辑 |

## 删减清单

以下旧仓库组件在新仓库中不再需要：

### 完全删除

| 组件 | 原因 |
|------|------|
| `packages/host/` (Express API) | 文件系统替代 HTTP |
| `packages/gen/src/commands/convert.mjs` | site/ 消除，不再需要转换 |
| `packages/manager/src/composables/schemaApi.ts` | 本地读文件替代 API |
| `packages/manager/src/composables/settingsApi.ts` | 同上 |
| `packages/manager/src/utils/fetchWithAuth.ts` | 无认证概念 |
| `packages/manager/src/pages/Login.vue` | 无登录 |
| `packages/manager/src/pages/Setup.vue` | 无初始化 |
| `packages/manager/src/pages/Recover.vue` | 无恢复 |
| `packages/host/src/middleware/auth.js` | 无认证 |
| `packages/host/src/services/authService.js` | 无认证 |
| `packages/host/src/routes/admin/auth-lifecycle.js` | 无认证 |
| `data/security.json` | 无认证 |
| `scripts/start.sh` / `scripts/stop.sh` | 无运行时服务 |

### 保留改造

| 组件 | 改造内容 |
|------|---------|
| `packages/template-astro/` | 模板引擎保留，数据源从 JSON 改 YAML |
| `packages/manager/` | 去掉 API 层，改直读文件系统 |
| `packages/shared/` | 保留 sanitize、CSS、类型定义 |
| `CommentSection.astro` | 保留，SSR + Hydration 不变 |
| `commentAdapter.ts` | chronicle/github/twikoo 后端保留 |
| `commentService.js` | 移到 Electron 主进程，直接读写文件 |
| `DOMPurify + sanitize` | 保留，评论内容过滤 |

## 数据格式迁移

```
旧                                  新
──                                  ──
data/settings.json                  data/settings.yml
data/collections.json               data/collections.yml
data/friends.json                   data/friends.yml
data/profile.json                   data/profile.yml
data/comments/{id}.json             保留 JSON（访客源，程序写入）
data/posts/{id}/*-content.md        保留 Markdown + YAML frontmatter
data/posts/index.json               data/posts/index.yml
```

convert 管道废除，不再有 `site/` → `data/` 转换。`data/` 直接就是源文件，build 直接读取。

## Electron 角色变化

```
旧：Manager → fetchWithAuth → Host API → fs → data/
新：Manager → fs.readFile/writeFile → data/ → simple-git → commit/push
```

Electron 主进程负责：
- 文件系统读写 (`fs`)
- Git 操作 (`simple-git`)
- 图片压缩 (`sharp`)
- 构建触发 (`child_process` 跑 `astro build`)
- 窗口管理（保留）

去掉的功能：
- IPC 认证 (`chronicle://auth`)
- Passkey 集成
- CSP 设置（本地文件无跨域问题）

## 构建流水线

```
旧：POST /api/admin/build/astro → spawn chronicle-gen → astro build → dist/
新：git push → GitHub Actions → astro build → rsync/upload → CDN
```

本地构建（开发用）：
```
npx astro build --root packages/template-astro
```

## 实施顺序

1. **新仓库初始化** — 搭好 Astro + Electron + 目录结构
2. **数据格式迁移** — JSON → YAML 单向迁移脚本
3. **模板引擎适配** — YAML 数据源替换 JSON 数据源
4. **Electron 编辑器** — 基于文件系统的 Manager
5. **评论系统移植** — CommentSection + commentAdapter + service
6. **CI/CD 接入** — GitHub Actions 自动构建部署
7. **旧仓库归档** — README 注迁移说明，设为只读

旧仓库不做的：
- mixed mode convert 重构
- CMS 评论管理 API 端点（已完成）
- 运行时架构优化
