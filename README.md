# Chronicle

一个现代化的博客内容管理系统，支持 Markdown 编辑、多语言、主题定制等功能。

## 项目简介

Chronicle 是一个功能完整的博客系统，采用前后端分离架构：

- **后端**: Node.js + Express，提供文章管理、文件上传、用户认证等 API
- **前端**: Vue 3 + Astro，提供响应式管理界面和静态站点生成
- **特性**:
  - Markdown 实时预览编辑
  - 支持草稿、已发布、修改中等状态
  - WebAuthn 双因素认证
  - 多语言支持（中文/英文）
  - 自定义主题和字体
  - 文章合集管理
  - 流量统计（支持 Google Analytics 4）
  - 自动构建前端站点

## 项目结构

```
Chronicle/
chronicle-blog/
├── backend/                    # 后端服务 (原 server/)
│   ├── src/
│   │   └── index.js           # Express 主入口
│   ├── data/                  # 数据存储目录
│   │   ├── posts/             # 文章数据
│   │   ├── upload/            # 上传文件
│   │   └── settings.json      # 配置文件
│   └── logs/                  # 日志文件 (原 log/)
│
├── admin/                     # 管理后台 (原 chronicle-frontend/)
│   ├── src/
│   │   ├── components/        # Vue 组件
│   │   ├── pages/             # 页面
│   │   ├── utils/             # 工具函数
│   │   └── locales/           # 国际化文件
│   ├── dist/                  # 构建产物
│   └── package.json
│
└── frontend/                  # 前台站点 (原 astro-template/)
    ├── src/
    │   ├── pages/             # 页面路由
    │   ├── components/        # 组件
    │   └── themes/            # 主题
    ├── dist/                  # 构建产物
    └── package.json
```


## 部署方法

### 前置要求

- Node.js >= 18
- npm 或 yarn
- PM2
- crontab（可选，用于定时构建）
- 服务器及配置好的 **2个** 域名

### 1. 克隆本仓库

建议部署位置：`/opt`

```bash
cd /opt
git clone https://github.com/vanvanhasnophi/Chronicle.git
```

### 2. 配置nginx

1. 安装nginx，步骤参考：https://nginx.org/en/docs/install.html

2. 在site-available创建文件`chronicle`

    最小配置：
    ```nginx
    server {
        listen 80;
        server_name front-domain.com;

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

            
        # HSTS
        add_header Strict-Transport-Security "max-age=63072000" always;

        root /var/www/front-domain.com/;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }

        location /api/ {
            proxy_pass http://localhost:3000/api/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        location /server/ {
            proxy_pass http://localhost:3000/server/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }

    server {
        listen 80;
        server_name back-domain.com;

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

            
        # HSTS
        add_header Strict-Transport-Security "max-age=63072000" always;

        root /var/www/back-domain.com/;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }

        location /api/ {
            proxy_pass http://localhost:3000/api/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        location /server/ {
            proxy_pass http://localhost:3000/server/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

    如果想要使用https，请参考：https://letsencrypt.org/zh-cn/getting-started/

3. 建立软链接
    ```bash
    ln -s /etc/nginx/sites-available/chronicle /etc/nginx/sites-enabled/
    ```


### 3. 自动部署

```bash
chmod +x ./chronicle-deploy.sh
./chronicle-deploy.sh
```

** 需要填入的配置 **
|序号|键名|功能|示例
|---|---|---|---|
1|FRONTEND_DOMAIN|前台域名|`front-domain.com`
2|BACKEND_DOMAIN|后台管理域名|`back-domain.com`
3|WEB_ROOT|前台静态文件根目录|`/var/www/front-domain.com`
4|BACKEND_ROOT|管理后台静态文件根目录|`/var/www/back-domain.com`
5|SERVER_ROOT|API 服务端目录|`opt/Chronicle/server`
6|ASTRO_ROOT|前台站点目录|`opt/Chronicle/astro-template`
7|MEDIA_DOMAIN|CDN媒体域名（若不配置，则填入前台域名）|`file.domain.com`
8|FRONTEND_API_BASE_URL|API 基准 URL（建议填入包含协议的前台域名）|`http://front-domain.com`
9|ASTRO_API_BASE_URL|Astro 构建时使用的本地API URL|`http://127.0.0.1:3000`
10|REPO_FRONTEND_SRC_NAME|管理后台源码目录名|`chronicle-frontend`
11|REPO_ASTRO_SRC_NAME|Astro 前台源码目录名|`astro-template`


### 4. 访问应用

- 管理后台: `http://back-domain.com`
- 前台站点: `http://front-domain.com`

首次访问需要设置管理员密码。

## 开发模式

### 启动开发服务器
```bash
chmod +x ./start.sh && chmod +x ./stop.sh
./start.sh --dev
```

### 停止开发服务器
```bash
./stop.sh
```

## 常用命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs chronicle-server

# 重启服务
pm2 restart chronicle-server

# 停止服务
pm2 stop chronicle-server
```

## 数据备份

定期备份 `server/data/` 目录：

```bash
# 创建备份
tar -czf chronicle-backup-$(date +%Y%m%d).tar.gz server/data/

# 恢复备份
tar -xzf chronicle-backup-20240130.tar.gz
```

## 故障排查

### 服务无法启动

1. 检查端口是否被占用：`lsof -i :3000`
2. 查看日志：`pm2 logs chronicle-server`
3. 检查依赖是否完整：`cd server && npm install`

### 文件上传失败

1. 检查 `server/data/upload/` 目录权限
2. 确保磁盘空间充足

### 构建失败

1. 清理缓存：`rm -rf node_modules package-lock.json`
2. 重新安装依赖：`npm install`

## 许可证

MIT License


## Traffic API

`/api/traffic` 优先从 Google Analytics 4 Data API 读取统计。

需要配置：
- `server/data/settings.json` 或设置页里的 `gaPropertyId`
- `GA_SERVICE_ACCOUNT_JSON` 或 `GOOGLE_APPLICATION_CREDENTIALS`

如果 GA 配置缺失或请求失败，会回退到本地访问日志统计。
