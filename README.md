<div align="center">

# Nekomi（ani-calendar）

**自托管番剧日历与资源聚合站**

一个 Node 单体应用（Vue 3 + Vite 前端、原生 Node HTTP 后端）：季度放送时间表、Mikan 资源库、字幕组聚合、全局番剧搜索与 RSS 订阅。静态页面与 REST API 由同一进程提供，数据落在本地 SQLite 与季度 JSON 文件中。

![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite)
![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)
![License](https://img.shields.io/badge/License-MIT-4B0082)

[功能](#功能特性) · [快速开始](#快速开始) · [API](#api) · [架构](#架构) · [目录结构](#目录结构) · [部署](#部署) · [运维](#运维) · [许可证](#许可证)

</div>

---

## 功能特性

- 🗓️ **每周时间表**：按周一到周日展示当季新番播出时间，支持 2016 至今任意年/季切换；自动定位今天并高亮，星期导航吸顶，点击平滑跳转
- 📅 **日期与播出徽标**：星期标题带日期（如 `08/06（今天）`）；封面右上角显示放送时刻，开播前 35 分钟内变红并显示「播出中」
- ⭐ **评分与标签**：封面左上角 Bangumi 评分、底部标签遮罩，详情弹窗同步展示
- 🖼️ **WebP 服务端缩略图**：`scripts/gen_thumbs.js` 用 sharp 批量生成 400×600 WebP 缩略图，由 `/thumbs/` 提供（`image/webp` + 30 天缓存），大幅降低首屏流量
- 📺 **资源检索**：Mikan 资源聚合入库，按最新发布分页浏览，支持番剧 / 季度 / 字幕组筛选
- 🔍 **全局搜索**：`/api/anime/search` 基于 `anime_index.json` 全量番剧索引（1900–2026，含老番），模糊匹配中文/日文/罗马音；`/api/search` 同时检索资源标题与季度番剧，10 分钟 LRU 缓存
- 🏢 **字幕组聚合**：按字幕组浏览全部发布，支持关键词过滤
- 🔗 **统一 Tracker**：所有输出的磁力链接自动注入 23 个自选 tracker（`004430.xyz` / `tracker.nekomi.cn` / itzmx / dler 等），替换来源 tracker
- 📡 **RSS 订阅**：按番剧（`/rss/bangumi/:key/:id`）或字幕组（`/rss/group/:name`）输出 RSS 2.0，带 magnet enclosure
- 🛡️ **种子自域名代理**：`/api/resources/torrent/:hash` 代下载 `.torrent` 文件（24h 内存缓存），不暴露第三方源地址
- ⚡ **性能**：季度数据启动预热 + mtime 增量缓存；API/静态文件 gzip；Service Worker（PWA）离线缓存
- 🌗 **暗色模式**：跟随系统 `prefers-color-scheme`

## 快速开始

### 环境要求

- Node.js **≥ 18**（Vite 8 要求），推荐 20 LTS
- npm ≥ 9

### 安装与运行

```bash
git clone https://github.com/alipoi/Ani.git
cd Ani
npm install          # 安装 better-sqlite3、sharp、vite 等依赖
npm run build        # 构建前端（Vite 输出到 dist/）
npm start            # 启动，默认 http://localhost:8080
```

打开 <http://localhost:8080> 即可使用。首次启动会自动创建空数据库，之后运行抓取脚本填充内容。

### 抓取数据

```bash
npm run fetch-data            # 番剧信息（acgsecrets.hk）：季度列表、播出时间、简介、图片
npm run fetch-images          # 只补图片（--images-only）
npm run fetch-resources       # 资源增量爬取（Mikan，断点续爬）
npm run fetch-resources:full  # 强制全量重爬（--full）
```

`node fetch_acgsecrets.js [起始年] [结束年] [flags]`：

| 参数 | 说明 |
|---|---|
| `--add-only` | 增量：只追加站点新出现的番剧（含封面），不改动已有条目，适合 cron 每周 |
| `--refresh` | 配合 `--add-only`：给已有条目补上站点后来公布的时间/星期（仅当本地缺失时） |
| `--data-only` | 只更新数据，不下载封面 |
| `--images-only` | 只补图片（已存在的数据文件） |
| `--force` | 忽略已存在文件强制重抓覆盖（会覆盖手工修改，慎用） |

`node fetch_resources.js`：

| 参数 | 说明 |
|---|---|
| `--fast` | 快速增量：只抓最新 5 页并匹配新行，单次数秒（推荐 cron 每 2 分钟） |
| `--full` | 强制全量重爬 |
| `--rematch` | 清空番剧关联并重新匹配（44 万行约 1-2 分钟） |
| `--rss` | 从 nyaa / dmhy 的 RSS 补充资源 |
| `--details` | 补抓资源简介与截图 |
| `--rss-one <id>` | 只匹配单部番剧的 RSS 资源 |

### 生成衍生物（可选）

```bash
node build_index.js            # 从 bgm API 枚举生成 anime_index.json（全量番剧索引，供 /api/anime/search）
node scripts/gen_thumbs.js     # 用 images/ 批量生成 /thumbs/ 的 400×600 WebP 缩略图（需 sharp）
node scripts/clean_zws.js      # 清理库内标题/字幕组字段中的零宽字符（U+200B 等，一次性）
```

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

#### `GET /api/resources/torrent/:hash`

代理下载 `.torrent` 文件（不暴露第三方源，24h 内存缓存）。返回 `application/x-bittorrent`，带 `Content-Disposition` 文件名。

#### `GET /api/resources/bangumi?key=&id=&page=&size=`

按番剧查询资源。`key` 为六位季度键（如 `202607`），`id` 为番剧 ID（如 `acgs-anime-2229`）。

```json
{ "list": [ /* 资源数组 */ ], "total": 12, "page": 1, "size": 30 }
```

### 字幕组

#### `GET /api/groups?q=`

字幕组列表（含资源数），`q` 为可选模糊过滤。

```json
{ "list": [ { "name": "喵萌奶茶屋", "count": 30421 }, ... ] }
```

#### `GET /api/group/:name?page=&size=`

某字幕组的最新发布（结构同 `/api/resources/latest`）。

### 搜索

#### `GET /api/anime/search?q=&p=`

**全量番剧搜索**（`anime_index.json` 索引，1900–2026 含老番，镜像自 bgm）：模糊匹配标题/日文名/罗马音，翻页参数 `p`。是日历页搜索的主要后端。

```json
{
  "list": [
    {
      "id": 9304,
      "title": "猫眼三姐妹",
      "titleJp": "キャッツ・アイ",
      "date": "1983-07-11",
      "platform": "TV",
      "score": 7.2,
      "eps": 73,
      "cover": "https://bgmimg.072139.xyz/pic/cover/l/...",
      "tags": ["TV", "日本", "漫画改"]
    }
  ],
  "total": 5,
  "page": 1,
  "pages": 1
}
```

> 索引文件 `anime_index.json` 由 `build_index.js` 生成（不入库，见 `.gitignore`）。

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

### 静态资源

- `/thumbs/<season>/<title>.webp` — 400×600 WebP 缩略图（由 `gen_thumbs.js` 生成）
- `/assets/*` — 前端构建产物（带内容 hash，可长期缓存）
- `favicon.png` / `manifest.webmanifest` — PWA 图标与清单

## 架构

```
┌──────────────┐   ┌───────────────────────────┐
│  浏览器/订阅器 │──▶│  server.js（Node 单体）      │
└──────────────┘   │  ├─ 静态文件（dist + thumbs）│
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
              anime_index.json（全量番剧索引，build_index.js 生成）
              thumbs/（WebP 缩略图，gen_thumbs.js 生成）
```

- **存储**：`data/resources.db`（SQLite，WAL 模式，`better-sqlite3`）；`data/*.js` 为季度番剧数据文件（`_DATA["202607"]["summer"] = [...]` 形式）；`anime_index.json` 为全量番剧搜索索引
- **爬虫**：`fetch_resources.js`（Mikan 资源）+ `fetch_acgsecrets.js`（番剧信息/图片），独立进程，通过 `--fast` 支持 cron 增量
- **前端**：Vue 3 + Vite（`src/`，`npm run build` 输出 `dist/`），多视图单页应用；Service Worker 缓存静态资源
- **性能**：季度数据启动预热（44 文件 ≈ 150ms）并按 mtime 增量缓存；搜索结果 LRU 缓存（200 条 / 10 分钟）；缩略图 WebP + 30 天缓存

## 目录结构

```
.
├── server.js              # HTTP 服务：静态 + API + RSS
├── db.js                  # SQLite 数据层（better-sqlite3，WAL）
├── fetch_resources.js     # Mikan 资源爬虫（--fast/--full/--rss/--details/--rematch/--rss-one）
├── fetch_acgsecrets.js    # 番剧信息/图片爬虫（acgsecrets.hk，繁→简，--add-only 增量，JST→北京时间）
├── build_index.js         # 生成 anime_index.json 全量番剧索引（bgm API 枚举）
├── vite.config.mjs        # Vite 构建 + PWA 插件
├── index.html             # SPA 入口（SEO meta / canonical / og 标签）
├── src/                   # 前端源码（Vue 3）
│   ├── main.js / App.vue / router.js
│   ├── views/             # CalendarView / ClassicView / GroupsView / GroupView / ResourcePage
│   ├── components/        # SiteHeader / DetailOverlay / ResourceRow / Pager / CtxMenu / Lightbox
│   ├── assets/style.css   # 全站样式（主题变量、暗色模式）
│   └── api.js / i18n.js / bgmeta.js / calendar.js / search.js / theme.js ...
├── dist/                  # 构建产物（npm run build，已提交 git）
├── data/
│   ├── resources.db       # 资源 SQLite 库（自动创建）
│   ├── 202607.js ...      # 各季度番剧数据
│   └── crawl_state.json   # 爬虫断点
├── scripts/
│   ├── gen_thumbs.js      # 批量生成 /thumbs/ WebP 缩略图（sharp）
│   └── clean_zws.js       # 清理库内零宽字符（一次性维护）
├── deploy/                # systemd + Caddy + cron + 一键同步
│   ├── sync.sh            # 服务器一键同步脚本（见运维）
│   ├── crawl.sh / schedule.sh / backup.sh / install.sh
│   └── ani.service / Caddyfile
├── images/                # 封面原图（git submodule，alipoi/Ani-images）
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

- 系统选 **Ubuntu 22.04/24.04**（aarch64）：`install.sh` 可直接跑。Node 20 与 `better-sqlite3` 均有 linux-arm64 预编译包，脚本同时装了 `build-essential` 兜底编译
- 监听 80 端口通过 systemd `AmbientCapabilities=CAP_NET_BIND_SERVICE` 实现，无需 root 运行服务
- Oracle 实例均在境外，访问 Mikan / acgsecrets / 图片源无需代理（`HTTPS_PROXY` 留空即可）
- 迁移数据：把本机 `data/`（`resources.db` + 季度 JS + `images/`）拷到 `/opt/ani/` 下并保持 `ani` 用户属主，重启服务即生效

## 运维

| 操作 | 命令 |
|---|---|
| 查看服务日志 | `journalctl -u ani -f` |
| 重启服务 | `sudo systemctl restart ani` |
| 快速增量爬取 | `sudo -u ani node /opt/ani/fetch_resources.js --fast` |
| 强制全量重爬 | `sudo -u ani node /opt/ani/fetch_resources.js --full` |
| 重新匹配番剧 | `sudo -u ani node /opt/ani/fetch_resources.js --rematch` |
| 补详情页简介/截图 | `sudo -u ani node /opt/ani/fetch_resources.js --details` |
| 生成/更新全量番剧索引 | `sudo -u ani node /opt/ani/build_index.js` |
| 生成/更新 WebP 缩略图 | `sudo -u ani node /opt/ani/scripts/gen_thumbs.js` |
| 服务器一键同步代码 | `sudo bash /opt/ani/deploy/sync.sh`（详见 [`deploy/SYNC.md`](deploy/SYNC.md)） |
| 恢复备份 | `cp /opt/ani-backup/resources_XXXX.db /opt/ani/data/resources.db && sudo systemctl restart ani` |

## 许可证

MIT
