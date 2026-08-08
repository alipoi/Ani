#!/usr/bin/env bash
# 每周一次：季度时间表爬虫（acgsecrets）
# --add-only：只把站点上新出现的番剧追加进当前/明年季度文件，并下载新封面
# --refresh ：给已有条目补上站点后来公布的时间/星期（仅当本地缺失时，已有时间的绝不覆盖）
# 新季度开播前数据文件不存在时，会自动创建并全量抓取。
set -euo pipefail
cd /opt/ani
Y=$(date +%Y)
exec /usr/bin/env node fetch_acgsecrets.js --add-only --refresh "$Y" "$((Y + 1))" >> /var/log/ani-schedule.log 2>&1
