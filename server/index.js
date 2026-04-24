const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const os = require('os');

const app = express();
const PORT = 3000;

console.log("Backend Version: 2026-02-11-FIX-RPID (blog.eightyfor.top)");

// Enable CORS
app.use(cors());
// Parse JSON bodies for API endpoints
app.use(express.json());

// In-memory mock control store for development: can override API responses
const mockStore = {
    enabled: true,
    posts: [
        {
            id: "6c96284f-a6ec-44d8-a0ed-acce66641cde",
            title: "乌萨奇？到！",
            date: "2026-02-11T13:56:09.188Z",
            updatedAt: "2026-02-15T07:07:53.919Z",
            filename: "6c96284f-a6ec-44d8-a0ed-acce66641cde.md",
            summary: "纪念 Chronicle 1.0 上线，有 CDN 过后，图片加载更快了~",
            tags: ["usagi", "featured"],
            status: "published",
            font: "sans"
        },
        {
            id: "a7d395e0-b7fd-55e9-b1fe-bddf77752def",
            title: "2026 前端技术展望",
            date: "2026-04-01T02:30:00.000Z",
            updatedAt: "2026-04-02T10:20:00.000Z",
            filename: "a7d395e0-b7fd-55e9-b1fe-bddf77752def.md",
            summary: "React Server Components、Vue Vapor、HTMX……今年有哪些值得关注的前端动向？",
            tags: ["前端", "展望", "2026"],
            status: "published",
            font: "sans"
        },
        {
            id: "b8e4a6f1-c8fe-66f0-c2gf-ceee88863efg",
            title: "Rust 入门笔记：从所有权开始",
            date: "2026-03-20T14:20:00.000Z",
            updatedAt: "2026-03-22T09:15:00.000Z",
            filename: "b8e4a6f1-c8fe-66f0-c2gf-ceee88863efg.md",
            summary: "学习 Rust 的过程中，最难理解也最核心的概念就是所有权系统，这里是我的学习笔记。",
            tags: ["Rust", "系统编程", "入门"],
            status: "published",
            font: "mono"
        },
        {
            id: "c9f5b7g2-d9gf-77g1-d3hg-dfff99974fgh",
            title: "数据库索引设计指南",
            date: "2026-02-28T09:20:00.000Z",
            updatedAt: "2026-03-01T11:30:45.789Z",
            filename: "c9f5b7g2-d9gf-77g1-d3hg-dfff99974fgh.md",
            summary: "详解 MySQL 索引的类型、原理及最佳实践，通过实际案例展示如何优化慢查询。",
            tags: ["数据库", "MySQL", "索引", "featured"],
            status: "published",
            font: "sans"
        },
        {
            id: "d0g6c8h3-e0hg-88h2-e4ih-eggg00085ghi",
            title: "Git 工作流团队实践",
            date: "2026-03-01T11:10:00.000Z",
            updatedAt: "2026-03-02T14:20:35.901Z",
            filename: "d0g6c8h3-e0hg-88h2-e4ih-eggg00085ghi.md",
            summary: "分享团队中使用 Git Flow 和 GitHub Flow 的经验，以及代码审查的最佳实践。",
            tags: ["Git", "团队协作", "工作流"],
            status: "published",
            font: "sans"
        },
        {
            id: "e1h7d9i4-f1ih-99i3-f5ji-fhhh11196hij",
            title: "设计系统搭建笔记",
            date: "2026-02-05T16:00:00.000Z",
            updatedAt: "2026-02-06T10:15:25.234Z",
            filename: "e1h7d9i4-f1ih-99i3-f5ji-fhhh11196hij.md",
            summary: "从零开始搭建设计系统的全过程，包括组件库、设计 tokens 和文档站点。",
            tags: ["设计系统", "UI", "组件库"],
            status: "draft",
            font: "sans"
        },
        {
            id: "f2i8e0j5-g2ji-00j4-g6kj-giii22207ijk",
            title: "微服务架构落地反思",
            date: "2025-12-10T08:30:00.000Z",
            updatedAt: "2025-12-12T16:45:12.567Z",
            filename: "f2i8e0j5-g2ji-00j4-g6kj-giii22207ijk.md",
            summary: "回顾微服务架构迁移过程中的坑与收获，总结适合小团队的演进策略。",
            tags: ["微服务", "架构", "反思", "featured"],
            status: "published",
            font: "mono"
        },
        {
            id: "g3j9f1k6-h3kj-11k5-h7lk-hjjj33318jkl",
            title: "CSS Grid 完全指南",
            date: "2025-11-18T08:30:00.000Z",
            updatedAt: "2025-11-20T12:00:00.000Z",
            filename: "g3j9f1k6-h3kj-11k5-h7lk-hjjj33318jkl.md",
            summary: "从基础概念到复杂布局，一份完整的 CSS Grid 学习手册。",
            tags: ["CSS", "布局", "Grid"],
            status: "published",
            font: "sans"
        },
        {
            id: "h4k0g2l7-i4lk-22l6-i8ml-ikkk44429klm",
            title: "Node.js 内存泄漏排查实战",
            date: "2025-10-05T08:30:00.000Z",
            updatedAt: "2025-10-07T14:30:00.000Z",
            filename: "h4k0g2l7-i4lk-22l6-i8ml-ikkk44429klm.md",
            summary: "一次真实的 Node.js 内存泄漏问题排查过程，以及如何通过工具定位问题。",
            tags: ["Node.js", "内存泄漏", "调试", "featured"],
            status: "published",
            font: "mono"
        },
        {
            id: "i5l1h3m8-j5ml-33m7-j9nm-jlll55530lmn",
            title: "Vue 3 组合式 API 最佳实践",
            date: "2025-09-12T08:30:00.000Z",
            updatedAt: "2025-09-14T10:45:00.000Z",
            filename: "i5l1h3m8-j5ml-33m7-j9nm-jlll55530lmn.md",
            summary: "总结 Vue 3 项目中组合式 API 的使用经验和复用逻辑的封装技巧。",
            tags: ["Vue", "组合式API", "前端"],
            status: "published",
            font: "sans"
        },
        {
            id: "j6m2i4n9-k6nm-44n8-k0on-kmmm66641mno",
            title: "Docker 容器化开发环境搭建",
            date: "2025-08-20T08:30:00.000Z",
            updatedAt: "2025-08-22T16:20:00.000Z",
            filename: "j6m2i4n9-k6nm-44n8-k0on-kmmm66641mno.md",
            summary: "使用 Docker 统一团队开发环境，解决「在我电脑上能跑」的问题。",
            tags: ["Docker", "DevOps", "环境配置"],
            status: "published",
            font: "sans"
        },
        {
            id: "k7n3j5o0-l7on-55o9-l1po-lnnn77752nop",
            title: "TypeScript 泛型深度解析",
            date: "2025-07-15T08:30:00.000Z",
            updatedAt: "2025-07-17T11:10:00.000Z",
            filename: "k7n3j5o0-l7on-55o9-l1po-lnnn77752nop.md",
            summary: "从基础到高级，彻底搞懂 TypeScript 泛型的用法和内置工具类型。",
            tags: ["TypeScript", "类型系统", "进阶"],
            status: "published",
            font: "mono"
        },
        {
            id: "l8o4k6p1-m8po-66p0-m2qp-mooo88863opq",
            title: "HTTP/3 新特性速览",
            date: "2025-06-08T08:30:00.000Z",
            updatedAt: "2025-06-10T09:45:00.000Z",
            filename: "l8o4k6p1-m8po-66p0-m2qp-mooo88863opq.md",
            summary: "基于 QUIC 协议的 HTTP/3 带来了哪些改进？对前端性能有什么影响？",
            tags: ["HTTP", "网络协议", "性能"],
            status: "published",
            font: "sans"
        },
        {
            id: "m9p5l7q2-n9qp-77q1-n3rq-nppp99974pqr",
            title: "单元测试入门与实战",
            date: "2025-05-22T08:30:00.000Z",
            updatedAt: "2025-05-24T15:30:00.000Z",
            filename: "m9p5l7q2-n9qp-77q1-n3rq-nppp99974pqr.md",
            summary: "Jest + Vitest 实战，如何编写可维护的单元测试。",
            tags: ["测试", "单元测试", "Jest"],
            status: "published",
            font: "sans"
        },
        {
            id: "n0q6m8r3-o0rq-88r2-o4sr-oqqq00085qrs",
            title: "Electron 桌面应用开发踩坑记",
            date: "2025-04-10T08:30:00.000Z",
            updatedAt: "2025-04-12T13:20:00.000Z",
            filename: "n0q6m8r3-o0rq-88r2-o4sr-oqqq00085qrs.md",
            summary: "从打包到更新，Electron 开发中遇到的问题和解决方案。",
            tags: ["Electron", "桌面应用", "踩坑"],
            status: "published",
            font: "sans"
        },
        {
            id: "o1r7n9s4-p1sr-99s3-p5ts-prrr11196rst",
            title: "AI 辅助编程实践思考",
            date: "2025-03-05T08:30:00.000Z",
            updatedAt: "2025-03-07T10:00:00.000Z",
            filename: "o1r7n9s4-p1sr-99s3-p5ts-prrr11196rst.md",
            summary: "Copilot、Cursor 等 AI 工具如何提升开发效率，以及需要注意的问题。",
            tags: ["AI", "编程工具", "思考", "featured"],
            status: "published",
            font: "sans"
        },
        {
            id: "p2s8o0t5-q2ts-00t4-q6ut-qsss22207stu",
            title: "WebAssembly 应用场景探索",
            date: "2025-02-18T08:30:00.000Z",
            updatedAt: "2025-02-20T16:45:00.000Z",
            filename: "p2s8o0t5-q2ts-00t4-q6ut-qsss22207stu.md",
            summary: "WASM 在视频处理、游戏、加密计算等场景的实际应用案例。",
            tags: ["WebAssembly", "WASM", "前沿"],
            status: "draft",
            font: "mono"
        },
        {
            id: "q3t9p1u6-r3ut-11u5-r7vu-rttt33318tuv",
            title: "正则表达式从入门到精通",
            date: "2025-01-25T08:30:00.000Z",
            updatedAt: "2025-01-27T11:30:00.000Z",
            filename: "q3t9p1u6-r3ut-11u5-r7vu-rttt33318tuv.md",
            summary: "一份系统的正则学习指南，配合大量实战例子。",
            tags: ["正则", "工具", "技巧"],
            status: "published",
            font: "sans"
        },
        {
            id: "r4u0q2v7-s4vu-22v6-s8wv-suuu44429uvw",
            title: "Nginx 配置进阶技巧",
            date: "2024-11-30T08:30:00.000Z",
            updatedAt: "2024-12-02T14:15:00.000Z",
            filename: "r4u0q2v7-s4vu-22v6-s8wv-suuu44429uvw.md",
            summary: "负载均衡、缓存配置、限流、反向代理……Nginx 的高级配置技巧汇总。",
            tags: ["Nginx", "运维", "服务器"],
            status: "published",
            font: "sans"
        },
        {
            id: "s5v1r3w8-t5wv-33w7-t9xw-svvv55530vwx",
            title: "2024 年度技术回顾",
            date: "2024-12-28T08:30:00.000Z",
            updatedAt: "2024-12-30T17:00:00.000Z",
            filename: "s5v1r3w8-t5wv-33w7-t9xw-svvv55530vwx.md",
            summary: "回顾 2024 年技术圈的大事件：AI 爆发、前端框架更新、Rust 生态发展……",
            tags: ["年度回顾", "2024", "总结", "featured"],
            status: "published",
            font: "sans"
        }
    ],
    settings: null,
};

