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
ASTRO_ROOT_DEFAULT="${ASTRO_ROOT:-/opt/Chronicle/packages/template-astro}"
MEDIA_DOMAIN_DEFAULT="${MEDIA_DOMAIN:-https://file.eightyfor.top}"
FRONTEND_API_BASE_URL_DEFAULT="${FRONTEND_API_BASE_URL:-https://${FRONTEND_DOMAIN_DEFAULT}}"
ASTRO_API_BASE_URL_DEFAULT="${ASTRO_API_BASE_URL:-http://127.0.0.1:3000}"

# 首先检查是否存在已保存的配置文件；如果存在，列出并询问是否采用
ADOPTED_CONFIG=0
if [ -f "$CONFIG_FILE" ]; then
    log "找到已保存的部署配置: $CONFIG_FILE"
    echo "--- 当前保存的配置 ---"
    nl -ba "$CONFIG_FILE" | sed -n '1,200p'
    echo "----------------------"
    # 将已保存配置 source 为默认值（不会立刻完全采用）
    # shellcheck disable=SC1090
    . "$CONFIG_FILE" || true

    read -r -p "是否完全采用上述已保存配置并跳过未填写项的交互？ [Y/n]: " adopt_choice || true
    adopt_choice=${adopt_choice:-y}
    # 仅在配置文件包含所有必需项时，才允许“完全采用”并跳过交互填写
    if [ "${adopt_choice,,}" = "y" ]; then
        MISSING_COUNT=0
        REQUIRED_VARS=("FRONTEND_DOMAIN" "BACKEND_DOMAIN" "WEB_ROOT" "BACKEND_ROOT" "SERVER_ROOT" "ASTRO_ROOT" "FRONTEND_API_BASE_URL" "ASTRO_API_BASE_URL" "MEDIA_DOMAIN" "REPO_FRONTEND_SRC_NAME" "REPO_ASTRO_SRC_NAME")
        for v in "${REQUIRED_VARS[@]}"; do
            if [ -z "${!v:-}" ]; then
                MISSING_COUNT=$((MISSING_COUNT+1))
            fi
        done
        if [ "$MISSING_COUNT" -eq 0 ]; then
            log "采用已保存配置：$CONFIG_FILE（配置完整，跳过交互）"
            ADOPTED_CONFIG=1
        else
            warn "已保存配置存在但缺少 $MISSING_COUNT 项，将使用已保存配置作为默认值并提示补全缺失项。"
            ADOPTED_CONFIG=0
            log "转为扫描仓库以检测源码目录并初始化（保留已保存配置作为默认）。"
        fi
    else
        log "用户选择不完全采用已保存配置，将使用其作为默认值并提示补全缺失项。"
    fi
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

        REPO_FRONTEND_SRC_NAME="packages/admin"
        REPO_ASTRO_SRC_NAME="packages/template-astro"

        if [ "${#CANDIDATES[@]}" -gt 0 ]; then
            echo "检测到以下候选源码目录："
            i=1
            for c in "${CANDIDATES[@]}"; do
                echo "  $i) $c"
                i=$((i+1))
            done

            for c in "${CANDIDATES[@]}"; do
                case "$c" in
                    astro-template|packages/template-astro) REPO_ASTRO_SRC_NAME="$c" ;;
                    chronicle-frontend|packages/admin) REPO_FRONTEND_SRC_NAME="$c" ;;
                esac
            done

            echo "检测到的默认源码目录："
            echo "  Astro 源码目录: $REPO_ASTRO_SRC_NAME"
            echo "  管理后台源码目录: $REPO_FRONTEND_SRC_NAME"

            prompt_default REPO_FRONTEND_SRC_NAME "请选择管理前端源码目录名" "$REPO_FRONTEND_SRC_NAME"
            prompt_default REPO_ASTRO_SRC_NAME "请选择 Astro 源码目录名" "$REPO_ASTRO_SRC_NAME"
        else
            log "未检测到候选源码目录。请手动输入源码目录名。"
            read -r -p "管理前端源码目录名 (例如 packages/admin): " REPO_FRONTEND_SRC_NAME || true
            REPO_FRONTEND_SRC_NAME=${REPO_FRONTEND_SRC_NAME:-packages/admin}
            read -r -p "Astro 源码目录名 (例如 packages/template-astro): " REPO_ASTRO_SRC_NAME || true
            REPO_ASTRO_SRC_NAME=${REPO_ASTRO_SRC_NAME:-packages/template-astro}
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

    REPO_FRONTEND_SRC_NAME="packages/admin"
    REPO_ASTRO_SRC_NAME="packages/template-astro"

    if [ "${#CANDIDATES[@]}" -gt 0 ]; then
        echo "检测到以下候选源码目录："
        i=1
        for c in "${CANDIDATES[@]}"; do
            echo "  $i) $c"
            i=$((i+1))
        done

        for c in "${CANDIDATES[@]}"; do
            case "$c" in
                astro-template) REPO_ASTRO_SRC_NAME="$c" ;;
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
        read -r -p "管理前端源码目录名 (例如 packages/admin): " REPO_FRONTEND_SRC_NAME || true
        REPO_FRONTEND_SRC_NAME=${REPO_FRONTEND_SRC_NAME:-packages/admin}
        read -r -p "Astro 源码目录名 (例如 packages/template-astro): " REPO_ASTRO_SRC_NAME || true
        REPO_ASTRO_SRC_NAME=${REPO_ASTRO_SRC_NAME:-packages/template-astro}
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

