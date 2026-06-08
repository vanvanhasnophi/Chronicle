#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Chronicle v1 数据导出脚本（在旧 v1 仓库中运行）
#
# 用法:
#   bash scripts/export-v1-data.sh
#
# 约定（与 migrate-v1-to-v2.sh 共享）:
#   安全位置: ~/.chronicle/v1data.tar.gz
#
# 做的事:
#   1. 找到 v1 数据目录（自动检测或手动指定）
#   2. 打包为 tar.gz 放到 ~/.chronicle/
#   3. 询问是否清理旧目录
#   4. git clone 新 v2 仓库
# ═══════════════════════════════════════════════════════════════

set -Eeuo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

log()   { printf "%b\n" "${GREEN}[$1]${RESET} ${2:-}"; }
warn()  { printf "%b\n" "${YELLOW}[Warn]${RESET} $*"; }
die()   { printf "%b\n" "${RED}[Error]${RESET} $*" >&2; exit 1; }

# ── 约定: 与 migrate-v1-to-v2.sh 共享的安全位置 ──────────
SAFE_DIR="${HOME}/.chronicle"
SAFE_FILE="${SAFE_DIR}/v1data.tar.gz"

# ── 可选: 新仓库地址和安装目录 ────────────────────────────
NEW_REPO_URL="${REPO_URL:-https://github.com/vanvanhasnophi/Chronicle.git}"
NEW_REPO_BRANCH="${REPO_BRANCH:-main}"
NEW_INSTALL_DIR="${INSTALL_DIR:-/opt/Chronicle}"

# ═══════════════════════════════════════════════════════════════
# Step 1: 找到 v1 数据目录
# ═══════════════════════════════════════════════════════════════
log "STEP1" "查找 v1 数据目录..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 候选检测路径
CANDIDATES=(
  "$REPO_ROOT/server/data"
  "$REPO_ROOT/data"
  "/opt/Chronicle/server/data"
  "/opt/Chronicle/data"
)

V1_DATA=""
for dir in "${CANDIDATES[@]}"; do
  if [[ -f "$dir/settings.json" ]]; then
    V1_DATA="$dir"
    break
  fi
done

if [[ -z "$V1_DATA" ]]; then
  warn "未自动找到 v1 数据目录。"
  read -r -p "请手动输入 v1 数据目录完整路径: " V1_DATA || true
  if [[ ! -d "$V1_DATA" || ! -f "$V1_DATA/settings.json" ]]; then
    die "该目录不包含 settings.json，不是有效的 v1 数据目录"
  fi
fi

log "STEP1" "v1 数据目录: $V1_DATA"

# 快速统计
echo "  - settings.json: $([[ -f "$V1_DATA/settings.json" ]] && echo '✓' || echo '✗')"
echo "  - posts/:        $([[ -f "$V1_DATA/posts/index.json" ]] && echo "✓ ($(python3 -c "import json; print(len(json.load(open('$V1_DATA/posts/index.json','r'))))" 2>/dev/null || echo '?') posts)" || echo '✗')"
echo "  - upload/:       $(find "$V1_DATA/upload" -type f 2>/dev/null | wc -l) files"

# ═══════════════════════════════════════════════════════════════
# Step 2: 打包
# ═══════════════════════════════════════════════════════════════
log "STEP2" "打包数据到 $SAFE_FILE ..."

mkdir -p "$SAFE_DIR"

# 打包时保持目录结构，以便 migrate 脚本能找到 settings.json
cd "$(dirname "$V1_DATA")"
BASE_NAME="$(basename "$V1_DATA")"

tar czf "$SAFE_FILE" "$BASE_NAME" 2>&1 || die "打包失败"

PACK_SIZE=$(du -h "$SAFE_FILE" 2>/dev/null | cut -f1 || echo '?')
log "STEP2" "打包完成 ($PACK_SIZE): $SAFE_FILE"

# ═══════════════════════════════════════════════════════════════
# Step 3: 确认数据包完整性
# ═══════════════════════════════════════════════════════════════
log "STEP3" "验证数据包..."
tar tzf "$SAFE_FILE" 2>/dev/null | head -5 || true

# ═══════════════════════════════════════════════════════════════
# Step 4: 询问是否清理旧目录
# ═══════════════════════════════════════════════════════════════
read -r -p "是否删除旧仓库目录 $REPO_ROOT ? [y/N]: " clean_choice || true
if [[ "${clean_choice,,}" == "y" ]]; then
  log "STEP4" "删除旧仓库目录..."
  rm -rf "$REPO_ROOT"
  log "STEP4" "已删除: $REPO_ROOT"
else
  log "STEP4" "保留旧目录: $REPO_ROOT"
fi

# ═══════════════════════════════════════════════════════════════
# Step 5: 克隆新 v2 仓库
# ═══════════════════════════════════════════════════════════════
read -r -p "是否克隆新 v2 仓库到 $NEW_INSTALL_DIR ? [y/N]: " clone_choice || true
if [[ "${clone_choice,,}" != "y" ]]; then
  cat <<EOF

${GREEN}═══ 导出完成 ═══${RESET}

📦 数据包:  $SAFE_FILE
📋 下一步:  在新 v2 仓库中运行:
            bash scripts/migrate-v1-to-v2.sh

EOF
  exit 0
fi

log "STEP5" "克隆新 v2 仓库..."

if [[ -d "$NEW_INSTALL_DIR" ]]; then
  warn "$NEW_INSTALL_DIR 已存在，跳过 clone"
else
  git clone --branch "$NEW_REPO_BRANCH" --depth 1 "$NEW_REPO_URL" "$NEW_INSTALL_DIR" 2>&1 || die "clone 失败"
fi

# 把数据包复制到新仓库（方便 migrate 脚本找到）
cp "$SAFE_FILE" "$NEW_INSTALL_DIR/v1data.tar.gz"
log "STEP5" "数据包已复制到 $NEW_INSTALL_DIR/v1data.tar.gz"

cat <<EOF

${GREEN}╔═══════════════════════════════════════════════════════╗${RESET}
${GREEN}║        v1 数据导出完成！                              ║${RESET}
${GREEN}╚═══════════════════════════════════════════════════════╝${RESET}

📦 安全位置:  $SAFE_FILE
📂 新仓库:    $NEW_INSTALL_DIR

📋 下一步:
    cd $NEW_INSTALL_DIR
    bash scripts/migrate-v1-to-v2.sh

EOF
