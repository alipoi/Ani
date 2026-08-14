# 部署指南

架构：Node 单体（server.js 静态 + API）+ SQLite（WAL）+ Caddy 反代 + systemd 托管 + cron 爬虫。

> 不要用 Cloudflare Workers / Railway / Render：better-sqlite3 是 native 模块且数据库文件在 `data/`，这些平台文件系统是临时的，重新部署数据即丢失。**自建 VPS 是唯一推荐形态。**

## 方式一：VPS（推荐）

### 1. 准备
- 服务器：2C2G 即可（腾讯云轻量 / 阿里云 ECS，~68 元/月），系统 Ubuntu 22.04 / Debian 12
- 域名：国内服务器绑域名需 ICP 备案；没域名就先用 `http://服务器IP:8080`

### 2. 一键部署
```bash
# 先在 deploy/Caddyfile 里把 ani.example.com 改成你的域名（没域名可先不配 Caddy）
sudo bash deploy/install.sh
```

脚本会完成：Node 20 → 用户 ani → 拉代码 `/opt/ani` → npm i → systemd 服务 → Caddy 自动 HTTPS → cron（快速爬虫每 2 分钟 + 每日备份）。

> Caddy 只为了 HTTPS 域名，**不是必需**：没有域名就直接 `http://服务器IP:8080`，把 Caddy 那段从 install.sh 里跳过即可。

### 3. 迁移本地数据（可选，强烈建议）
```bash
# 把本机 data/ 整个目录拷到服务器（resources.db + 各季番 data/*.js）
scp -r data/resources.db user@服务器IP:/opt/ani/data/
sudo systemctl restart ani
```

### 4. 验证
```bash
systemctl status ani          # 服务状态
curl -s localhost:8080/api/groups
cat /var/log/ani-crawl.log    # 爬虫日志
ls /opt/ani-backup            # 每日备份（保留 7 天）
```

## 运维速查

| 操作 | 命令 |
|---|---|
| 一键同步代码（拉 origin master 并部署） | `sudo bash /opt/ani/deploy/sync.sh`（详见 [`deploy/SYNC.md`](deploy/SYNC.md)） |
| 看服务日志 | `journalctl -u ani -f` |
| 重启 | `sudo systemctl restart ani` |
| 快速增量（cron 每 2 分钟） | `sudo -u ani node /opt/ani/fetch_resources.js --fast` |
| 手动增量（旧页断点续爬） | `sudo -u ani node /opt/ani/fetch_resources.js` |
| 强制全量重爬 | `sudo -u ani node /opt/ani/fetch_resources.js --full` |
| 重跑匹配 | `sudo -u ani node /opt/ani/fetch_resources.js --match-only --rematch` |
| RSS 补充（nyaa/dmhy） | `sudo -u ani node /opt/ani/fetch_resources.js --rss` |
| 补详情页简介/截图 | `sudo -u ani node /opt/ani/fetch_resources.js --details` |
| 恢复备份 | `cp /opt/ani-backup/resources_XXXX.db /opt/ani/data/resources.db && sudo systemctl restart ani` |

## 爬虫说明

- **镜像 failover**：Mikan 官方域名有 Cloudflare 防护，脚本内置镜像列表（kas.pub / mikanani.me / mikanani.tv），被 403/429/503/CF 拦截自动轮换；可用 `MIKAN_BASE` 环境变量锁定
- **代理**：nyaa.si 等境外源从国内 VPS 抓不到，在 `deploy/ani.service` 里打开 `HTTPS_PROXY=http://127.0.0.1:7890` 一行（填你的代理地址）后 `sudo systemctl daemon-reload && sudo systemctl restart ani`；脚本会自动读取该环境变量
- **快速增量（--fast）**：每次只抓 Classic 第 1-5 页（最新发布）并只匹配新插入的行，单次 1-3 个请求、几秒完成——cron 每 2 分钟跑一次，追新档期基本实时；想更快改 cron 为 `* * * * *`（每分钟一次也毫无压力）
- **断点**：`data/crawl_state.json` 记录已爬到第几页、当前镜像、上次运行时间；增量模式遇到整页已入库即停
- **匹配**：`--rematch` 会清空全部资源的番剧关联并重跑（改匹配器后执行一次即可，44 万行约 1-2 分钟）；`--fast` 不能与 `--rematch` 同用

## 备份/恢复

每日 04:30 自动备份到 `/opt/ani-backup/`（SQLite 在线备份，WAL 安全、无需停服），保留 7 天。恢复见上表。

## 端口与环境变量

- `PORT`（默认 8080）、`HOST`（默认 0.0.0.0）、`MIKAN_BASE`、`HTTPS_PROXY` / `HTTP_PROXY`
- 静态文件与 API 响应已支持 gzip 压缩；SIGTERM 优雅退出（systemd 平滑重启）
