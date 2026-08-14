#!/bin/bash
set -e

# ============================================================
# Telegram Web Multi - 多账号管理后台一键部署脚本
# 用法: curl -sL https://raw.githubusercontent.com/ynp1078614229/telegram-web-multi/main/deploy.sh | bash
# 支持系统: Ubuntu 18+/Debian 10+
# ============================================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
APP_NAME="telegram-multi"
APP_DIR="/opt/telegram-web-multi"
ADMIN_WEB_DIR="/var/www/admin"
GIT_REPO="https://github.com/ynp1078614229/telegram-web-multi.git"
BACKEND_PORT=3002
DOMAIN="${1:-_}"

log()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error(){ echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

if [ "$EUID" -ne 0 ]; then
  error "请使用 root 权限运行: sudo bash deploy.sh [your-domain.com]"
fi

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Telegram Web Multi - 一键部署脚本${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "域名: ${YELLOW}${DOMAIN}${NC}"
echo -e "后端端口: ${YELLOW}${BACKEND_PORT}${NC}"
echo ""

# ============================================================
# 1. 系统更新 & 基础工具
# ============================================================
log "更新系统包..."
apt-get update -qq
apt-get install -y -qq curl wget git build-essential sqlite3 nginx > /dev/null 2>&1

# ============================================================
# 2. 安装 Node.js 20.x
# ============================================================
if command -v node &> /dev/null; then
  log "Node.js 已安装: $(node -v)"
else
  log "安装 Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  log "Node.js 安装完成: $(node -v)"
fi

# ============================================================
# 3. 安装 pnpm v9（v10 不自动编译原生模块）
# ============================================================
npm install -g pnpm@9 > /dev/null 2>&1
hash -r
log "pnpm 版本: $(pnpm -v)"

# ============================================================
# 4. 安装 PM2
# ============================================================
if ! command -v pm2 &> /dev/null; then
  log "安装 PM2..."
  npm install -g pm2 > /dev/null 2>&1
fi
log "PM2 版本: $(pm2 -v)"

# ============================================================
# 5. 克隆/更新源码
# ============================================================
if [ -d "${APP_DIR}/.git" ]; then
  log "更新源码..."
  cd "${APP_DIR}"
  git fetch --depth 1 origin main
  git reset --hard origin/main
else
  log "从 GitHub 克隆最新源码..."
  rm -rf "${APP_DIR}"
  git clone --depth 1 "${GIT_REPO}" "${APP_DIR}"
fi
log "源码部署完成: $(cd ${APP_DIR} && git log --oneline -1)"

# ============================================================
# 6. 创建 .env（项目根目录）
# ============================================================
if [ ! -f "${APP_DIR}/.env" ]; then
  log "创建 .env 配置..."
  cat > "${APP_DIR}/.env" << EOF
TELEGRAM_API_ID=33960207
TELEGRAM_API_HASH=b4a1d5e99cce9e6f317596dfc25aa38a
MULTI_PORT=${BACKEND_PORT}
NODE_ENV=production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
EOF
else
  log ".env 已存在，跳过创建"
fi

# ============================================================
# 7. 安装后端依赖 & 构建
# ============================================================
log "安装后端依赖..."
cd "${APP_DIR}/backend"
rm -rf node_modules
pnpm install --prod=false 2>&1 | tail -3

log "构建后端 TypeScript..."
pnpm run build 2>&1 | tail -5
log "后端构建完成"

# ============================================================
# 8. 构建管理后台前端
# ============================================================
if [ -d "${APP_DIR}/admin-frontend" ]; then
  log "安装前端依赖..."
  cd "${APP_DIR}/admin-frontend"
  rm -rf node_modules
  pnpm install 2>&1 | tail -3

  log "构建前端..."
  pnpm run build 2>&1 | tail -3
  log "前端构建完成"
else
  error "未找到 admin-frontend 目录"
fi

# ============================================================
# 9. 配置 Nginx
# ============================================================
log "配置 Nginx..."

cat > /etc/nginx/sites-available/${APP_NAME} << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location = / {
        return 301 /admin/;
    }
    location = /admin {
        return 301 /admin/;
    }

    location ^~ /admin/ {
        alias ${ADMIN_WEB_DIR}/;
        index index.html;
        try_files \$uri \$uri/ /admin/index.html;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    access_log /var/log/nginx/${APP_NAME}.access.log;
    error_log  /var/log/nginx/${APP_NAME}.error.log;
}
EOF

# 部署前端静态文件
mkdir -p "${ADMIN_WEB_DIR}"
cp -r ${APP_DIR}/admin-frontend/dist/* "${ADMIN_WEB_DIR}/"

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}

nginx -t 2>&1 || error "Nginx 配置测试失败"
systemctl enable nginx > /dev/null 2>&1
systemctl restart nginx
log "Nginx 配置完成"

# ============================================================
# 10. 启动后端 (PM2)
# ============================================================
log "启动后端服务..."

pm2 delete ${APP_NAME} 2>/dev/null || true

cd "${APP_DIR}/backend"
pm2 start dist/server.js \
  --name "${APP_NAME}" \
  --env production \
  --max-memory-restart 512M \
  --time

pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
log "后端服务启动完成"

# ============================================================
# 11. 验证
# ============================================================
sleep 3

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}  部署完成!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

if curl -s http://127.0.0.1:${BACKEND_PORT}/api/health > /dev/null 2>&1; then
  echo -e "  后端服务: ${GREEN}运行中${NC} (端口 ${BACKEND_PORT})"
else
  echo -e "  后端服务: ${RED}启动失败，请运行 pm2 logs ${APP_NAME} 查看${NC}"
fi

if systemctl is-active --quiet nginx; then
  echo -e "  Nginx:    ${GREEN}运行中${NC} (端口 80)"
else
  echo -e "  Nginx:    ${RED}启动失败${NC}"
fi

echo ""
if [ "${DOMAIN}" = "_" ]; then
  SERVER_IP=$(curl -4 -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
  echo -e "  管理后台: ${GREEN}http://${SERVER_IP}/admin/${NC}"
else
  echo -e "  管理后台: ${GREEN}http://${DOMAIN}/admin/${NC}"
fi
echo -e "  默认账号: ${YELLOW}admin / admin123${NC}"
echo ""
echo -e "${YELLOW}常用命令:${NC}"
echo "  pm2 logs ${APP_NAME}        查看后端日志"
echo "  pm2 restart ${APP_NAME}     重启后端"
echo "  systemctl restart nginx    重启 Nginx"
echo ""
