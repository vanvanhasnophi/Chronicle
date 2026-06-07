#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Chronicle v1 → v2 数据迁移脚本（在 v2 仓库中运行）
#
# 用法:
#   bash scripts/migrate-v1-to-v2.sh /path/to/v1data.tar.gz
#   bash scripts/migrate-v1-to-v2.sh             # 默认从约定位置读取
#
# 约定（与 export-v1-data.sh 共享）:
#   ~/.chronicle/v1data.tar.gz  — 默认数据包位置
#   <repo_root>/v1data.tar.gz   — 备选
#
# 做以下事情:
#   1. 停止服务
#   2. 备份当前 data/ → data.bak.{timestamp}/
#   3. 解压 v1 数据
#   4. 转换并写入 v2 格式
#   5. npm install + build
#   6. 重启服务
# ═══════════════════════════════════════════════════════════════

set -Eeuo pipefail

# ── Config ─────────────────────────────────────────────────
REPO_ROOT="${REPO_ROOT:-/opt/Chronicle}"

# 数据包优先顺序: 命令行参数 > 仓库根目录 > 约定位置
SAFE_FILE_DEFAULT="${HOME}/.chronicle/v1data.tar.gz"
if [[ -f "${REPO_ROOT}/v1data.tar.gz" ]]; then
  V1_TARBALL="${1:-${REPO_ROOT}/v1data.tar.gz}"
else
  V1_TARBALL="${1:-${SAFE_FILE_DEFAULT}}"
fi

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

log()   { printf "%b\n" "${GREEN}[$1]${RESET} ${2:-}"; }
warn()  { printf "%b\n" "${YELLOW}[Warn]${RESET} $*"; }
die()   { printf "%b\n" "${RED}[Error]${RESET} $*" >&2; exit 1; }

# ── Step 1: 停止服务 ──────────────────────────────────────
log "STEP1" "停止 Chronicle 服务..."
if command -v pm2 &> /dev/null; then
  pm2 stop chronicle-server 2>/dev/null || true
  pm2 stop chronicle-host   2>/dev/null || true
fi
killall node 2>/dev/null || true
sleep 2

# ── Step 2: 备份现有 data/ ────────────────────────────────
DATA_DIR="${REPO_ROOT}/data"
if [[ -d "$DATA_DIR" ]] && [[ -f "$DATA_DIR/settings.json" ]]; then
  BACKUP_DIR="${REPO_ROOT}/data.bak.$(date +%Y%m%d-%H%M%S)"
  log "STEP2" "备份现有 data/ → $(basename "$BACKUP_DIR")"
  cp -a "$DATA_DIR" "$BACKUP_DIR"
fi

# ── Step 3: 解压 v1 数据（从约定安全位置）────────────────
if [[ ! -f "$V1_TARBALL" ]]; then
  die "v1 数据包不存在: $V1_TARBALL"
fi

MIGRATE_TMP="/tmp/chronicle-v1-migrate-$$"
log "STEP3" "解压 v1 数据到 $MIGRATE_TMP ..."
rm -rf "$MIGRATE_TMP"
mkdir -p "$MIGRATE_TMP"
tar xzf "$V1_TARBALL" -C "$MIGRATE_TMP" 2>&1 || die "解压失败"

V1_DATA="$MIGRATE_TMP/opt/Chronicle/server/data"
if [[ ! -d "$V1_DATA" ]]; then
  # 尝试其他可能的路径
  V1_DATA=$(find "$MIGRATE_TMP" -name "settings.json" -path "*/data/*" | head -1 | xargs dirname 2>/dev/null || true)
  if [[ -z "$V1_DATA" || ! -d "$V1_DATA" ]]; then
    die "找不到 v1 数据目录（需要包含 settings.json 的 data/ 目录）"
  fi
fi
log "STEP3" "v1 数据目录: $V1_DATA"

# ── Step 4: 确保 v2 data/ 目录结构 ─────────────────────────
log "STEP4" "准备 v2 数据目录..."
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"/{posts,upload,branding,manager-background}
mkdir -p "$DATA_DIR/upload"/{pic,sound,video,doc,txt,other,.thumbs/pic}

# 恢复 symlink
rm -rf "${REPO_ROOT}/packages/host/data" 2>/dev/null || true
ln -sf ../../data "${REPO_ROOT}/packages/host/data"

# ── Step 4a: 复制 upload/ ──────────────────────────────────
log "STEP4a" "迁移 upload/ ..."
if [[ -d "$V1_DATA/upload" ]]; then
  rsync -a "$V1_DATA/upload/" "$DATA_DIR/upload/" 2>&1 || warn "rsync upload 有部分错误，继续..."
fi
log "STEP4a" "upload 迁移完成 ($(find "$DATA_DIR/upload" -type f | wc -l) 个文件)"

