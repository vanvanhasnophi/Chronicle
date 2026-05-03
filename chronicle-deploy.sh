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

CONFIG_DIR="${HOME}/.config/chronicle"
CONFIG_FILE="$CONFIG_DIR/deploy.conf"
ARCHIVE_NAME="chronicle-upload.tar.gz"

FRONTEND_DOMAIN_DEFAULT="blog.eightyfor.top"
FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-$FRONTEND_DOMAIN_DEFAULT}"
WEB_ROOT_DEFAULT="/var/www/${FRONTEND_DOMAIN}"
WEB_ROOT="${WEB_ROOT:-$WEB_ROOT_DEFAULT}"
SERVER_ROOT="${SERVER_ROOT:-/opt/chronicle/server}"
ASTRO_ROOT="${ASTRO_ROOT:-/opt/chronicle/astro-frontend}"
MEDIA_DOMAIN="${MEDIA_DOMAIN:-https://file.eightyfor.top}"
FRONTEND_API_BASE_URL_DEFAULT="https://${FRONTEND_DOMAIN}"
FRONTEND_API_BASE_URL="${FRONTEND_API_BASE_URL:-$FRONTEND_API_BASE_URL_DEFAULT}"
ASTRO_API_BASE_URL="${ASTRO_API_BASE_URL:-http://127.0.0.1:3000}"

if [ -f "$CONFIG_FILE" ]; then
    log "加载部署配置: $CONFIG_FILE"
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
    FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-$FRONTEND_DOMAIN_DEFAULT}"
    WEB_ROOT="${WEB_ROOT:-/var/www/${FRONTEND_DOMAIN}}"
    SERVER_ROOT="${SERVER_ROOT:-/opt/chronicle/server}"
    ASTRO_ROOT="${ASTRO_ROOT:-/opt/chronicle/astro-frontend}"
    MEDIA_DOMAIN="${MEDIA_DOMAIN:-https://file.eightyfor.top}"
    FRONTEND_API_BASE_URL="${FRONTEND_API_BASE_URL:-https://${FRONTEND_DOMAIN}}"
    ASTRO_API_BASE_URL="${ASTRO_API_BASE_URL:-http://127.0.0.1:3000}"
fi

save_config() {
    mkdir -p "$CONFIG_DIR"
    cat > "$CONFIG_FILE" <<EOF
FRONTEND_DOMAIN="$FRONTEND_DOMAIN"
WEB_ROOT="$WEB_ROOT"
SERVER_ROOT="$SERVER_ROOT"
ASTRO_ROOT="$ASTRO_ROOT"
MEDIA_DOMAIN="$MEDIA_DOMAIN"
FRONTEND_API_BASE_URL="$FRONTEND_API_BASE_URL"
ASTRO_API_BASE_URL="$ASTRO_API_BASE_URL"
EOF
}

log "Starting Chronicle Deployment..."

if [ ! -f "$ARCHIVE_NAME" ]; then
    echo "Error: $ARCHIVE_NAME not found directly in this folder."
    exit 1
fi

prompt_default FRONTEND_DOMAIN "请输入前台域名" "$FRONTEND_DOMAIN"
prompt_default WEB_ROOT "请输入前台部署目录" "$WEB_ROOT"
prompt_default SERVER_ROOT "请输入后端目录" "$SERVER_ROOT"
prompt_default ASTRO_ROOT "请输入 Astro 源码目录" "$ASTRO_ROOT"
prompt_default FRONTEND_API_BASE_URL "请输入前台 API 基址" "$FRONTEND_API_BASE_URL"
prompt_default ASTRO_API_BASE_URL "请输入 Astro 构建时 API 基址" "$ASTRO_API_BASE_URL"
prompt_default MEDIA_DOMAIN "请输入媒体域名" "$MEDIA_DOMAIN"

save_config

log "Extracting archive..."
rm -rf temp_deploy
mkdir temp_deploy
tar xzf "$ARCHIVE_NAME" -C temp_deploy

mkdir -p "$(dirname "$SERVER_ROOT")" "$ASTRO_ROOT"

log "Updating Astro source ($ASTRO_ROOT)..."
rsync -av --delete --exclude='node_modules' --exclude='dist' --exclude='.astro' temp_deploy/astro-frontend/ "$ASTRO_ROOT/"

log "Recreating Astro upload symlink..."
mkdir -p "$ASTRO_ROOT/public/server/data"
REAL_UPLOAD_PATH="$SERVER_ROOT/data/upload"
ASTRO_UPLOAD_LINK="$ASTRO_ROOT/public/server/data/upload"
if [ -d "$REAL_UPLOAD_PATH" ]; then
    if [ -L "$ASTRO_UPLOAD_LINK" ] || [ -e "$ASTRO_UPLOAD_LINK" ]; then
        rm -rf "$ASTRO_UPLOAD_LINK"
    fi
    ln -s "$REAL_UPLOAD_PATH" "$ASTRO_UPLOAD_LINK"
fi

log "Updating Backend ($SERVER_ROOT)..."
mkdir -p "$SERVER_ROOT"
rsync -av --delete --exclude='data' --exclude='log' --exclude='node_modules' temp_deploy/server/ "$SERVER_ROOT/"

RUN_WRAPPER="$SERVER_ROOT/run.sh"
cat > "$RUN_WRAPPER" <<EOF
#!/bin/bash
export MEDIA_DOMAIN="$MEDIA_DOMAIN"
cd "$SERVER_ROOT"
exec node index.js
EOF
chmod +x "$RUN_WRAPPER"

log "Installing Backend Dependencies..."
cd "$SERVER_ROOT"
npm install --production

log "Installing Astro Dependencies..."
cd "$ASTRO_ROOT"
npm install

log "Building Astro frontend..."
API_BASE_URL="$ASTRO_API_BASE_URL" npm run build

log "Deploying Astro dist to $WEB_ROOT..."
mkdir -p "$WEB_ROOT"
rsync -a --delete "$ASTRO_ROOT/dist/" "$WEB_ROOT/"

log "Configuring Image Optimization (Symlinks)..."
mkdir -p "$WEB_ROOT/server/data"
REAL_UPLOAD_PATH="$SERVER_ROOT/data/upload"
LINK_PATH="$WEB_ROOT/server/data/upload"
if [ -d "$REAL_UPLOAD_PATH" ]; then
    if [ -L "$LINK_PATH" ]; then
        :
    elif [ -d "$LINK_PATH" ]; then
        warn "$LINK_PATH exists as a directory, replacing it with a symlink."
        rm -rf "$LINK_PATH"
        ln -s "$REAL_UPLOAD_PATH" "$LINK_PATH"
    else
        ln -s "$REAL_UPLOAD_PATH" "$LINK_PATH"
    fi
else
    warn "Real upload path $REAL_UPLOAD_PATH does not exist yet."
fi

cd "$(dirname "$0")"
rm -rf temp_deploy

log "Reloading Services..."
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
