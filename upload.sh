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

# 3. 复制 server 目录到临时目录，并清理 data 文件，仅保留目录结构
cd /opt/Chronicle
rm -rf /tmp/chronicle-upload
mkdir -p /tmp/chronicle-upload
cp -r server /tmp/chronicle-upload/
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