// Never auto-fill posts from built-in templates: start with mock disabled and empty.
mockStore.enabled = false;
mockStore.posts = null;

// Dev-only mock control endpoints
app.get('/api/_mock', (req, res) => {
    return res.json({ enabled: mockStore.enabled, hasPosts: !!mockStore.posts, hasSettings: !!mockStore.settings });
});

app.post('/api/_mock', (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: 'missing key' });
    if (key === 'posts') mockStore.posts = value;
    else if (key === 'settings') mockStore.settings = value;
    else return res.status(400).json({ error: 'invalid key' });
    return res.json({ success: true });
});

app.post('/api/_mock/enable', (req, res) => {
    mockStore.enabled = true;
    return res.json({ enabled: true });
});
app.post('/api/_mock/disable', (req, res) => {
    mockStore.enabled = false;
    return res.json({ enabled: false });
});
app.post('/api/_mock/clear', (req, res) => {
    mockStore.enabled = false;
    mockStore.posts = null;
    mockStore.settings = null;
    return res.json({ cleared: true });
});

app.post('/api/_mock/default', (req, res) => {
    mockStore.enabled = false;
    mockStore.posts = ([
        {
            id: "6c96284f-a6ec-44d8-a0ed-acce66641cde",
            title: "乌萨奇？到！",
            date: "2026-02-11T13:56:09.188Z",
            updatedAt: "2026-02-15T07:07:53.919Z",
            filename: "6c96284f-a6ec-44d8-a0ed-acce66641cde.md",
            summary: "纪念 Chronicle 1.0 上线，有 CDN 过后，图片加载更快了~",
            tags: ["usagi", "featured"],
            status: "published",
            font: "sans"
        },
        {
            id: "a7d395e0-b7fd-55e9-b1fe-bddf77752def",
            title: "2026 前端技术展望",
            date: "2026-04-01T02:30:00.000Z",
            updatedAt: "2026-04-02T10:20:00.000Z",
            filename: "a7d395e0-b7fd-55e9-b1fe-bddf77752def.md",
            summary: "React Server Components、Vue Vapor、HTMX……今年有哪些值得关注的前端动向？",
            tags: ["前端", "展望", "2026"],
            status: "published",
            font: "sans"
        },
        {
            id: "b8e4a6f1-c8fe-66f0-c2gf-ceee88863efg",
            title: "Rust 入门笔记：从所有权开始",
            date: "2026-03-20T14:20:00.000Z",
            updatedAt: "2026-03-22T09:15:00.000Z",
            filename: "b8e4a6f1-c8fe-66f0-c2gf-ceee88863efg.md",
            summary: "学习 Rust 的过程中，最难理解也最核心的概念就是所有权系统，这里是我的学习笔记。",
            tags: ["Rust", "系统编程", "入门"],
            status: "published",
            font: "mono"
        },
        {
            id: "c9f5b7g2-d9gf-77g1-d3hg-dfff99974fgh",
            title: "数据库索引设计指南",
            date: "2026-02-28T09:20:00.000Z",
            updatedAt: "2026-03-01T11:30:45.789Z",
            filename: "c9f5b7g2-d9gf-77g1-d3hg-dfff99974fgh.md",
            summary: "详解 MySQL 索引的类型、原理及最佳实践，通过实际案例展示如何优化慢查询。",
            tags: ["数据库", "MySQL", "索引", "featured"],
            status: "published",
            font: "sans"
        },
        {
            id: "d0g6c8h3-e0hg-88h2-e4ih-eggg00085ghi",
            title: "Git 工作流团队实践",
            date: "2026-03-01T11:10:00.000Z",
            updatedAt: "2026-03-02T14:20:35.901Z",
            filename: "d0g6c8h3-e0hg-88h2-e4ih-eggg00085ghi.md",
            summary: "分享团队中使用 Git Flow 和 GitHub Flow 的经验，以及代码审查的最佳实践。",
            tags: ["Git", "团队协作", "工作流"],
            status: "published",
            font: "sans"
        },
        {
            id: "e1h7d9i4-f1ih-99i3-f5ji-fhhh11196hij",
            title: "设计系统搭建笔记",
            date: "2026-02-05T16:00:00.000Z",
            updatedAt: "2026-02-06T10:15:25.234Z",
            filename: "e1h7d9i4-f1ih-99i3-f5ji-fhhh11196hij.md",
            summary: "从零开始搭建设计系统的全过程，包括组件库、设计 tokens 和文档站点。",
            tags: ["设计系统", "UI", "组件库"],
            status: "draft",
            font: "sans"
        },
        {
            id: "f2i8e0j5-g2ji-00j4-g6kj-giii22207ijk",
            title: "微服务架构落地反思",
            date: "2025-12-10T08:30:00.000Z",
            updatedAt: "2025-12-12T16:45:12.567Z",
            filename: "f2i8e0j5-g2ji-00j4-g6kj-giii22207ijk.md",
            summary: "回顾微服务架构迁移过程中的坑与收获，总结适合小团队的演进策略。",
            tags: ["微服务", "架构", "反思", "featured"],
            status: "published",
            font: "mono"
        },
        {
            id: "g3j9f1k6-h3kj-11k5-h7lk-hjjj33318jkl",
            title: "CSS Grid 完全指南",
            date: "2025-11-18T08:30:00.000Z",
            updatedAt: "2025-11-20T12:00:00.000Z",
            filename: "g3j9f1k6-h3kj-11k5-h7lk-hjjj33318jkl.md",
            summary: "从基础概念到复杂布局，一份完整的 CSS Grid 学习手册。",
            tags: ["CSS", "布局", "Grid"],
            status: "published",
            font: "sans"
        },
        {
            id: "h4k0g2l7-i4lk-22l6-i8ml-ikkk44429klm",
            title: "Node.js 内存泄漏排查实战",
            date: "2025-10-05T08:30:00.000Z",
            updatedAt: "2025-10-07T14:30:00.000Z",
            filename: "h4k0g2l7-i4lk-22l6-i8ml-ikkk44429klm.md",
            summary: "一次真实的 Node.js 内存泄漏问题排查过程，以及如何通过工具定位问题。",
            tags: ["Node.js", "内存泄漏", "调试", "featured"],
            status: "published",
            font: "mono"
        },
        {
            id: "i5l1h3m8-j5ml-33m7-j9nm-jlll55530lmn",
            title: "Vue 3 组合式 API 最佳实践",
            date: "2025-09-12T08:30:00.000Z",
            updatedAt: "2025-09-14T10:45:00.000Z",
            filename: "i5l1h3m8-j5ml-33m7-j9nm-jlll55530lmn.md",
            summary: "总结 Vue 3 项目中组合式 API 的使用经验和复用逻辑的封装技巧。",
            tags: ["Vue", "组合式API", "前端"],
            status: "published",
            font: "sans"
        },
        {
            id: "j6m2i4n9-k6nm-44n8-k0on-kmmm66641mno",
            title: "Docker 容器化开发环境搭建",
            date: "2025-08-20T08:30:00.000Z",
            updatedAt: "2025-08-22T16:20:00.000Z",
            filename: "j6m2i4n9-k6nm-44n8-k0on-kmmm66641mno.md",
            summary: "使用 Docker 统一团队开发环境，解决「在我电脑上能跑」的问题。",
            tags: ["Docker", "DevOps", "环境配置"],
            status: "published",
            font: "sans"
        },
        {
            id: "k7n3j5o0-l7on-55o9-l1po-lnnn77752nop",
            title: "TypeScript 泛型深度解析",
            date: "2025-07-15T08:30:00.000Z",
            updatedAt: "2025-07-17T11:10:00.000Z",
            filename: "k7n3j5o0-l7on-55o9-l1po-lnnn77752nop.md",
            summary: "从基础到高级，彻底搞懂 TypeScript 泛型的用法和内置工具类型。",
            tags: ["TypeScript", "类型系统", "进阶"],
            status: "published",
            font: "mono"
        },
        {
            id: "l8o4k6p1-m8po-66p0-m2qp-mooo88863opq",
            title: "HTTP/3 新特性速览",
            date: "2025-06-08T08:30:00.000Z",
            updatedAt: "2025-06-10T09:45:00.000Z",
            filename: "l8o4k6p1-m8po-66p0-m2qp-mooo88863opq.md",
            summary: "基于 QUIC 协议的 HTTP/3 带来了哪些改进？对前端性能有什么影响？",
            tags: ["HTTP", "网络协议", "性能"],
            status: "published",
            font: "sans"
        },
        {
            id: "m9p5l7q2-n9qp-77q1-n3rq-nppp99974pqr",
            title: "单元测试入门与实战",
            date: "2025-05-22T08:30:00.000Z",
            updatedAt: "2025-05-24T15:30:00.000Z",
            filename: "m9p5l7q2-n9qp-77q1-n3rq-nppp99974pqr.md",
            summary: "Jest + Vitest 实战，如何编写可维护的单元测试。",
            tags: ["测试", "单元测试", "Jest"],
            status: "published",
            font: "sans"
        },
        {
            id: "n0q6m8r3-o0rq-88r2-o4sr-oqqq00085qrs",
            title: "Electron 桌面应用开发踩坑记",
            date: "2025-04-10T08:30:00.000Z",
            updatedAt: "2025-04-12T13:20:00.000Z",
            filename: "n0q6m8r3-o0rq-88r2-o4sr-oqqq00085qrs.md",
            summary: "从打包到更新，Electron 开发中遇到的问题和解决方案。",
            tags: ["Electron", "桌面应用", "踩坑"],
            status: "published",
            font: "sans"
        },
        {
            id: "o1r7n9s4-p1sr-99s3-p5ts-prrr11196rst",
            title: "AI 辅助编程实践思考",
            date: "2025-03-05T08:30:00.000Z",
            updatedAt: "2025-03-07T10:00:00.000Z",
            filename: "o1r7n9s4-p1sr-99s3-p5ts-prrr11196rst.md",
            summary: "Copilot、Cursor 等 AI 工具如何提升开发效率，以及需要注意的问题。",
            tags: ["AI", "编程工具", "思考", "featured"],
            status: "published",
            font: "sans"
        },
        {
            id: "p2s8o0t5-q2ts-00t4-q6ut-qsss22207stu",
            title: "WebAssembly 应用场景探索",
            date: "2025-02-18T08:30:00.000Z",
            updatedAt: "2025-02-20T16:45:00.000Z",
            filename: "p2s8o0t5-q2ts-00t4-q6ut-qsss22207stu.md",
            summary: "WASM 在视频处理、游戏、加密计算等场景的实际应用案例。",
            tags: ["WebAssembly", "WASM", "前沿"],
            status: "draft",
            font: "mono"
        },
        {
            id: "q3t9p1u6-r3ut-11u5-r7vu-rttt33318tuv",
            title: "正则表达式从入门到精通",
            date: "2025-01-25T08:30:00.000Z",
            updatedAt: "2025-01-27T11:30:00.000Z",
            filename: "q3t9p1u6-r3ut-11u5-r7vu-rttt33318tuv.md",
            summary: "一份系统的正则学习指南，配合大量实战例子。",
            tags: ["正则", "工具", "技巧"],
            status: "published",
            font: "sans"
        },
        {
            id: "r4u0q2v7-s4vu-22v6-s8wv-suuu44429uvw",
            title: "Nginx 配置进阶技巧",
            date: "2024-11-30T08:30:00.000Z",
            updatedAt: "2024-12-02T14:15:00.000Z",
            filename: "r4u0q2v7-s4vu-22v6-s8wv-suuu44429uvw.md",
            summary: "负载均衡、缓存配置、限流、反向代理……Nginx 的高级配置技巧汇总。",
            tags: ["Nginx", "运维", "服务器"],
            status: "published",
            font: "sans"
        },
        {
            id: "s5v1r3w8-t5wv-33w7-t9xw-svvv55530vwx",
            title: "2024 年度技术回顾",
            date: "2024-12-28T08:30:00.000Z",
            updatedAt: "2024-12-30T17:00:00.000Z",
            filename: "s5v1r3w8-t5wv-33w7-t9xw-svvv55530vwx.md",
            summary: "回顾 2024 年技术圈的大事件：AI 爆发、前端框架更新、Rust 生态发展……",
            tags: ["年度回顾", "2024", "总结", "featured"],
            status: "published",
            font: "sans"
        }
    ]);
    mockStore.settings = null;
});

