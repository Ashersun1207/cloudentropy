# Entropybot 更新与发布

## 用户更新

Entropybot 使用自己的 GitHub Releases：
https://github.com/Ashersun1207/entropybot/releases

当前分发模式为手动更新。设置 → 更新 → 打开发布页面；下载 DMG 后退出应用，将新 Entropybot.app 拖入 Applications 替换。不会在后台下载、退出时安装或通过官方 Entropybot 更新源替换应用。

应用身份：`ai.entropybot.desktop`，产品名 Entropybot。版本独立从 `0.2.0` 开始，和上游 `0.1.141` 不混用。

工作区继续使用 `~/.entropybot`（或已配置的 OMB_DATA_DIR），包括 bots、messages.db、记忆、向量及本机配置。Electron 的窗口配置和加密凭证继续使用原来的 `~/Library/Application Support/entropybot`。版本升级不会清空这些目录；不要同时运行 Entropybot 和旧 Entropybot 操作同一工作区。

首次迁移应退出旧应用、备份整个工作区和 Electron profile，再启动 Entropybot。钥匙串/辅助功能授权可能因新的 bundle ID 或签名重新询问。不要把这些备份上传仓库或 Release。恢复官方包并不能自动回滚数据库；需要恢复匹配版本的数据备份。

## 开发者发布

1. 从 `upstream` 合并所需更新，保留 entropybot 的版本、身份、更新策略及专属 workflow。上游 workflow 归档在 `.github/upstream-workflows/`，不会执行。不要直接恢复上游发布、npm、Docker 或镜像同步流程。
2. 按 SemVer 修改 package.json 的版本；记录改动与验证。运行 `pnpm typecheck` 和相关测试。
3. `node scripts/entropybot-release.mjs check` 核对身份。使用 tag `entropybot-v<package.version>`，例如 `entropybot-v0.2.0`，不要使用上游 `v*` 标签。
4. 推送 tag 触发 `.github/workflows/entropybot-release.yml`；也可以在 Actions 手动运行。默认分支推送不会生成发布包。
5. CI 构建 macOS arm64 的 DMG/ZIP，并生成 SHA256SUMS 与 entropybot-build.json（提交号、版本、签名状态及哈希）。所有构建先进入 draft release。
6. 检查 Actions、安装与迁移结果，重写该版本发布说明，再手动 Publish release。工作流不会自动公开草稿。

本地构建：`pnpm package:entropybot:mac`，之后 `node scripts/entropybot-release.mjs manifest`。本地构建脚本先生成 UI/server、speech helper、CUA，再打包 Apple silicon App；没有 Windows/Linux/Intel 发布承诺。

## 签名与后续自动更新

目前只做 ad-hoc 签名，没有 Apple Developer ID 或公证，不能承诺 macOS 静默自动更新。SHA256 可检查下载完整性，不能替代 Apple 身份签名。

未来如需自动更新：配置自己的 Developer ID、公证与发布凭证；增加自动模式的回归测试及安装回滚验收，再切换更新策略。`electron-builder.yml` 中的 provider 已指向 entropybot，当前代码不会加载 electron-updater 或安排自动安装。

## 上游归属

保留 LICENSE、NOTICE 与原作者归属。enterprise/ 仍按其单独许可，不因换更新源获得生产授权。当前部分界面、图标和辅助组件保留上游名称；这套流程并不代表完整品牌替换或获得商标许可。
