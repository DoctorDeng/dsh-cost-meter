# v1.9.33 更新说明

## 中文

本版本完成三条上游兼容监控告警的验证，费用插件的运行时适配代码保持原样。

- **billion-context 0.1.205 / 0.1.206：**实际发布包通过代理与原生传输、四种协议、重试、摘要压缩、缓存计费、API/Plan 分类、父子会话、历史回放、重启及原版 CLI 自动接入检查。
- **dsh-codex-subscription 3.1.6：**宿主依赖约束更新，额度接入函数未变；原版解析器和 RPC 通过单周、双窗口、强制刷新与失败回退检查。
- **dsh-codex-connect 0.2.0-alpha.10：**新增原版额度解析器、公开状态类与 GET 路由检查，确认当前账号的用量和账号列表取自同一快照；下一次刷新跟随新账号，并保留登录失效、额度失败、鉴权拒绝和方法限制。

持续集成保留原有版本，并加入上述版本。监控基线更新为 **0.1.206 / 3.1.6 / 0.2.0-alpha.10**，记录对应 npm 发布包的 SHA-512 完整性。测试使用本地模拟数据与服务，没有登录用户账号或调用外部模型。

报告来源：`github-actions[bot]` 在 [#392](https://github.com/Han-1413141/dsh-cost-meter/issues/392)、[#393](https://github.com/Han-1413141/dsh-cost-meter/issues/393)、[#394](https://github.com/Han-1413141/dsh-cost-meter/issues/394) 提供版本和接口指纹变化。[详细验证范围](plugin-compatibility-watch.md)。

更新至 **1.9.33** 可获取本次兼容说明；无需额外配置或重新绑定账号。

## English

Verify compatibility with billion-context **0.1.205 / 0.1.206**, dsh-codex-subscription **3.1.6** and dsh-codex-connect **0.2.0-alpha.10**. Existing runtime adapters remain compatible.

The published packages pass the relevant billing, replay, CLI, quota-parser and RPC checks. New Codex Connect checks execute its original parser, public-status class and read-only HTTP route with local account/auth/quota fixtures, including account snapshot consistency, account changes, signed-out states, quota failures and authenticated request boundaries.

Expand the pinned CI matrix and update the monitoring baseline only after validation, retaining package SHA-512 integrity. No real user sign-in or external model request was used. These checks address automated reports #392, #393 and #394 from `github-actions[bot]`. No additional configuration or account rebinding is needed.
