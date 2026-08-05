# Nekomi（番组日历）

> 新番资讯 · 每日追番 · 资源检索 —— 自托管番剧日历与资源聚合站

一个零依赖框架的 Node 单体应用：番剧季度时间表、资源数据库、字幕组聚合、全局搜索与 RSS 订阅。静态页面 + REST API 由同一进程提供，数据落在本地 SQLite 与季度 JSON 文件中。

![Node](https://img.shields.io/badge/Node-%3E%3D12-339933?logo=node.js)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite)
![License](https://img.shields.io/badge/License-MIT-4B0082)

---

## 功能特性

- 🗓️ **每周时间表**：按周一到周日展示当季新番播出时间，支持年份 / 季度切换（2016 至今）
- 📺 **资源检索**：Mikan 资源聚合入库，按最新发布分页浏览，支持番剧、季、字幕组筛选
- 🔍 **全局搜索**：同时搜索资源标题（SQLite）与全季度番剧（内存缓存），重复关键词 10 分钟内秒回
- 🏢 **字幕组聚合**：按字幕组浏览全部发布，支持关键词过滤
- 🔗 **统一 Tracker**：所有输出的磁力链接自动注入 23 个自选 tracker（`004430.xyz` / `tracker.nekomi.cn` / itzmx / dler 等），替换掉来源 tracker
- 📡 **RSS 订阅**：按番剧（`/rss/bangumi/:key/:id`）或字幕组（`/rss/group/:name`）输出 RSS 2.0，带 magnet enclosure
- 🖼️ **详情页**：资源简介与截图（acgsecrets 抓取）
- ⚡ **性能**：季度数据启动预热 + mtime 增量缓存；API/静态文件 gzip 压缩；Service Worker（PWA）离线缓存
- 🌗 **暗色模式**：跟随系统 `prefers-color-scheme`

## 快速开始

```bash
git clone <repo-url>
cd Ani
npm install          # 安装 better-sqlite3 等依赖
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

常用抓取参数（`node fetch_resources.js`）：

| 参数 | 说明 |
|---|---|
| `--fast` | 快速增量：只抓最新 5 页并匹配新行，单次数秒（推荐 cron 每 2 分钟） |
| `--full` | 强制全量重爬 |
| `--rematch` | 清空番剧关联并重新匹配（44 万行约 1-2 分钟） |
| `--rss` | 从 nyaa / dmhy 的 RSS 补充资源 |
| `--details` | 补抓资源简介与截图 |

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
└──────────────┘   │  ├─ 静态文件（PWA + gzip）   │
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
- **前端**：原生 HTML/CSS/JS，无构建步骤；Service Worker 缓存静态资源
- **性能**：季度数据启动预热（44 文件 ≈ 150ms）并按 mtime 增量缓存；搜索结果 LRU 缓存（200 条 / 10 分钟）

## 目录结构

```
.
├── server.js              # HTTP 服务：静态 + API + RSS
├── db.js                  # SQLite 数据层（better-sqlite3，WAL）
├── fetch_resources.js     # Mikan 资源爬虫（--fast/--full/--rss/--details/--rematch）
├── fetch_acgsecrets.js    # 番剧信息/图片爬虫（acgsecrets.hk，繁→简）
├── index.html / style.css / script.js   # 前端（原生，无构建）
├── sw.js                  # Service Worker（PWA）
├── manifest.json          # PWA 清单
├── data/
│   ├── resources.db       # 资源 SQLite 库（自动创建）
│   ├── 202607.js ...      # 各季度番剧数据
│   └── crawl_state.json   # 爬虫断点
├── deploy/                # systemd + Caddy + cron 部署文件
└── DEPLOY.md              # 部署指南（VPS 推荐）
```

## 部署

自托管需要**持久化磁盘**（SQLite 文件 + 数据文件），推荐 2C2G 自建 VPS。Cloudflare Workers / Railway / Render 等无持久化平台不适用。

```bash
sudo bash deploy/install.sh   # Node → 拉代码 → systemd → Caddy HTTPS → cron 爬虫 → 每日备份
```

详见 [`DEPLOY.md`](DEPLOY.md)。

## 许可证

MIT
