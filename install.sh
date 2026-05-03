#!/usr/bin/env bash

set -Eeuo pipefail

# ============== CONFIG ==============
REPO_URL="${REPO_URL:-https://github.com/vanvanhasnophi/Chronicle.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
INSTALL_DIR_DEFAULT="${INSTALL_DIR:-/opt/Chronicle}"
MEDIA_DOMAIN_DEFAULT="${MEDIA_DOMAIN:-https://file.eightyfor.top}"
WEB_ROOT_DEFAULT="${WEB_ROOT:-/var/www/blog.eightyfor.top}"
NGINX_CONFIG_DIR="/etc/nginx/sites-available"
BLOG_DOMAIN_DEFAULT="${BLOG_DOMAIN:-blog.eightyfor.top}"

# 参数记忆配置
CONFIG_DIR="${HOME}/.config/chronicle"
CONFIG_FILE="$CONFIG_DIR/install.conf"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

log() { printf "%b\n" "${GREEN}[$1]${RESET} ${2:-}"; }
warn() { printf "%b\n" "${YELLOW}[Warn]${RESET} $*"; }
die() { printf "%b\n" "${RED}[Error]${RESET} $*" >&2; exit 1; }

# Mode: install or update
MODE="${1:-install}"

confirm() {
  local prompt="$1"
  local default_answer="${2:-N}"
  local answer=""
  if [[ "$default_answer" == "Y" ]]; then
    read -r -p "$prompt [Y/n]: " answer || true
    [[ -z "$answer" || "$answer" =~ ^[Yy]$ ]]
  else
    read -r -p "$prompt [y/N]: " answer || true
    [[ "$answer" =~ ^[Yy]$ ]]
  fi
}

prompt_default() {
  local var_name="$1"
  local prompt="$2"
  local default_value="$3"
  local value=""
  read -r -p "$prompt [${default_value}]: " value || true
  if [[ -z "$value" ]]; then
    value="$default_value"
  fi
  printf -v "$var_name" '%s' "$value"
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

save_config() {
  local install_dir="$1"
  local blog_domain="$2"
  local web_root="$3"
  
  mkdir -p "$CONFIG_DIR"
  cat > "$CONFIG_FILE" <<EOF
INSTALL_DIR="$install_dir"
BLOG_DOMAIN="$blog_domain"
WEB_ROOT="$web_root"
REPO_BRANCH="$REPO_BRANCH"
SAVED_AT="$(date -Iseconds)"
EOF
  log INFO "配置已保存到: $CONFIG_FILE"
}

load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    log INFO "加载保存的配置..."
    source "$CONFIG_FILE"
    INSTALL_DIR_DEFAULT="${INSTALL_DIR:-$INSTALL_DIR_DEFAULT}"
    BLOG_DOMAIN_DEFAULT="${BLOG_DOMAIN:-$BLOG_DOMAIN_DEFAULT}"
    WEB_ROOT_DEFAULT="${WEB_ROOT:-$WEB_ROOT_DEFAULT}"
    REPO_BRANCH="${REPO_BRANCH:-main}"
  fi
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

root_exec() {
  if [[ $EUID -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

need_sudo() {
  if [[ $EUID -eq 0 ]]; then
    SUDO=""
  elif command_exists sudo; then
    SUDO="sudo"
  else
    die "需要 root 权限或可用的 sudo。"
  fi
}

detect_package_manager() {
  if command_exists apt-get; then
    echo "apt-get"
  elif command_exists dnf; then
    echo "dnf"
  elif command_exists yum; then
    echo "yum"
  elif command_exists pacman; then
    echo "pacman"
  elif command_exists zypper; then
    echo "zypper"
  else
    echo ""
  fi
}

install_base_packages() {
  local pm
  pm="$(detect_package_manager)"
  [[ -n "$pm" ]] || die "未检测到可用的软件包管理器。请先手动安装 git/curl/rsync/tar。"

  log INFO "安装基础依赖 (${pm})..."
  case "$pm" in
    apt-get)
      root_exec apt-get update >/dev/null 2>&1 || die "[ERROR] apt-get 更新失败"
      root_exec env DEBIAN_FRONTEND=noninteractive apt-get install -y git curl rsync tar ca-certificates build-essential python3 >/dev/null 2>&1 || die "[ERROR] 依赖安装失败"
      ;;
    dnf)
      root_exec dnf install -y git curl rsync tar ca-certificates gcc-c++ make python3 >/dev/null 2>&1 || die "[ERROR] 依赖安装失败"
      ;;
    yum)
      root_exec yum install -y git curl rsync tar ca-certificates gcc-c++ make python3 >/dev/null 2>&1 || die "[ERROR] 依赖安装失败"
      ;;
    pacman)
      root_exec pacman -Sy --noconfirm git curl rsync tar ca-certificates base-devel python >/dev/null 2>&1 || die "[ERROR] 依赖安装失败"
      ;;
    zypper)
      root_exec zypper --non-interactive install git curl rsync tar ca-certificates gcc-c++ make python3 >/dev/null 2>&1 || die "[ERROR] 依赖安装失败"
      ;;
  esac
}

