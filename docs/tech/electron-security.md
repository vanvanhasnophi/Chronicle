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

## CSP 安全-功能权衡

Chronicle 的 CSP 在个人 CMS 场景下放松了若干限制以换取可用性。以下记录每一项松弛的原因、风险和未来多用户场景下的收紧方案。

### 生产环境 CSP

```
default-src  'self'
style-src    'self' 'unsafe-inline'
script-src   'self' 'unsafe-eval' 'unsafe-inline'
img-src      'self' data: blob: file: https:
media-src    'self' file: https:
object-src   'self' file: https:
frame-src    'self' https:
font-src     'self'
connect-src  'self' file: https://*
```

### 逐项分析

#### `script-src 'unsafe-eval'`

- **功能**：KaTeX 和 Mermaid 内部使用 `eval()` / `new Function()` 解析公式和图表。
- **风险**：`eval` 是 XSS 放大器——一旦攻击者能注入脚本，`eval` 提供了更大的执行面。
- **当前防线**：`contextIsolation` + DOMPurify 过滤全部用户内容，注入入口极窄。
- **多用户收紧**：评估是否可以将公式渲染移到 Web Worker 沙箱中，或使用预编译方案。若仍需要 `unsafe-eval`，至少对编辑器和管理页分别应用不同 CSP。

#### `script-src 'unsafe-inline'`

- **功能**：编辑器预览区图片的 `onload="this.classList.add('loaded')"` 和 `onerror="…dataset.error='1'"` 内联事件处理器。如果去掉，图片的 loading/error 状态无法由 CSS 驱动。
- **风险**：允许任意内联 `<script>` 标签和内联事件处理器。这是 CSP 防御链中最宽的一个口。
- **当前防线**：DOMPurify 在 HTML 进入 DOM 之前剥离所有 `<script>` 和 `on*` 属性。内联处理器只在 DOMPurify 过滤**之后**由 `postProcessHtml` 生成。
- **多用户收紧**（优先）：使用 `script-src-attr` 单独放行内联事件处理器，保持 `script-src` 禁止内联 `<script>`。或改用 MutationObserver / IntersectionObserver 替代内联 onload/onerror，彻底消除对 `'unsafe-inline'` 的依赖。

#### `img-src file:` / `media-src file:` / `object-src file:` / `connect-src file:`

- **功能**：Electron 本地编辑时预览、上传、恢复 `file:///` 引用的本地文件。
- **风险**：允许页面读取任意本地文件。恶意 markdown 中的 `<img src="file:///etc/passwd">` 会尝试加载（但 Chromium 的 file:// 跨目录 SOP 会拦截）。
- **当前防线**：
  - 浏览器环境：`http://` 页面天然无法访问 `file:///`（SOP 拦截）。
  - Electron 环境：导航守卫禁止跳转到外部 `file://` 页面。IPC `readFileByPath` 有 `path.isAbsolute()` 和长度校验。DOMPurify 剥离危险标签。
  - 发布链路：保存时所有 `file:///` 引用被上传并替换为 HTTPS URL，发布内容中不留 `file:///`。
- **多用户收紧**：为编辑器页单独设置 CSP（允许 `file:`），其他页面（文件管理、设置等）不允许。

#### `connect-src https://*`

- **功能**：CMS 可连接到任意用户配置的 HTTPS API 服务器。
- **风险**：恶意管理员可能利用 CMS 向外部发送数据（数据外泄）。XSS 攻击者可借助宽松的 `connect-src` 向攻击者服务器回传信息。
- **当前防线**：单用户场景下，管理员即站点所有者，不存在恶意管理员威胁。XSS 面由 DOMPurify + CSP 其他指令收缩。
- **多用户收紧**（优先）：根据配置的 `API_BASE_URL` 动态生成 CSP，将 `connect-src` 限制为已知域名白名单。

#### `frame-src 'self' https:`

- **功能**：为将来可能的 iframe 嵌入（PDF.js 预览、第三方服务集成等）预留。当前 Chronicle 不使用 iframe。
- **风险**：允许嵌入任意 HTTPS 页面。被嵌入页面可能包含恶意内容，或通过 `postMessage` 与父页面通信。
- **当前防线**：不使用 iframe，无实际攻击面。如果未来引入 iframe，需配合 `sandbox` 属性限制。
- **多用户收紧**：按需限制为已知域名白名单。

#### `object-src file: https:`

- **功能**：FilePreviewModal 使用 `<object type="application/pdf">` 预览 PDF 文件。
- **风险**：`<object>` 历史上是插件执行入口（Flash、ActiveX），现代浏览器已不再支持浏览器插件，实际攻击面极小。
- **多用户收紧**：评估是否用 `<iframe>` + PDF.js 替代 `<object>`，或将 PDF 预览委托给外部服务。

### 收紧优先级（多用户场景）

1. `connect-src` — 限制为已知 API 域名白名单
2. `script-src 'unsafe-inline'` — 用 `script-src-attr` 分离内联事件处理器，或用 JS 替代
3. `file:` scheme — 仅编辑器页开放，其他页面关闭
4. `frame-src` — 当前无 iframe 使用，若未来引入需收紧为白名单 + sandbox
5. `script-src 'unsafe-eval'` — 评估 KaTeX/Mermaid 沙箱化
