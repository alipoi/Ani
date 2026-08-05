#!/usr/bin/env bash
# Ani 一键部署（Ubuntu 22.04 / Debian 12）
# 用法：sudo bash deploy/install.sh
set -euo pipefail

APP_DIR=/opt/ani
APP_USER=ani
REPO_URL=${REPO_URL:-https://github.com/alipoi/Ani.git}

echo "==> 安装 Node.js 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs build-essential python3
fi

echo "==> 创建用户与目录"
id -u "$APP_USER" >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin "$APP_USER"
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

echo "==> 安装 Caddy（自动 HTTPS）"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi
# 先编辑 deploy/Caddyfile 里的域名，再执行下一步
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl enable --now caddy

echo "==> 配置 cron：快速增量爬虫每 2 分钟 + 每日备份"
chmod +x deploy/crawl.sh deploy/backup.sh
(crontab -l 2>/dev/null | grep -v '/opt/ani' || true
 echo '*/2 * * * * /opt/ani/deploy/crawl.sh'
 echo '30 4 * * * /opt/ani/deploy/backup.sh') | crontab -

echo "==> 完成"
echo "  服务: systemctl status ani"
echo "  日志: journalctl -u ani -f"
echo "  爬虫: cat /var/log/ani-crawl.log"
echo "  备份: ls /opt/ani-backup"
echo "  提示: 编辑 /etc/caddy/Caddyfile 填好域名后 systemctl reload caddy；首次数据可把本机 data/resources.db 拷到 /opt/ani/data/ 后重启 ani"
