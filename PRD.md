# Chronicle — 产品需求文档 (PRD)

版本：1.0

最后更新：2026-05-23

<p style="color: #f00">引用：项目源代码与说明位于仓库根目录，关键文件：[README.md](README.md)、[package.json](package.json)、[server/index.js](server/index.js)。</p>

---

## 一、项目概述

- 项目名称：Chronicle
<!-- UPDATED: 根据最新设计更新产品定位为 CMS + SSG 一体化解决方案 -->
- 简要描述：面向博客、文档站、企业官网的内容管理（CMS）+ 静态站点生成（SSG）一体化解决方案，包含内容管理、静态前端、流量统计、媒体上传与基本安全认证（WebAuthn）。
- 主要技术栈证据：后端基于 Express（见 `server/index.js`），前端使用 Astro/Vite（见 `astro-template/` 和 `chronicle-frontend/`），依赖包括 `katex`、`@simplewebauthn/*`（见 `package.json`）。

## 二、目标与成功标准

<!-- UPDATED: 根据最新设计补充五种部署模式的统一目标 -->
- 目标：为博主、文档站团队与企业官网提供统一的内容管理与静态站点生成能力，覆盖五种部署模式；优先通过 GA4 获取流量数据，失败时回退到本地日志统计。
- 成功标准：
  - 管理端能安全创建/编辑/发布文章并触发静态构建或使前端可读到最新内容；
  - 五种部署模式均能在对应责任边界内完成内容创建、构建、交付与访问；
  - `/api/traffic` 在配置 GA 时返回 GA4 数据，配置缺失时返回本地日志统计；
  - 媒体上传可用，文件写入 `server/data/upload` 并能在页面正常展示；
  - 支持 WebAuthn 注册/登录完成管理权限控制；
  - 日志（访问/错误）写入 `log/` 并可供运维审计。

## 三、目标用户

- 个人博主：需要快速发布、漂亮渲染（公式、代码高亮）的文章并部署静态站点。
- 小型团队或站点管理员：管理多篇文章、集合，查看访问统计与进行运维部署。
- 技术运维：需要可配置的部署路径与脚本，以及日志审计支持。

### 3.1 部署模式说明

<!-- ADDED: 根据最新设计补充五种部署模式说明 -->
Chronicle 以同一套内容模型、编辑体验和发布流程，提供五种面向不同场景的部署模式。模式差异主要体现在数据是否出域、构建能力由谁负责、以及用户需要承担多少运维工作。

- 隐私模式：CMS 与 SSG 均运行在用户自有服务器，官方不接触任何业务数据。适合对数据边界、合规要求和内部审计要求都较高的企业。
- SSG托管模式：CMS 运行在用户本地或自有环境，官方提供云端构建服务完成静态生成，构建产物再回传到用户服务器。适合希望保留内容控制权，同时减少构建运维负担的团队。
- CMS托管模式：官方提供云端 CMS，SSG 运行在用户自有服务器或私有环境中。适合需要统一内容管理入口，但希望将站点生成留在自有基础设施中的团队。
- 打包模式：官方提供完整软件包，用户可将 CMS、SSG 和数据库全部私有化部署。适合需要长期私有部署、可控升级节奏和内部系统集成的组织。
- 全托管模式：CMS、SSG 与托管能力均由官方云端提供，用户几乎无需运维即可上线。适合追求最快上线和最少维护成本的个人、团队与企业。

五种模式共享同一产品主线，用户可以按业务阶段从低运维方案平滑迁移到更高控制力的方案，而不需要改变内容资产与核心工作流。

## 四、关键功能（详细）

1. 内容管理（CMS）
   - 功能：文章的创建/编辑/删除/发布、集合管理（Collection）、标签管理、草稿/发布状态。
   - 存储位置：`server/data/posts/` 与 `server/data/collection.json`。
   - 约束：文章应包含 `id, title, slug, content, tags[], featured, publishedAt, author, attachments[]`。

2. 静态前端与渲染
   - 功能：静态站点由 `astro-template` / `chronicle-frontend` 生成，支持 KaTeX 渲染数学公式、代码高亮、媒体懒加载与目录（TOC）。
   - 证据：`katex` 依赖、前端组件 `FloatingToc.vue`, `FilePreviewModal.vue` 等。

3. 流量统计
   - 功能：优先调用 GA4（`BetaAnalyticsDataClient`）获取流量时间序列；若 GA 配置缺失或 API 请求失败，回退到本地访问日志统计。
   - API：`GET /api/traffic?range=`（范围别名支持 `30min`, `12h`, `1d`, `7d`, `30d` 等）。
   - 配置来源：`server/data/settings.json` 或环境变量 `GA_SERVICE_ACCOUNT_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`。