// Logger
const LOG_DIR = path.join(__dirname, 'log');
const ACCESS_LOG = path.join(LOG_DIR, 'access.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const accessLogStream = fs.createWriteStream(ACCESS_LOG, { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));

// Keep API JSON responses fresh in browsers; curl bypasses HTTP cache anyway.
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Data Directories
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'upload');
const POSTS_DIR = path.join(DATA_DIR, 'posts');
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const INDEX_FILE = path.join(POSTS_DIR, 'index.json');

const CATEGORIES = ['pic', 'sound', 'txt', 'video', 'doc', 'other'];

function sortTags(tags) {
    if (!tags || !Array.isArray(tags)) return [];
    return tags.sort((a, b) => {
        if (a === 'featured') return -1;
        if (b === 'featured') return 1;
        return a.localeCompare(b);
    });
}

// Dev Static Link Helper
// Ensures that even if started without start.sh, or if links are missing,
// we try to bind the upload folder to the frontend public folder.
function ensureDevSymlink() {
    try {
        // Detect if we are in the monorepo structure
        // ../chronicle-frontend/public
        const frontendPublic = path.resolve(__dirname, '../chronicle-frontend/public');
        if (fs.existsSync(frontendPublic)) {
            const targetParent = path.join(frontendPublic, 'server/data');
            const targetLink = path.join(targetParent, 'upload');
            
            if (!fs.existsSync(targetParent)) {
                fs.mkdirSync(targetParent, { recursive: true });
            }

            if (!fs.existsSync(targetLink)) {
                // Ensure source exists
                if (fs.existsSync(UPLOAD_DIR)) {
                     // Check if targetLink is a broken link
                     try { fs.unlinkSync(targetLink); } catch(e) {}
                     fs.symlinkSync(UPLOAD_DIR, targetLink, 'dir');
                     console.log('[Dev] Created static asset symlink:', targetLink);
                }
            }
        }
    } catch (e) {
        // Silent fail - permission or structure issues
    }
}
// Run once on startup
ensureDevSymlink();

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
CATEGORIES.forEach(cat => {
    const catDir = path.join(UPLOAD_DIR, cat);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
});
if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });
if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, '[]');

// Encryption Setup
const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = crypto.scryptSync('chronicle-secret-key-123', 'salt', 32);

// CDN purge config from env (for Alibaba Cloud)
const ALIYUN_ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID || '';
const ALIYUN_ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET || '';
const CDN_API_ENDPOINT = process.env.CDN_API_ENDPOINT || 'https://cdn.aliyuncs.com/';
// Optional switch to enable/disable CDN purge behaviour.
// Currently hard-coded OFF for safety. To enable later, set this to read from env as before.
const ENABLE_CDN_PURGE = false;

