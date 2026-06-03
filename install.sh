#!/usr/bin/env bash

set -Eeuo pipefail

# ============== CONFIG ==============
REPO_URL="${REPO_URL:-https://github.com/vanvanhasnophi/Chronicle.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
INSTALL_DIR_DEFAULT="${INSTALL_DIR:-/opt/Chronicle}"
MEDIA_DOMAIN_DEFAULT="${MEDIA_DOMAIN:-https://file.eightyfor.top}"
NGINX_CONFIG_DIR="/etc/nginx/sites-available"
FRONTEND_DOMAIN_DEFAULT="${FRONTEND_DOMAIN:-blog.eightyfor.top}"
BACKEND_DOMAIN_DEFAULT="${BACKEND_DOMAIN:-admin.blog.eightyfor.top}"
FRONTEND_ROOT_DEFAULT="${FRONTEND_ROOT:-/var/www/${FRONTEND_DOMAIN_DEFAULT}}"
BACKEND_ROOT_DEFAULT="${BACKEND_ROOT:-/var/www/${BACKEND_DOMAIN_DEFAULT}}"
ENABLE_HTTPS_DEFAULT="${ENABLE_HTTPS:-false}"

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

site_root_for_domain() {
  printf '/var/www/%s' "$1"
}

save_config() {
  local install_dir="$1"
  local frontend_domain="$2"
  local backend_domain="$3"
  local frontend_root="$4"
  local backend_root="$5"
  local enable_https="$6"
  
  mkdir -p "$CONFIG_DIR"
  cat > "$CONFIG_FILE" <<EOF
INSTALL_DIR="$install_dir"
FRONTEND_DOMAIN="$frontend_domain"
BACKEND_DOMAIN="$backend_domain"
FRONTEND_ROOT="$frontend_root"
BACKEND_ROOT="$backend_root"
ENABLE_HTTPS="$enable_https"
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
    FRONTEND_DOMAIN_DEFAULT="${FRONTEND_DOMAIN:-$FRONTEND_DOMAIN_DEFAULT}"
    BACKEND_DOMAIN_DEFAULT="${BACKEND_DOMAIN:-$BACKEND_DOMAIN_DEFAULT}"
    FRONTEND_ROOT_DEFAULT="${FRONTEND_ROOT:-$(site_root_for_domain "$FRONTEND_DOMAIN_DEFAULT")}"
    BACKEND_ROOT_DEFAULT="${BACKEND_ROOT:-$(site_root_for_domain "$BACKEND_DOMAIN_DEFAULT")}"
    ENABLE_HTTPS_DEFAULT="${ENABLE_HTTPS:-$ENABLE_HTTPS_DEFAULT}"
    REPO_BRANCH="${REPO_BRANCH:-main}"
  fi
}

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
  (cd "$repo_root/packages/host" && npm install --omit=dev >/dev/null 2>&1) || die "[ERROR] 后端依赖安装失败"

  log INFO "安装 CMS 依赖..."
  (cd "$repo_root/packages/manager" && npm install >/dev/null 2>&1) || die "[ERROR] CMS 依赖安装失败"

  log INFO "安装 Astro 依赖..."
  (cd "$repo_root/packages/template-astro" && npm install >/dev/null 2>&1) || die "[ERROR] Astro 依赖安装失败"
}

prepare_runtime_dirs() {
  local repo_root="$1"
  root_exec mkdir -p "$repo_root/data/upload"
  root_exec mkdir -p "$repo_root/packages/host/log"
  root_exec mkdir -p "$repo_root/packages/manager/public/server/data"
  root_exec mkdir -p "$repo_root/packages/template-astro/public/server/data"

  ensure_symlink "$repo_root/packages/manager/public/server/data/upload" "$repo_root/data/upload"
  ensure_symlink "$repo_root/packages/template-astro/public/server/data/upload" "$repo_root/data/upload"
}

generate_nginx_config() {
  local frontend_domain="$1"
  local backend_domain="$2"
  local frontend_root="$3"
  local backend_root="$4"
  local repo_root="$5"
  local enable_https="$6"
  local config_file="$NGINX_CONFIG_DIR/chronicle.conf"
  local tmp_file="/tmp/chronicle-nginx.conf"
  local frontend_cert_dir="/etc/letsencrypt/live/$frontend_domain"
  local backend_cert_dir="/etc/letsencrypt/live/$backend_domain"
  local https_ready="false"

  if [[ "$enable_https" == "true" && -f "$frontend_cert_dir/fullchain.pem" && -f "$frontend_cert_dir/privkey.pem" && -f "$backend_cert_dir/fullchain.pem" && -f "$backend_cert_dir/privkey.pem" ]]; then
    https_ready="true"
  elif [[ "$enable_https" == "true" ]]; then
    warn "HTTPS 已启用，但证书不存在，已回退到 HTTP。"
  fi

  log INFO "生成 Nginx 配置: $config_file"

  : > "$tmp_file"

  cat >> "$tmp_file" <<EOF
upstream chronicle_backend {
  server 127.0.0.1:3000;
}

EOF

  if [[ "$https_ready" == "true" ]]; then
    cat >> "$tmp_file" <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name $frontend_domain;
  return 301 https://\$host\$request_uri;
}