node_major_version() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

install_nodejs() {
  local major=0
  if command_exists node; then
    major="$(node_major_version)"
  fi

  if [[ "$major" -ge 18 ]] && command_exists npm; then
    log INFO "检测到 Node.js $(node -v)，跳过安装。"
    return
  fi

  local pm
  pm="$(detect_package_manager)"
  [[ -n "$pm" ]] || die "缺少 Node.js，且无法自动安装。"

  log INFO "安装 Node.js 20.x..."
  case "$pm" in
    apt-get)
      curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | root_exec bash - >/dev/null 2>&1 || die "[ERROR] Node.js 源配置失败"
      root_exec env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >/dev/null 2>&1 || die "[ERROR] Node.js 安装失败"
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_20.x 2>/dev/null | root_exec bash - >/dev/null 2>&1 || die "[ERROR] Node.js 源配置失败"
      root_exec "$pm" install -y nodejs >/dev/null 2>&1 || die "[ERROR] Node.js 安装失败"
      ;;
    pacman)
      root_exec pacman -Sy --noconfirm nodejs npm >/dev/null 2>&1 || die "[ERROR] Node.js 安装失败"
      ;;
    zypper)
      warn "zypper 环境下未自动配置 NodeSource，尝试安装系统仓库里的 nodejs。"
      root_exec zypper --non-interactive install nodejs npm >/dev/null 2>&1 || die "[ERROR] Node.js 安装失败"
      ;;
  esac

  command_exists node || die "[ERROR] Node.js 安装失败，命令不可用"
  command_exists npm || die "[ERROR] npm 安装失败，命令不可用"
  major="$(node_major_version)"
  [[ "$major" -ge 18 ]] || die "[ERROR] Node.js 版本过低：$(node -v)，需要 18 以上版本"
}

clone_or_update_repo() {
  local target_dir="$1"
  if [[ -d "$target_dir/.git" ]]; then
    log INFO "检测到已有仓库，更新到最新代码..."
    git -C "$target_dir" remote set-url origin "$REPO_URL" >/dev/null 2>&1 || true
    git -C "$target_dir" fetch origin "$REPO_BRANCH" >/dev/null 2>&1 || die "[ERROR] Git fetch 失败"
    git -C "$target_dir" checkout -B "$REPO_BRANCH" "origin/$REPO_BRANCH" >/dev/null 2>&1 || die "[ERROR] Git checkout 失败"
    return
  fi

  if [[ -n "$(find "$target_dir" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1 || true)" ]]; then
    if ! confirm "目标目录 \"$target_dir\" 已存在且非空，是否删除后重新安装？"; then
      die "安装已取消。"
    fi
    root_exec rm -rf "$target_dir"
  fi

  root_exec mkdir -p "$target_dir"
  log INFO "从 GitHub 克隆仓库到 $target_dir ..."
  root_exec git clone --branch "$REPO_BRANCH" --depth 1 "$REPO_URL" "$target_dir" >/dev/null 2>&1 || die "[ERROR] Git clone 失败"
}