function percentEncode(str) {
    return encodeURIComponent(str)
        .replace(/\+/g, '%20')
        .replace(/\*/g, '%2A')
        .replace(/%7E/g, '~');
}

async function aliyunCdnRefresh(urls = []) {
    if (!ENABLE_CDN_PURGE) {
        console.log('[CDN] Purge disabled by ENABLE_CDN_PURGE env var');
        return;
    }
    if (!ALIYUN_ACCESS_KEY_ID || !ALIYUN_ACCESS_KEY_SECRET || !urls || urls.length === 0) {
        console.log('[CDN] Skipping CDN refresh - missing creds or urls');
        return;
    }

    try {
        const params = {
            Format: 'JSON',
            Version: '2018-05-10',
            AccessKeyId: ALIYUN_ACCESS_KEY_ID,
            SignatureMethod: 'HMAC-SHA1',
            Timestamp: new Date().toISOString(),
            SignatureVersion: '1.0',
            SignatureNonce: Math.random().toString(36).slice(2),
            Action: 'RefreshObjectCaches'
        };

        // ObjectPath.N entries
        urls.forEach((u, i) => { params[`ObjectPath.${i+1}`] = u; });
        params.ObjectType = 'File';

        // Canonicalize
        const keys = Object.keys(params).sort();
        const canonicalized = keys.map(k => `${percentEncode(k)}=${percentEncode(String(params[k]))}`).join('&');
        const stringToSign = `GET&%2F&${percentEncode(canonicalized)}`;

        const sign = crypto.createHmac('sha1', ALIYUN_ACCESS_KEY_SECRET + '&').update(stringToSign).digest('base64');
        const finalParams = { Signature: sign, ...params };

        const qs = Object.keys(finalParams).map(k => `${percentEncode(k)}=${percentEncode(String(finalParams[k]))}`).join('&');
        const url = `${CDN_API_ENDPOINT}?${qs}`;

        // Fire request (GET)
        console.log('[CDN] Purge request URL:', url.replace(/(AccessKeyId=)[^&]+/, '$1****'));
        const resp = await fetch(url, { method: 'GET', timeout: 10000 });
        const body = await resp.text();
        console.log('[CDN] Purge response:', resp.status, body);
    } catch (e) {
        console.error('[CDN] Purge error', e);
    }
}

// --- Front Matter Helpers ---
function parseFrontMatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { attributes: {}, body: content };
    
    const attributes = {};
    match[1].split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join(':').trim();
            if (key === 'tags') {
                try { attributes[key] = JSON.parse(value); } catch(e) { attributes[key] = []; }
            } else {
                attributes[key] = value;
            }
        }
    });
    return { attributes, body: match[2] };
}

function stringifyFrontMatter(attributes, body) {
    let fm = '---\n';
    if (attributes.title) fm += `title: ${attributes.title}\n`;
    if (attributes.date) fm += `date: ${attributes.date}\n`;
    if (attributes.font) fm += `font: ${attributes.font}\n`;
    if (attributes.tags) fm += `tags: ${JSON.stringify(attributes.tags)}\n`;
    fm += '---\n';
    return fm + body;
}

// Helper: get directory path for a post (supports legacy filename)
function getPostDir(post) {
    if (!post) return '';
    const dirName = post.dir || (post.filename ? post.filename.replace(/\.md$/, '') : post.id);
    return path.join(POSTS_DIR, String(dirName || ''));
}

function isValidId(id) {
    return typeof id === 'string' && /^[0-9a-fA-F\-]+$/.test(id)
}

function readPostContentFromDisk(post) {
    const dir = getPostDir(post)
    const id = post.id
    if (!isValidId(id)) return ''
    const expectedName = `${id}-content.md`
    const p = path.join(dir, expectedName)
    if (fs.existsSync(p)) {
        let raw = fs.readFileSync(p, 'utf-8')
        try { raw = decrypt(raw) } catch(e) {}
        const { body } = parseFrontMatter(raw)
        return body
    }
    // Fallback to legacy filename if present and appears to match id
    if (post.filename && post.filename.startsWith(id)) {
        const legacy = path.join(POSTS_DIR, post.filename)
        if (fs.existsSync(legacy)) {
            let raw = fs.readFileSync(legacy, 'utf-8')
            try { raw = decrypt(raw) } catch(e) {}
            const { body } = parseFrontMatter(raw)
            return body
        }
    }
    return ''
}

function writePostContentToDisk(post, content, options = {}) {
    // options: { draft: boolean }
    const dir = getPostDir(post)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const id = post.id
    if (!isValidId(id)) throw new Error('Invalid post id')
    const filename = options.draft ? `${id}-draft.md` : `${id}-content.md`
    const full = stringifyFrontMatter({ title: post.title, date: post.date, updatedAt: post.updatedAt, tags: post.tags || [], font: post.font || 'sans' }, content || '')
    const encrypted = encrypt(full)
    fs.writeFileSync(path.join(dir, filename), encrypted)
}

function writeCompiledHtmlToDisk(post, html) {
    const dir = getPostDir(post)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const id = post.id
    if (!isValidId(id)) throw new Error('Invalid post id')
    fs.writeFileSync(path.join(dir, `${id}-compiled.html`), html || '')
}

function writeTocToDisk(post, toc) {
    const dir = getPostDir(post)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const id = post.id
    if (!isValidId(id)) throw new Error('Invalid post id')
    fs.writeFileSync(path.join(dir, `${id}-toc.json`), JSON.stringify(toc || []))
}

function readCompiledHtmlFromDisk(post) {
    const dir = getPostDir(post)
    const id = post.id
    if (!isValidId(id)) return ''
    const p = path.join(dir, `${id}-compiled.html`)
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
    return ''
}

function readTocFromDisk(post) {
    const dir = getPostDir(post)
    const id = post.id
    if (!isValidId(id)) return []
    const p = path.join(dir, `${id}-toc.json`)
    if (fs.existsSync(p)) {
        try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch(e) { return [] }
    }
    return []
}

// Ensure Index Consistency on Startup
function syncIndexWithFiles() {
    try {
        if (!fs.existsSync(INDEX_FILE)) return;
        let posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
        let modified = false;

        posts.forEach(post => {
            // Support new per-post directory layout: POSTS_DIR/<id>/<id>-content.md
            const dirName = post.dir || (post.filename ? post.filename.replace(/\.md$/, '') : post.id);
            const dirPath = path.join(POSTS_DIR, dirName || '')
            const expected = path.join(dirPath, `${post.id}-content.md`)
            let mdPath = ''
            if (fs.existsSync(expected)) {
                mdPath = expected
            } else if (post.filename && fs.existsSync(path.join(POSTS_DIR, post.filename))) {
                mdPath = path.join(POSTS_DIR, post.filename)
            }

            if (mdPath && fs.existsSync(mdPath)) {
                let content = fs.readFileSync(mdPath, 'utf-8');
                try { content = decrypt(content); } catch(e) {}
                
                const { attributes } = parseFrontMatter(content);
                if (attributes.font && attributes.font !== post.font) {
                    post.font = attributes.font;
                    modified = true;
                    console.log(`[Sync] Updated font for ${post.id} from file metadata: ${post.font}`);
                }
            }
        });

        if (modified) {
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
            console.log('[Sync] Index updated based on file metadata');
        }
    } catch (e) {
        console.error('[Sync] Failed to sync index:', e);
    }
}
syncIndexWithFiles();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const [ivHex, encryptedText] = text.split(':');
  if (!ivHex || !encryptedText) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function hashPassword(pwd) {
    return crypto.scryptSync(pwd, 'chronicle-salt', 64).toString('hex');
}

// Passkey Globals
const isDev = process.argv.includes('--dev');
const RP_ID = isDev ? 'localhost' : 'blog.eightyfor.top'; 
const ORIGIN = isDev ? 'http://localhost:5173' : 'https://blog.eightyfor.top'; 
// MEDIA_DOMAIN controls the public base URL for uploaded media files.
// Set via environment variable in production: MEDIA_DOMAIN=https://file.eightyfor.top
const MEDIA_DOMAIN = (process.env.MEDIA_DOMAIN && process.env.MEDIA_DOMAIN.replace(/\/$/, '')) || (isDev ? 'http://localhost:3000' : 'https://file.eightyfor.top');
console.log('Passkey Config:', { RP_ID, ORIGIN });
const passkeyChallenges = new Map();
const verificationCodes = new Map();

// Middlewares
// Use JSON parser for everything EXCEPT upload endpoint which needs raw stream
// 增加 limit 解决大文件上传 413 问题
app.use((req, res, next) => {
    if (req.path === '/api/upload') {
        next();
    } else {
        express.json({ limit: '100mb' })(req, res, next);
    }
});

// --- ROUTES ---

