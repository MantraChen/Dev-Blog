# Linux 试运行与切换

接入 `HaruharaZhang/my_server` 的具体方案见 [服务器仓库适配说明](../my-server/README.md)，该方案通过朋友仓库的审核和组件部署入口运行。

这是 Ubuntu LTS / systemd 的候选部署模板，尚未在本轮 Windows 机器实机运行。保留 Caddy、Node 和 SQLite；不自动替换线上 NSSM 服务。

1. 安装 Node 24.22.1 或同主版本更新补丁、npm、Git、官方 Caddy 和 SQLite 所需系统库。建立无登录权限的 `devblog` 用户。核对模板中 `/usr/bin/node`，不要混用不同 Node 主版本构建原生模块。
2. 使用 `/opt/dev-blog/releases/<commit>` 保存 release；部署账户拥有源码，服务账户只读。使用 `/var/lib/dev-blog` 保存持久数据库和备份，属主 `devblog`，目录权限 0700。数据库不要放在版本目录或网络文件系统中。
3. `/etc/dev-blog.env` 只允许 root 读取（0600），包含 `NODE_ENV=production`、`HOST=127.0.0.1`、`PORT=4321`、`DATABASE_PATH=/var/lib/dev-blog/data.db`、`ADMIN_PASSWORD_HASH=<现有 bcrypt hash>`。不要把真实值放入 Git 或命令历史。systemd 读取该文件后向专用服务进程传入变量。
4. 在新 release 用 Linux 本机依赖运行 `npm ci`、`npm run verify`、`npm audit --audit-level=moderate`；构建时传入 `PUBLIC_RELEASE_ID=<commit>`。安装依赖或构建不要对生产数据库执行迁移。
5. 将数据库**一致备份的副本**放入 `/var/lib/dev-blog`。在具有相同环境的服务账户下运行 `npm run db:migrate`；核验完整性与统计总数。生产切换时先停旧服务及 webhook，完成最终备份再做这一阶段。
6. 创建 `/opt/dev-blog/current` 指向已验证 release；安装本目录 service 到 `/etc/systemd/system/dev-blog.service`，执行 `systemd-analyze verify`、`systemctl daemon-reload`、`systemctl enable --now dev-blog`。先用回环健康检查核对 commit，再使用上层 Caddy 转发；只向外开放 80/443。
7. 使用 `deploy/Caddyfile.example` 的应用转发段，删除 `/webhook` 分支或明确接入新的部署机制：仓库中的 webhook 当前调用 PowerShell，**不能直接搬到 Linux**。低风险首发采用人工 staged release；稳定后再实现受限制的 CI 部署。

升级时先在新目录构建验证；停服务、备份迁移、切换 current、启动、验收。启动失败切回上一 release；不要自动用旧数据库覆盖新写入。systemd 单元不会在每次重启时自动迁移，避免失败循环反复创建备份。保留 `current` 指向的 release 和至少一个已验证回退版本。

应用每 15 分钟有限批次清理过期统计明细。历史积压先 `npm run db:maintain` 查看，再 `npm run db:maintain -- --apply`；后者先创建并验证备份。配置 journald 限额和异机备份，并定期在隔离目录恢复演练。`npm run doctor` 是只读检查，不能替代这些演练。

不要配置 `MemoryDenyWriteExecute=true`（可能阻止 V8 JIT），不要禁止线程创建（搜索使用 Node worker），不要把 SQLite 写目录设为只读。本模板不包含未经测试的自动 DNS 切换或数据库还原。

迁移 008 后的内容平台使用单个应用进程：应用每 30 秒处理定时发布、过期回收站以及可选的每日备份。在线备份/恢复会排空进行中的 API 写入，并暂时拒绝新的写入。不要在同一个 SQLite / media 目录上并行运行多个应用进程执行这些维护操作。`MEDIA_DIR` 和 `FULL_BACKUP_DIR` 默认均位于数据库旁；自定义时同步调整 `ReadWritePaths`。详见 [内容平台与恢复说明](../../docs/CONTENT-PLATFORM.md)。

迁移 009 增加通行密钥、分享图和可选的 restic 备份。服务进程也需要 `SITE_URL`、`PUBLIC_BASE_PATH`，并按实际 HTTPS 来源设置 `WEBAUTHN_ORIGIN`。建议安装 `fonts-noto-cjk`；restic 缓存放在 `/var/lib/dev-blog/restic-cache`，凭据通过私密文件提供，不能依赖被 `ProtectHome=true` 屏蔽的管理员主目录。具体变量、保留策略及恢复方式见 [写作与运维增强](../../docs/PUBLISHING-OPERATIONS.md)。

CI 的 Linux 子路径任务已配置独立 systemd/Caddy 演练，包括异常退出重启、持久目录和完整恢复；脚本限制在 GitHub-hosted runner，不能直接用于生产。当前本地无 Linux 测试机，Actions 因账号账单锁定未启动，此演练尚未运行通过。解锁后需重跑 CI，再在目标服务器做 HTTPS、备份后端网络权限和真实设备通行密钥验收。继续采用先试运行、再切换的方式，保留原有 Windows 服务作为可回退环境。
