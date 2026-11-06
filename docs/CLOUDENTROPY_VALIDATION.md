# Cloudentropy 0.2.0 本机验证（2026-11-06）

- 分支：`codex/cloudentropy-updates`。更新实现提交 `33e523e8a`，模块整理及更新来源补齐 `13943d459`，发布完整性检查 `fba2141e9`。
- `pnpm typecheck` 通过。
- updater、config、local-computer、memory、replay、update-check、after-pack 和 source-size checks：375 项通过，1 项平台测试跳过；随后新增的 cloudentropy tag 解析测试及 update-check 共 7 项通过。
- pre-push 的源码检查通过；没有跳过钩子或放宽文件体积上限。
- `pnpm package:cloudentropy:mac` 成功生成 Apple silicon DMG/ZIP。
- `codesign --verify --deep --strict` 通过；签名为 ad-hoc，未做 Apple 公证。
- Bundle ID 为 `ai.cloudentropy.desktop`；包内 app-update.yml 的 owner/repo 为 `Ashersun1207/cloudentropy`。
- 包内 harness 在临时独立工作区启动，`/api/health` 返回 HTTP 200。首次测试清理目录遇到并发写入，增加清理重试后再次通过；未改产品代码处理这一测试清理问题。
- 本机旧 App 与工作区冷备份位于 `~/Library/Application Support/Cloudentropy Backups/` 的日期目录，未上传 GitHub。
- 已安装 `/Applications/Cloudentropy.app`，复用现有工作区；启动前后读取到的持久数据均为 247 条消息、8 个记忆文件、3 个向量、4 个 bot。Magpie available，memoryEmbedding.enabled 为 true。
- macOS 签名/应用身份变化可能要求重新授权钥匙串或辅助功能；本次启动日志曾报告 credential store unreadable。保留了原始加密存储与冷备份，不能据此宣称所有已连接第三方账号完成迁移。Magpie 与千问配置来自工作区配置，已核对状态。
- 自动更新边界由测试验证：不加载 binary updater、不安排 quiet-install/下载定时器；未授权窗口不能打开发布页，install IPC 拒绝自动安装。

尚未完成的验证：GitHub Actions 首次打包至草稿的整个流程、从公开发布页下载后升级、Apple Developer ID 签名/公证、多平台安装。公开 Release 前应核对 Actions 与安装结果，不将本地构建成功当作远端流水线通过。