// 1. Static File Serving (Mimic /server/data/upload/...)
// Frontend requests: /server/data/upload/pic/xxx.png
// Serve uploaded files but avoid marking them immutable so browsers
// will revalidate when the underlying file changes. Use a very short
// max-age to allow clients to pick up background updates promptly.
app.use('/server/data/upload', express.static(UPLOAD_DIR, {
    maxAge: 0,
    immutable: false,
    setHeaders: (res, filePath) => {
        // Encourage revalidation while still allowing public caching
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
}));

// Thumbnail endpoint: /thumb/<category>/<file>
// Tries to generate a cached thumbnail under UPLOAD_DIR/.thumbs
let sharpLib = null;
try {
    sharpLib = require('sharp');
} catch (e) {
    // sharp not installed - thumbnails will fallback to original image
    console.log('[Thumb] sharp not available, thumbnails will fallback to original images');
}

app.get('/thumb/*', async (req, res) => {
    try {
        const rel = req.path.replace(/^\/thumb\//, '').replace(/^\/+/, '');
        const target = path.resolve(UPLOAD_DIR, rel);
        if (!target.startsWith(UPLOAD_DIR) || !fs.existsSync(target)) {
            return res.status(404).send('Not found');
        }

        // cached thumbs dir
        const thumbBase = path.join(UPLOAD_DIR, '.thumbs');
        const thumbPath = path.join(thumbBase, rel);
        const thumbDir = path.dirname(thumbPath);

        // Ensure thumb dir exists
        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

        // If sharp available, create thumbnail if needed
        if (sharpLib) {
            let needCreate = true;
            try {
                if (fs.existsSync(thumbPath)) {
                    const tStat = fs.statSync(thumbPath);
                    const oStat = fs.statSync(target);
                    if (tStat.mtimeMs >= oStat.mtimeMs) needCreate = false;
                }
            } catch (e) { needCreate = true; }

            if (needCreate) {
                try {
                        await sharpLib(target)
                            .resize({ width: 200, height: 200, fit: 'inside', withoutEnlargement: true })
                        .toFile(thumbPath);
                } catch (e) {
                    console.error('[Thumb] failed to generate thumb for', target, e.message || e);
                    // fallback to original
                    return res.sendFile(target);
                }
            }

            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days
            return res.sendFile(thumbPath);
        }

        // sharp not available -> just serve original image
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        return res.sendFile(target);
    } catch (e) {
        console.error('[Thumb] error', e);
        res.status(500).send('Error');
    }
});


// 2. Auth - Passkey
// Code Verification Routes
app.get('/api/auth/code/generate', (req, res) => {
    // Simple mock auth check - in prod check session
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set('admin', { 
        code, 
        expires: Date.now() + 5 * 60 * 1000 
    });
    console.log('Generated code:', code);
    res.json({ code, expiresIn: 300 });
});

app.post('/api/auth/code/verify', (req, res) => {
    const { code } = req.body;
    const stored = verificationCodes.get('admin');
    
    if (!stored) return res.status(400).json({ success: false, message: 'No code active' });
    if (Date.now() > stored.expires) {
        verificationCodes.delete('admin');
        return res.status(400).json({ success: false, message: 'Code expired' });
    }
    
    if (stored.code === code) {
        verificationCodes.delete('admin');
        res.json({ success: true, token: 'session-valid' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid code' });
    }
});

app.post('/api/auth/passkey/register/options', async (req, res) => {
    const user = 'admin';
    const options = await generateRegistrationOptions({
        rpName: 'Chronicle Blog',
        rpID: RP_ID,
        userID: new Uint8Array(Buffer.from(user)),
        userName: user,
    });
    passkeyChallenges.set(user, options.challenge);
    res.json(options);
});

app.post('/api/auth/passkey/register/verify', async (req, res) => {
    try {
        const { response } = req.body;
        const user = 'admin';
        const expectedChallenge = passkeyChallenges.get(user);
        
        if (!expectedChallenge) return res.status(400).json({ error: 'No challenge' });

        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
        });

        if (verification.verified && verification.registrationInfo) {
            passkeyChallenges.delete(user);
            
            if (!fs.existsSync(SECURITY_FILE)) {
                const defaultHash = hashPassword('admin');
                fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash, devices: [] }));
            }
            
            const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
            if (!saved.devices) saved.devices = [];
            
            const { credential } = verification.registrationInfo;
            // 获取设备名和类型
            const deviceName = os.hostname();
            const ua = req.headers['user-agent'] || '';
            const deviceType = getDeviceTypeFromUA(ua);
            const dateStr = new Date().toLocaleDateString();
            
            // Format: "Device (Type, Date)" e.g. "MyMac (Mac, 2/12/2026)"
            let finalName = req.query.name || `${deviceName} (${deviceType}, ${dateStr})`;
            
            saved.devices.push({
                credentialID: credential.id,
                credentialPublicKey: Buffer.from(credential.publicKey).toString('base64url'),
                counter: credential.counter,
                transports: response.response.transports,
                name: finalName,
                createdAt: new Date().toISOString()
            });
            
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
            res.json({ verified: true });
        } else {
            res.status(400).json({ verified: false });
        }
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/auth/passkey/login/options', async (req, res) => {
    const user = 'admin';
    const options = await generateAuthenticationOptions({
            rpID: RP_ID,
            userVerification: 'preferred',
    });
    passkeyChallenges.set(user, options.challenge);
    res.json(options);
});

app.post('/api/auth/passkey/login/verify', async (req, res) => {
    try {
        const { response } = req.body;
        const user = 'admin';
        const expectedChallenge = passkeyChallenges.get(user);

        if (!fs.existsSync(SECURITY_FILE)) return res.status(400).send('No devices registered');
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const devices = saved.devices || [];
        
        const device = devices.find(d => d.credentialID === response.id);
        if (!device) return res.status(400).send('Device not found');

        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: expectedChallenge || '',
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
            credential: {
                id: device.credentialID,
                publicKey: new Uint8Array(Buffer.from(device.credentialPublicKey, 'base64url')),
                counter: device.counter,
                transports: device.transports,
            },
        });

        if (verification.verified) {
            passkeyChallenges.delete(user);
            device.counter = verification.authenticationInfo.newCounter;
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
            res.json({ verified: true, token: 'session-valid' });
        } else {
            res.status(400).json({ verified: false });
        }
    } catch(e) {
        console.error(e);
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/auth/passkeys', (req, res) => {
    try {
        if (!fs.existsSync(SECURITY_FILE)) return res.json([]);
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const devices = (saved.devices || []).map(d => ({
            id: d.credentialID,
            name: d.name || 'Unnamed Passkey',
            createdAt: d.createdAt || '',
            transports: d.transports
        }));
        res.json(devices);
    } catch(e) {
        res.status(500).json([]);
    }
});

app.delete('/api/auth/passkeys/:id', (req, res) => {
    try {
        const { id } = req.params;
        if (!fs.existsSync(SECURITY_FILE)) return res.status(404).send('No file');
        
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        if (!saved.devices) return res.status(404).send('Not found');
        
        const initialLen = saved.devices.length;
        saved.devices = saved.devices.filter(d => d.credentialID !== id);
        
        if (saved.devices.length === initialLen) {
            return res.status(404).send('Not found');
        }

        fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.patch('/api/auth/passkeys/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!fs.existsSync(SECURITY_FILE)) return res.status(404).send('No file');
        
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const device = (saved.devices || []).find(d => d.credentialID === id);
        
        if (!device) return res.status(404).send('Not found');
        
        device.name = name || device.name;
        fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});


// 3. Auth - Normal
app.post('/api/auth/login', (req, res) => {
    try {
        const { password } = req.body;
        
        if (!fs.existsSync(SECURITY_FILE)) {
            const defaultHash = hashPassword('admin');
            fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash }));
        }
        
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const attemptHash = hashPassword(password);
        
        if (saved.passwordHash === attemptHash) {
            if (saved.devices && saved.devices.length > 0) {
                res.json({ success: true, requirePasskey: true });
            } else {
                res.json({ success: true, token: 'session-valid' });
            }
        } else {
            res.status(401).json({ success: false, message: 'Invalid password' });
        }
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.post('/api/auth/change', (req, res) => {
    try {
        const { oldPassword, newPassword, token } = req.body;
        
        if (!fs.existsSync(SECURITY_FILE)) {
            const newHash = hashPassword(newPassword);
            fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: newHash }));
            return res.json({ success: true });
        }

        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const oldHash = hashPassword(oldPassword);

        if (saved.passwordHash === oldHash) {
            // Check 2FA if enabled
            if (saved.devices && saved.devices.length > 0) {
                if (token !== 'session-valid') {
                    return res.json({ success: false, requirePasskey: true });
                }
            }

            const newHash = hashPassword(newPassword);
            saved.passwordHash = newHash; // Keep devices
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Old password incorrect' });
        }
    } catch(e) {
        res.status(500).send('Error');
    }
});


