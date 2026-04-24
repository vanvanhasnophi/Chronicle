# 使用SPA (如 Vue/React)
- 缺陷
    - 首屏慢 (需要下载庞大的 JavaScript 产物并由客户端在浏览器完成水合并渲染 DOM)
    - SEO 差 (爬虫抓取时多数只能看到一个 `<div id="app"></div>` 的空壳)

# 使用 Astro (MPA 多页应用架构)
- 缺陷与 **Astro 的现代解决方案**
    - **资源不可页面间复用？** 
      - ✅ *解决*: 引入 `<ClientRouter />` (原 ViewTransitions)，并使用 `transition:persist` 指令，可以让视频播放器、状态、侧边栏等 DOM 元素在页面跳转间无缝保持（不重新渲染）。使用 Nano Stores 也能跨页面跨岛屿复用逻辑状态。
      - 💡 *举例 (字体复用)*: 传统 MPA 换页时哪怕有浏览器缓存，重新解析字体也可能出现瞬间闪烁(FOUT)。在 Astro 中，一旦启用了 `<ClientRouter />`，页面之间是通过原生的 Fetch 和 DOM 替换来实现的，并不是硬刷新。因此**字体一旦在首屏被解析并加载到内存后，就会一直驻留在当前页面的 DOM 上下文中**，无论你跳转多少个文章页面，字体资源不仅被复用，而且是“0 消耗”复用，连重新挂载的过程都省了！
    - **二次导航慢？** 
      - ✅ *解决*: 配置激进的预加载机制 `prefetch: { prefetchAll: true }`，当链接出现在视区或鼠标悬停时，浏览器会在后台默默提前下载好下一页的完整 HTML。配合路由过渡动画，体感速度完全媲美 SPA。
    - **交互受限？** 
      - ✅ *解决*: Astro 独创的群岛架构 (Islands Architecture)。对于绝大多数静态内容直接输出零 JS 的 HTML；对于需要复杂交互的区块，利用 Vue/React 岛屿（如 `<VueComponent client:load />`）局部注水并接管交互，打破了传统 MPA 的交互瓶颈。