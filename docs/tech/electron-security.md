# Chronicle Electron 安全模型

## 概述

Chronicle Manager 的 Electron 桌面应用将 Vue SPA 封装为原生窗口。安全策略基于两层隔离：Electron 的进程隔离（contextIsolation）+ 应用层的 CSP 和导航限制。

## 进程隔离

### 渲染进程（所有 BrowserWindow）

```js
webPreferences: {
  preload: path.join(__dirname, 'preload.cjs'),
  contextIsolation: true,   // 渲染进程无法访问 Node.js / Electron API
  nodeIntegration: false,   // 禁止 require()
  // sandbox: true 未启用 — Linux 需要预配 user namespaces，
  // contextIsolation + CSP 对该应用的威胁模型足够
}
```

- 渲染进程只能通过 `contextBridge` 暴露的 API（`window.chronicleElectron`）与主进程通信
- 主进程不直接暴露任何 Node.js API 给渲染进程

### Preload 脚本

`preload.cjs` 通过 `contextBridge.exposeInMainWorld` 暴露有限 API：
- 窗口控制：`windowMinimize` / `windowMaximize` / `windowClose` → IPC → 主进程
- 事件监听：`onMaximizeChange` / `onLoginCallback`
- Electron 专用功能：`openExternalLogin`（仅 https） / `openPrintInBrowser`（HTML ≤ 2MB）
- 平台信息：`platform` / `isElectron` / `env.VITE_API_BASE_URL`

不允许的 channel 被 `send()` / `on()` 的白名单拦截。

## 内容安全策略（CSP）

通过 `app.on('web-contents-created')` 在所有页面注入响应头：

### 生产环境
```
default-src 'self'
script-src 'self' 'unsafe-eval'
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob: https:
font-src 'self'
connect-src 'self' https://*
```

- `'unsafe-eval'`：KaTeX 和 Mermaid 内部使用 `eval()` / `new Function()`
- `'unsafe-inline'`：Vue 的 scoped CSS 注入内联 `<style>`
- `connect-src https://*`：允许向任意 HTTPS API 服务器发送请求
- `img-src https:`：允许加载外部图片和 CDN 资源

### 开发环境
```
...（基础上增加）
http://localhost:*   （Vite 开发服务器）
ws://localhost:*     （HMR WebSocket）
```

## 导航限制

### `will-navigate` 处理
- 生产环境：仅允许导航到 `file://` URL（当前页面自身）
- 开发环境：额外允许导航到 Vite 开发服务器 URL
- 所有其他导航（如跳转到外部网站）被 `event.preventDefault()` 阻止

### `will-redirect` 处理
- 生产环境：阻止所有 HTTP 重定向
- 开发环境：放行（Vite HMR 使用重定向）
- SPA 内部的 hash 路由（`#/editor`）不触发导航事件，不受此限制

### `setWindowOpenHandler`
- `https://` URL → `shell.openExternal()` 在系统浏览器中打开
- 其他 URL（内部路由） → `createChildWindow()` 创建 Electron 子窗口
- `http://` URL 被拒绝（不在匹配范围内）

## IPC 安全

### `open-external-login`
- URL 必须以 `https://` 开头（开发环境也接受 `http://localhost`）
- 拒绝 `file://`、`javascript:`、`data:` 等危险 scheme

### `chronicle://auth` 自定义协议
- 仅接受 `chronicle://auth`（协议 + hostname 双重校验）
- token 参数必须匹配 `/^[a-fA-F0-9]{16,}$/`（32 字节随机 hex）
- 实际 token 由服务端 `crypto.randomBytes(32).toString('hex')` 生成（64 字符），匹配该正则

### `open-print-in-browser`
- HTML 内容类型校验：必须为 string
- 大小限制：≤ 2 MB（防止写爆磁盘）
- title 参数做文件名安全清洗（只保留字母数字和中文）

## 应用菜单

- 生产环境：File（Quit）、Edit（undo/redo/cut/copy/paste/selectAll）、View（zoom）、Help
- 开发环境：View 额外包含 Reload / Force Reload / Toggle DevTools
- 生产环境中无 DevTools 入口，无法通过菜单打开开发者工具执行任意脚本

## 窗口控制

无框窗口的控制按钮通过 IPC 通信：
- `window-minimize` / `window-maximize` / `window-close`：发送到主进程执行
- `window-is-maximized`：查询当前最大化状态（invoke/handle 模式）
- `window-maximize-change`：主进程通知渲染进程最大化状态变更

每个 IPC 调用通过 `BrowserWindow.fromWebContents(event.sender)` 定位到发送者窗口，确保子窗口控制按钮操作的是正确的窗口。