// 4. Files API
app.get('/api/files', (req, res) => {
    const queryPath = req.query.path || '';

    if (queryPath === 'all') {
            let allFiles = [];
            CATEGORIES.forEach(cat => {
                const catDir = path.join(UPLOAD_DIR, cat);
                if (fs.existsSync(catDir)) {
                    try {
                        const files = fs.readdirSync(catDir, { withFileTypes: true })
                        .filter(d => !d.isDirectory())
                        .map(dirent => {
                            const relPath = `${cat}/${dirent.name}`;
                            const fullUrl = `${MEDIA_DOMAIN}/server/data/upload/${relPath}`;
                            // Construct thumb URL if likely an image (simple check via cat or ext)
                            // We use /thumb/ route which handles existence check or fallback
                                const thumbUrl = ['pic'].includes(cat)
                                    ? `${MEDIA_DOMAIN}/server/data/upload/.thumbs/${relPath}`
                                : undefined;
                                
                            return {
                                name: dirent.name,
                                type: 'file',
                                category: cat,
                                path: relPath,
                                url: fullUrl,
                                thumb: thumbUrl
                            };
                        });
                        allFiles = allFiles.concat(files);
                    } catch(e) {}
                }
            });
            return res.json(allFiles);
    }

    const targetDir = path.resolve(UPLOAD_DIR, queryPath.replace(/^\/+/, ''));
    if (!targetDir.startsWith(UPLOAD_DIR)) {
        return res.status(403).send('Forbidden');
    }
    if (!fs.existsSync(targetDir)) {
        return res.json([]);
    }

    try {
        const items = fs.readdirSync(targetDir, { withFileTypes: true }).map(dirent => {
            const rel = path.relative(UPLOAD_DIR, path.join(targetDir, dirent.name)).replace(/\\/g, '/');
            const isDir = dirent.isDirectory();
            const fullUrl = `${MEDIA_DOMAIN}/server/data/upload/${rel}`;
            
            // Determine thumb
            // If we are listing a specific path (e.g. 'pic'), we can infer category logic
            // Or just check extension
            let thumbUrl;
            if (!isDir) {
                const ext = path.extname(dirent.name).toLowerCase();
                if (['.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.bmp','.tiff'].includes(ext)) {
                         thumbUrl = `${MEDIA_DOMAIN}/server/data/upload/.thumbs/${rel}`;
                }
            }

            return {
                name: dirent.name,
                type: isDir ? 'directory' : 'file',
                path: rel,
                url: fullUrl,
                thumb: thumbUrl
            };
        });
        res.json(items);
    } catch (e) {
        res.status(500).send('Error listing files');
    }
});

// 5. Settings API - read/write a simple JSON file under server/data/settings.json

// ==========================================
// 💡 PUBLIC APIs (For Astro / Frontend)
// ==========================================

app.get('/api/public/settings', (req, res) => {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return res.json({});
        const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        // 🚨 SECURITY: Only return safe fields to the public frontend
        const safeSettings = {
            siteName: saved.siteName || 'Chronicle',
            authorName: saved.authorName || '',
            bio: saved.bio || '',
            avatar: saved.avatar || '',
            homeFeatures: saved.homeFeatures || [],
            friends: saved.friends || [],
            footerHtml: saved.footerHtml || '',
            appearance: saved.appearance || {}
        };
        res.json(safeSettings);
    } catch (e) {
        console.error('[Public Settings] GET error', e);
        res.status(500).json({});
    }
});

app.get('/api/public/posts', (req, res) => {
    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        let posts = JSON.parse(indexContent || '[]');
        
        // 🚨 SECURITY: Always filter only published posts
        posts = posts.filter(p => p.status === 'published');
        posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Support for pagination (useful for Infinite Scroll in Astro)
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        // Optionally filter by tag
        const tag = req.query.tag;
        if (tag) {
            posts = posts.filter(p => (p.tags || []).includes(tag));
        }

        const totalOptions = posts.length;
        const paginatedPosts = posts.slice(skip, skip + limit).map(p => {
             // Strip sensitive/unnecessary disk fields to minimize payload
             return {
                 id: p.id,
                 title: p.title,
                 date: p.date,
                 updatedAt: p.updatedAt,
                 summary: p.summary,
                 tags: p.tags || [],
                 font: p.font
             }
        });

        res.json({
            data: paginatedPosts,
            total: totalOptions,
            page,
            limit,
            hasMore: skip + limit < totalOptions
        });
    } catch(e) {
        res.status(500).json({ data: [], total: 0 });
    }
});

app.get('/api/public/post', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('Missing ID');

    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        const posts = JSON.parse(indexContent || '[]');
        const post = posts.find(p => p.id === id);

        // 🚨 SECURITY: Only allow published posts
        if (!post || post.status !== 'published') return res.status(404).send('Post not found');

        // Read compiled html & toc from disk
        const html = readCompiledHtmlFromDisk(post) || '';
        const toc = readTocFromDisk(post);

        // Return stripped safe payload
        res.json({ 
            id: post.id,
            title: post.title,
            date: post.date,
            updatedAt: post.updatedAt,
            tags: post.tags || [],
            font: post.font,
            html, 
            toc 
        });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.get('/api/public/search', (req, res) => {
    try {
        const keyword = (req.query.keyword || '').toLowerCase().trim();
        if (!keyword) return res.json([]);

        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        let posts = JSON.parse(indexContent || '[]');
        
        posts = posts.filter(p => p.status === 'published');
        
        const results = posts.filter(p => {
            return (p.title || '').toLowerCase().includes(keyword) || 
                   (p.summary || '').toLowerCase().includes(keyword) ||
                   (p.tags || []).some(t => t.toLowerCase().includes(keyword));
        }).map(p => ({
            id: p.id,
            title: p.title,
            summary: p.summary,
            date: p.date,
            tags: p.tags || []
        }));

        res.json(results);
    } catch(e) {
        res.status(500).json([]);
    }
});

// ==========================================
// 🔴 ADMIN APIs (For Vue CMS Dashboard)
// ==========================================

app.get('/api/settings', (req, res) => {
    try {
        // If mockStore enabled and settings provided, return mock settings
        if (typeof mockStore !== 'undefined' && mockStore.enabled && mockStore.settings) {
            return res.json(mockStore.settings);
        }

        if (!fs.existsSync(SETTINGS_FILE)) return res.json({});
        const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        res.json(saved);
    } catch (e) {
        console.error('[Settings] GET error', e);
        res.status(500).json({});
    }
});

app.post('/api/settings', (req, res) => {
    try {
        const body = req.body || {};
        let saved = {};
        if (fs.existsSync(SETTINGS_FILE)) {
            try { saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) } catch(e) { saved = {} }
        }
        // Merge incoming values
        saved = Object.assign({}, saved, body);
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(saved, null, 2));
        res.json(saved);
    } catch (e) {
        console.error('[Settings] POST error', e);
        res.status(500).send('Error');
    }
});