ensure_symlink() {
  local link_path="$1"
  local target_path="$2"
  root_exec mkdir -p "$(dirname "$link_path")"
  if [[ -L "$link_path" || -e "$link_path" ]]; then
    root_exec rm -rf "$link_path"
  fi
  root_exec ln -s "$target_path" "$link_path"
}

install_node_deps() {
  local repo_root="$1"
  log INFO "安装后端依赖..."
  (cd "$repo_root/server" && npm install --omit=dev >/dev/null 2>&1) || die "[ERROR] 后端依赖安装失败"

  log INFO "安装 CMS 依赖..."
  (cd "$repo_root/chronicle-frontend" && npm install >/dev/null 2>&1) || die "[ERROR] CMS 依赖安装失败"

  log INFO "安装 Astro 依赖..."
  (cd "$repo_root/astro-frontend" && npm install >/dev/null 2>&1) || die "[ERROR] Astro 依赖安装失败"
}

prepare_runtime_dirs() {
  local repo_root="$1"
  root_exec mkdir -p "$repo_root/server/data/upload"
  root_exec mkdir -p "$repo_root/server/log"
  root_exec mkdir -p "$repo_root/chronicle-frontend/public/server/data"
  root_exec mkdir -p "$repo_root/astro-frontend/public/server/data"

  ensure_symlink "$repo_root/chronicle-frontend/public/server/data/upload" "$repo_root/server/data/upload"
  ensure_symlink "$repo_root/astro-frontend/public/server/data/upload" "$repo_root/server/data/upload"
}

generate_nginx_config() {
  local blog_domain="$1"
  local web_root="$2"
  local config_file="$NGINX_CONFIG_DIR/$blog_domain"
  
  log INFO "生成 Nginx 配置: $config_file"
  
  cat > /tmp/nginx-$blog_domain.conf <<'NGINX_EOF'
upstream chronicle_backend {
    server 127.0.0.1:3000;
}

upstream chronicle_cms {
    server 127.0.0.1:5173;
}

upstream chronicle_astro {
    server 127.0.0.1:4321;
}

server {
    listen 80;
    listen [::]:80;
    server_name {{BLOG_DOMAIN}};
    
    root {{WEB_ROOT}};
    
    # 前端静态文件
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "public, max-age=3600";
    }
    
    # 上传的媒体文件
    location /server/data/upload/ {
        alias {{REPO_ROOT}}/server/data/upload/;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
    
    # 后端 API
    location /api/ {
        proxy_pass http://chronicle_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name admin.{{BLOG_DOMAIN}};
    
    # CMS 管理后台
    location / {
        proxy_pass http://chronicle_cms;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}
NGINX_EOF
  
  # 替换占位符
  sed -i "s|{{BLOG_DOMAIN}}|$blog_domain|g" /tmp/nginx-$blog_domain.conf
  sed -i "s|{{WEB_ROOT}}|$web_root|g" /tmp/nginx-$blog_domain.conf
  sed -i "s|{{REPO_ROOT}}|${repo_root}|g" /tmp/nginx-$blog_domain.conf
  
  root_exec cp /tmp/nginx-$blog_domain.conf "$config_file"
  root_exec ln -sf "$config_file" "/etc/nginx/sites-enabled/$blog_domain" 2>/dev/null || true
  
  log INFO "Nginx 配置已生成"
}

install_nginx() {
  if command_exists nginx; then
    log INFO "Nginx 已安装: $(nginx -v 2>&1)"
    return
  fi
  
  local pm
  pm="$(detect_package_manager)"
  [[ -n "$pm" ]] || die "缺少软件包管理器，无法安装 Nginx。"
  
  log INFO "安装 Nginx..."
  case "$pm" in
    apt-get)
      root_exec apt-get update >/dev/null 2>&1 || die "[ERROR] apt-get 更新失败"
      root_exec env DEBIAN_FRONTEND=noninteractive apt-get install -y nginx >/dev/null 2>&1 || die "[ERROR] Nginx 安装失败"
      ;;
    dnf)
      root_exec dnf install -y nginx >/dev/null 2>&1 || die "[ERROR] Nginx 安装失败"
      ;;
    yum)
      root_exec yum install -y nginx >/dev/null 2>&1 || die "[ERROR] Nginx 安装失败"
      ;;
    pacman)
      root_exec pacman -Sy --noconfirm nginx >/dev/null 2>&1 || die "[ERROR] Nginx 安装失败"
      ;;
    zypper)
      root_exec zypper --non-interactive install nginx >/dev/null 2>&1 || die "[ERROR] Nginx 安装失败"
      ;;
  esac
  
  root_exec systemctl enable nginx >/dev/null 2>&1 || die "[ERROR] Nginx 启用失败"
  root_exec systemctl start nginx >/dev/null 2>&1 || die "[ERROR] Nginx 启动失败"
  log INFO "Nginx 已启动"
}

