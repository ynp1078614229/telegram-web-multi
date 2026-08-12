# Telegram Web Multi - 多账号管理后台

多 Telegram 账号统一管理后台，支持 QR 码登录、消息收发、自动回复机器人、头像缓存等功能。

## 功能特性

- **多账号管理** — 同时管理多个 Telegram 账号，独立隔离 session
- **QR 码登录** — 扫码即可登录，支持 2FA 二次验证
- **消息收发** — 查看聊天记录、发送/接收消息、下载头像与媒体
- **自动回复机器人** — 按账号配置关键词规则，支持匹配模式、延迟回复、冷却时间
- **管理后台** — React SPA 管理面板，支持仪表盘、账号详情、机器人规则配置
- **头像缓存** — 1 小时内存缓存，避免频繁下载头像
- **JWT 鉴权** — 管理后台登录认证，安全隔离

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express + TypeScript |
| Telegram 协议 | gramJS (Telegram MTProto) |
| 数据库 | SQLite (better-sqlite3, WAL 模式) |
| 前端 | React 18 + Vite + Tailwind CSS + React Router |
| 进程管理 | PM2 |
| 反向代理 | Nginx |

## 项目结构

```
.
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── server.ts           # 主入口，Express + PM2
│   │   ├── db/
│   │   │   └── database.ts     # SQLite 数据库初始化
│   │   ├── middleware/
│   │   │   └── auth.ts         # JWT 鉴权中间件
│   │   ├── routes/
│   │   │   ├── auth.ts         # 登录/改密/会话验证
│   │   │   ├── accounts.ts     # 账号管理、QR登录、消息、头像
│   │   │   └── bot.ts          # 自动回复机器人规则
│   │   └── services/
│   │       └── telegramService.ts  # gramJS 客户端管理
│   ├── package.json
│   └── tsconfig.json
├── admin-frontend/             # 管理后台前端
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx        # 管理后台登录
│   │   │   ├── DashboardPage.tsx    # 账号列表仪表盘
│   │   │   ├── AccountDetailPage.tsx # 账号聊天详情
│   │   │   └── BotSettingsPage.tsx   # 机器人规则配置
│   │   └── services/
│   │       └── api.ts          # API 请求封装
│   ├── package.json
│   └── vite.config.ts
├── deploy.sh                   # 一键部署脚本
├── build-admin.sh              # 管理后台构建脚本
└── package.json                # 根 package.json
```

## 快速部署

### 一键部署（推荐）

适用于 Ubuntu/Debian 全新服务器：

```bash
curl -sL https://raw.githubusercontent.com/ynp1078614229/telegram-web-multi/main/deploy.sh | bash
```

脚本会自动完成：
1. 安装 Node.js 20.x、pnpm v9、PM2、Nginx
2. 从 GitHub Release 下载并解压源码
3. 构建后端 + 管理后台前端
4. 配置 Nginx 反向代理
5. 启动 PM2 服务

部署完成后访问：`http://你的服务器IP/admin/`

### 手动部署

```bash
# 1. 克隆仓库
git clone https://github.com/ynp1078614229/telegram-web-multi.git
cd telegram-web-multi

# 2. 安装后端依赖并构建
cd backend
npm install -g pnpm@9   # 必须使用 pnpm v9
pnpm install
pnpm run build

# 3. 配置环境变量
cp ../.env.example ../.env
# 编辑 .env 填入你的 Telegram API 凭据

# 4. 构建管理后台前端
cd ../admin-frontend
pnpm install
pnpm run build

# 5. 启动服务
cd ../backend
pm2 start dist/server.js --name telegram-multi
pm2 save
```

## 环境变量

在 `backend/.env` 中配置：

```env
# Telegram API 凭据（从 https://my.telegram.org 获取）
TELEGRAM_API_ID=你的API_ID
TELEGRAM_API_HASH=你的API_HASH

# 服务端口
MULTI_PORT=3002

# 管理员账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的密码

# 可选：客户端起始端口
CLIENT_START_PORT=3001
```

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 管理员登录，返回 JWT |
| GET | `/api/auth/me` | 获取当前管理员信息 |
| POST | `/api/auth/change-password` | 修改管理员密码 |

### 账号管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/accounts` | 获取所有账号列表 |
| GET | `/api/accounts/:id` | 获取单个账号详情 |
| POST | `/api/accounts/login` | 手机号登录（发送验证码） |
| POST | `/api/accounts/verify-code` | 验证登录验证码 |
| POST | `/api/accounts/qr/start` | 发起 QR 码登录 |
| GET | `/api/accounts/qr/check/:sessionId` | 轮询 QR 登录状态 |
| POST | `/api/accounts/qr/verify-2fa` | QR 登录 2FA 验证 |
| GET | `/api/accounts/avatar/:chatId` | 获取头像（支持 token query） |
| PATCH | `/api/accounts/:id/toggle` | 启用/禁用账号 |
| DELETE | `/api/accounts/:id` | 删除账号 |
| POST | `/api/accounts/:id/regen-token` | 重新生成客户端 Token |

### 消息

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/accounts/:id/dialogs` | 获取聊天列表 |
| GET | `/api/accounts/:id/messages` | 获取聊天记录 |
| POST | `/api/accounts/:id/send` | 发送消息 |
| POST | `/api/accounts/:id/mark-read` | 标记已读 |

### 自动回复机器人

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/bot/global/status` | 全局机器人状态 |
| PUT | `/api/bot/global/status` | 更新全局状态 |
| GET | `/api/bot/global/rules` | 全局规则列表 |
| POST | `/api/bot/global/rules` | 创建全局规则 |
| PUT | `/api/bot/rules/:ruleId` | 编辑规则 |
| DELETE | `/api/bot/rules/:ruleId` | 删除规则 |
| GET | `/api/bot/global/logs` | 全局回复日志 |
| GET | `/api/bot/rules/:accountId` | 账号规则列表 |
| POST | `/api/bot/rules/:accountId` | 创建账号规则 |
| POST | `/api/bot/copy-rules/:from/:to` | 复制规则到其他账号 |

## 数据库

SQLite 数据库文件 `data.db` 自动创建在 `backend/` 目录下，包含以下表：

| 表名 | 说明 |
|------|------|
| `admin_users` | 管理员账号 |
| `accounts` | Telegram 账号（session、token、状态） |
| `auto_replies` | 自动回复规则 |
| `auto_reply_cooldowns` | 规则冷却时间记录 |
| `auto_reply_logs` | 回复日志 |
| `auth_state` | 登录认证状态 |
| `auth_sessions` | 登录会话 |

## 常用命令

```bash
# 查看后端日志
pm2 logs telegram-multi

# 重启后端
pm2 restart telegram-multi

# 重启 Nginx
systemctl restart nginx

# 查看服务状态
pm2 status
```

## 注意事项

- **pnpm 版本**：必须使用 pnpm v9，v10 不会自动编译 better-sqlite3 原生模块
- **Telegram API**：需要自行从 [my.telegram.org](https://my.telegram.org) 申请 API_ID 和 API_HASH
- **头像路由**：`/api/accounts/avatar/:chatId` 支持 `?token=xxx&accountId=yyy` query 参数认证（img 标签兼容）
- **会话隔离**：每个 Telegram 账号使用独立的 gramJS client 实例

## License

MIT
