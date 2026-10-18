# 兼容插件监控

GitHub Actions 工作流 `plugin-compatibility-watch` 每日北京时间 08:23 检查，支持手动运行。GitHub 排队可能延迟实际开始时间。

监控 `billion-context`、`dsh-codex-subscription`、`dsh-codex-connect` 的 npm `latest` 发布包。检查包名与版本、SHA-512 完整性、导出入口、DSH 兼容范围、宿主依赖，以及接入函数的语法指纹和额度接口标记。billion-context 额外运行本项目实际使用的原版源码兼容检查，覆盖代理和原生传输。

检查只下载和读取公开包，不安装或执行上游代码，不查询用户账户。新版本、接口变化、契约不匹配或检查失败时，由 `github-actions[bot]` 创建对应插件的跟踪 issue。后续变化更新同一条未关闭的机器人 issue；相同结果不重复通知。报告和指纹保存在该次 Actions 的 artifact 中。

静态契约匹配不能证明上游运行行为完全一致。出现变更后，先查看报告中的函数变化，运行本项目对应兼容回归；确认后执行 `node scripts/watch-plugin-compatibility.mjs --record` 更新基线，并随修复提交。基线不会由机器人自动接受，也不会自动升级插件。

本地查看：`node scripts/watch-plugin-compatibility.mjs`。本地默认不创建 issue。单元检查：`node test/plugin-compatibility-watch.mjs`。