deploy_from_repo() {
  local repo_root="$1"
  local web_root="$2"
  local server_root="$repo_root/server"
  local astro_root="$repo_root/astro-frontend"
  
  log INFO "部署前端到 $web_root ..."
  root_exec mkdir -p "$web_root"
  root_exec cp -r "$repo_root/dist/"* "$web_root/" 2>/dev/null || true
  
  log INFO "更新 Astro 源代码 ($astro_root)..."
  root_exec rsync -q --delete --exclude='node_modules' --exclude='dist' --exclude='.astro' \
    "$repo_root/astro-frontend/" "$astro_root/" || true
  
  log INFO "配置上传目录符号链接..."
  root_exec mkdir -p "$astro_root/public/server/data"
  ensure_symlink "$astro_root/public/server/data/upload" "$server_root/data/upload"
  ensure_symlink "$web_root/server/data/upload" "$server_root/data/upload"
  
  log INFO "部署后端代码..."
  root_exec mkdir -p "$server_root"
  root_exec rsync -q --delete --exclude='data' --exclude='log' --exclude='node_modules' \
    "$repo_root/server/" "$server_root/" || true
}

rebuild_frontends() {
  local repo_root="$1"
  
  log INFO "重建前端（CMS + Astro）..."
  
  if [[ -d "$repo_root/chronicle-frontend" ]]; then
    log INFO "构建 CMS..."
    (cd "$repo_root/chronicle-frontend" && npm run build >/dev/null 2>&1) || die "[ERROR] CMS 构建失败"
  fi
  
  if [[ -d "$repo_root/astro-frontend" ]]; then
    log INFO "构建 Astro..."
    (cd "$repo_root/astro-frontend" && npm run build >/dev/null 2>&1) || die "[ERROR] Astro 构建失败"
  fi
}

reload_nginx() {
  if command_exists nginx; then
    if root_exec systemctl is-active --quiet nginx; then
      log INFO "重载 Nginx..."
      root_exec systemctl reload nginx >/dev/null 2>&1 || die "[ERROR] Nginx 重载失败"
    else
      log INFO "启动 Nginx..."
      root_exec systemctl start nginx >/dev/null 2>&1 || die "[ERROR] Nginx 启动失败"
    fi
  fi
}

restart_services() {
  local repo_root="$1"
  
  log INFO "重启 Chronicle 后端服务..."
  
  # 杀死旧进程
  killall node 2>/dev/null || true
  sleep 1
  
  # 只启动后端
  log INFO "启动后端 API (3000)..."
  (cd "$repo_root/server" && npm start > "$repo_root/server.log" 2>&1 &)
  
  sleep 2
  log INFO "后端服务已启动"
}