4. 上传与媒体管理
   - 功能：文件上传接口，支持图片/音频/视频/文档分类；上传文件写入 `server/data/upload`，并在文章中以 URL 引用。
   - 分类：`pic, sound, txt, video, doc, other`（见 `server/index.js` 常量 `CATEGORIES`）。

5. 认证与授权
   - 功能：WebAuthn 注册与登录（`generateRegistrationOptions`, `verifyRegistrationResponse` 等），管理 API 需鉴权。
   - 额外：支持 `X-Chronicle-Auth` 与 `Authorization` 等头部；CORS 白名单限定可访问域名。

6. 构建与部署
   - 功能：提供构建配置（`settings.json`），并包含部署脚本（`chronicle-deploy.sh`, `start.sh`, `stop.sh` 等）以将静态产物部署到指定目录。
   - 说明：根据最新设计，构建与部署能力需要同时支持隐私模式、SSG托管模式、CMS托管模式、打包模式和全托管模式；不同模式下，构建责任、数据边界与交付位置不同，但内容发布流程保持一致。
   - 可配置项：`frontendUrl`, `frontendCodeDir`, `frontendBuildTargetDir`。

7. 日志与监控
   - 功能：访问日志写入 `log/access.log`（由 `morgan` 产出），错误写入 `log/error.log`（后端有错误写入代码路径）。

### 4.1 商业模式与定价策略

<!-- ADDED: 根据最新设计补充商业模式与定价策略 -->
Chronicle 的商业模式以“先覆盖低门槛入口，再提供按需升级能力”为原则设计，兼顾用户试用、团队扩张与企业私有化需求。

- 免费入口：
  - 隐私模式基础版：作为高隐私场景的免费入口，帮助用户先完成私有化体验与内容迁移验证。
  - 打包模式社区版：作为全私有化部署的免费入口，面向愿意自行承担部署与维护的用户。
  - CMS托管模式（个人/免费版）：注册账号即用，适合有一定技术基础的体验用户，功能有限。
- 收费模式：
  - SSG托管模式：采用订阅制，并可叠加按构建次数计费，适合构建频率与流量变化较大的站点。
  - CMS托管模式（专业/企业版）：采用订阅制，并按存储容量与成员数扩展，适合内容协作频繁的团队。
  - 打包模式（企业版）：采用一次性授权 + 年维护费，适合重视长期私有部署和可控升级的客户。
  - 全托管模式：采用套餐订阅，按个人/团队/企业分层，面向希望零运维上线的用户。
- 定价原则：
  - 低门槛入口负责获取试用与口碑，高价值能力通过托管、容量、构建和服务等级实现差异化收费。
  - 同一客户可按阶段升级模式，避免因业务增长导致系统重建。

## 五、用户旅程与用例

### 5.1 模式选择指南

<!-- ADDED: 根据最新设计补充模式选择指南 -->
用户可按“数据隐私要求、自有服务器配置、运维能力”三项核心维度选择模式，优先满足最严格的约束，再兼顾成本与效率。

| 维度 | 适合优先选择的模式 | 说明 |
| --- | --- | --- |
| 数据隐私要求高 | 隐私模式、打包模式 | 数据不出自有环境，适合对合规、审计和数据边界要求严格的场景。 |
| 数据隐私要求中 | SSG托管模式、CMS托管模式 | 允许部分能力由官方托管，在控制权与效率之间取得平衡。 |
| 数据隐私要求低 | 全托管模式 | 适合更重视上线速度和省心体验的场景。 |
| 自有服务器配置强 | 隐私模式、SSG托管模式、打包模式 | 具备独立部署条件，可优先选择更高控制力的方案。 |
| 自有服务器配置弱 | CMS托管模式、全托管模式 | 减少自建基础设施压力，优先使用官方托管能力。 |
| 运维能力高 | 隐私模式、打包模式 | 适合能够承担版本升级、环境管理与故障排查的团队。 |
| 运维能力中 | SSG托管模式、CMS托管模式 | 适合将部分复杂度交给官方，但仍保留关键控制点的团队。 |
| 运维能力低 | 全托管模式 | 适合希望直接使用而不承担系统运维的用户。 |

推荐决策顺序：先判断是否必须做到“官方不接触数据”；若必须，则优先选择隐私模式或打包模式；若可以接受部分托管，则根据自有服务器与运维能力在 SSG托管模式、CMS托管模式与全托管模式之间选择。

- 用例 1：发布文章（管理员）
  1. 管理员通过 WebAuthn 登录。
  2. 在管理界面撰写或上传文章，上传媒体文件（可选）。
  3. 保存并发布：后端在 `server/data/posts` 更新，必要时触发静态构建。
  4. 前端站点显示新文章，索引文件（`index.json`）更新。

- 用例 2：查看流量数据（管理员）
  1. 管理员请求 `/api/traffic?range=7d`。
  2. 服务优先尝试调用 GA4；若失败，解析 `log/access.log` 生成统计结果返回。