app.post('/api/folder', (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) throw new Error('Missing folderPath');
        
        const targetPath = path.resolve(UPLOAD_DIR, folderPath.replace(/^\/+/, ''));
        if (!targetPath.startsWith(UPLOAD_DIR)) return res.status(403).send('Forbidden');

        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.delete('/api/files', (req, res) => {
    const queryPath = req.query.path || '';
    const targetPath = path.resolve(UPLOAD_DIR, queryPath.replace(/^\/+/, ''));
    if (!targetPath.startsWith(UPLOAD_DIR)) return res.status(403).send('Forbidden');
    
    try {
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }

        // Also remove cached thumbnails for this path under .thumbs
        try {
            const rel = path.relative(UPLOAD_DIR, targetPath).replace(/\\/g, '/');
            const thumbTarget = path.join(UPLOAD_DIR, '.thumbs', rel);
            // Ensure thumbTarget is inside upload dir for safety
            if (thumbTarget.startsWith(UPLOAD_DIR) && fs.existsSync(thumbTarget)) {
                fs.rmSync(thumbTarget, { recursive: true, force: true });
            }

            // Trigger CDN refresh for both origin path and thumbs path (fire-and-forget)
            (async () => {
                try {
                    const relSafe = rel.replace(/^\/+/, '');
                    if (!relSafe) return;
                    const urls = [];
                    const originUrl = `${MEDIA_DOMAIN.replace(/\/$/, '')}/server/data/upload/${relSafe}`;
                    const thumbUrl = `${MEDIA_DOMAIN.replace(/\/$/, '')}/server/data/upload/.thumbs/${relSafe}`;
                    urls.push(originUrl);
                    urls.push(thumbUrl);
                    // Also add wildcard variants to try to purge directories
                    urls.push(originUrl + '*');
                    urls.push(thumbUrl + '*');

                    console.log('[Delete] Triggering CDN purge for', urls);
                    await aliyunCdnRefresh(urls);
                } catch (e) {
                    console.error('[Delete] CDN purge failed', e);
                }
            })();
        } catch (e) {
            console.error('[Delete] Failed to remove thumbs for', targetPath, e);
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.post('/api/upload', (req, res) => {
    // Ensure access capability
    ensureDevSymlink();

    const filename = req.headers['x-filename'];
    let category = req.headers['x-category'] || '';
    
    if (!filename) return res.status(400).send('Missing filename');
    
    const decodedName = decodeURIComponent(filename);
    const ext = path.extname(decodedName).toLowerCase();

    // Auto-classify
    if (!category || !CATEGORIES.includes(category)) {
        if (['.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.bmp','.tiff'].includes(ext)) category = 'pic';
        else if (['.mp3','.wav','.ogg','.m4a','.flac','.aac'].includes(ext)) category = 'sound';
        else if (['.mp4','.webm','.avi','.mov','.mkv','.wmv'].includes(ext)) category = 'video';
        else if (['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.odt','.ods','.odp','.rtf'].includes(ext)) category = 'doc';
        else if (['.txt','.md','.js','.ts','.html','.css','.json','.py','.java','.c','.cpp','.h','.vue','.xml','.yaml','.yml','.ini','.conf','.sh','.bat','.log','.csv','.rs','.go','.php','.rb','.pl','.swift','.kt','.sql','.r','.m','.make','.dockerfile'].includes(ext)) category = 'txt';
        else category = 'other';
    }

    const categoryDir = path.join(UPLOAD_DIR, category);
    if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

    const cleanName = decodedName.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const randomName = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${cleanName}`;
    const filePath = path.join(categoryDir, randomName);
    
    const writeStream = fs.createWriteStream(filePath);
    req.pipe(writeStream);

    writeStream.on('finish', async () => {
        const webPath = `/server/data/upload/${category}/${randomName}`;
        const fullUrl = `${MEDIA_DOMAIN}${webPath}`;
        
        let thumbUrl = '';
        
        // Thumbnail generation & Pre-warm logic
            try {
                // 1. Generate thumbnail immediately if it's an image and sharp is available
                if (sharpLib && ['pic'].includes(category)) {
                     const thumbRel = `/${category}/${randomName}`;
                     const thumbBase = path.join(UPLOAD_DIR, '.thumbs');
                     const thumbPath = path.join(thumbBase, thumbRel);
                     const thumbDir = path.dirname(thumbPath);
                     
                     if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
                     
                     try {
                         await sharpLib(filePath)
                             .resize({ width: 200, height: 200, fit: 'inside', withoutEnlargement: true })
                             .toFile(thumbPath);
                         thumbUrl = `${MEDIA_DOMAIN}/server/data/upload/.thumbs${thumbRel}`;
                     } catch (err) {
                         console.error('[Upload] Thumb generation failed:', err.message);
                     }
                }

            // 2. Pre-warm CDN (Async)
            // Trigger GET requests to the CDN URLs so it pulls from origin immediately
            // We do not await this to avoid blocking the response significantly, 
            // but a small delay might be fine to ensure origin is ready.
            const warmUrls = [fullUrl];
            if (thumbUrl) warmUrls.push(thumbUrl);

            // Fire and forget pre-warm
            (async () => {
                try {
                    console.log('[Pre-warm] Triggering fetch for:', warmUrls);
                    const results = await Promise.allSettled(warmUrls.map(u => fetch(u, { method: 'HEAD', timeout: 5000 })));
                    results.forEach((r, i) => {
                         if (r.status === 'rejected') console.error(`[Pre-warm] Failed ${warmUrls[i]}:`, r.reason);
                         else console.log(`[Pre-warm] Success ${warmUrls[i]}`);
                    });
                } catch (e) { console.error('[Pre-warm] error', e); }
            })();

        } catch (e) {
            console.error('[Upload] Post-process error', e);
        }

        res.json({ url: fullUrl, path: webPath, category, thumb: thumbUrl });
    });
    writeStream.on('error', (err) => {
        console.error(err);
        res.status(500).send('Upload failed');
    });
});


// 5. Blog Posts API

app.get('/api/posts', (req, res) => {
    try {
        const timelineParam = String(req.query.timeline || '').toLowerCase();
        const timelineDesc = timelineParam === '' || timelineParam === '1' || timelineParam === 'true' || timelineParam === 'desc' || timelineParam === 'newest';
        const featuredOnly = req.query.featured === 'true';

        // If mockStore is enabled and posts are provided, use them directly
        if (typeof mockStore !== 'undefined' && mockStore.enabled && Array.isArray(mockStore.posts)) {
            let posts = mockStore.posts.map((p) => ({ ...p }));
            
            // Filter featured posts if requested
            if (featuredOnly) {
                posts = posts.filter(post => 
                    Array.isArray(post.tags) && 
                    (post.tags.includes('featured') || post.tags.includes('精选'))
                );
            }
            
            // apply simple pagination if requested
            const pageParam = req.query.page !== undefined ? parseInt(String(req.query.page), 10) : NaN;
            const perPageParam = req.query.perPage !== undefined ? parseInt(String(req.query.perPage), 10) : NaN;
            if (timelineDesc) {
                posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            }
            if (!Number.isNaN(pageParam) || !Number.isNaN(perPageParam)) {
                const page = Number.isNaN(pageParam) ? 1 : Math.max(1, pageParam);
                const perPage = Number.isNaN(perPageParam) ? 10 : Math.max(1, perPageParam);
                const total = posts.length;
                const start = (page - 1) * perPage;
                const end = start + perPage;
                const pagePosts = posts.slice(start, end);
                return res.json({ posts: pagePosts, total, page, perPage });
            }
            return res.json(posts);
        }
        // Reload strictly to get fresh data
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        let posts = JSON.parse(indexContent || '[]');

        const hasTitleParam = Object.prototype.hasOwnProperty.call(req.query, 'title');
        const hasTagsParam = Object.prototype.hasOwnProperty.call(req.query, 'tags');
        const hasSearchParams = hasTitleParam || hasTagsParam;

        const titleQuery = String(req.query.title || '').trim().toLowerCase();
        const rawTags = req.query.tags;
        const tagQueryList = Array.isArray(rawTags)
            ? rawTags
            : typeof rawTags === 'string'
                ? rawTags.split(',')
                : [];
        const normalizedTags = tagQueryList
            .map(t => String(t).trim())
            .filter(Boolean);
        
        const includeDrafts = req.query.includeDrafts === 'true';
        if (!includeDrafts) {
            posts = posts.filter(p => p.status === 'published' || p.status === 'modifying' || !p.status);
        }

        // Filter featured posts if requested
        if (featuredOnly) {
            posts = posts.filter(post => 
                Array.isArray(post.tags) && 
                (post.tags.includes('featured') || post.tags.includes('精选'))
            );
        }

        // Search mode: if query includes title/tags, enforce filtered results.
        // Empty title + empty tags should return empty results.
        if (hasSearchParams) {
            if (!titleQuery && normalizedTags.length === 0) {
                return res.json([]);
            }

            posts = posts.filter(post => {
                const postTitle = String(post.title || '').toLowerCase();
                const postTags = Array.isArray(post.tags) ? post.tags : [];

                const matchesTitle = !titleQuery || postTitle.includes(titleQuery);
                const matchesTags = normalizedTags.length === 0 || normalizedTags.every(tag => postTags.includes(tag));
                return matchesTitle && matchesTags;
            });
        }

        // Augment posts with hasHtml flag based on disk state
        posts = posts.map(p => {
            const html = readCompiledHtmlFromDisk(p)
            const hasHtml = !!(html && html.length > 0)
            // ensure dir field when possible
            if (!p.dir) p.dir = p.filename ? p.filename.replace(/\.md$/, '') : p.id
            return { ...p, hasHtml }
        })

        if (timelineDesc) {
            posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }

        // Pagination support: if `page` or `perPage` query provided, return a paged response
        const pageParam = req.query.page !== undefined ? parseInt(String(req.query.page), 10) : NaN;
        const perPageParam = req.query.perPage !== undefined ? parseInt(String(req.query.perPage), 10) : NaN;
        if (!Number.isNaN(pageParam) || !Number.isNaN(perPageParam)) {
            const page = Number.isNaN(pageParam) ? 1 : Math.max(1, pageParam);
            const perPage = Number.isNaN(perPageParam) ? 10 : Math.max(1, perPageParam);
            const total = posts.length;
            const start = (page - 1) * perPage;
            const end = start + perPage;
            const pagePosts = posts.slice(start, end);
            return res.json({ posts: pagePosts, total, page, perPage });
        }

        res.json(posts);
    } catch(e) {
        res.status(500).send('[]');
    }
});

app.get('/api/post', (req, res) => {
    const { id, mode } = req.query;
    if (!id) return res.status(400).send('Missing ID');

    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        const posts = JSON.parse(indexContent || '[]');
        const post = posts.find(p => p.id === id);

        if (!post) return res.status(404).send('Post not found');

        // legacy filename handling removed: content is read from per-post dir via helpers

        // Read content from per-post directory or legacy filename
        const content = readPostContentFromDisk(post)

        // Read compiled html & toc from disk if available (validate id)
        const html = readCompiledHtmlFromDisk(post) || ''
        const toc = readTocFromDisk(post)
        const hasHtml = !!(html && html.length > 0)

        // If mode=edit and there's a draft file, prefer draft content for editing
        if (mode === 'edit') {
            const dir = getPostDir(post)
            const draftPath = path.join(dir, `${post.id}-draft.md`)
            if (fs.existsSync(draftPath)) {
                let raw = fs.readFileSync(draftPath, 'utf-8')
                try { raw = decrypt(raw) } catch(e) {}
                const { body } = parseFrontMatter(raw)
                // override content
                // Note: do not promote draft to published unless saved as such
                // return draft as content for editor
                return res.json({ ...post, content: body, html, hasHtml, toc })
            }
        }

        res.json({ ...post, content, html, hasHtml, toc });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.post('/api/restore', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('Missing ID');
    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        const posts = JSON.parse(indexContent || '[]');
        const post = posts.find(p => p.id === id);

        if (post && post.status === 'modifying') {
            const dir = getPostDir(post)
            const draftPath = path.join(dir, `${id}-draft.md`)
            if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath)
            // remove legacy draftFilename field if present
            if (post.draftFilename) delete post.draftFilename
            post.status = 'published'
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.post('/api/post', (req, res) => {
    try {
        const data = req.body;
        if (!data.title) return res.status(400).send('Missing title');

        let posts = [];
        try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch(e){}

        let post;
        const now = new Date().toISOString();
        const content = data.content;
        const status = data.status;

        if (data.id) {
            post = posts.find(p => p.id === data.id);
            if (post) {
                post.title = data.title || post.title;
                if (content !== undefined) {
                    post.summary = content.slice(0, 200).replace(/[#*`\[\]]/g, '');
                }

                // For directory-based storage, manage draft files instead of draftFilename
                if (status === 'modifying') {
                    post.status = 'modifying';
                } else if (status === 'published') {
                    // Remove any draft file named <id>-draft.md if promoting to published
                    const dir = getPostDir(post)
                    const draftPath = path.join(dir, `${post.id}-draft.md`)
                    if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath)
                    post.status = 'published';
                } else if (status) {
                    post.status = status;
                }
                if (data.tags) post.tags = sortTags(data.tags || []);
                if (data.font) post.font = data.font;
                post.updatedAt = now;
                // Ensure post.dir exists for new/legacy posts
                if (!post.dir) post.dir = post.id
            }
        }

        if (!post) {
            const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
            const filename = `${id}.md`;
            post = {
                id,
                title: data.title,
                date: now,
                updatedAt: now,
                filename,
                dir: id,
                summary: (content || '').slice(0, 200).replace(/[#*`\[\]]/g, ''),
                tags: sortTags(data.tags || []),
                font: data.font || 'sans',
                status: status || 'draft'
            };
            posts.push(post);
            data.id = id;
        }

        if (content !== undefined || !data.id) {
            // Write content to per-post directory (draft or content)
            try {
                if (post.status === 'modifying') {
                    writePostContentToDisk(post, content || '', { draft: true })
                } else {
                    writePostContentToDisk(post, content || '', { draft: false })
                }
            } catch (e) {
                console.error('[Post] Failed to write content to disk', e)
            }
        } else {
             // If content wasn't sent but metadata was updated, we should update the file metadata too.
             // But reading, decrypting, updating FM, encrypting, saving is expensive.
             // Given BlogEditor always sends content, we might skip this edge case or handle it.
             // For robustness (user request: "ensure... linking"), allow metadata-only update to file:
             // metadata-only update: update front matter in existing content.md (or legacy file)
             const dir = getPostDir(post)
             const candidate1 = path.join(dir, `${post.id}-content.md`)
             const candidate2 = path.join(dir, `${post.id}-draft.md`)
             const existingPath = fs.existsSync(candidate1) ? candidate1 : (fs.existsSync(candidate2) ? candidate2 : (post.filename ? path.join(POSTS_DIR, post.filename) : null))
             if (existingPath && fs.existsSync(existingPath)) {
                 try {
                     const raw = fs.readFileSync(existingPath, 'utf-8');
                     let currentContent = raw;
                     try { currentContent = decrypt(raw); } catch(e){}
                     const { body } = parseFrontMatter(currentContent);
                     const newContent = stringifyFrontMatter({
                        title: post.title,
                        date: post.date,
                        updatedAt: post.updatedAt,
                        tags: post.tags || [],
                        font: post.font || 'sans'
                    }, body);
                    fs.writeFileSync(existingPath, encrypt(newContent));
                } catch(e) { console.error('Failed to update file metadata', e); }
             }
        }

        // If frontend sent compiledHtml (static HTML) or html, sanitize and store it on disk
        if (data.compiledHtml || data.html) {
            try {
                const sanitized = sanitizeHtml(data.compiledHtml || data.html);
                post.html = sanitized; // keep in index for quick access
                writeCompiledHtmlToDisk(post, sanitized);
            } catch (e) {
                post.html = '';
            }
        }

        // Save toc if provided
        if (data.toc) {
            try { writeTocToDisk(post, data.toc) } catch(e) { }
        }

        fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true, id: post.id });
    } catch(e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

app.delete('/api/post', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('ID required');

    try {
        let posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]');
        const post = posts.find(p => p.id === id);
        if (post) {
            // Remove per-post directory if exists, otherwise remove legacy file
            const dir = getPostDir(post)
            if (fs.existsSync(dir)) {
                try { fs.rmSync(dir, { recursive: true, force: true }) } catch(e) { console.error('[Delete] remove dir failed', e) }
            } else if (post.filename) {
                const mdPath = path.join(POSTS_DIR, post.filename);
                if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
            }
            posts = posts.filter(p => p.id !== id);
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.post('/api/scan', (req, res) => {
    try {
        let posts = [];
        try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch(e){}
        // Scan POSTS_DIR for per-post directories and legacy .md files
        const entries = fs.readdirSync(POSTS_DIR, { withFileTypes: true });
        const dirPosts = [];
        const legacyFiles = [];
        entries.forEach(e => {
            if (e.isDirectory()) {
                dirPosts.push(e.name)
            } else if (e.isFile() && e.name.endsWith('.md')) {
                legacyFiles.push(e.name)
            }
        })

        const originalCount = posts.length;

        // Keep posts that still exist (either dir or legacy file)
        posts = posts.filter(p => {
            const dirName = p.dir || (p.filename ? p.filename.replace(/\.md$/, '') : p.id)
            return dirPosts.includes(dirName) || legacyFiles.includes(p.filename)
        })

        // Find orphaned legacy files and recover them
        const indexedFiles = new Set(posts.map(p => p.filename).filter(Boolean));
        const orphans = legacyFiles.filter(f => !indexedFiles.has(f));

        let recoveredCount = 0;
        orphans.forEach(filename => {
            try {
                const raw = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf-8');
                let content = raw;
                try { content = decrypt(raw); } catch(e) {}
                const stats = fs.statSync(path.join(POSTS_DIR, filename));
                const id = filename.replace('.md', '');

                posts.push({
                    id,
                    title: `Recovered: ${id}`,
                    date: stats.birthtime || new Date(),
                    filename,
                    dir: id,
                    summary: content.slice(0, 100).replace(/[#*`\[\]]/g, ''),
                    tags: ['recovered'],
                    status: 'draft'
                });
                recoveredCount++;
            } catch(e){}
        });

        if (posts.length !== originalCount || recoveredCount > 0) {
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        }

        res.json({ 
            success: true, 
            removed: originalCount - posts.length + recoveredCount, 
            recovered: recoveredCount 
        });
    } catch(e) {
        res.status(500).send('Scan failed');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

function getDeviceTypeFromUA(ua) {
    if (!ua) return 'Unknown';
    ua = ua.toLowerCase();
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('cros')) return 'ChromeOS';
    return 'Other';
}

// Very small sanitizer for compiled HTML saved from clients.
// This is NOT a replacement for a proper HTML sanitizer like DOMPurify on the server side,
// but helps prevent obvious script injections saved into index.json.
function sanitizeHtml(html) {
    if (!html) return '';
    try {
        // Remove <script>...</script>
        let s = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        // Remove javascript: URIs
        s = s.replace(/href\s*=\s*["']?javascript:[^"'>\s]*/gi, '');
        s = s.replace(/src\s*=\s*["']?javascript:[^"'>\s]*/gi, '');
        // Strip on* event handlers e.g. onclick, onerror
        s = s.replace(/\son[a-z]+\s*=\s*(?:\"[^\"]*\"|\'[^\']*\'|[^\s>]+)/gi, '');
        return s;
    } catch (e) {
        return '';
    }
}