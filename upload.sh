#!/bin/bash

#!/bin/bash

set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RESET='\033[0m'

error() { printf "%b\n" "${RED}$*${RESET}" >&2; }
success() { printf "%b\n" "${GREEN}$*${RESET}"; }
info() { printf "%b\n" "${YELLOW}$*${RESET}"; }

die() {
    error "ERROR: $*"
    exit 1
}

check_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "命令 '$1' 未找到，请先安装。"
}

info "开始上传流程..."

# Load .env files (project root, script dir, current dir) if present
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_files=("/opt/Chronicle/.env" "$script_dir/.env" ".env")
for ef in "${env_files[@]}"; do
    if [ -f "$ef" ]; then
        info "加载环境变量文件: $ef"
        set -o allexport
        # shellcheck disable=SC1090
        . "$ef" || die "加载 $ef 失败"
        set +o allexport
    fi
done

# 检查常用命令
check_cmd npm
check_cmd rsync
check_cmd tar
check_cmd scp || die "scp 未找到，请安装 OpenSSH 客户端。"

# 1. 支持环境变量覆盖，否则交互输入服务器信息
if [ -z "$SERVER_IP" ]; then
    read -p "请输入服务器IP: " SERVER_IP
fi
if [ -z "$SERVER_USER" ]; then
    read -p "请输入服务器用户名: " SERVER_USER
fi
if [ -z "$SERVER_PWD" ]; then
    # -s 仍然支持从管道读取，但优先使用环境变量
    read -s -p "请输入服务器密码 (留空则使用密钥认证): " SERVER_PWD
    echo
fi
if [ -z "$REMOTE_PATH" ]; then
    read -p "请输入服务器目标路径（如 /opt/chronicle-deploy）: " REMOTE_PATH
fi

# 2. 前端打包
echo "正在构建前端..."
cd /opt/Chronicle/chronicle-frontend || die "无法进入 /opt/Chronicle/chronicle-frontend"
if ! npm run build; then
    die "前端打包失败，请检查错误输出。"
fi

# Clean temp dir to prevent stale files
rm -rf /tmp/chronicle-upload
mkdir -p /tmp/chronicle-upload || die "无法创建临时目录 /tmp/chronicle-upload"

# 3. 复制 server 目录到临时目录，并清理 data 文件，仅保留目录结构
cd /opt/Chronicle || die "无法进入 /opt/Chronicle"
if [ -d "server/node_modules" ]; then
    info "Warning: server/node_modules detected. It will be excluded from upload."
fi
info "正在同步 server 文件..."
if ! rsync -av --exclude='node_modules' --exclude='.git' server /tmp/chronicle-upload/; then
    die "rsync 同步 server 目录失败。"
fi
# Clean data files if directory exists
if [ -d /tmp/chronicle-upload/server/data ]; then
    find /tmp/chronicle-upload/server/data -type f -delete || info "警告：清理 data 文件失败，但继续。"
fi

# 4. 复制 dist 到临时目录
info "复制 dist..."
if ! cp -r chronicle-frontend/dist /tmp/chronicle-upload/; then
    die "复制 dist 失败。确保前端已正确构建并生成 dist。"
fi

# 5. 打包
cd /tmp/chronicle-upload || die "无法进入 /tmp/chronicle-upload"
info "正在打包..."
if ! tar czf chronicle-upload.tar.gz server dist; then
    die "打包失败。"
fi

# 6. 上传（优先使用 sshpass，如果没有则尝试使用 scp）
echo "开始上传到 ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/ ..."
if command -v sshpass >/dev/null 2>&1 && [ -n "$SERVER_PWD" ]; then
    scp_output=$(sshpass -p "$SERVER_PWD" scp -o StrictHostKeyChecking=no chronicle-upload.tar.gz ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/ 2>&1)
    scp_status=$?
else
    if [ -z "$SERVER_PWD" ]; then
        echo "未提供密码，使用密钥认证进行 scp..."
    else
        echo "sshpass 未安装，尝试使用 scp（如需密码请安装 sshpass）..."
    fi
    scp_output=$(scp chronicle-upload.tar.gz ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/ 2>&1)
    scp_status=$?
fi

if [ $scp_status -ne 0 ]; then
    error "上传失败（scp 返回码 $scp_status）："
    error "$scp_output"
    # 检测常见 ssh 配置问题并给出提示
    if echo "$scp_output" | grep -iq "Bad configuration option"; then
        error "提示：检测到 SSH 客户端配置文件中存在不支持的选项（例如 'permitrootlogin'）。"
        error "请将 'PermitRootLogin' 之类的选项放在服务器端的 /etc/ssh/sshd_config，而非客户端的 /etc/ssh/ssh_config。"
    fi
    die "上传过程失败，请根据上方错误信息排查。"
fi

success "上传完成！请在服务器上解压："
success "cd ${REMOTE_PATH} && tar xzf chronicle-upload.tar.gz"