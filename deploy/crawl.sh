#!/usr/bin/env bash
# 快速增量：只抓最新几页 + 匹配新行，单次 1-3 个请求、几秒完成
# 追番党推荐 cron 每 2 分钟跑一次，追不上档期的可以改更短
set -euo pipefail
cd /opt/ani
exec /usr/bin/env node fetch_resources.js --fast >> /var/log/ani-crawl.log 2>&1
