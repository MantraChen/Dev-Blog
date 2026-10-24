# 接入朋友的 my_server

本分支为向 [HaruharaZhang/my_server](https://github.com/HaruharaZhang/my_server) 提交适配 PR 做准备。服务器侧实现位于该仓库的 `z_my_server/dev-blog` 组件，博客应用沿用已经合并的 `bea1a01569b312ad1381497c1970fb809ea25594`，不要求先合并本说明分支。

适配保留 `howielog.com`、全部文章路径、管理功能和 SQLite，在朋友的 Linux / systemd / Caddy 环境中使用独立 Node 24.22.1+ 运行时、回环端口 4321、独立服务账户及持久数据目录。组件以完整源码 SHA 固定版本，接入朋友仓库的组件选择、部署台账、回退和 CI 必需检查；默认关闭，须服务器所有者完成配置与数据导入后显式启用。

服务器侧准备包含：构建和 HTTP 验证、数据库副本迁移演练、停服务后一致备份、精确版本健康检查、失败恢复代码与服务状态，以及 Caddy 追加片段和首次切换说明。数据库不会随代码回退被旧备份覆盖；域名、Caddy、DNS 和生产数据不会由准备分支自动修改。

上线前按朋友仓库组件 README 完成 Linux CI、实际 systemd 权限检查、数据恢复演练、TLS/登录/搜索验收，再安排最终数据同步及 DNS 切换。当前 Windows 自动部署 webhook 保持暂停。

本轮只准备本地分支、提交、补丁及 PR 文案；没有创建或发送 PR，没有推送朋友仓库，也没有触发部署。