# ── Step 4b: 迁移 background/ → branding/ ─────────────────
log "STEP4b" "迁移 background/ → branding/ ..."
if [[ -d "$V1_DATA/background" ]]; then
  cp -a "$V1_DATA/background/"* "$DATA_DIR/branding/" 2>/dev/null || true
fi
log "STEP4b" "branding 迁移完成 ($(find "$DATA_DIR/branding" -type f | wc -l) 个文件)"

# ── Step 4c: 迁移 posts/ ──────────────────────────────────
log "STEP4c" "迁移 posts/ ..."

# 复制 v1 posts 目录
if [[ -d "$V1_DATA/posts" ]]; then
  rsync -a "$V1_DATA/posts/" "$DATA_DIR/posts/" 2>&1 || warn "rsync posts 有部分错误，继续..."
fi

# ── 清理每个 post 目录（删除 compiled.html 和 toc.json）──
log "STEP4c" "清理 compiled.html / toc.json ..."
cleaned=0
for dir in "$DATA_DIR/posts"/*/; do
  [[ -d "$dir" ]] || continue
  for junk in "$dir"*-compiled.html "$dir"*-toc.json; do
    if [[ -f "$junk" ]]; then
      rm -f "$junk"
      ((cleaned++)) || true
    fi
  done
done
log "STEP4c" "清理了 $cleaned 个冗余文件"

# ── 处理遗留的平铺 .md 文件（移入 uuid 目录）─────
log "STEP4c" "处理遗留平铺 .md 文件..."
moved=0
for md_file in "$DATA_DIR/posts"/*.md; do
  [[ -f "$md_file" ]] || continue
  base=$(basename "$md_file" .md)
  uuid_dir="$DATA_DIR/posts/$base"
  mkdir -p "$uuid_dir"
  # 如果目录里还没有 content.md，把这个 md 作为 content.md
  if [[ ! -f "$uuid_dir/${base}-content.md" ]]; then
    cp "$md_file" "$uuid_dir/${base}-content.md"
    ((moved++)) || true
  fi
  # 删除平铺的 md（已安全复制）
  rm -f "$md_file"
done
log "STEP4c" "移动了 $moved 个平铺 .md 文件"

# ── 更新 index.json（去掉 toc 字段）─────────────────
INDEX_FILE="$DATA_DIR/posts/index.json"
if [[ -f "$INDEX_FILE" ]]; then
  log "STEP4c" "更新 index.json（移除 toc 字段）..."

  node -e "
    const fs = require('fs');
    const index = JSON.parse(fs.readFileSync('$INDEX_FILE', 'utf-8') || '[]');
    let changed = 0;
    const cleaned = index.map(p => {
      if (!p || typeof p !== 'object') return p;
      // 去除非 v2 字段
      if (p.toc !== undefined) { delete p.toc; changed++; }
      if (p.compiledHtml !== undefined) { delete p.compiledHtml; changed++; }
      // 确保 dir 字段存在
      if (!p.dir) p.dir = p.id || (p.filename ? p.filename.replace(/\.md$/, '') : '');
      // 确保 filename 格式正确
      if (!p.filename) p.filename = p.id + '.md';
      return p;
    });
    fs.writeFileSync('$INDEX_FILE', JSON.stringify(cleaned, null, 2), 'utf-8');
    console.log('  移除 toc 字段: ' + changed + ' 条');
    console.log('  总文章数: ' + cleaned.length);
  " 2>&1 || warn "index.json 更新有错误，请手动检查"
fi

# ── Step 4d: 迁移 collection.json → collections.json ─────
log "STEP4d" "迁移 collection.json → collections.json ..."
V1_COLLECTION="$V1_DATA/collection.json"
V2_COLLECTIONS="$DATA_DIR/collections.json"

if [[ -f "$V1_COLLECTION" ]]; then
  node -e "
    const fs = require('fs');
    const raw = JSON.parse(fs.readFileSync('$V1_COLLECTION', 'utf-8'));
    // v1 格式: { collections: [...] } 或直接数组
    let collections;
    if (Array.isArray(raw)) {
      collections = raw;
    } else if (raw && Array.isArray(raw.collections)) {
      collections = raw.collections;
    } else {
      collections = [];
    }
    fs.writeFileSync('$V2_COLLECTIONS', JSON.stringify(collections, null, 2), 'utf-8');
    console.log('  集合数: ' + collections.length);
  " 2>&1 || warn "collections.json 迁移有错误"
else
  echo '[]' > "$V2_COLLECTIONS"
  log "STEP4d" "无 v1 collection.json，写入空数组"
fi

# ── Step 4e: 迁移 settings.json ────────────────────────────
log "STEP4e" "迁移 settings.json ..."
V1_SETTINGS="$V1_DATA/settings.json"
V2_SETTINGS="$DATA_DIR/settings.json"
V2_FRIENDS="$DATA_DIR/friends.json"

if [[ -f "$V1_SETTINGS" ]]; then
  node -e "
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('$V1_SETTINGS', 'utf-8'));

    // 1. 提取 friends → friends.json
    const friends = {
      globalStyle: settings.friendsGlobalStyle || 'left-sm',
      cards: Array.isArray(settings.friendsCards) ? settings.friendsCards : [],
    };
    fs.writeFileSync('$V2_FRIENDS', JSON.stringify(friends, null, 2), 'utf-8');
    console.log('  friends 条目: ' + friends.cards.length);

    // 2. 从 settings 中删除 friends 字段
    delete settings.friendsCards;
    delete settings.friendsGlobalStyle;

    // 3. 更新背景图路径: /server/data/background/ → /server/data/branding/ or /server/data/manager-background/
    const rewriteBackgroundUrl = (val) => {
      if (typeof val === 'string') {
        return val
          .replace(/\/server\/data\/background\//g, '/server/data/branding/');
      }
      if (val && typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
          out[k] = (typeof v === 'string')
            ? v.replace(/\/server\/data\/background\//g, '/server/data/branding/')
            : v;
        }
        return out;
      }
      return val;
    };

    if (settings.frontendBackground) {
      settings.frontendBackground = rewriteBackgroundUrl(settings.frontendBackground);
    }
    if (settings.backendBackground) {
      settings.backendBackground = rewriteBackgroundUrl(settings.backendBackground);
    }
    if (settings.frontendBackgroundMeta) {
      try {
        const meta = typeof settings.frontendBackgroundMeta === 'string'
          ? JSON.parse(settings.frontendBackgroundMeta)
          : settings.frontendBackgroundMeta;
        if (meta.url) meta.url = meta.url.replace(/\/server\/data\/background\//g, '/server/data/branding/');
        settings.frontendBackgroundMeta = JSON.stringify(meta);
      } catch(e) {}
    }
    if (settings.backendBackgroundMeta) {
      try {
        const meta = typeof settings.backendBackgroundMeta === 'string'
          ? JSON.parse(settings.backendBackgroundMeta)
          : settings.backendBackgroundMeta;
        if (meta.url) meta.url = meta.url.replace(/\/server\/data\/background\//g, '/server/data/branding/');
        settings.backendBackgroundMeta = JSON.stringify(meta);
      } catch(e) {}
    }

    // 4. 补充 v2 新增默认字段
    if (!settings.backendTheme) settings.backendTheme = 'dark';
    if (!settings.backendFont) settings.backendFont = 'sans';
    if (!settings.backendLocale) settings.backendLocale = 'en';
    if (typeof settings.featureFlags === 'string') {
      settings.featureFlags = {
        searchSuggestions: false, relatedPosts: false,
        collectionPage: true, aboutPage: true,
        friendsPage: true, traffic: true,
      };
    }

    fs.writeFileSync('$V2_SETTINGS', JSON.stringify(settings, null, 2), 'utf-8');
    console.log('  settings 已迁移（背景图路径已更新）');
  " 2>&1 || warn "settings.json 迁移有错误"
else
  warn "v1 settings.json 不存在，跳过"
fi

# ── Step 4f: 复制 security.json ────────────────────────────
log "STEP4f" "迁移 security.json ..."
if [[ -f "$V1_DATA/security.json" ]]; then
  cp "$V1_DATA/security.json" "$DATA_DIR/security.json"
else
  warn "v1 security.json 不存在，将使用默认"
fi

# ── Step 4g: 写入 .schema-version ──────────────────────────
log "STEP4g" "写入 .schema-version ..."
cat > "$DATA_DIR/.schema-version" <<'EOF'
{
  "security": "1.0.0",
  "settings": "1.0.0"
}
EOF

# ── Step 5: 创建 profile.json（如果不存在）───────────────
PROFILE_FILE="$DATA_DIR/profile.json"
if [[ ! -f "$PROFILE_FILE" ]]; then
  log "STEP5" "创建默认 profile.json ..."
  cat > "$PROFILE_FILE" <<'EOF'
{
  "name": "",
  "bio": "",
  "avatar": ""
}
EOF
fi

# ── 清理临时文件 ──────────────────────────────────────────
rm -rf "$MIGRATE_TMP"
log "INFO" "临时文件已清理"

# ── Step 6: npm install + build ───────────────────────────
log "STEP6" "安装依赖并构建..."

cd "$REPO_ROOT"

log "STEP6" "安装 host 依赖..."
(cd packages/host && npm install --omit=dev 2>&1) || warn "host 依赖安装有错误"

log "STEP6" "安装 manager 依赖..."
(cd packages/manager && npm install 2>&1) || warn "manager 依赖安装有错误"

log "STEP6" "安装 template-astro 依赖..."
(cd packages/template-astro && npm install 2>&1) || warn "template-astro 依赖安装有错误"

log "STEP6" "构建 CMS (manager)..."
(cd packages/manager && npm run build 2>&1) || warn "CMS 构建失败"

log "STEP6" "构建 Astro 前端..."
# 通过 gen CLI 做完整构建（含 settings 同步 + Astro build + 输出部署）
DATA_DIR="$DATA_DIR" \
  npx chronicle-gen build \
    --dataDir "$DATA_DIR" \
    --codeDir "$REPO_ROOT/packages/template-astro" \
    --targetDir "$REPO_ROOT/packages/template-astro/dist" \
    2>&1 || warn "Astro 构建有错误，请手动检查"

# ── Step 7: 确保运行时目录 ────────────────────────────────
log "STEP7" "确保运行时目录和 symlink..."

mkdir -p "$REPO_ROOT/packages/manager/public/server/data"
mkdir -p "$REPO_ROOT/packages/template-astro/public/server/data"

# 创建/更新 symlinks
for public_dir in "$REPO_ROOT/packages/manager/public/server/data" "$REPO_ROOT/packages/template-astro/public/server/data"; do
  for dir in upload branding; do
    target="$public_dir/$dir"
    source="$DATA_DIR/$dir"
    if [[ -L "$target" || -e "$target" ]]; then
      rm -rf "$target"
    fi
    ln -sf "$source" "$target"
  done
done

# ── Step 8: 运行数据迁移（加密→明文，幂等）─────────────
log "STEP8" "运行数据迁移（加密→明文）..."
MIGRATE_SCRIPT="$REPO_ROOT/scripts/migrate-posts-plaintext.js"
if [[ -f "$MIGRATE_SCRIPT" ]]; then
  node "$MIGRATE_SCRIPT" --apply 2>&1 || warn "数据迁移脚本有错误，可稍后手动运行"
fi

# ── Step 9: PM2 重新注册 + 重启服务 ──────────────────────
log "STEP9" "PM2 重新注册（v2 入口: packages/host/index.js）..."

HOST_ENTRY="$REPO_ROOT/packages/host/index.js"

if command -v pm2 &> /dev/null; then
  # 停止并删除旧 v1 进程（server/index.js）
  pm2 delete chronicle-server 2>/dev/null || true
  pm2 delete chronicle-host   2>/dev/null || true

  # 以 v2 入口重新注册
  pm2 start "$HOST_ENTRY" --name chronicle-host
  pm2 save 2>/dev/null || true

  log "STEP10" "PM2 chronicle-host 已注册并启动"
else
  # 没有 pm2 则回退到 nohup
  warn "pm2 未安装，使用 nohup 启动..."
  killall node 2>/dev/null || true
  sleep 1
  (cd "$REPO_ROOT/packages/host" && nohup node index.js > "$REPO_ROOT/packages/host.log" 2>&1 &)
  sleep 2
fi

HOST_PID=$(pgrep -f "node.*host" 2>/dev/null | head -1 || true)
if [[ -n "$HOST_PID" ]]; then
  log "STEP10" "服务已启动 (PID: $HOST_PID)"
else
  warn "服务可能未成功启动，请检查: pm2 logs chronicle-host 或 tail -f $REPO_ROOT/packages/host.log"
fi

# ── 完成 ──────────────────────────────────────────────────
cat <<EOF

${GREEN}╔═══════════════════════════════════════════════════════╗${RESET}
${GREEN}║        Chronicle v1 → v2 数据迁移完成！               ║${RESET}
${GREEN}╚═══════════════════════════════════════════════════════╝${RESET}

📁 数据目录:    $DATA_DIR
📦 v1 备份:     ${BACKUP_DIR:-无}
📝 PM2 名称:    chronicle-host
📝 日志:        pm2 logs chronicle-host  或  tail -f $REPO_ROOT/packages/host.log

🔍 快速检查:
  - 文章数:     $(cat "$DATA_DIR/posts/index.json" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo '?')
  - 合集数:     $(cat "$DATA_DIR/collections.json" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo '?')
  - Friends:    $(cat "$DATA_DIR/friends.json" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('cards',[])))" 2>/dev/null || echo '?')
  - Upload:     $(find "$DATA_DIR/upload" -type f 2>/dev/null | wc -l) 个文件
  - Branding:   $(find "$DATA_DIR/branding" -type f 2>/dev/null | wc -l) 个文件
  - 服务状态:   $(pgrep -f 'node.*host' > /dev/null && echo '✅ 运行中' || echo '❌ 未运行')

EOF
