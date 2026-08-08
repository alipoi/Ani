# Nekomi

> Nekomi —— 自托管番剧日历与资源聚合站

一个 Node 单体应用（Vue 3 + Vite 前端、Express 风格 API）：番剧季度时间表、资源数据库、字幕组聚合、全局搜索与 RSS 订阅。静态页面 + REST API 由同一进程提供，数据落在本地 SQLite 与季度 JSON 文件中。

![Node](https://img.shields.io/badge/Node-%3E%3D12-339933?logo=node.js)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite)
![License](https://img.shields.io/badge/License-MIT-4B0082)

---

## 功能特性

- 🗓️ **每周时间表**：按周一到周日展示当季新番播出时间，支持年份 / 季度切换（2016 至今）；自动定位今天并高亮，左侧星期导航栏吸顶居中，点击平滑跳转
- 📅 **日期与播出徽章**：每个星期标题带日期（如 `08/06（今天）`）；封面右上角显示放送时刻，播出时（开播 35 分钟内，每 30 秒刷新）变红并显示「播出中」
- ⭐ **评分与标签**：封面左上角 Bangumi 评分、底部标签遮罩，详情弹窗同步展示
- 📺 **资源检索**：Mikan 资源聚合入库，按最新发布分页浏览，支持番剧、季、字幕组筛选
- 🔍 **全局搜索**：同时搜索资源标题（SQLite）与全季度番剧（内存缓存），重复关键词 10 分钟内秒回
- 🏢 **字幕组聚合**：按字幕组浏览全部发布，支持关键词过滤
- 🔗 **统一 Tracker**：所有输出的磁力链接自动注入 23 个自选 tracker（`004430.xyz` / `tracker.nekomi.cn` / itzmx / dler 等），替换掉来源 tracker
- 📡 **RSS 订阅**：按番剧（`/rss/bangumi/:key/:id`）或字幕组（`/rss/group/:name`）输出 RSS 2.0，带 magnet enclosure；全站 RSS 入口为统一样式的圆形图标按钮
- 🖼️ **详情页**：资源简介与截图（acgsecrets 抓取）
- ⚡ **性能**：季度数据启动预热 + mtime 增量缓存；API/静态文件 gzip 压缩；Service Worker（PWA）离线缓存
- 🌗 **暗色模式**：跟随系统 `prefers-color-scheme`

## 快速开始

```bash
git clone <repo-url>
cd Ani
npm install          # 安装 better-sqlite3、vite 等依赖
npm run build        # 构建前端（Vite → dist/）
npm start            # 启动，默认 http://localhost:8080
```

打开 <http://localhost:8080> 即可使用。无数据库时会自动创建空表，先跑数据抓取脚本（见下）再填充内容。

### 抓取数据

```bash
npm run fetch-data            # 番剧信息（acgsecrets.hk）：季度列表、播出时间、简介、图片
npm run fetch-images          # 只补图片（--images-only）
npm run fetch-resources       # 资源增量爬取（Mikan，断点续爬）
npm run fetch-resources:full  # 强制全量重爬（--full）
```

常用抓取参数（`node fetch_acgsecrets.js [起始年] [结束年] [flags]`）：

| 参数 | 说明 |
|---|---|
| `--add-only` | 增量：只追加站点新出现的番剧（含封面），不改动已有条目，适合 cron 每周跑 |
| `--refresh` | 配合 `--add-only`：给已有条目补上站点后来公布的时间/星期（仅当本地缺失时） |
| `--data-only` | 只更新数据，不下载封面 |
| `--images-only` | 只补图片（已存在的数据文件） |
| `--force` | 忽略已存在文件，强制重抓覆盖（会覆盖手工修改，慎用） |

常用抓取参数（`node fetch_resources.js`）：

| 参数 | 说明 |
|---|---|
| `--fast` | 快速增量：只抓最新 5 页并匹配新行，单次数秒（推荐 cron 每 2 分钟） |
| `--full` | 强制全量重爬 |
| `--rematch` | 清空番剧关联并重新匹配（44 万行约 1-2 分钟） |
| `--rss` | 从 nyaa / dmhy 的 RSS 补充资源 |
| `--details` | 补抓资源简介与截图 |
| `--rss-one <id>` | 只匹配单部番剧的 RSS 资源（如补个别番剧的匹配） |

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8080` | HTTP 端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `MIKAN_BASE` | 自动镜像列表 | 锁定 Mikan 镜像（kas.pub / mikanani.me / mikanani.tv） |
| `HTTPS_PROXY` | 无 | 境外源（nyaa 等）代理，国内 VPS 必备 |

## API

所有接口返回 `application/json;charset=utf-8`（gzip 压缩），RSS 接口返回 `application/rss+xml`。

### 资源

#### `GET /api/resources/latest`

最新资源分页，支持组合筛选。

| 参数 | 类型 | 说明 |
|---|---|---|
| `page` | int | 页码，默认 1 |
| `size` | int | 每页条数，默认 30，最大 100 |
| `group` | string | 字幕组精确筛选（`subtitle_group`） |
| `season` | string | 季度筛选（`season_key`，如 `202607`） |
| `q` | string | 标题模糊搜索（`%kw%`） |

```json
{
  "list": [
    {
      "info_hash": "0123...40位hex",
      "title": "[喵萌奶茶屋] 某番剧 第01话 1080p.mkv",
      "bangumi_id": "acgs-anime-xxxx",
      "season_key": "202607",
      "episode": "01",
      "subtitle_group": "喵萌奶茶屋",
      "size": "1.2 GB",
      "magnet": "magnet:?xt=urn:btih:...&tr=https%3a%2f%2f004430.xyz%2fannounce&...",
      "torrent_url": "",
      "source": "Mikan",
      "publish_time": "2026-07-01 12:00:00",
      "added_at": "2026-07-01 12:00:01",
      "description": "…",
      "images": ["https://..."],
      "detail_fetched": 1
    }
  ],
  "total": 443217,
  "page": 1,
  "size": 30
}
```

> `magnet` 字段已由服务端统一重写：剥离来源 tracker，注入项目内置 23 个 tracker。

#### `GET /api/resources/hash/:hash`

按 info_hash（40 位 hex）查单条资源。不存在返回 `404`。

#### `GET /api/resources/bangumi?key=&id=&page=&size=`

按番剧查询资源。`key` 为六位季度键（如 `202607`），`id` 为番剧 ID（如 `acgs-anime-2229`）。

```json
{ "list": [ /* 资源数组 */ ], "total": 12, "page": 1, "size": 30 }
```

### 字幕组

#### `GET /api/groups?q=`

字幕组列表（含资源数），`q` 为可选模糊过滤。返回：

```json
{ "list": [ { "name": "喵萌奶茶屋", "count": 30421 }, ... ] }
```

#### `GET /api/group/:name?page=&size=`

某字幕组的最新发布（结构同 `/api/resources/latest`）。

### 搜索

#### `GET /api/search?q=`

全局搜索：资源标题（SQLite `LIKE`）+ 全季度番剧（2016 至今，内存缓存）。结果带 10 分钟缓存，`q` 必填。

```json
{
  "resources": [ /* 最多 50 条资源 */ ],
  "bangumi": [
    {
      "id": "acgs-anime-2229",
      "title": "某番剧",
      "titleJp": "…",
      "season_key": "202607",
      "weekday": 3,
      "airTime": "22:00"
    }
  ]
}
```

### 番剧数据（时间表）

#### `GET /api/data/:key/:season`

单个季度的番剧列表。`key` 为六位季度键，`season` 为 `winter|spring|summer|fall`。

```json
[
  {
    "id": "acgs-anime-2229",
    "title": "某番剧",
    "titleJp": "…",
    "weekday": 3,
    "airTime": "22:00",
    "description": "…",
    "images": ["https://..."],
    "staff": [ { "role": "导演", "name": "…" }, ... ],
    "cast": [ { "role": "主角", "name": "…" }, ... ]
  }
]
```

#### `POST /api/list`

Body: `{ "key": "202607", "season": "summer" }` → 同上季度番剧数组（供日历页使用）。

#### `POST /api/delete`

Body: `{ "key": "202607", "season": "summer", "id": "acgs-anime-xxxx" }` → 从季度数据文件中删除某部番剧。

```json
{ "success": true }
```

### RSS

#### `GET /rss/bangumi/:key/:id`

某番剧的最新资源订阅（最多 200 条），`<link>` 与 `<enclosure>` 为注入 tracker 后的 magnet。

#### `GET /rss/group/:name`

某字幕组最新发布订阅（50 条）。

## 架构

```
┌──────────────┐   ┌───────────────────────────┐
│  浏览器/订阅器 │──▶│  server.js（Node 单体）      │
└──────────────┘   │  ├─ 静态文件（dist，PWA+gzip）│
                   │  ├─ REST API（/api/*）       │
                   │  └─ RSS（/rss/*）            │
                   └───────┬───────────────────┘
                           │
              ┌────────────┴────────────┐
              │ SQLite (WAL)            │  data/resources.db
              │  · resources 44万+ 行     │  资源表
              │  · meta                  │
              └──────────────────────────┘
              data/YYYYMM.js（每季度番剧，JS 数据文件，vm 解析）
```

- **存储**：`data/resources.db`（SQLite，WAL 模式，`better-sqlite3`）；`data/*.js` 为季度番剧数据文件（`_DATA["202607"]["summer"] = [...]` 形式）
- **爬虫**：`fetch_resources.js`（Mikan 资源）+ `fetch_acgsecrets.js`（番剧信息/图片），独立进程，通过 `--fast` 支持 cron 增量
- **前端**：Vue 3 + Vite（`src/`，`npm run build` 输出 `dist/`），多视图单页应用；Service Worker 缓存静态资源
- **性能**：季度数据启动预热（44 文件 ≈ 150ms）并按 mtime 增量缓存；搜索结果 LRU 缓存（200 条 / 10 分钟）

## 目录结构

```
.
├── server.js              # HTTP 服务：静态 + API + RSS
├── db.js                  # SQLite 数据层（better-sqlite3，WAL）
├── fetch_resources.js     # Mikan 资源爬虫（--fast/--full/--rss/--details/--rematch/--rss-one）
├── fetch_acgsecrets.js    # 番剧信息/图片爬虫（acgsecrets.hk，繁→简，--add-only 增量）
├── vite.config.mjs        # Vite 构建 + PWA 插件
├── index.html             # SPA 入口（SEO meta / canonical / og 标签）
├── src/                   # 前端源码（Vue 3）
│   ├── main.js / App.vue / router.js
│   ├── views/             # CalendarView / ClassicView / GroupsView / GroupView / ResourcePage
│   ├── components/        # SiteHeader / DetailOverlay / ResourceRow / Pager / CtxMenu / Lightbox
│   ├── assets/style.css   # 全站样式（主题变量、暗色模式）
│   ├── api.js / i18n.js / bgmeta.js / calendar.js / search.js / theme.js ...
├── dist/                  # 构建产物（npm run build，已提交 git）
├── data/
│   ├── resources.db       # 资源 SQLite 库（自动创建）
│   ├── 202607.js ...      # 各季度番剧数据
│   └── crawl_state.json   # 爬虫断点
├── deploy/                # systemd + Caddy + cron（crawl.sh / schedule.sh / backup.sh / install.sh）
└── DEPLOY.md              # 部署指南（VPS 推荐）
```

## 部署

自托管需要**持久化磁盘**（SQLite 文件 + 数据文件），推荐 2C2G 自建 VPS。Cloudflare Workers / Railway / Render 等无持久化平台不适用。

```bash
sudo bash deploy/install.sh   # Node → 拉代码 → systemd → cron 爬虫 → 每日备份
```

详见 [`DEPLOY.md`](DEPLOY.md)。

### 域名与 CDN（默认 Cloudflare）

`install.sh` **不安装 Caddy**，默认走 Cloudflare CDN（Node 直接监听 :80）：

1. DNS 添加 `nekomi.cn` 的 A 记录指向实例公网 IP，代理状态选「已代理」（橙色云朵）
2. VCN 安全列表放行入站 **80**（443 由 CF 边缘终结 TLS，可不开）
3. Cloudflare SSL/TLS 模式选 **Flexible**（CF→源站走 HTTP）
4. 缓存规则：对 `/` 与 `/api/*` 设置「不缓存」或 Edge Cache TTL = 0，避免 HTML 被缓存成旧版本（静态资源 `dist/` 已带 hash，可放心缓存）

### 自动化任务（install.sh 自动配置）

| 任务 | 频率 | 脚本 |
|---|---|---|
| 资源增量爬取（Mikan，`--fast --details`） | 每 2 分钟 | `deploy/crawl.sh`（日志 `/var/log/ani-crawl.log`） |
| 季度时间表爬取（acgsecrets，`--add-only --refresh`，当前+明年） | 每周日 03:15 | `deploy/schedule.sh`（日志 `/var/log/ani-schedule.log`） |
| SQLite 在线备份（保留 7 天） | 每天 04:30 | `deploy/backup.sh` |

时间表自动更新的范围：

- **新季度自动创建**：10 月新番在 acgsecrets 上架后（通常开播前 3-6 周），周日任务自动抓取生成 `data/202610.js` 并下载全部封面
- **季中新番自动追加**：季度中途新上架的番剧自动补入（`--add-only`）
- **时间自动补全**：原「时间未定」的番剧在站点公布具体时间后自动写入（`--refresh`，只补缺失、不覆盖已有时间）
- **不自动改**：已有确定时间的条目不会被覆盖（保护手工修正）；如需强制全量刷新：`node fetch_acgsecrets.js --force 2026 2026`

### Oracle Cloud ARM（Ampere A1）说明

- 系统选 **Ubuntu 22.04/24.04**（aarch64）：`install.sh` 可直接跑。Node 20 与 `better-sqlite3` 均有 linux-arm64 预编译包，脚本同时装了 `build-essential` 兜底编译。
- 监听 80 端口通过 systemd `AmbientCapabilities=CAP_NET_BIND_SERVICE` 实现，无需 root 运行服务。
- Oracle 实例均在境外，访问 Mikan / acgsecrets / 图片源无需代理（`HTTPS_PROXY` 留空即可）。
- 迁移数据：把本机 `data/`（`resources.db` + 季度 JS + `images/`）拷到 `/opt/ani/` 下并保持 `ani` 用户属主，重启服务即生效。

## 许可证

MIT
