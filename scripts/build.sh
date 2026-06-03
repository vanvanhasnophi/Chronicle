#!/usr/bin/env bash
# Chronicle 多规格发行版构建脚本
# 用法: ./scripts/build.sh <variant> [options]
#
# Variants:
#   full         全自托管版 — server + admin + template-astro（默认）
#   self-hosted  静态自托管版 — admin + template-astro 静态产物
#   static       完整静态版 — template-astro 纯静态站点
#   admin        仅管理后台 — admin SPA
#   lite         精简版 — template-astro + 示例内容（无 server/admin）

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${REPO_ROOT}/release"
ADMIN_DIR="${REPO_ROOT}/packages/admin"
ASTRO_DIR="${REPO_ROOT}/packages/template-astro"
SERVER_DIR="${REPO_ROOT}/server"
DATA_DIR="${REPO_ROOT}/data"

# ── 默认值 ──────────────────────────────────────────────
VARIANT="${1:-full}"
MEDIA_DOMAIN="${MEDIA_DOMAIN:-}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3000}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-}"
VITE_CDN_BASE_URL="${VITE_CDN_BASE_URL:-}"

# ── 颜色 ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RESET='\033[0m'
info()  { printf "%b\n" "${GREEN}[build]${RESET} $*"; }
warn()  { printf "%b\n" "${YELLOW}[warn]${RESET} $*"; }
error() { printf "%b\n" "${RED}[error]${RESET} $*" >&2; }
die()   { error "$*"; exit 1; }

# ── 检查工具 ────────────────────────────────────────────
check_node() {
  local v; v=$(node -v 2>/dev/null || echo "none")
  local major; major=$(echo "$v" | sed 's/v//' | cut -d. -f1)
  if [ "$major" -lt 18 ] 2>/dev/null; then
    die "Node.js >= 18 required (found $v)"
  fi
  info "Node.js $v"
}

# ── 构建管理后台 (admin) ────────────────────────────────
build_admin() {
  info "Building @chronicle/admin ..."
  cd "$ADMIN_DIR"

  if [ ! -d "node_modules" ]; then
    info "Installing admin dependencies..."
    npm install
  fi

  # 设置生产环境变量
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}"
  export VITE_CDN_BASE_URL="${VITE_CDN_BASE_URL:-}"

  npm run build
  info "Admin built → $ADMIN_DIR/dist/"
}

# ── 构建前台模板 (template-astro) ────────────────────────
build_template() {
  local mode="${1:-static}"  # static | server
  info "Building @chronicle/template-astro (mode: $mode) ..."
  cd "$ASTRO_DIR"

  if [ ! -d "node_modules" ]; then
    info "Installing astro dependencies..."
    npm install
  fi

  # 确保 settings.json 存在（用于构建时数据注入）
  if [ -f "$DATA_DIR/settings.json" ]; then
    cp "$DATA_DIR/settings.json" "$ASTRO_DIR/public/server/data/settings.json" 2>/dev/null || true
  fi

  case "$mode" in
    static)
      # 静态模式：构建纯静态站点。需要 API_BASE_URL 来在 SSG 阶段拉取数据
      export MEDIA_DOMAIN="${MEDIA_DOMAIN:-}"
      export API_BASE_URL="${API_BASE_URL}"
      npm run build
      info "Template (static) built → $ASTRO_DIR/dist/"
      ;;
    server)
      # SSR 模式（自托管）：保留服务端渲染能力
      export MEDIA_DOMAIN="${MEDIA_DOMAIN:-}"
      export API_BASE_URL="${API_BASE_URL}"
      npm run build
      info "Template (server) built → $ASTRO_DIR/dist/"
      ;;
  esac
}

# ── 准备 Server 依赖 ────────────────────────────────────
prepare_server() {
  info "Preparing chronicle-server ..."
  cd "$SERVER_DIR"

  if [ ! -d "node_modules" ]; then
    info "Installing server dependencies..."
    npm install --omit=dev
  fi
  info "Server ready at $SERVER_DIR/"
}

# ── 组装发布包 ──────────────────────────────────────────
assemble_release() {
  local name="$1"; shift
  local target="${BUILD_DIR}/${name}"
  rm -rf "$target"
  mkdir -p "$target"

  info "Assembling release: $name → $target"

  for src in "$@"; do
    if [ -e "$src" ]; then
      cp -r "$src" "$target/" 2>/dev/null || true
    fi
  done

  # 生成版本信息
  cat > "$target/CHRONICLE_BUILD_INFO" <<EOF
variant=${name}
version=$(node -e "try{console.log(require('${REPO_ROOT}/packages/template-astro/package.json').version)}catch(e){console.log('unknown')}")
build_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
node=$(node -v)
EOF

  info "Release assembled: $target"
  du -sh "$target"
}

# ── Main ────────────────────────────────────────────────

case "$VARIANT" in
  help|--help|-h)
    cat <<EOF
Chronicle Build System — 多规格发行版构建

用法: ./scripts/build.sh <variant> [选项]

发行版规格 (Variants):
  full          全自托管版 — server + admin + template-astro
                输出: release/chronicle-full-*/
                部署: VPS, 通过 install.sh 一键安装

  self-hosted   静态自托管版 — admin SPA + template-astro 静态站点
                输出: release/chronicle-static-*/ (+ Nginx 配置模板)
                部署: VPS + Nginx 纯静态 serve

  static        完整静态版 — template-astro 纯静态站点
                输出: release/chronicle-pages-*/
                部署: GitHub Pages / Vercel / Netlify / OSS

  admin         仅管理后台 — admin CMS SPA
                输出: release/chronicle-admin-*/
                部署: 独立管理域名

  lite          精简版 — template-astro 纯静态（fork & deploy）
                输出: release/chronicle-lite-*/
                部署: 任意静态托管