- 用例 3：上传媒体并在文章中引用
  1. 管理界面或 API 上传文件（`X-Filename` 可用），服务保存到 `server/data/upload` 并返回路径。
  2. 前端在文章中使用该路径进行懒加载或直接展示。

## 六、API 规范（概要）

- `GET /api/traffic?range=<range>`
  - 描述：返回流量时间序列与聚合数据。
  - 成功响应：{ success: true, data: { slots: [...], totals: {...} } }

- `POST /api/upload`
  - 描述：上传文件（支持 `multipart/form-data` 或原始 body），允许 `X-Filename`。
  - 权限：需要鉴权（管理员）。

- 内容管理相关（CRUD，均需鉴权）
  - `GET /api/posts`、`GET /api/posts/:id`、`POST /api/posts`、`PUT /api/posts/:id`、`DELETE /api/posts/:id`

- WebAuthn 路由（示例）
  - `POST /webauthn/register/options` -> `generateRegistrationOptions`
  - `POST /webauthn/register/verify` -> `verifyRegistrationResponse`
  - `POST /webauthn/auth/options` -> `generateAuthenticationOptions`
  - `POST /webauthn/auth/verify` -> `verifyAuthenticationResponse`

（备注：以上路径为建议/存在实现的抽象，实际路由名请以代码为准。）

## 七、数据模型（建议）

- Article
  - id: string
  - title: string
  - slug: string
  - content: string (Markdown/HTML)
  - excerpt: string
  - tags: string[]
  - featured: boolean
  - publishedAt: ISO8601
  - author: { id, name }
  - attachments: [{ path, type }]

- Collection
  - id, title, description, posts: string[]

- Settings
  - frontendUrl, gaPropertyId, frontendCodeDir, frontendBuildTargetDir, managerDomain, deploymentMode, billingPlan, hostingScope

- Security
  - users[], roles[], webauthn_credentials[]

## 八、非功能需求

- 可部署性：在 Linux 主机上通过 Node.js 运行；静态构建使用 Astro/Vite 输出。
- 可维护性：配置优先读取 `server/data/settings.json`，敏感凭证通过环境变量注入。
- 可扩展性：静态前端与后端分离，易于替换前端框架或独立扩展 API。
- 性能：静态资源优先；流量统计以 GA 为主以降低本地 IO 负载。
<!-- UPDATED: 根据最新设计补充多模式下的可部署性要求 -->
- 多模式适配：同一套产品能力应能支持自有服务器、官方托管与混合部署，且不破坏统一的内容资产管理体验。

## 九、安全与隐私

- 身份验证：使用 WebAuthn 增强管理端安全。
- CORS：后端维护白名单（`server/index.js` 中 `allowedOrigins`）。
- 凭证管理：GA 服务账号 JSON 及其他敏感数据应通过环境变量或外部密钥管理，不纳入仓库。
- 上传限制：建议在 API 层校验文件类型、大小与扫描已知危险类型。

## 十、验收标准（可测试）

1. 功能性
  - 管理端创建并发布文章，前端站点可正确呈现。
  - `/api/traffic` 在提供 GA 凭证时返回 GA 数据，否则返回本地解析数据。
  - 媒体上传后可在文章页面加载。
  - 五种部署模式均可按各自责任边界完成内容创建、构建、交付与访问。

2. 安全
  - 未鉴权请求被拒绝或受限；CORS 仅允许白名单域。

3. 运维
  - 构建脚本能生成静态文件并部署到 `frontendBuildTargetDir`（配置项）。
  - 模式切换后，内容数据、权限体系和发布结果保持一致，不需要重建业务内容。

## 十一、Roadmap 建议

- 短期（1-2 周）
  - 补充完整 API 文档并提供示例请求/响应。
  - 编写流量回退的集成测试以验证在无 GA 情形下的表现。

- 中期（1-3 月）
  - 增强 RBAC 支持并完善 UI 的角色管理。
  - 引入全文索引/搜索（如 Lunr/Elastic/Lucene）以改进检索体验。

- 长期
  - 多站点/多域名托管支持、外部登录（OAuth）整合、可视化流量仪表盘。

## 十二、待办 / 建议任务列表

- 将 PRD 保存为仓库文件（已完成）。
- 为关键 API 增添自动化测试。
- 在管理界面添加“重建索引”和“触发构建”按钮并记录构建历史。

---

维护者备注：如需我将此 PRD 自动提交为分支并创建 PR，请授权我执行提交步骤，我可以：

- 创建与当前 PRD 日期一致的分支并添加 `PRD.md`；
- 运行 `git add || commit || push` 并发起 Pull Request（需要你授权在此仓库进行提交）。

参考文件： [README.md](README.md)、[server/index.js](server/index.js)、[package.json](package.json)