server {
  listen 80;
  listen [::]:80;
  server_name $backend_domain;
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name $frontend_domain;
  root $frontend_root;

  ssl_certificate $frontend_cert_dir/fullchain.pem;
  ssl_certificate_key $frontend_cert_dir/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers off;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 10m;
  add_header Strict-Transport-Security "max-age=63072000" always;
  client_max_body_size 100M;

  location / {
    try_files \$uri \$uri/ /index.html;
    add_header Cache-Control "public, max-age=3600";
  }

  location /server/data/upload/ {
    alias $repo_root/data/upload/;
    expires 365d;
    add_header Cache-Control "public, immutable";
  }

  location /api/ {
    proxy_pass http://chronicle_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_buffering off;
  }
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name $backend_domain;
  root $backend_root;

  ssl_certificate $backend_cert_dir/fullchain.pem;
  ssl_certificate_key $backend_cert_dir/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers off;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 10m;
  add_header Strict-Transport-Security "max-age=63072000" always;
  client_max_body_size 100M;

  location / {
    try_files \$uri \$uri/ /index.html;
    add_header Cache-Control "public, max-age=3600";
  }

  location /server/data/upload/ {
    alias $repo_root/data/upload/;
    expires 365d;
    add_header Cache-Control "public, immutable";
  }

  location /api/ {
    proxy_pass http://chronicle_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_buffering off;
  }
}
EOF
  else
    cat >> "$tmp_file" <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name $frontend_domain;
  root $frontend_root;
  client_max_body_size 100M;

  location / {
    try_files \$uri \$uri/ /index.html;
    add_header Cache-Control "public, max-age=3600";
  }

  location /server/data/upload/ {
    alias $repo_root/data/upload/;
    expires 365d;
    add_header Cache-Control "public, immutable";
  }

  location /api/ {
    proxy_pass http://chronicle_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_buffering off;
  }
}

server {
  listen 80;
  listen [::]:80;
  server_name $backend_domain;
  root $backend_root;
  client_max_body_size 100M;

  location / {
    try_files \$uri \$uri/ /index.html;
    add_header Cache-Control "public, max-age=3600";
  }

  location /server/data/upload/ {
    alias $repo_root/data/upload/;
    expires 365d;
    add_header Cache-Control "public, immutable";
  }

  location /api/ {
    proxy_pass http://chronicle_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_buffering off;
  }
}
EOF
  fi

  root_exec cp "$tmp_file" "$config_file" >/dev/null 2>&1 || die "[ERROR] Nginx 配置写入失败"
  root_exec ln -sf "$config_file" "/etc/nginx/sites-enabled/chronicle.conf" >/dev/null 2>&1 || die "[ERROR] Nginx 启用失败"

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
  local frontend_root="$2"
  local backend_root="$3"
  local server_root="$repo_root/packages/host"
  
  log INFO "部署前端静态文件到 $frontend_root ..."
  root_exec mkdir -p "$frontend_root"
  root_exec rsync -a --delete "$repo_root/packages/template-astro/dist/" "$frontend_root/" >/dev/null 2>&1 || die "[ERROR] 前台静态文件部署失败"

  log INFO "部署后台静态文件到 $backend_root ..."
  root_exec mkdir -p "$backend_root"
  root_exec rsync -a --delete "$repo_root/packages/manager/dist/" "$backend_root/" >/dev/null 2>&1 || die "[ERROR] 后台静态文件部署失败"

  log INFO "部署后端代码..."
  root_exec mkdir -p "$server_root"
  root_exec rsync -q --delete --exclude='data' --exclude='log' --exclude='node_modules' \
    "$repo_root/server/" "$server_root/" || true
}

rebuild_frontends() {
  local repo_root="$1"
  
  log INFO "重建前端（CMS + Astro）..."
  
  if [[ -d "$repo_root/packages/manager" ]]; then
    log INFO "构建 CMS..."
    (cd "$repo_root/packages/manager" && npm run build >/dev/null 2>&1) || die "[ERROR] CMS 构建失败"
  fi
  
  if [[ -d "$repo_root/packages/template-astro" ]]; then
    log INFO "构建 Astro..."
    (cd "$repo_root/packages/template-astro" && npm run build >/dev/null 2>&1) || die "[ERROR] Astro 构建失败"
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
  (cd "$repo_root/packages/host" && npm start > "$repo_root/packages/host.log" 2>&1 &)
  
  sleep 2
  log INFO "后端服务已启动"
}

