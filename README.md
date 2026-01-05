# MissAV Bot Worker v2.0

[中文](#中文) | [English](#english) | [日本語](#日本語)

---

## 中文

基于 Cloudflare Worker 的 MissAV 和 JAVNinja 双爬虫 Telegram 机器人，自动抓取两个网站的最新视频并推送给订阅用户。

### 功能特性

- 🤖 **双爬虫支持** - 同时支持 MissAV 和 JAVNinja
- 📺 **预览播放** - 支持视频预览和封面图展示
- 🔔 **智能订阅** - 支持订阅全部/演员/标签
- 🚫 **自动去重** - 避免重复抓取和推送（跨网站去重）
- 🔍 **视频搜索** - 支持按演员、标签搜索（双网站）
- 📊 **推送记录** - 完整的推送历史记录
- 🎯 **自动发现群组** - 启动时自动发现并订阅所有 Bot 所在的群组
- 🛡️ **防刷屏机制** - 智能去重，避免重启时重复推送
- 🔄 **替补机制** - 一个网站失败时自动使用另一个

### 技术栈

- Cloudflare Workers (JavaScript/TypeScript)
- Cloudflare KV (数据存储)
- Telegram Bot API
- 原生 Fetch API (网页解析)

### 环境要求

- Cloudflare 账号
- Telegram Bot Token
- 3 个 Cloudflare KV 命名空间

### 快速开始

#### 1. 创建 Telegram Bot

1. 在 Telegram 中搜索 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 创建新机器人
3. 按提示设置机器人名称和用户名
4. 获取 Bot Token

#### 2. 创建 Cloudflare KV 命名空间

在 Cloudflare Dashboard 中创建 3 个 KV 命名空间：

```bash
# 视频数据存储
npx wrangler kv:namespace create "MISSAV_DATA"

# 订阅存储
npx wrangler kv:namespace create "SUBSCRIPTIONS"

# 推送记录存储
npx wrangler kv:namespace create "PUSH_RECORDS"
```

#### 3. 配置项目

复制配置文件：

```bash
cp wrangler.toml.example wrangler.toml
cp .dev.vars.example .dev.vars
```

编辑 `wrangler.toml`，填入你的 KV 命名空间 ID。

#### 4. 设置环境变量

在 `.dev.vars` 或 Cloudflare Dashboard 中设置：

```bash
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_BOT_USERNAME=YourBotUsername

# JAVNinja 配置（可选）
JAVNJINJA_BASE_URL=https://javninja.com
JAVNJINJA_ENABLED=true

# MissAV 配置
MISSAV_BASE_URL=https://missav.ai
MISSAV_ENABLED=true
```

#### 5. 部署项目

```bash
# 安装依赖
npm install

# 本地测试
npm run dev

# 部署到生产环境
npm run deploy
```

#### 6. 设置 Telegram Webhook

部署完成后，设置 Webhook：

```bash
curl -F "url=https://your-worker.workers.dev/webhook" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

### 双爬虫说明

#### 支持的网站

| 网站 | 状态 | 网址 | 说明 |
|------|------|------|------|
| **MissAV** | ✅ 默认启用 | missav.ai | 主要数据源 |
| **JAVNinja** | ✅ 默认启用 | javninja.com | 替补数据源 |

#### 爬虫机制

1. **并行爬取** - 两个网站同时爬取，提高效率
2. **去重处理** - 按番号去重，避免重复推送
3. **失败切换** - 一个网站失败时，另一个继续工作
4. **来源标识** - 推送消息显示视频来源

#### API 端点

| 端点 | 功能 |
|------|------|
| `/cron` | 触发双爬虫任务（两个网站） |
| `/cron/missav` | 只爬取 MissAV |
| `/cron/javninja` | 只爬取 JAVNinja |

### 使用教程

#### 机器人命令

**订阅管理**

```
/subscribe              - 订阅全部新片（两个网站）
/subscribe 演员名       - 订阅指定演员（两个网站）
/subscribe #标签        - 订阅指定标签（两个网站）
/unsubscribe           - 取消全部订阅
/unsubscribe 演员名     - 取消演员订阅
/list                  - 查看我的订阅
```

**查询命令**

```
/search 关键词          - 搜索视频（两个网站）
/latest                - 查看最新视频（两个网站）
/help                  - 查看帮助信息
```

#### 使用示例

1. **订阅全部新片**
   ```
   /subscribe
   ```

2. **订阅指定演员**
   ```
   /subscribe 三上悠亚
   ```

3. **搜索视频**
   ```
   /search SSIS
   ```

### 配置说明

#### 爬虫配置

```toml
[vars]
# MissAV 配置
MISSAV_BASE_URL = "https://missav.ai"
MISSAV_ENABLED = true

# JAVNinja 配置
JAVNJINJA_BASE_URL = "https://javninja.com"
JAVNJINJA_ENABLED = true

# 爬虫通用配置
CRAWLER_ENABLED = true
MISSAV_CRAWL_INTERVAL = "900000"  # 15分钟
CRAWLER_INITIAL_PAGES = 2
```

#### 定时任务

```toml
[[triggers]]
crons = ["*/15 * * * *"]  # 每15分钟执行双爬虫
```

### 项目结构

```
missav-bot-worker/
├── src/
│   ├── index.js              # 主入口（v2.0 双爬虫支持）
│   └── modules/
│       ├── config.js         # 配置管理（双爬虫配置）
│       ├── storage.js        # KV 存储
│       ├── telegramBot.js    # Telegram 机器人
│       ├── missavCrawler.js  # MissAV 爬虫
│       ├── javninjaCrawler.js # JAVNinja 爬虫（新增）
│       ├── subscriptionManager.js  # 订阅管理
│       └── pushService.js    # 推送服务（双来源支持）
├── tests/
│   └── bot.test.js           # 测试文件
├── wrangler.toml.example     # 配置文件模板
├── package.json
└── README.md
```

### 本地开发

```bash
# 安装依赖
npm install

# 本地测试
npm run dev

# 测试双爬虫
curl http://localhost:8787/cron
```

### 部署

```bash
# 部署到生产环境
npm run deploy

# 查看日志
npx wrangler tail
```

### 常见问题

#### 1. 两个网站都抓不到视频

- 检查网络连接
- 确认 User-Agent 设置
- 尝试增加请求间隔

#### 2. JAVNinja 抓取失败

- 确认 JAVNJINJA_ENABLED=true
- 检查 JAVNJINJA_BASE_URL 是否正确
- 查看日志获取详细错误信息

#### 3. 重复推送

- 项目已内置跨网站去重
- 如果还有重复，可能是同一视频在两个网站都有

### 限制与注意事项

1. **免费版限制**：
   - 每日 100,000 次请求
   - 10ms CPU 时间限制
   - 1MB 脚本大小限制

2. **爬虫限制**：
   - 两个网站同时爬取会消耗更多请求配额
   - 建议根据需要启用/禁用某个爬虫

3. **数据持久化**：
   - KV 存储免费版有写操作限制
   - 建议定期备份重要数据

### 更新日志

#### v2.0.0 (2024-01)
- ✨ 新增 JAVNinja 爬虫支持
- 🔄 支持双爬虫并行工作
- 📊 跨网站去重
- 🎯 来源标识显示
- 🔄 失败自动切换

### 许可证

MIT License

### 免责声明

本项目仅供学习交流使用,请勿用于非法用途。使用本项目所产生的一切后果由使用者自行承担。

---

## English

MissAV Telegram Bot based on Cloudflare Worker with **dual crawler support** (MissAV + JAVNinja), automatically crawls latest videos from both sites and pushes them to subscribers.

### Features

- 🤖 **Dual Crawler** - Supports both MissAV and JAVNinja simultaneously
- 📺 **Preview Play** - Supports video preview and cover image display
- 🔔 **Smart Subscription** - Supports ALL/ACTORS/TAG subscriptions
- 🚫 **Auto Deduplication** - Avoids duplicate crawling and pushing (cross-site)
- 🔍 **Video Search** - Supports searching by actors and tags (both sites)
- 📊 **Push Records** - Complete push history records
- 🎯 **Auto Discover Groups** - Automatically discovers and subscribes to all groups
- 🛡️ **Anti-Spam Mechanism** - Smart deduplication, avoids duplicate pushes
- 🔄 **Fallback Mechanism** - Auto-switch when one site fails

### Supported Sites

| Site | Status | URL | Description |
|------|--------|-----|-------------|
| **MissAV** | ✅ Enabled | missav.ai | Primary source |
| **JAVNinja** | ✅ Enabled | javninja.com | Secondary source |

### Quick Start

#### 1. Create Telegram Bot

1. Search for [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot` to create a new bot
3. Follow the prompts to set the bot name and username
4. Get the Bot Token

#### 2. Create Cloudflare KV Namespaces

```bash
npx wrangler kv:namespace create "MISSAV_DATA"
npx wrangler kv:namespace create "SUBSCRIPTIONS"
npx wrangler kv:namespace create "PUSH_RECORDS"
```

#### 3. Configure

```bash
cp wrangler.toml.example wrangler.toml
cp .dev.vars.example .dev.vars
```

Set environment variables in `.dev.vars`:

```bash
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_BOT_USERNAME=YourBotUsername

# JAVNinja (optional)
JAVNJINJA_BASE_URL=https://javninja.com
JAVNJINJA_ENABLED=true

# MissAV
MISSAV_BASE_URL=https://missav.ai
MISSAV_ENABLED=true
```

#### 4. Deploy

```bash
npm install
npm run dev   # Local development
npm run deploy  # Production
```

#### 5. Set Webhook

```bash
curl -F "url=https://your-worker.workers.dev/webhook" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

### API Endpoints

| Endpoint | Function |
|----------|----------|
| `/cron` | Trigger dual crawler (both sites) |
| `/cron/missav` | Crawl MissAV only |
| `/cron/javninja` | Crawl JAVNinja only |

### Usage

**Subscribe to all new videos from both sites:**
```
/subscribe
```

**Subscribe to specific actor:**
```
/subscribe Yua Mikami
```

**Search videos:**
```
/search SSIS
```

### Configuration

```toml
[vars]
# MissAV
MISSAV_BASE_URL = "https://missav.ai"
MISSAV_ENABLED = true

# JAVNinja
JAVNJINJA_BASE_URL = "https://javninja.com"
JAVNJINJA_ENABLED = true

# Common
CRAWLER_ENABLED = true
MISSAV_CRAWL_INTERVAL = "900000"  # 15 minutes
```

### Changelog

#### v2.0.0 (2024-01)
- ✨ Added JAVNinja crawler support
- 🔄 Dual crawler parallel execution
- 📊 Cross-site deduplication
- 🎯 Source tag display
- 🔄 Auto-fallback on failure

### License

MIT License

### Disclaimer

This project is for learning and communication purposes only. Please do not use it for illegal purposes.

---

## 日本語

Cloudflare Worker ベースの MissAV + JAVNinja **双クローラー** Telegram ボット。両サイトからの最新動画を自動的にクロールし、購読者へプッシュ通知を送信します。

### 機能特徴

- 🤖 **双クローラー対応** - MissAV と JAVNinja を同時にサポート
- 📺 **プレビュー再生** - 動画プレビューとサムネイル表示対応
- 🔔 **スマート購読** - 全員/出演者/タグの購読に対応
- 🚫 **自動重複排除** - 重複クロール・プッシュを防止（サイト間）
- 🔍 **動画検索** - 出演者、タグでの検索に対応（両サイト）
- 📊 **プッシュ記録** - プッシュ履歴の完全な記録
- 🎯 **グループ自動発見** - ボットが参加するグループの自動発見・購読
- 🛡️ **スパム防止機構** - スマート重複排除、再起動時の重複プッシュを防止
- 🔄 **フェイルオーバー** - 1つのサイト失敗時に自動切り替え

### 対応サイト

| サイト | 状態 | URL | 説明 |
|--------|------|-----|------|
| **MissAV** | ✅ 有効 | missav.ai | プライマリソース |
| **JAVNinja** | ✅ 有効 | javninja.com | セカンダリソース |

### クイックスタート

#### 1. Telegram ボットの作成

[@BotFather](https://t.me/BotFather) でボットを作成し、Token を取得。

#### 2. KV ネームスペースの作成

```bash
npx wrangler kv:namespace create "MISSAV_DATA"
npx wrangler kv:namespace create "SUBSCRIPTIONS"
npx wrangler kv:namespace create "PUSH_RECORDS"
```

#### 3. 設定

```bash
cp wrangler.toml.example wrangler.toml
cp .dev.vars.example .dev.vars
```

`.dev.vars` で環境変数を設定：

```bash
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_BOT_USERNAME=YourBotUsername

# JAVNinja（オプション）
JAVNJINJA_BASE_URL=https://javninja.com
JAVNJINJA_ENABLED=true

# MissAV
MISSAV_BASE_URL=https://missav.ai
MISSAV_ENABLED=true
```

#### 4. デプロイ

```bash
npm install
npm run dev   # ローカル開発
npm run deploy  # 本番環境
```

#### 5. Webhook 設定

```bash
curl -F "url=https://your-worker.workers.dev/webhook" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

### API エンドポイント

| エンドポイント | 機能 |
|--------------|------|
| `/cron` | 双クローラータスク実行（両サイト） |
| `/cron/missav` | MissAV のみクロール |
| `/cron/javninja` | JAVNinja のみクロール |

### 使い方

**両サイトの新規動画を購読：**
```
/subscribe
```

**特定出演者を購読：**
```
/subscribe 三上悠亜
```

**動画を検索：**
```
/search SSIS
```

### 設定

```toml
[vars]
# MissAV
MISSAV_BASE_URL = "https://missav.ai"
MISSAV_ENABLED = true

# JAVNinja
JAVNJINJA_BASE_URL = "https://javninja.com"
JAVNJINJA_ENABLED = true

# 共通
CRAWLER_ENABLED = true
MISSAV_CRAWL_INTERVAL = "900000"  # 15分
```

### 変更履歴

#### v2.0.0 (2024-01)
- ✨ JAVNinja クローラー対応追加
- 🔄 双クローラー並列実行
- 📊 サイト間重複排除
- 🎯 ソースタグ表示
- 🔄 失敗時自動切り替え

### ライセンス

MIT License

### 免責事項

本プロジェクトは学習・交流目的でのみ使用してください。非法的な用途での使用は禁止します。