if [ "$ADOPTED_CONFIG" -eq 0 ]; then
    prompt_default FRONTEND_DOMAIN "请输入前台域名" "$FRONTEND_DOMAIN"
    prompt_default BACKEND_DOMAIN "请输入后台域名" "$BACKEND_DOMAIN"
    prompt_default WEB_ROOT "请输入前台部署目录" "$WEB_ROOT"
    prompt_default BACKEND_ROOT "请输入后台部署目录" "$BACKEND_ROOT"
    prompt_default SERVER_ROOT "请输入后端目录" "$SERVER_ROOT"
    prompt_default ASTRO_ROOT "请输入 Astro 源码目录" "$ASTRO_ROOT"
    prompt_default FRONTEND_API_BASE_URL "请输入 packages/admin 的 API 基址" "$FRONTEND_API_BASE_URL"
    prompt_default ASTRO_API_BASE_URL "请输入 Astro 构建时 API 基址" "$ASTRO_API_BASE_URL"
    prompt_default MEDIA_DOMAIN "请输入媒体域名" "$MEDIA_DOMAIN"

    save_config
fi

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

cd "$SERVER_ROOT"
if [ -f package.json ]; then
    log "Installing server dependencies (npm install)..."
    npm install || warn "npm install failed in $SERVER_ROOT"
else
    warn "No package.json in $SERVER_ROOT, skipping npm install."
fi

RUN_WRAPPER="$SERVER_ROOT/run.sh"
cat > "$RUN_WRAPPER" <<EOF
#!/bin/bash
export MEDIA_DOMAIN="$MEDIA_DOMAIN"
cd "$SERVER_ROOT"
exec node index.js
EOF
chmod +x "$RUN_WRAPPER"

log "重启/启动后端服务器..."
if command -v pm2 &> /dev/null; then
    pm2 restart chronicle-server || pm2 start "$RUN_WRAPPER" --name chronicle-server
else
    warn "pm2 not found. Cannot restart backend automatically."
fi

log "构建 packages/admin..."
mkdir -p "$BACKEND_ROOT"
cd "$REPO_ROOT/$REPO_FRONTEND_SRC_NAME"

# Ensure frontend dependencies are installed before build
if [ -f "package.json" ]; then
    log "Installing ${REPO_FRONTEND_SRC_NAME} dependencies (npm install)..."
    (cd "$REPO_ROOT/$REPO_FRONTEND_SRC_NAME" && npm install) || warn "npm install failed in $REPO_ROOT/$REPO_FRONTEND_SRC_NAME"
else
    warn "No package.json in $REPO_ROOT/$REPO_FRONTEND_SRC_NAME, skipping npm install."
fi

# 在每次构建前询问是否使用现成 dist（如果用户选择 yes 且 dist 存在，则跳过构建）
FRONTEND_DIST_DIR="$REPO_ROOT/$REPO_FRONTEND_SRC_NAME/dist"
read -r -p "是否使用现成 ${REPO_FRONTEND_SRC_NAME}/dist 并跳过构建？ [y/N]: " use_existing_dist || true
use_existing_dist=${use_existing_dist:-n}
SKIP_BUILD_FRONTEND=0
if [ "${use_existing_dist,,}" = "y" ]; then
    if [ -d "$FRONTEND_DIST_DIR" ]; then
        log "用户选择使用现成 dist，跳过构建。"
        SKIP_BUILD_FRONTEND=1
    else
        warn "用户选择跳过构建但未找到 $FRONTEND_DIST_DIR，继续构建。"
        SKIP_BUILD_FRONTEND=0
    fi
