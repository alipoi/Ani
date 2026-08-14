# 代码同步与发布流程

本仓库采用 **开发机开发 → GitHub 中转 → 服务器只读同步** 的三方协作模型。本文档说明日常同步与本仓库历史遗留问题的解决办法。

```
开发机 (Windows)  ──push──▶  GitHub (origin/master)  ──pull──▶  服务器 /opt/ani
     D:\迅雷云盘\项目\Ani          alipoi/Ani                    (纯同步节点)
```

## 基本原则

1. **服务器只同步，不开发**。`/opt/ani` 工作区内不应存在未提交的代码改动；爬虫产物（`data/*.js`、`thumbs/`）由 cron 自动生成，不入库。
2. **dist/ 是入库产物**：前端修改后必须 `npm run build` 并提交 `dist/`，服务器同步后直接生效（无需服务器端构建）。
3. **衍生数据不入库**（`.gitignore`）：`anime_index*.json`（由 `build_index.js` 生成）、`thumbs/`（由 `scripts/gen_thumbs.js` 生成）、`server.js.bak*`。
4. **全部料想外的情况以本文档「事故处置」节为准**。

## 日常同步（服务器侧，一键）

```bash
sudo bash /opt/ani/deploy/sync.sh
```

脚本执行：检查未提交改动 → `git fetch` → `git reset --hard origin/master` → 更新子模块 `images/` → 依赖变更时 `npm install` → dist 不一致时 `npm run build` → 重启 `ani` 服务。

> 所有操作均需以 root 可写 `.git` 目录（`/opt/ani` 默认 root 属主 + `ani` 用户运行服务；配置里对两个用户都添加了 `safe.directory`）。

## 开发机侧（日常）

```bash
# 改代码 → 构建 → 提交 → 推送
npm run build
git add -A
git commit -m "feat/fix: ..."
git push origin master

# 服务器生效
ssh ani-prod "sudo bash /opt/ani/deploy/sync.sh"
```

**注意**：开发机直连 GitHub 可能因网络原因失败（HTTP 443 连接超时，常见于国内网络）。此时用本文档「断网中转」方案。

## 断网中转（开发机无法直连 GitHub 时）

利用服务器作为 git 中继（服务器与 GitHub 连通正常）：

```powershell
# 1. 开发机打包需要推送达 commit（以 origin/master 为基的增量）
git bundle create master.bundle origin/master..master

# 2. 上传到服务器
scp master.bundle ani-prod:/tmp/master.bundle

# 3. 服务器拉入并推送到 GitHub
ssh ani-prod "
  cd /opt/ani
  git fetch /tmp/master.bundle 'refs/heads/master:refs/remotes/origin/master'
  git push https://<user>:<PAT>@github.com/alipoi/Ani.git origin/master:master
  rm /tmp/master.bundle
"

# 4. 开发机补拉服务器分支（若服务器起了临时分支，同样用 bundle 反向中转）
git fetch "C:\Users\<你>\AppData\Local\Temp\opencode\server-local.bundle" server-local
git branch server-local FETCH_HEAD
```

> GitHub 推送凭据建议用 PAT（个人访问令牌），勿写死进仓库；日常推送若可直连则走 `origin` 即可。

## 事故处置：服务器出现本地独有改动

**背景（2026-08-15 已处理）**：服务器 `/opt/ani` 曾长期存在未提交的本地代码改动（webp/thumbs 服务、`/api/anime/search` 全量番剧索引搜索、种子自域名代理 `/api/resources/torrent/:hash`、sharp 依赖、`build_index.js`），且 `origin master` 仅落后 60 余个提交。原因：服务端功能直接在服务器上手工开发，从未提交。

**如果再次发现服务器有独有代码**，禁止直接 `reset --hard`（会丢失线上必需实现）。正确处置流程：

```bash
# 1. 服务器：把本地改动固化成分支并推送
cd /opt/ani
git checkout -b server-local
git add -A
git commit -m "feat: server-side changes - ..."
git push https://<user>:<PAT>@github.com/alipoi/Ani.git server-local

# 2. 开发机：fetch 分支 → 合并进 master → 解决冲突 → 构建 → 推送
git fetch origin server-local
git merge server-local -m "merge: 合入服务器端独有实现"
git status                        # 手工解决 data/*.js、server.js 等冲突
node --check server.js
npm run build
git commit -m "fix merge conflicts"
git push origin master

# 3. 服务器：对齐 origin/master，删除临时分支
git fetch origin
git checkout -B master origin/master
git submodule update --init images
git branch -D server-local
git push origin --delete server-local     # 远端分支也清理
```

**冲突要点**（本次 2026-08-15 实战）：

- `data/*.js`：两侧爬虫产物语义一致，仅行尾 CRLF/LF 差异 → 取 master 版：`git checkout --ours -- data/ && git add data/`
- `server.js`：两侧功能都要留（本侧独有 + origin 演进）→ 手动逐块合并，`node --check server.js` 验证
- `package.json`：合并 `sharp` 依赖（服务器独有，`gen_thumbs.js` 依赖）
- `fetch_acgsecrets.js`：服务器版 JST→北京时间的 +18 行改动与 origin 提交 `225e9ef` 重复 → 保留 origin 版即可
- `.gitignore`：补 `anime_index*.json`、`thumbs/`、`server.js.bak*`
- `images/` 子模块：服务端子模块因 `safe.directory` 未含其路径报 dubious ownership → `git config --global --add safe.directory /opt/ani/images`；升级指针时若工作区有孤儿文件阻塞 checkout，先 `git clean -fdx` 再 `git submodule update`

**验证清单（同步/合并后必须跑）**：

```bash
# 线上功能
curl -s 'https://nekomi.cn/api/anime/search?q=猫眼' | head -c 200   # 全量番剧搜索
curl -sI https://nekomi.cn/thumbs/202510/DIGIMON%20BEATBREAK.webp  # thumbs webp
curl -sI https://nekomi.cn/api/resources/torrent/<40位hash>         # 种子代理
curl -s 'https://nekomi.cn/api/resources/hash/449bcb5628bc4830b44cd15b90c68043a5d231ee' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["title"][0]=="[")'  # ZWS 修复
```

## 密码与凭据备忘（仅内部）

- 服务器 SSH：别名 `ani-prod`（`~/.ssh/config`，root@140.245.63.19:22）；密钥认证失效，改走密码（本地 `SSH_ASKPASS` + 临时 cmd 文件方式，用完即删）。
- GitHub：`alipoi/Ani`，推送用 PAT（权限：Contents read/write）。
- Caddy 在 `deploy/Caddyfile` 处理域名；阿里云 RUM 监控脚本由 Caddy 注入 `dist/index.html`（不入库，勿在构建时删除）。