环境变量:
  API_BASE_URL       Astro SSG 构建时使用的后端地址 (默认 http://127.0.0.1:3000)
  MEDIA_DOMAIN       媒体文件 CDN 域名
  VITE_API_BASE_URL  Admin 的 API 基址 (默认 /api)
  VITE_CDN_BASE_URL  Admin 的 CDN 基址

示例:
  # 构建全自托管版
  npm run build:full

  # 构建 GitHub Pages 静态版（需要本地运行 server 提供数据）
  API_BASE_URL=http://127.0.0.1:3000 npm run build:static

  # 构建精简版（纯静态，无需后端）
  npm run build:lite
EOF
    exit 0
    ;;
esac

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Chronicle Build System                    ║"
echo "║   Variant: ${VARIANT}                                ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

check_node

case "$VARIANT" in
  # ── full: 全自托管版 ──────────────────────────────────
  full)
    info "=== Building: 全自托管版 (Full Self-Hosted) ==="
    prepare_server
    build_admin
    build_template static

    assemble_release "chronicle-full-$(date +%Y%m%d)" \
      "$SERVER_DIR" \
      "$ADMIN_DIR/dist" \
      "$ASTRO_DIR/dist" \
      "$REPO_ROOT/install.sh" \
      "$REPO_ROOT/start.sh" \
      "$REPO_ROOT/stop.sh" \
      "$REPO_ROOT/chronicle-deploy.sh"

    info ""
    info "全自托管版构建完成。部署方式："
    info "  cd release/chronicle-full-*"
    info "  sudo bash install.sh install"
    ;;

  # ── self-hosted: 静态自托管版 ──────────────────────────
  self-hosted)
    info "=== Building: 静态自托管版 (Static Self-Hosted) ==="
    build_admin
    build_template static

    assemble_release "chronicle-static-$(date +%Y%m%d)" \
      "$ADMIN_DIR/dist" \
      "$ASTRO_DIR/dist"

    # 生成 Nginx 配置模板
    mkdir -p "${BUILD_DIR}/chronicle-static-$(date +%Y%m%d)/nginx"
    cat > "${BUILD_DIR}/chronicle-static-$(date +%Y%m%d)/nginx/chronicle.conf" <<'NGINX'
# Chronicle Static Self-Hosted Nginx Config
server {
    listen 80;
    server_name YOUR_DOMAIN;

    # 公开站点（Astro 静态产物）
    root /var/www/YOUR_DOMAIN;
    index index.html;

    # CMS 管理后台
    location /admin {
        alias /var/www/YOUR_MANAGER_DOMAIN;
        try_files $uri $uri/ /admin/index.html;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

    info ""
    info "静态自托管版构建完成。部署方式："
    info "  1. 将 dist/ 上传到 VPS: rsync -a release/chronicle-static-*/dist/ user@host:/var/www/yoursite/"
    info "  2. 配置 Nginx（参考 release/chronicle-static-*/nginx/）"
    ;;

  # ── static: 完整静态版（GitHub Pages / CDN）───────────
  static)
    info "=== Building: 完整静态版 (Full Static / GitHub Pages) ==="

    # 静态版构建时，API_BASE_URL 指向一个可用的后端（本地或远程）
    # 构建产物中不含任何运行时 API 依赖
    if [ -z "${API_BASE_URL:-}" ]; then
      warn "API_BASE_URL not set."
      warn "模板 SSG 构建需要从后端拉取文章数据。"
      warn "请先启动 chronicle-server (node server/index.js)，然后设置："
      warn "  export API_BASE_URL=http://127.0.0.1:3000"
      warn ""
      warn "或者如果 server 已在运行，继续..."
      API_BASE_URL="http://127.0.0.1:3000"
    fi

    build_template static

    assemble_release "chronicle-pages-$(date +%Y%m%d)" \
      "$ASTRO_DIR/dist"

    # 生成 GitHub Pages 部署信息
    cat > "${BUILD_DIR}/chronicle-pages-$(date +%Y%m%d)/.nojekyll" <<<''
    cat > "${BUILD_DIR}/chronicle-pages-$(date +%Y%m%d)/CNAME" <<<'YOUR_DOMAIN'

    info ""
    info "完整静态版构建完成。部署方式："
    info "  GitHub Pages:"
    info "    cd release/chronicle-pages-*"
    info "    git init && git add -A && git commit -m 'deploy'"
    info "    git push git@github.com:USER/REPO.git main:gh-pages"
    info ""
    info "  Vercel / Netlify: 直接导入 release/chronicle-pages-*/ 目录"
    ;;

  # ── admin: 仅管理后台 ──────────────────────────────────
  admin)
    info "=== Building: 管理后台 (Admin Only) ==="
    build_admin

    assemble_release "chronicle-admin-$(date +%Y%m%d)" \
      "$ADMIN_DIR/dist"

    info ""
    info "管理后台构建完成 → release/chronicle-admin-*/"
    ;;

  # ── lite: 精简版 ──────────────────────────────────────
  lite)
    info "=== Building: 精简版 (Lite) ==="

    # 精简版：只需要 template-astro，使用本地示例数据
    # 不依赖 server、admin 或任何运行时后端
    build_template static

    assemble_release "chronicle-lite-$(date +%Y%m%d)" \
      "$ASTRO_DIR/dist"

    info ""
    info "精简版构建完成。这是一个纯静态博客，可以："
    info "  - 直接部署到任意静态托管平台"
    info "  - fork lite 分支进行二次开发"
    info "  - 所有内容通过 Markdown 文件管理"
    ;;

  *)
    die "Unknown variant: '$VARIANT'. Use 'help' to see available variants."
    ;;
esac

echo ""
info "Build complete: $VARIANT"
