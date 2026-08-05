#!/usr/bin/env bash
# 快速增量：只抓最新几页 + 匹配新行 + 补抓最多 100 条资源详情（介绍/图片）
# 追番党推荐 cron 每 2 分钟跑一次，追不上档期的可以改更短
set -euo pipefail
cd /opt/ani
exec /usr/bin/env node fetch_resources.js --fast --details --details-max 100 >> /var/log/ani-crawl.log 2>&1
