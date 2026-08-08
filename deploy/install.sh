#!/usr/bin/env bash
# Ani 一键部署（Ubuntu 22.04 / Debian 12）
# 用法：sudo bash deploy/install.sh
set -euo pipefail

APP_DIR=/opt/ani
APP_USER=ani
REPO_URL=${REPO_URL:-https://github.com/alipoi/Ani.git}

echo "==> 安装 Node.js 22"
NEED_NODE=0
if ! command -v node >/dev/null 2>&1; then NEED_NODE=1; fi
if command -v node >/dev/null 2>&1 && [ "$(node -p 'Number(process.versions.node.split(".")[0]) < 22')" = "true" ]; then NEED_NODE=1; fi
if [ "$NEED_NODE" = "1" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs build-essential python3
fi

echo "==> 创建用户与目录"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd -r -m -s /usr/sbin/nologin "$APP_USER"
else
  mkdir -p "/home/$APP_USER"
  chown "$APP_USER:$APP_USER" "/home/$APP_USER"
fi
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> 拉取代码（首次）"
cd "$APP_DIR"
if [ ! -d .git ]; then
  sudo -u "$APP_USER" git clone --recurse-submodules "$REPO_URL" .
fi
sudo -u "$APP_USER" npm install --omit=dev

echo "==> 安装 systemd 服务"
cp deploy/ani.service /etc/systemd/system/ani.service
systemctl daemon-reload
systemctl enable --now ani

echo "==> 配置 cron：资源爬虫每 2 分钟 + 每周季度时间表 + 每日备份"
chmod +x deploy/crawl.sh deploy/schedule.sh deploy/backup.sh
(crontab -l 2>/dev/null | grep -v '/opt/ani' || true
 echo '*/2 * * * * /opt/ani/deploy/crawl.sh'
 echo '15 3 * * 0 /opt/ani/deploy/schedule.sh'
 echo '30 4 * * * /opt/ani/deploy/backup.sh') | crontab -

echo "==> 完成"
echo "  服务: systemctl status ani"
echo "  日志: journalctl -u ani -f"
echo "  资源爬虫: cat /var/log/ani-crawl.log"
echo "  季度爬虫: cat /var/log/ani-schedule.log"
echo "  备份: ls /opt/ani-backup"
echo "  提示: 本脚本不装 Caddy，默认走 Cloudflare CDN（Node 直连 :80）"
echo "  Cloudflare 配置:"
echo "    1. DNS 里把 nekomi.cn 添加 A 记录指向本机公网 IP，代理状态选「已代理（橙色云朵）」"
echo "    2. VCN 安全列表放行入站 80 端口（443 可不开，由 CF 边缘终结 TLS）"
echo "    3. SSL/TLS 模式选 Flexible（CF→源站走 HTTP :80）"
echo "    4. 缓存规则：建议对 / 与 /api/ 跳过缓存或用 Edge Cache TTL 0，避免 HTML 被缓存成旧版"
echo "  首次数据可把本机 data/ 拷到 /opt/ani/data/ 后重启 ani"
