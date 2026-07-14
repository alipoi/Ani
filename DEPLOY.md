# 部署指南

## 方式一：国内云服务器

### 1. 买台服务器
- 腾讯云轻量应用服务器或阿里云 ECS，最低配够用（2核2G，~68元/月）
- 系统选 Ubuntu 22.04 或 CentOS

### 2. 装 Node.js + PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pm2
```

### 3. 拉代码
```bash
git clone --recurse-submodules https://github.com/alipoi/Ani.git
cd Ani
```

### 4. 启动
```bash
pm2 start server.js --name ani
pm2 save
pm2 startup  # 开机自启
```

### 5. 配域名 + 反向代理（可选）
```nginx
# /etc/nginx/sites-available/ani
server {
    listen 80;
    server_name 你的域名或IP;
    location / { proxy_pass http://127.0.0.1:3000; }
}
```

然后浏览器访问 `http://服务器IP:3000` 就能看到了。

---

## 方式二：Railway / Render（推荐，最省心）

连 GitHub 仓库，自动部署 Node.js 项目：
1. 去 [railway.app](https://railway.app) 或 [render.com](https://render.com)
2. 点 "New Project" → "Deploy from GitHub repo"
3. 选 `alipoi/Ani`，启动命令 `node server.js`
4. 自动 HTTPS + 域名，搞定

## 方式三：Vercel（需稍改）

Vercel 能部署 Node.js serverless，但 `server.js` 需要稍作调整适配。

## 方式四：GitHub Actions + 你的服务器

提交代码后自动部署到你的 VPS，但需要你有一台服务器。