do_install() {
  local repo_root=""
  local install_dir="$INSTALL_DIR_DEFAULT"
  local frontend_domain="$FRONTEND_DOMAIN_DEFAULT"
  local backend_domain="$BACKEND_DOMAIN_DEFAULT"
  local frontend_root="$FRONTEND_ROOT_DEFAULT"
  local backend_root="$BACKEND_ROOT_DEFAULT"
  local enable_https="$ENABLE_HTTPS_DEFAULT"
  
  need_sudo
  
  # 加载之前保存的配置
  load_config
  install_dir="$INSTALL_DIR_DEFAULT"
  frontend_domain="$FRONTEND_DOMAIN_DEFAULT"
  backend_domain="$BACKEND_DOMAIN_DEFAULT"
  frontend_root="$FRONTEND_ROOT_DEFAULT"
  backend_root="$BACKEND_ROOT_DEFAULT"
  enable_https="$ENABLE_HTTPS_DEFAULT"
  
  log INFO "Chronicle 傻瓜式部署安装"
  prompt_default install_dir "安装目录" "$install_dir"
  prompt_default frontend_domain "前台域名" "$frontend_domain"
  prompt_default backend_domain "后台域名" "$backend_domain"
  frontend_root="$(site_root_for_domain "$frontend_domain")"
  backend_root="$(site_root_for_domain "$backend_domain")"
  local https_default="N"
  if [[ "$enable_https" == "true" ]]; then
    https_default="Y"
  fi
  if confirm "是否启用 HTTPS（需要已签发证书）" "$https_default"; then
    enable_https="true"
  else
    enable_https="false"
  fi
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
  deploy_from_repo "$repo_root" "$frontend_root" "$backend_root"
  
  # 生成并配置 Nginx
  generate_nginx_config "$frontend_domain" "$backend_domain" "$frontend_root" "$backend_root" "$repo_root" "$enable_https"
  reload_nginx
  
  # 启动服务
  restart_services "$repo_root"
  
  # 保存配置
  save_config "$install_dir" "$frontend_domain" "$backend_domain" "$frontend_root" "$backend_root" "$enable_https"
  
  cat <<EOF

${GREEN}╔════════════════════════════════════════════════════════╗${RESET}
${GREEN}║           Chronicle  部署完成！                         ║${RESET}
${GREEN}╚════════════════════════════════════════════════════════╝${RESET}

📁 安装目录: $repo_root
🌐 前台: http://$frontend_domain
🧰 后台: http://$backend_domain
📝 API: http://$frontend_domain/api
🔐 HTTPS: ${enable_https}

📋 日志文件:
  - 后端: $repo_root/packages/host.log
📂 前台目录: $frontend_root
📂 后台目录: $backend_root

📍 配置已保存到: $CONFIG_FILE

🚀 快速命令:
  # 查看日志
  tail -f $repo_root/packages/host.log

  # 手动重启服务
  bash $repo_root/install.sh update

  # 更新配置
  nano /etc/nginx/sites-available/chronicle.conf
  systemctl reload nginx

EOF
}

do_update() {
  local repo_root
  local frontend_root
  local backend_root
  local frontend_domain
  local backend_domain
  local enable_https
  
  # 加载保存的配置
  load_config
  repo_root="${INSTALL_DIR:-$INSTALL_DIR_DEFAULT}"
  frontend_domain="${FRONTEND_DOMAIN:-$FRONTEND_DOMAIN_DEFAULT}"
  backend_domain="${BACKEND_DOMAIN:-$BACKEND_DOMAIN_DEFAULT}"
  frontend_root="${FRONTEND_ROOT:-$FRONTEND_ROOT_DEFAULT}"
  backend_root="${BACKEND_ROOT:-$BACKEND_ROOT_DEFAULT}"
  enable_https="${ENABLE_HTTPS:-$ENABLE_HTTPS_DEFAULT}"
  
  [[ -d "$repo_root" ]] || die "安装目录不存在: $repo_root"
  
  log INFO "Chronicle 更新模式"
  log INFO "拉取最新代码..."
  
  git -C "$repo_root" fetch origin "$REPO_BRANCH" >/dev/null 2>&1 || die "[ERROR] Git fetch 失败"
  git -C "$repo_root" checkout -B "$REPO_BRANCH" "origin/$REPO_BRANCH" >/dev/null 2>&1 || die "[ERROR] Git checkout 失败"
  
  # 重新构建和部署
  prepare_runtime_dirs "$repo_root"
  rebuild_frontends "$repo_root"
  
  log INFO "部署到生产环境..."
  deploy_from_repo "$repo_root" "$frontend_root" "$backend_root"
  generate_nginx_config "$frontend_domain" "$backend_domain" "$frontend_root" "$backend_root" "$repo_root" "$enable_https"
  
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
      do_update
      ;;
    *)
      cat <<EOF
用法: $0 [install|update]

  install  - 首次安装（默认）
  update   - 更新代码、重新构建前后端静态资源、重载 Nginx、重启后端

环境变量:
  INSTALL_DIR     - 安装目录 (默认: /opt/Chronicle)
  FRONTEND_DOMAIN - 前台域名 (默认: blog.eightyfor.top)
  BACKEND_DOMAIN  - 后台域名 (默认: admin.blog.eightyfor.top)
  ENABLE_HTTPS    - 是否启用 HTTPS (true/false)
  REPO_BRANCH     - Git 分支 (默认: main)

示例:
  FRONTEND_DOMAIN=myblog.com BACKEND_DOMAIN=admin.myblog.com bash $0 install
  bash $0 update
EOF
      exit 0
      ;;
  esac
}

main "$@"