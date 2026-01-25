# Account Manager Pro

专业的 Gemini 账号管理系统，支持个人号库存管理、家庭组车位管理、自动发送邀请等功能。

基于 Cloudflare 全栈开发（Pages + Workers + D1），完全免费部署。

## ✨ 功能特性

### 📥 智能导入
- 支持多行文本批量粘贴
- 自动识别多种分隔符
- 自动查重，防止重复入库
- 批次标记功能

### 📦 库存管理
- 个人号/家庭组分类管理
- 多状态筛选（库存/已售/异常）
- 全局搜索功能
- 实时统计仪表盘

### 👨‍👩‍👧‍👦 家庭组业务
- 一键转换个人号为家庭组
- 可视化车位管理
- 车位分配与释放
- 到期提醒与续费管理
- 满员自动标记

### 🤖 自动化功能（暂未开源）
- 一键开启家庭组
- 一键删除支付资料
- 一键发送家庭组邀请
- 一键踢出成员

> ⚠️ 自动化功能需要配合指纹浏览器（如 VirtualBrowser）和本地 API 实现，**此部分暂未开源**，请自行实现。

### 🚀 销售交付
- 快捷复制
- 2FA 在线计算
- 密码脱敏显示
- 售出记录管理

### 📊 数据统计
- 库存总数与收入统计
- 个人号/家庭组数量
- 可用车位统计
- 异常账号监控
- 到期提醒通知

---

## 🚀 快速开始

### 前置要求

