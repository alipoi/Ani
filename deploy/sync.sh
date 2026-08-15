#!/usr/bin/env bash
# Ani 服务器一键同步（拉取 origin master 并部署）
# 用法：sudo bash /opt/ani/deploy/sync.sh
#
# 说明：服务器为纯同步节点——所有开发都在开发机完成并推送到 GitHub，
#       本脚本将 /opt/ani 工作区与 origin/master 强制对齐：
#         1. 放弃全部本地未提交改动（含 data/*.js 爬虫产物，之后 cron 会重新生成）
#         2. 同步 git 子模块 images/
#         3. 依赖变更时执行 npm install
#         4. 前端产物变更时执行 npm run build
#         5. 重启 ani 服务
#       若服务器存在"本地独有改动需要保留"，请先手工提交并合并回 master（见 SYNC.md）。

set -euo pipefail

APP_DIR=/opt/ani
APP_USER=ani
REPO_URL=${REPO_URL:-https://github.com/alipoi/Ani.git}

cd "$APP_DIR"

echo "==> 检查本地未提交改动"
DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then
  echo "!! 存在未提交改动，将被丢弃："
  echo "$DIRTY"
  if [ -t 0 ]; then
    read -r -p "   继续丢弃并同步? [y/N] " ans
    [[ "$ans" =~ ^[Yy]$ ]] || { echo "已取消。"; exit 1; }
  else
    echo "   非交互模式，自动继续（如不想丢弃请取消）"
  fi
fi

echo "==> 拉取 origin"
sudo -u "$APP_USER" git fetch origin

HEAD_NOW=$(sudo -u "$APP_USER" git rev-parse HEAD)
HEAD_NEW=$(sudo -u "$APP_USER" git rev-parse origin/master)
echo "  当前: $(git log -1 --format='%h %s' "$HEAD_NOW")"
echo "  目标: $(git log -1 --format='%h %s' origin/master)"
if [ "$HEAD_NOW" = "$HEAD_NEW" ]; then
  echo "  已是最新，无需同步。"
  exit 0
fi

echo "==> 重置工作区到 origin/master（丢弃本地改动）"
sudo -u "$APP_USER" git reset --hard origin/master
sudo -u "$APP_USER" git submodule sync
sudo -u "$APP_USER" git submodule update --init --recursive

echo "==> 检查依赖变更"
OLD_DEPS=$(sudo -u "$APP_USER" git show "$HEAD_NOW":package-lock.json 2>/dev/null | sha256sum | cut -d' ' -f1 || echo old)
NEW_DEPS=$(sudo -u "$APP_USER" git show HEAD:package-lock.json | sha256sum | cut -d' ' -f1)
if [ "$OLD_DEPS" != "$NEW_DEPS" ]; then
  echo "  依赖有变化，执行 npm install"
  sudo -u "$APP_USER" npm install --omit=dev
else
  echo "  依赖无变化，跳过 npm install"
fi

echo "==> 检查前端产物是否需要重建"
DIST_DIRTY=$(sudo -u "$APP_USER" git status --porcelain -- dist/ || true)
if [ -n "$DIST_DIRTY" ]; then
  echo "  dist 与提交不一致，执行 npm run build"
  sudo -u "$APP_USER" npm run build
else
  echo "  dist 与提交一致，跳过构建"
fi

echo "==> 重启服务"
systemctl restart ani
sleep 2
systemctl is-active ani

echo "==> 完成"
