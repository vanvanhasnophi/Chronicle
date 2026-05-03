#!/bin/bash

# 迁移脚本：为现有文章添加作者和AI生成字段
# 默认作者名：Eightyfor
# 默认AI生成标记：false

POSTS_FILE="/opt/Chronicle/server/data/posts/index.json"
BACKUP_FILE="/opt/Chronicle/server/data/posts/index.json.backup"

# 检查文件是否存在
if [ ! -f "$POSTS_FILE" ]; then
    echo "错误：找不到文章数据文件 $POSTS_FILE"
    exit 1
fi

# 创建备份
cp "$POSTS_FILE" "$BACKUP_FILE"
if [ $? -ne 0 ]; then
    echo "错误：无法创建备份文件"
    exit 1
fi

echo "已创建备份文件: $BACKUP_FILE"

# 使用Python处理JSON文件
python3 << 'EOF'
import json
import os

posts_file = "/opt/Chronicle/server/data/posts/index.json"
backup_file = "/opt/Chronicle/server/data/posts/index.json.backup"

# 读取文章数据
with open(posts_file, 'r', encoding='utf-8') as f:
    posts = json.load(f)

print(f"找到 {len(posts)} 篇文章")

# 统计需要更新的文章数量
updated_count = 0

for post in posts:
    # 检查是否已有author字段
    if 'author' not in post:
        post['author'] = 'Eightyfor'
        updated_count += 1
        print(f"为文章 '{post.get('title', 'Unknown')}' 添加作者字段")
    
    # 检查是否已有aiGenerated字段
    if 'aiGenerated' not in post:
        post['aiGenerated'] = False
        updated_count += 1
        print(f"为文章 '{post.get('title', 'Unknown')}' 添加AI生成字段")

if updated_count > 0:
    # 写入更新后的数据
    with open(posts_file, 'w', encoding='utf-8') as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    
    print(f"\n成功更新 {updated_count} 个字段")
    print(f"更新后的文章数据已保存到: {posts_file}")
else:
    print("所有文章都已包含必要的字段，无需更新")

EOF

# 检查Python脚本执行结果
if [ $? -eq 0 ]; then
    echo "迁移完成！"
    
    # 显示更新后的文件信息
    echo "\n更新后的文章数据预览："
    head -n 20 "$POSTS_FILE"
    
    echo "\n备份文件位置：$BACKUP_FILE"
    echo "如需恢复，请运行：cp $BACKUP_FILE $POSTS_FILE"
else
    echo "错误：迁移过程中出现问题"
    # 尝试恢复备份
    cp "$BACKUP_FILE" "$POSTS_FILE"
    echo "已恢复备份文件"
    exit 1
fi