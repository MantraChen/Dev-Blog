# my_server 适配历史与域名恢复

当前正式入口已恢复为 **https://howielog.com/**，代码已合入 `main`。服务器侧 [HaruharaZhang/my_server PR #13](https://github.com/HaruharaZhang/my_server/pull/13) 保持关闭；本次没有修改朋友仓库的 `source.json`、重开 PR 或执行部署。

此前方案是在 `https://dyyjs.com/howielog/` 直接提供博客服务。该路径不再是默认入口；请勿把旧组件中的 `SITE_URL=https://dyyjs.com`、`PUBLIC_BASE_PATH=/howielog` 原样用于当前独立域名部署。

## 当前配置

构建和服务统一使用 `SITE_URL=https://howielog.com`、`PUBLIC_BASE_PATH=/`；服务设置 `WEBAUTHN_ORIGIN=https://howielog.com`。修改旧环境配置后重新构建并重启，不能只替换静态文件或只改运行时变量。部署步骤见 [Windows](../setup.md) 或 [Linux](../linux/README.md)，Caddy 示例已使用 `howielog.com`。

文章 `/blog/<slug>`、后台 `/admin`、接口 `/api/*`、图片 `/media/<uuid>.webp`、RSS `/rss.xml`、canonical/OG 和 sitemap 均使用根路径。博客收到旧 `/howielog/...` 的 GET/HEAD 请求会跳到相应根路径并保留查询参数；写入接口不重定向。正文、封面等已保存的博客链接在渲染时转换，数据库正文及文章 slug 不变；Giscus 继续按原始文章 pathname 查找讨论。

浏览器直接访问朋友域名的旧地址时，请求仍由朋友服务器接收；如需从那里跳转到 `howielog.com`，须由服务器所有者单独配置。此博客仓库无法代替对方修改 DNS、TLS 或 Caddy。对方域名的其他页面不会被当作博客链接替换。

## 数据和认证

保留现有 SQLite、media 和完整备份目录；迁移 007–009 及内容功能均保留，不能用空数据库覆盖。升级前成套备份数据库和图片，按 [内容平台说明](../../docs/CONTENT-PLATFORM.md) 校验恢复。

独立域名使用根路径 Cookie，需要重新登录。通行密钥绑定域名，目标域名应重新注册；管理员密码仍为恢复入口。restic 站点标签依赖域名和前缀，旧标签备份继续保留，检查配置后再开启新标签下的自动备份与清理。

`/howielog` 部署能力仍保留以验证兼容性；`npm run verify:all` 先测子路径，最后构建并验证 `howielog.com` 根路径，完成后的 `dist/` 对应正式入口。此前测试服务器资源和 GitHub 账单限制仍需在实际上线前解决。