fi

if [ "$SKIP_BUILD_FRONTEND" -eq 0 ]; then
    VITE_API_BASE_URL="$FRONTEND_API_BASE_URL" npm run build
else
    log "跳过构建，使用现成 dist。"
fi

log "恢复 packages/admin 源码中的 upload symlink..."
ensure_symlink "$REPO_ROOT/$REPO_FRONTEND_SRC_NAME/public/server/data/upload" "$REPO_ROOT/data/upload"
ensure_symlink "$REPO_ROOT/$REPO_FRONTEND_SRC_NAME/public/server/data/background" "$REPO_ROOT/data/background"

log "部署 packages/admin 到后台站点目录 ($BACKEND_ROOT)..."
rsync -a --delete "$REPO_ROOT/$REPO_FRONTEND_SRC_NAME/dist/" "$BACKEND_ROOT/"

log "构建 packages/template-astro..."
mkdir -p "$WEB_ROOT"
cd "$REPO_ROOT/$REPO_ASTRO_SRC_NAME"
# 在构建前把后端 settings.json 复制到 Astro 项目，以便在构建时/运行时读取 feature flags
SETTINGS_SRC="$REPO_ROOT/data/settings.json"
ASTRO_PUBLIC_DIR="$REPO_ROOT/$REPO_ASTRO_SRC_NAME/public/server/data"
ASTRO_SRC_DATA_DIR="$REPO_ROOT/$REPO_ASTRO_SRC_NAME/src/data"
if [ -f "$SETTINGS_SRC" ]; then
    mkdir -p "$ASTRO_PUBLIC_DIR"
    mkdir -p "$ASTRO_SRC_DATA_DIR"
    cp "$SETTINGS_SRC" "$ASTRO_PUBLIC_DIR/settings.json"
    cp "$SETTINGS_SRC" "$ASTRO_SRC_DATA_DIR/settings.json"
    log "已将 settings.json 复制到 Astro 的 public 和 src/data（供运行时与构建时使用）"
else
    warn "未找到 $SETTINGS_SRC，构建时将无法使用后端 settings。"
fi

# Ensure Astro dependencies are installed before build
if [ -f "package.json" ]; then
    log "Installing ${REPO_ASTRO_SRC_NAME} dependencies (npm install)..."
    (cd "$REPO_ROOT/$REPO_ASTRO_SRC_NAME" && npm install) || warn "npm install failed in $REPO_ROOT/$REPO_ASTRO_SRC_NAME"
else
    warn "No package.json in $REPO_ROOT/$REPO_ASTRO_SRC_NAME, skipping npm install."
fi

MEDIA_DOMAIN="$MEDIA_DOMAIN" API_BASE_URL="$ASTRO_API_BASE_URL" npm run build

log "恢复 packages/template-astro 源码中的 upload symlink..."
ensure_symlink "$REPO_ROOT/$REPO_ASTRO_SRC_NAME/public/server/data/upload" "$REPO_ROOT/data/upload"
ensure_symlink "$REPO_ROOT/$REPO_ASTRO_SRC_NAME/public/server/data/background" "$REPO_ROOT/data/background"

log "部署 packages/template-astro 到前台站点目录 ($WEB_ROOT)..."
rsync -a --delete "$REPO_ROOT/$REPO_ASTRO_SRC_NAME/dist/" "$WEB_ROOT/"

log "配置前台上传目录符号链接..."
ensure_symlink "$WEB_ROOT/server/data/upload" "$REPO_ROOT/data/upload"
ensure_symlink "$WEB_ROOT/server/data/background" "$REPO_ROOT/data/background"

log "配置后台上传目录符号链接..."
ensure_symlink "$BACKEND_ROOT/server/data/upload" "$REPO_ROOT/data/upload"
ensure_symlink "$BACKEND_ROOT/server/data/background" "$REPO_ROOT/data/background"

log "重载 Web 服务..."
if systemctl is-active --quiet nginx; then
    systemctl reload nginx
    log "Nginx reloaded."
else
    warn "Nginx is not running or not managed by systemctl."
fi

log "Deployment Complete!"
