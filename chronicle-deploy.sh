#!/bin/bash

set -Eeuo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log() {
    printf "%b\n" "${GREEN}[Deploy]${NC} $*"
}

warn() {
    printf "%b\n" "${YELLOW}[Warn]${NC} $*"
}

prompt_default() {
    local var_name="$1"
    local prompt="$2"
    local default_value="$3"
    local value=""
    read -r -p "$prompt [${default_value}]: " value || true
    if [ -z "$value" ]; then
        value="$default_value"
    fi
    printf -v "$var_name" '%s' "$value"
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

ensure_symlink() {
    local link_path="$1"
    local target_path="$2"
    mkdir -p "$(dirname "$link_path")"
    if [ -L "$link_path" ] || [ -e "$link_path" ]; then
        rm -rf "$link_path"
    fi
    ln -s "$target_path" "$link_path"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
cd "$REPO_ROOT"

CONFIG_DIR="${HOME}/.config/chronicle"
CONFIG_FILE="$CONFIG_DIR/deploy.conf"

FRONTEND_DOMAIN_DEFAULT="${FRONTEND_DOMAIN:-blog.eightyfor.top}"
BACKEND_DOMAIN_DEFAULT="${BACKEND_DOMAIN:-blogmanager.eightyfor.top}"
WEB_ROOT_DEFAULT="${WEB_ROOT:-/var/www/${FRONTEND_DOMAIN_DEFAULT}}"
BACKEND_ROOT_DEFAULT="${BACKEND_ROOT:-/var/www/${BACKEND_DOMAIN_DEFAULT}}"
SERVER_ROOT_DEFAULT="${SERVER_ROOT:-/opt/Chronicle/server}"
ASTRO_ROOT_DEFAULT="${ASTRO_ROOT:-/opt/Chronicle/astro-frontend}"
MEDIA_DOMAIN_DEFAULT="${MEDIA_DOMAIN:-https://file.eightyfor.top}"
FRONTEND_API_BASE_URL_DEFAULT="${FRONTEND_API_BASE_URL:-https://${FRONTEND_DOMAIN_DEFAULT}}"
ASTRO_API_BASE_URL_DEFAULT="${ASTRO_API_BASE_URL:-http://127.0.0.1:3000}"

# 首先检查是否存在已保存的配置文件；如果存在，列出并询问是否采用
if [ -f "$CONFIG_FILE" ]; then
    log "找到已保存的部署配置: $CONFIG_FILE"
    echo "--- 当前保存的配置 ---"
    nl -ba "$CONFIG_FILE" | sed -n '1,200p'
    echo "----------------------"
    read -r -p "是否采用上述已保存配置并继续？ [Y/n]: " adopt_choice || true
    adopt_choice=${adopt_choice:-y}
    if [ "${adopt_choice,,}" = "y" ]; then
        log "采用已保存配置：$CONFIG_FILE"
        # shellcheck disable=SC1090
        . "$CONFIG_FILE"
    else
        log "用户拒绝采用已保存配置，转为扫描仓库以检测源码目录并初始化配置。"
        # fall-through to scan repository
        CANDIDATES=()
        log "扫描仓库根目录以检测源码目录..."
        for d in "$REPO_ROOT"/*; do
            [ -d "$d" ] || continue
            name="$(basename "$d")"
            if [ -f "$d/package.json" ] || [ -f "$d/astro.config.mjs" ] || [ -f "$d/index.html" ] || [ -f "$d/index.js" ]; then
                CANDIDATES+=("$name")
            fi
        done

        REPO_FRONTEND_SRC_NAME="chronicle-frontend"
        REPO_ASTRO_SRC_NAME="astro-frontend"

        if [ "${#CANDIDATES[@]}" -gt 0 ]; then
            echo "检测到以下候选源码目录："
            i=1
            for c in "${CANDIDATES[@]}"; do
                echo "  $i) $c"
                i=$((i+1))
            done

            for c in "${CANDIDATES[@]}"; do
                case "$c" in
                    astro-frontend) REPO_ASTRO_SRC_NAME="$c" ;;
                    chronicle-frontend) REPO_FRONTEND_SRC_NAME="$c" ;;
                esac
            done

            echo "检测到的默认源码目录："
            echo "  Astro 源码目录: $REPO_ASTRO_SRC_NAME"
            echo "  管理后台源码目录: $REPO_FRONTEND_SRC_NAME"

            prompt_default REPO_FRONTEND_SRC_NAME "请选择管理前端源码目录名" "$REPO_FRONTEND_SRC_NAME"
            prompt_default REPO_ASTRO_SRC_NAME "请选择 Astro 源码目录名" "$REPO_ASTRO_SRC_NAME"
        else
            log "未检测到候选源码目录。请手动输入源码目录名。"
            read -r -p "管理前端源码目录名 (例如 chronicle-frontend): " REPO_FRONTEND_SRC_NAME || true
            REPO_FRONTEND_SRC_NAME=${REPO_FRONTEND_SRC_NAME:-chronicle-frontend}
            read -r -p "Astro 源码目录名 (例如 astro-frontend): " REPO_ASTRO_SRC_NAME || true
            REPO_ASTRO_SRC_NAME=${REPO_ASTRO_SRC_NAME:-astro-frontend}
        fi
    fi
else
    log "未找到已保存部署配置，转为扫描仓库以检测源码目录并初始化配置。"
    CANDIDATES=()
    log "扫描仓库根目录以检测源码目录..."
    for d in "$REPO_ROOT"/*; do
        [ -d "$d" ] || continue
        name="$(basename "$d")"
        if [ -f "$d/package.json" ] || [ -f "$d/astro.config.mjs" ] || [ -f "$d/index.html" ] || [ -f "$d/index.js" ]; then
            CANDIDATES+=("$name")
        fi
    done

    REPO_FRONTEND_SRC_NAME="chronicle-frontend"
    REPO_ASTRO_SRC_NAME="astro-frontend"

    if [ "${#CANDIDATES[@]}" -gt 0 ]; then
        echo "检测到以下候选源码目录："
        i=1
        for c in "${CANDIDATES[@]}"; do
            echo "  $i) $c"
            i=$((i+1))
        done

        for c in "${CANDIDATES[@]}"; do
            case "$c" in
                astro-frontend) REPO_ASTRO_SRC_NAME="$c" ;;
                chronicle-frontend) REPO_FRONTEND_SRC_NAME="$c" ;;
            esac
        done

        echo "默认检测结果："
        echo "  Astro 源码目录: $REPO_ASTRO_SRC_NAME"
        echo "  管理后台源码目录: $REPO_FRONTEND_SRC_NAME"

        prompt_default REPO_FRONTEND_SRC_NAME "请选择管理前端源码目录名" "$REPO_FRONTEND_SRC_NAME"
        prompt_default REPO_ASTRO_SRC_NAME "请选择 Astro 源码目录名" "$REPO_ASTRO_SRC_NAME"
    else
        log "未检测到候选源码目录。请手动输入源码目录名。"
        read -r -p "管理前端源码目录名 (例如 chronicle-frontend): " REPO_FRONTEND_SRC_NAME || true
        REPO_FRONTEND_SRC_NAME=${REPO_FRONTEND_SRC_NAME:-chronicle-frontend}
        read -r -p "Astro 源码目录名 (例如 astro-frontend): " REPO_ASTRO_SRC_NAME || true
        REPO_ASTRO_SRC_NAME=${REPO_ASTRO_SRC_NAME:-astro-frontend}
    fi
fi

FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-$FRONTEND_DOMAIN_DEFAULT}"
BACKEND_DOMAIN="${BACKEND_DOMAIN:-$BACKEND_DOMAIN_DEFAULT}"
WEB_ROOT="${WEB_ROOT:-$WEB_ROOT_DEFAULT}"
BACKEND_ROOT="${BACKEND_ROOT:-$BACKEND_ROOT_DEFAULT}"
SERVER_ROOT="${SERVER_ROOT:-$SERVER_ROOT_DEFAULT}"
ASTRO_ROOT="${ASTRO_ROOT:-$ASTRO_ROOT_DEFAULT}"
MEDIA_DOMAIN="${MEDIA_DOMAIN:-$MEDIA_DOMAIN_DEFAULT}"
FRONTEND_API_BASE_URL="${FRONTEND_API_BASE_URL:-$FRONTEND_API_BASE_URL_DEFAULT}"
ASTRO_API_BASE_URL="${ASTRO_API_BASE_URL:-$ASTRO_API_BASE_URL_DEFAULT}"

save_config() {
    mkdir -p "$CONFIG_DIR"
    cat > "$CONFIG_FILE" <<EOF
FRONTEND_DOMAIN="$FRONTEND_DOMAIN"
BACKEND_DOMAIN="$BACKEND_DOMAIN"
WEB_ROOT="$WEB_ROOT"
BACKEND_ROOT="$BACKEND_ROOT"
SERVER_ROOT="$SERVER_ROOT"
ASTRO_ROOT="$ASTRO_ROOT"
MEDIA_DOMAIN="$MEDIA_DOMAIN"
FRONTEND_API_BASE_URL="$FRONTEND_API_BASE_URL"
ASTRO_API_BASE_URL="$ASTRO_API_BASE_URL"
REPO_FRONTEND_SRC_NAME="$REPO_FRONTEND_SRC_NAME"
REPO_ASTRO_SRC_NAME="$REPO_ASTRO_SRC_NAME"
EOF
}

log "Starting Chronicle Deployment..."

prompt_default FRONTEND_DOMAIN "请输入前台域名" "$FRONTEND_DOMAIN"
prompt_default BACKEND_DOMAIN "请输入后台域名" "$BACKEND_DOMAIN"
prompt_default WEB_ROOT "请输入前台部署目录" "$WEB_ROOT"
prompt_default BACKEND_ROOT "请输入后台部署目录" "$BACKEND_ROOT"
prompt_default SERVER_ROOT "请输入后端目录" "$SERVER_ROOT"
prompt_default ASTRO_ROOT "请输入 Astro 源码目录" "$ASTRO_ROOT"
prompt_default FRONTEND_API_BASE_URL "请输入 chronicle-frontend 的 API 基址" "$FRONTEND_API_BASE_URL"
prompt_default ASTRO_API_BASE_URL "请输入 Astro 构建时 API 基址" "$ASTRO_API_BASE_URL"
prompt_default MEDIA_DOMAIN "请输入媒体域名" "$MEDIA_DOMAIN"

save_config

if ! command_exists npm; then
    echo "Error: npm not found."
    exit 1
fi

if ! command_exists rsync; then
    echo "Error: rsync not found."
    exit 1
fi

log "同步后端源码到部署目录..."
mkdir -p "$SERVER_ROOT"
rsync -av --delete --exclude='data' --exclude='log' --exclude='node_modules' "$REPO_ROOT/server/" "$SERVER_ROOT/"

RUN_WRAPPER="$SERVER_ROOT/run.sh"
cat > "$RUN_WRAPPER" <<EOF
#!/bin/bash
export MEDIA_DOMAIN="$MEDIA_DOMAIN"
cd "$SERVER_ROOT"
exec node index.js
EOF
chmod +x "$RUN_WRAPPER"

log "构建 chronicle-frontend..."
mkdir -p "$BACKEND_ROOT"
cd "$REPO_ROOT/$REPO_FRONTEND_SRC_NAME"
VITE_API_BASE_URL="$FRONTEND_API_BASE_URL" npm run build

log "恢复 chronicle-frontend 源码中的 upload symlink..."
ensure_symlink "$REPO_ROOT/$REPO_FRONTEND_SRC_NAME/public/server/data/upload" "$REPO_ROOT/server/data/upload"

log "部署 chronicle-frontend 到后台站点目录 ($BACKEND_ROOT)..."
rsync -a --delete "$REPO_ROOT/$REPO_FRONTEND_SRC_NAME/dist/" "$BACKEND_ROOT/"

log "构建 astro-frontend..."
mkdir -p "$WEB_ROOT"
cd "$REPO_ROOT/$REPO_ASTRO_SRC_NAME"
API_BASE_URL="$ASTRO_API_BASE_URL" npm run build

log "恢复 astro-frontend 源码中的 upload symlink..."
ensure_symlink "$REPO_ROOT/$REPO_ASTRO_SRC_NAME/public/server/data/upload" "$REPO_ROOT/server/data/upload"

log "部署 astro-frontend 到前台站点目录 ($WEB_ROOT)..."
rsync -a --delete "$REPO_ROOT/$REPO_ASTRO_SRC_NAME/dist/" "$WEB_ROOT/"

log "配置前台上传目录符号链接..."
ensure_symlink "$WEB_ROOT/server/data/upload" "$SERVER_ROOT/data/upload"

log "配置后台上传目录符号链接..."
ensure_symlink "$BACKEND_ROOT/server/data/upload" "$SERVER_ROOT/data/upload"

log "重载服务..."
if command -v pm2 &> /dev/null; then
    pm2 restart chronicle || pm2 start "$RUN_WRAPPER" --name chronicle
else
    warn "pm2 not found. Cannot restart backend automatically."
fi

if systemctl is-active --quiet nginx; then
    systemctl reload nginx
    log "Nginx reloaded."
else
    warn "Nginx is not running or not managed by systemctl."
fi

log "Deployment Complete!"
