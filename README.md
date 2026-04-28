# Chronicle

一个可以往里面扔点史的个人博客网站。支持 Markdown 写作、Passkey 无密码登录、文件管理、多语言切换等功能。

## 技术栈

- **前端**：Vue 3 + TypeScript + Vite，使用 Vue Router 路由管理、vue-i18n 多语言、KaTeX 数学公式渲染、Mermaid 流程图
- **后端**：Node.js + Express，使用 SimpleWebAuthn 实现 Passkey 认证、Sharp 处理图片

## 项目结构

```
Chronicle/
├── chronicle-frontend/     # 前端（Vue 3 + TypeScript）
│   └── src/
│       ├── pages/          # 路由页面（博客列表、文章详情、编辑器、文件管理等）
│       ├── components/     # 公共组件（Markdown 渲染器、博客编辑器等）
│       ├── composables/    # Vue 组合式函数
│       ├── locales/        # 多语言翻译文件（中文 / 英文）
│       ├── router/         # 路由配置（含权限拦截）
│       └── utils/          # 工具函数
├── server/                 # 后端（Node.js + Express）
│   ├── index.js            # 服务入口：API 路由、Passkey 认证、文件服务
│   ├── data/               # 数据存储（文章 JSON、上传文件）
│   └── log/                # 访问日志
├── scripts/                # 维护脚本（数据迁移、Passkey 清理等）
├── start.sh                # 一键启动脚本
└── CHANGELOG.md            # 版本更新记录
```

## 主要功能

- **博客写作**：内置 Markdown 编辑器（Workdown），支持 KaTeX 数学公式、Mermaid 图表、代码高亮
- **无密码登录**：基于 WebAuthn / Passkey 实现，无需传统账号密码
- **文件管理**：支持图片、音频、视频、文档等多类型文件的上传与管理
- **全文搜索**：对所有博文进行关键词检索
- **多语言**：支持中文和英文界面切换
- **移动端适配**：响应式布局，支持手机端访问
- **后台管理**：文章管理、文件库、外观设置、安全设置等，路由级权限控制

## 快速开始

```bash
# 启动前端开发服务器
cd chronicle-frontend && npm install && npm run dev

# 启动后端服务
cd server && npm install && npm start
```
