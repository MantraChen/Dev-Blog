# 接入朋友的 my_server

服务器侧适配见 [HaruharaZhang/my_server PR #13](https://github.com/HaruharaZhang/my_server/pull/13)，组件为 `z_my_server/dev-blog`。本分支提供支持子路径的博客源码；服务器仓库的 `source.json` 固定本分支的完整 commit，不需要先合并博客 main，也不自动跟随分支更新。

目标入口为 **https://dyyjs.com/howielog/**：文章 `/howielog/blog/<slug>`、后台 `/howielog/admin`、接口 `/howielog/api/*`、RSS `/howielog/rss.xml`。访问 `/howielog` 时由 Caddy 以 308 补齐尾部斜杠并保留查询参数。博客由该路径直接提供服务，不再跳往 howielog.com；已有文章 slug、管理功能和 SQLite 数据保留。

构建时设置 `SITE_URL=https://dyyjs.com`、`PUBLIC_BASE_PATH=/howielog`，在相同环境中执行 `npm run verify`。部署器及 CI 从 source.json 读取这两个设置。资源、导航、API、canonical、OG、RSS/sitemap 均包含前缀；旧 howielog.com 内容链接在展示时转换，不改数据库正文。Giscus 按去掉部署前缀后的原 pathname 查找评论；若评论仓库设置过来源白名单，需要允许新域名并在上线前验证已有评论。

后台与访客 Cookie 使用专属名称和 `/howielog/` Path，主题存储键改为 `howielog:theme`；迁移后需要重新登录。子路径并非浏览器同源安全隔离，共用域名的应用必须相互信任。共享根目录的 Service Worker、缓存和 robots.txt 规则由服务器所有者维护，博客不覆盖它们。

服务器运行环境为 Linux / systemd / 现有 Caddy，专用 Node 24.22.1+、回环端口 4321、独立服务账户和持久 SQLite 目录。组件默认关闭，配置、数据库导入及启用步骤以服务器组件 README 为准。准备包含构建及 HTTP 验证、数据库副本迁移演练、一致备份、精确版本健康检查和失败恢复；代码回退不会覆盖数据库新写入。

Caddy 路由片段须导入现有 dyyjs.com 站点块，保留 `/howielog` 转发前缀及其他服务路由；robots 规则须合并到域名根目录文件。上线前完成 Linux CI、systemd 权限检查、数据恢复演练和 HTTPS/登录/搜索/评论验收，再在旧站暂停写入后同步最终数据。无需给 howielog.com 改 DNS；外部保存的旧域名链接只有在旧域名仍可提供 HTTP 服务时才能另外设置重定向。Windows 自动部署 webhook 保持暂停。
