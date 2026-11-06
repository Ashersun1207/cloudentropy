# Entropybot 展示页

静态产品介绍与下载页。Google 授权入口继续使用同域的 `/auth/google/start?rd=/welcome`，由部署环境提供后端；本地静态预览不处理授权。

## 本地预览

```sh
cd site
python3 -m http.server 5187 --bind 127.0.0.1
```

访问 http://127.0.0.1:5187/ 。上传时需同时包含 `index.html` 和整个 `assets/` 目录，图片采用相对路径。

## 更新应用截图

```sh
# 在仓库根目录执行，使用 Node.js 24+
source ~/.nvm/nvm.sh && nvm use 24
node --experimental-strip-types scripts/capture-site-app.ts
```

脚本启动一次性的隔离环境，用假引擎生成中文演示对话，再拍摄真实应用组件。不会读写用户的应用数据，也不会调用真实模型。脚本结束时自动关闭自己的服务与浏览器。

产物：

- `assets/app-light.webp`：Daylight，2560 × 1600。
- `assets/app-dark.webp`：Midnight，同一场景、相同尺寸。
- `assets/app-icon.png`：应用的 Electron 图标。

演示对话不代表真实任务执行记录。页面已标注演示内容。

## 部署

官网静态根目录为 `/opt/entropybot/site`，Caddy 容器只读挂载到 `/srv/site`。发布前先备份旧目录；上传新图片后再原子替换 `index.html`，避免页面引用尚未上传的资源。此更新无需重启容器。

仅发布 `index.html` 与 `assets/`。不要上传此目录之外的文件；`/opt/entropybot/private` 为授权后的页面，`/opt/entropybot/deploy` 保存现有 Caddy 和 Google 授权代理配置。

发布后核对主页及三张图片的 HTTP 状态、内容哈希、明暗主题切换和图片预览，并检查 Google 授权入口仍重定向到 Google。完整登录需要用户本人完成授权。

## 页面行为

主题默认跟随系统，可选择浅色、深色或跟随系统；选择保存在此网站自己的 `entropybot-theme` 中。截图随页面主题切换。点击截图可查看大图，Escape 关闭后焦点返回截图链接。关闭 JavaScript 时仍能通过图片链接查看原图。

本次检查包含 1440、390、320px 布局、两种主题、系统主题变化、刷新后的偏好保存、图片加载、大图关闭与焦点返回，以及无 JavaScript 的图片链接。没有执行 Google 登录或线上部署。
