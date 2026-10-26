# 兼容插件监控

GitHub Actions 工作流 `plugin-compatibility-watch` 每日北京时间 08:23 检查，支持手动运行。GitHub 排队可能延迟实际开始时间。

监控 `billion-context`、`dsh-codex-subscription`、`dsh-codex-connect` 的 npm `latest` 发布包。检查包名与版本、SHA-512 完整性、导出入口、DSH 兼容范围、宿主依赖，以及接入函数的语法指纹和额度接口标记。billion-context 额外运行本项目实际使用的原版源码兼容检查，覆盖代理和原生传输。

检查只下载和读取公开包，不安装或执行上游代码，不查询用户账户。新版本、接口变化、契约不匹配或检查失败时，由 `github-actions[bot]` 创建对应插件的跟踪 issue。后续变化更新同一条未关闭的机器人 issue；相同结果不重复通知。报告和指纹保存在该次 Actions 的 artifact 中。

静态契约匹配不能证明上游运行行为完全一致。出现变更后，先查看报告中的函数变化，运行本项目对应兼容回归；确认后执行 `node scripts/watch-plugin-compatibility.mjs --record` 更新基线，并随修复提交。基线不会由机器人自动接受，也不会自动升级插件。

本地查看：`node scripts/watch-plugin-compatibility.mjs`。本地默认不创建 issue。单元检查：`node test/plugin-compatibility-watch.mjs`。

2026-10-20 已验证并接受 `billion-context@0.1.202` 与 `dsh-codex-subscription@3.1.2`。前者通过实际发布包的代理、原生传输、重试、摘要、历史回放与原版 CLI 自动接入检查，后者通过实际额度解析和 RPC 的单周、双窗口、刷新、失败回退检查。测试使用合成数据与本机服务器，未查询用户账户或调用外部模型。两者接入接口指纹均未变化，v1.9.16 无需修改运行时代码即可兼容；对应版本已加入持续集成。

2026-10-22 已验证并接受 `billion-context@0.1.204` 与 `dsh-codex-subscription@3.1.4`（监控 issue [#379](https://github.com/Han-1413141/dsh-cost-meter/issues/379)、[#380](https://github.com/Han-1413141/dsh-cost-meter/issues/380)）。前者使用实际发布包验证代理、原生传输、重试、压缩、父子会话、历史回放和无配套包的 CLI 自动接入；后者验证发布包的单周、双窗口、强制刷新与失败回退。3.1.4 的 RPC 分发变化涉及语音功能，额度接口保持兼容。两版均加入持续集成，本次只接受已验证的两个版本，保留 `dsh-codex-connect` 原基线。

2026-10-24 处理 `github-actions[bot]` 在 [#392](https://github.com/Han-1413141/dsh-cost-meter/issues/392)、[#393](https://github.com/Han-1413141/dsh-cost-meter/issues/393)、[#394](https://github.com/Han-1413141/dsh-cost-meter/issues/394) 报告的版本与接口指纹变化。实际接入检查通过，费用插件运行时代码无需调整；持续集成保留旧版本并加入本次验证版本。

| 上游插件 | 已验证版本 | 变化与验证范围 |
| --- | --- | --- |
| billion-context | 0.1.205、0.1.206 | `handle` 为增量探测增加 conversation 参数，两版的接入函数指纹相同。用实际发布包验证四种协议、缓存计费、摘要压缩、重试、父子会话、API/Plan 分类、回放、重启及原版 CLI 自动接入。 |
| dsh-codex-subscription | 3.1.6 | 宿主依赖约束变化，额度接入函数指纹未变。用原版解析器和 RPC 载体验证单周、双窗口、强制刷新及失败回退。 |
| dsh-codex-connect | 0.2.0-alpha.10 | 宿主依赖与状态路由变化，状态读取使用同一账号快照。新增实际发布包检查，执行原版额度解析器、公开状态类与 GET 路由，覆盖读取期间切换账号、下一次刷新、登录失效、额度失败、401/403 拒绝、405 方法限制与卸载清理。 |

基线更新为 `0.1.206 / 3.1.6 / 0.2.0-alpha.10`，保存对应发布包的 SHA-512 完整性。Connect 的账号、认证和额度服务使用本地模拟对象；原版插件初始化、OAuth 登录与外部模型请求没有执行。检查入口为 `test/codex-connect-published.mjs`，通过 `DSH_TEST_CONNECT_PACKAGE` 指定已下载的 npm 压缩包。