1. [Cloudflare 账号](https://dash.cloudflare.com/)（免费版即可）
2. [Node.js](https://nodejs.org/) v18 或更高版本
3. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 步骤 1：安装 Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 步骤 2：创建 D1 数据库

```bash
wrangler d1 create account-manager-db
```

**记录返回的 `database_id`**，后面会用到。

### 步骤 3：配置 Worker

编辑 `worker/wrangler.toml`，将 `your-database-id-here` 替换为上一步获得的 ID：

```toml
[[d1_databases]]
binding = "DB"
database_name = "account-manager-db"
database_id = "你的数据库ID"
```

### 步骤 4：初始化数据库

```bash
cd worker
wrangler d1 execute account-manager-db --remote --file=../schema.sql
```

### 步骤 5：设置 JWT 密钥

```bash
wrangler secret put JWT_SECRET
# 输入一个强随机密钥（建议至少32个字符）
```

### 步骤 6：部署 Worker

```bash
cd worker
wrangler deploy
```

部署成功后会显示 Worker URL，例如：
```
https://account-manager-worker.your-subdomain.workers.dev
```

### 步骤 7：配置前端

编辑 `frontend/config.js`，替换为你的 Worker URL：

```javascript
const REMOTE_URL = 'https://你的worker地址.workers.dev';
```

### 步骤 8：部署前端到 Pages

```bash
cd frontend
wrangler pages deploy . --project-name=account-manager
```

### 步骤 9：登录管理员

系统预设了一个硬编码的管理员账号：

- **用户名**: `admin`
- **密码**: `admin123`

> ⚠️ **重要**: 部署前请修改 `worker/src/routes/auth.js` 中的管理员账号密码！

---

## 🤖 本地 API 部署（可选）

本地 API 用于实现自动化功能（自动发送邀请、踢出成员等），需要配合 [VirtualBrowser](https://virtualbrowser.cc/) 使用。

### 前置要求

1. Windows 系统
2. [Python 3.8+](https://www.python.org/)
3. [VirtualBrowser](https://www.virtualbrowser.cn/) - 多开浏览器工具
4. [Cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) - 内网穿透工具

### 步骤 1：安装 Python 依赖

```bash
cd local_api
pip install -r requirements.txt
playwright install chromium
```

### 步骤 2：配置 VirtualBrowser

1. 在 VirtualBrowser 中创建浏览器环境
2. 环境名称设置为 Google 账号邮箱
3. 登录对应的 Google 账号

### 步骤 3：配置 Cloudflared 隧道

1. 在 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) 创建隧道
2. 下载 `cloudflared.exe` 到 `C:\cloudflared\`
3. 配置隧道指向 `http://localhost:8090`
4. 修改 `local_api/cloudflared_config.yml` 中的域名

### 步骤 4：启动服务

**方法一：使用启动脚本**
```bash
双击运行 local_api/start_services.bat
```

**方法二：手动启动**
```bash
# 终端1：启动 API 服务
cd local_api
python invite_server.py

# 终端2：启动隧道
cloudflared tunnel --config C:\cloudflared\config.yml run
```

### 步骤 5：配置前端

在网页端点击"API 设置"，填入你的隧道域名（如 `https://api.example.com`）

### API 端点说明

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/browsers` | GET | 列出所有浏览器环境 |
| `/api/send-invite` | POST | 发送家庭组邀请 |
| `/api/remove-member` | POST | 踢出家庭组成员 |
| `/api/enable-family` | POST | 一键开启家庭组 |
| `/api/delete-payment` | POST | 删除支付资料 |

---

## 🛠️ 本地开发

### 启动 Worker（后端）

```bash
cd worker
wrangler dev
```

Worker 运行在 `http://localhost:8787`

### 启动前端

```bash
cd frontend
npx serve .
```

前端运行在 `http://localhost:3000`

**开发时**确保 `frontend/config.js` 中：
```javascript
const USE_LOCAL = true;
```

---

## 📁 项目结构

```
account-manager/
├── schema.sql              # D1 数据库建表脚本
├── migrations/             # 数据库迁移脚本
├── worker/                 # Cloudflare Worker 后端
│   ├── src/
│   │   ├── index.js       # 主入口
│   │   ├── routes/        # API 路由
│   │   │   ├── auth.js    # 认证接口
│   │   │   ├── import.js  # 导入接口
│   │   │   ├── list.js    # 列表查询
│   │   │   ├── update.js  # 更新操作
│   │   │   ├── delete.js  # 删除操作
│   │   │   └── admin.js   # 管理接口
│   │   └── utils/
│   │       ├── parser.js  # 文本解析
│   │       └── otp.js     # 2FA 计算
│   └── wrangler.toml      # Worker 配置
├── frontend/              # Cloudflare Pages 前端
│   ├── index.html        # 主页面
│   ├── login.html        # 登录页
│   ├── register.html     # 注册页
│   ├── admin.html        # 管理页
│   ├── styles.css        # 样式文件
│   ├── app.js            # 主逻辑
│   ├── config.js         # 配置文件
│   └── icons.js          # 图标定义
└── local_api/            # 本地自动化 API（可选）
    ├── invite_server.py  # API 服务
    ├── requirements.txt  # Python 依赖
    ├── cloudflared_config.yml  # 隧道配置示例
    └── start_services.bat     # 启动脚本
```

---

## 🔌 API 接口

### 认证相关

```
POST /api/auth/register  - 用户注册
POST /api/auth/login     - 用户登录
GET  /api/auth/me        - 获取当前用户
```

### 账号管理

```
POST  /api/import        - 导入账号
GET   /api/accounts      - 查询账号列表
PATCH /api/accounts/:id  - 更新账号
DELETE /api/accounts/:id - 删除账号
```

### 统计数据

```
GET /api/stats           - 获取统计数据
```

---

## ❓ 常见问题

### Q: Worker 部署失败？
A: 检查 `wrangler.toml` 中的 `database_id` 是否正确。

### Q: 前端无法连接后端？
A: 检查 `frontend/config.js` 中的 `REMOTE_URL` 是否正确。

### Q: 自动邀请功能不工作？
A: 确保本地 API 服务正在运行，且 Cloudflared 隧道已配置正确。

### Q: 2FA 验证码不正确？
A: 确保导入账号时的 2FA 密钥格式正确（Base32 编码）。

---

## 🔒 安全建议

1. 使用 [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/) 保护管理后台
2. 定期备份 D1 数据库
3. 使用强密码作为 JWT 密钥
4. 不要在公共网络暴露本地 API

---

## 📝 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**注意**: 本工具仅供学习和个人使用，请遵守相关法律法规。
