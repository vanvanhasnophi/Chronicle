#!/bin/bash

# 1. 交互输入服务器信息
read -p "请输入服务器IP: " SERVER_IP
read -p "请输入服务器用户名: " SERVER_USER
read -s -p "请输入服务器密码: " SERVER_PWD
echo
read -p "请输入服务器目标路径（如 /opt/chronicle-deploy）: " REMOTE_PATH

# 2. 前端打包
cd /opt/Chronicle/chronicle-frontend
npm run build

# Clean temp dir to prevent stale files
rm -rf /tmp/chronicle-upload
mkdir -p /tmp/chronicle-upload

# 3. 复制 server 目录到临时目录，并清理 data 文件，仅保留目录结构
cd /opt/Chronicle
if [ -d "server/node_modules" ]; then
    echo "Warning: server/node_modules detected. It will be excluded from upload."
fi
# Copy server but exclude node_modules
rsync -av --exclude='node_modules' --exclude='.git' server /tmp/chronicle-upload/
# Clean data files
find /tmp/chronicle-upload/server/data -type f -delete

# 4. 复制 dist 到临时目录
cp -r chronicle-frontend/dist /tmp/chronicle-upload/

# 5. 打包
cd /tmp/chronicle-upload
tar czf chronicle-upload.tar.gz server dist

# 6. 上传（需安装 sshpass）
sshpass -p "$SERVER_PWD" scp chronicle-upload.tar.gz ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/

echo "上传完成！请在服务器上解压："
echo "cd ${REMOTE_PATH} && tar xzf chronicle-upload.tar.gz"