do_install() {
  local repo_root=""
  local install_dir="$INSTALL_DIR_DEFAULT"
  local web_root="$WEB_ROOT_DEFAULT"
  local blog_domain="$BLOG_DOMAIN_DEFAULT"
  
  need_sudo
  
  # 加载之前保存的配置
  load_config
  install_dir="$INSTALL_DIR_DEFAULT"
  blog_domain="$BLOG_DOMAIN_DEFAULT"
  web_root="$WEB_ROOT_DEFAULT"
  
  log INFO "Chronicle 傻瓜式部署安装"
  prompt_default install_dir "安装目录" "$install_dir"
  prompt_default blog_domain "博客域名" "$blog_domain"
  prompt_default REPO_BRANCH "Git 分支" "$REPO_BRANCH"
  
  # 创建安装目录
  if [[ ! -d "$install_dir" ]]; then
    root_exec mkdir -p "$install_dir"
  fi
  
  install_base_packages
  install_nodejs
  install_nginx
  
  clone_or_update_repo "$install_dir"
  repo_root="$install_dir"
  
  if command_exists chown && [[ -n "${SUDO_USER:-}" ]]; then
    root_exec chown -R "$SUDO_USER":"$SUDO_USER" "$repo_root" || true
  fi
  
  log INFO "准备脚本执行权限..."
  root_exec chmod +x "$repo_root"/*.sh 2>/dev/null || true
  
  prepare_runtime_dirs "$repo_root"
  install_node_deps "$repo_root"
  
  # 构建前端
  rebuild_frontends "$repo_root"
  
  # 部署到 Web 根目录
  deploy_from_repo "$repo_root" "$web_root"
  
  # 生成并配置 Nginx
  generate_nginx_config "$blog_domain" "$web_root"
  reload_nginx
  
  # 启动服务
  restart_services "$repo_root"
  
  # 保存配置
  save_config "$install_dir" "$blog_domain" "$web_root"
  
  cat <<EOF

${GREEN}╔════════════════════════════════════════════════════════╗${RESET}
${GREEN}║           Chronicle  部署完成！                         ║${RESET}
${GREEN}╚════════════════════════════════════════════════════════╝${RESET}

📁 安装目录: $repo_root
🌐 前端: http://$blog_domain
🔐 后台: http://admin.$blog_domain
📝 后端 API: http://$blog_domain/api

📋 日志文件:
  - 后端: $repo_root/server.log

📍 配置已保存到: $CONFIG_FILE

🚀 快速命令:
  # 查看日志
  tail -f $repo_root/server.log

  # 手动重启服务
  bash $repo_root/install.sh update

  # 更新配置
  nano /etc/nginx/sites-available/$blog_domain
  systemctl reload nginx

EOF
}

do_update() {
  local repo_root
  local web_root
  
  # 加载保存的配置
  load_config
  repo_root="${INSTALL_DIR:-$INSTALL_DIR_DEFAULT}"
  web_root="${WEB_ROOT:-$WEB_ROOT_DEFAULT}"
  
  [[ -d "$repo_root" ]] || die "安装目录不存在: $repo_root"
  
  log INFO "Chronicle 更新模式"
  log INFO "拉取最新代码..."
  
  git -C "$repo_root" fetch origin "$REPO_BRANCH" >/dev/null 2>&1 || die "[ERROR] Git fetch 失败"
  git -C "$repo_root" checkout -B "$REPO_BRANCH" "origin/$REPO_BRANCH" >/dev/null 2>&1 || die "[ERROR] Git checkout 失败"
  
  # 重新构建和部署
  prepare_runtime_dirs "$repo_root"
  rebuild_frontends "$repo_root"
  
  log INFO "部署到生产环境..."
  deploy_from_repo "$repo_root" "$web_root"
  
  reload_nginx
  restart_services "$repo_root"
  
  log INFO "更新完成！所有服务已重启并重新构建"
}

main() {
  case "$MODE" in
    install)
      do_install
      ;;
    update)
      do_update "$INSTALL_DIR_DEFAULT"
      ;;
    *)
      cat <<EOF
用法: $0 [install|update]

  install  - 首次安装（默认）
  update   - 更新代码、重构前端、重启服务

环境变量:
  INSTALL_DIR     - 安装目录 (默认: /opt/Chronicle)
  BLOG_DOMAIN     - 博客域名 (默认: blog.eightyfor.top)
  REPO_BRANCH     - Git 分支 (默认: main)

示例:
  BLOG_DOMAIN=myblog.com bash $0 install
  bash $0 update
EOF
      exit 0
      ;;
  esac
}

main "$@"