#!/usr/bin/env bash
# 克隆/同步远端 `server` 目录到本地工作区的脚本（基于 rsync over SSH）
# 支持通过环境变量或命令行参数传入远端信息。
# 用法示例：
#   ./scripts/clone_server.sh -u user -h host -r /path/to/remote/server -d ./server -k ~/.ssh/id_rsa -p 22

set -o pipefail
set -euo pipefail

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

usage() {
  cat <<EOF
Usage: $0 [options]
Options:
  -u USER       远端 SSH 用户名（或环境变量 SERVER_USER）
  -h HOST       远端主机（或环境变量 SERVER_IP）
  -r REMOTE_SERVER_PATH 远端目录路径（或环境变量 REMOTE_SERVER_PATH），默认: /opt/chronicle/server
  -d DEST       本地目标目录（默认: ./server）
  -k SSH_KEY    私钥路径（或环境变量 SSH_KEY），可选
  -P PORT       SSH 端口（或环境变量 SSH_PORT），默认 22
  -n            dry-run（仅显示将要执行的 rsync 命令）
  -y            自动确认（非交互）
  -?            显示本帮助

环境变量优先级低于命令行参数。
示例：
  SERVER_USER=alice SERVER_IP=host.example.com REMOTE_SERVER_PATH=/opt/chronicle/server \ 
    ./scripts/clone_server.sh -d ./server_backup -n
EOF
}

# 默认值
DEST_DIR="./server"
REMOTE_SERVER_PATH="/opt/chronicle/server"
SSH_PORT="22"
DRY_RUN=0
AUTO_YES=0

while getopts ":u:h:r:d:k:P:w:ny?" opt; do
  case $opt in
    u) SERVER_USER="$OPTARG" ;;
    h) SERVER_IP="$OPTARG" ;;
    r) REMOTE_SERVER_PATH="$OPTARG" ;;
    d) DEST_DIR="$OPTARG" ;;
    k) SSH_KEY="$OPTARG" ;;
    w) SERVER_PWD="$OPTARG" ;;
    P) SSH_PORT="$OPTARG" ;;
    n) DRY_RUN=1 ;;
    y) AUTO_YES=1 ;;
    ?) usage; exit 0 ;;
  esac
done

# Load .env files (project root, script dir, current dir) if present
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_files=("/opt/Chronicle/.env" "$script_dir/.env" ".env")
for ef in "${env_files[@]}"; do
  if [ -f "$ef" ]; then
    info "加载环境变量文件: $ef"
    set -o allexport
    # shellcheck disable=SC1090
    . "$ef" || { echo "加载 $ef 失败"; exit 2; }
    set +o allexport
  fi
done

# 从环境变量获取（如果未通过参数提供）
: ${SERVER_USER:="${SERVER_USER:-}"}
: ${SERVER_IP:="${SERVER_IP:-}"}
: ${REMOTE_SERVER_PATH:="${REMOTE_SERVER_PATH:-$REMOTE_SERVER_PATH}"}
: ${SSH_KEY:="${SSH_KEY:-}"}
: ${SSH_PORT:="${SSH_PORT:-$SSH_PORT}"}
: ${SERVER_PWD:="${SERVER_PWD:-}"}

if [ -z "${SERVER_USER:-}" ] || [ -z "${SERVER_IP:-}" ]; then
  error "需要远端 SSH 用户和主机。使用 -u 和 -h，或设置 SERVER_USER/SERVER_IP 环境变量。"
  usage
  exit 2
fi

# 检查常用命令
check_cmd rsync
check_cmd ssh
mkdir -p "$DEST_DIR"

# 构造 ssh 选项

SSH_OPTS="-p ${SSH_PORT} -o StrictHostKeyChecking=accept-new"
if [ -n "${SSH_KEY:-}" ]; then
  SSH_OPTS+=" -i ${SSH_KEY}"
fi

# 如果提供了密码并且系统安装了 sshpass，则使用 sshpass 包装 rsync
USE_SSHPASS=0
if [ -n "${SERVER_PWD:-}" ]; then
  if command -v sshpass >/dev/null 2>&1; then
    USE_SSHPASS=1
  else
    echo "警告：提供了密码但未检测到 sshpass，rsync 将尝试使用标准 ssh（可能会提示输入密码）。若需非交互请安装 sshpass。"
  fi
fi

RSYNC_CMD=(rsync -avz --delete -e "ssh ${SSH_OPTS}")

FULL_SRC="${SERVER_USER}@${SERVER_IP}:${REMOTE_SERVER_PATH%/}/"

info "目标目录: ${DEST_DIR}"
info "远端: ${FULL_SRC}"

if [ "$DRY_RUN" -eq 1 ]; then
  info "DRY RUN: 将执行以下命令："
  if [ "$USE_SSHPASS" -eq 1 ]; then
    echo "sshpass -p '****' ${RSYNC_CMD[*]} ${FULL_SRC} ${DEST_DIR%/}/"
  else
    echo "${RSYNC_CMD[*]} ${FULL_SRC} ${DEST_DIR%/}/"
  fi
  exit 0
fi

if [ "$AUTO_YES" -ne 1 ]; then
  read -r -p "确认同步远端到本地（会删除目标中不存在于远端的文件）？[y/N] " answer
  case "$answer" in
    [Yy]*) ;;
    *) info "已取消。"; exit 0 ;;
  esac
fi

info "开始同步..."
if [ "$USE_SSHPASS" -eq 1 ]; then
  sshpass -p "$SERVER_PWD" "${RSYNC_CMD[@]}" "${FULL_SRC}" "${DEST_DIR%/}/"
else
  "${RSYNC_CMD[@]}" "${FULL_SRC}" "${DEST_DIR%/}/"
fi

success "同步完成。"
