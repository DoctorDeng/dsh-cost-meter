# DSH 0.2.1-alpha.5 兼容性

## 中文

本版另新增 [DeepSeek Search／Fetch API 次数费](web-request-fees.md#中文)：成功且有结果的请求 ¥0.005／次，保留调用时汇率；本地 HTTP 抓取不增加次数费。模型 Token 费率保持不变，内置搜索免费期不猜测结束日期。


核对日期：2026-10-16。目标为官方 [dsh-v0.2.1-alpha.5](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.5)，比较基线为 alpha.4。

**日常计费与界面在 v1.8.34 即可使用，原有模型 Token 计费无需调整。离线修复命令在新宿主上需升级到 v1.8.35。** 已在隔离的 Windows 测试环境中通过真实 CLI 安装 v1.8.34 公开发布包，启动 Web 宿主，确认凭据与路径模块复用宿主实例，三次合成用量全部入账。测试未使用真实账户、原有会话或模型 API。

与本插件有关的变化如下：

| 宿主变化 | 对费用插件的影响 |
|---|---|
| 新增 `conversation.input.model.label` Slot | 仅供自定义模型名称展示；本插件按 provider/model ID 计价，不按显示名称计价，无需接管这个 Slot。 |
| 收起右侧栏时使用 `overflow: clip` | 费用浮层已有 portal 挂载，不依赖侧栏溢出；真实 alpha.5 SlotCore 与发布版 dsh-context 的侧栏、会话页及弹窗联动检查通过。 |
| 技能菜单刷新、终端查询合并、PTC 提示调整 | 不改变费用插件使用的用量计数与价格接口。PTC 提示变化可能改变实际输入长度，费用仍按上报用量计算。 |
| 账户通知字段更宽松 | 该变化属于通知数据；本插件读取的钱包余额结构不受影响。 |

离线修复工具原来直接使用宿主导出的存储类。新宿主只导出插件入口，旧工具会安全拒绝 `--write`。v1.8.35 通过官方插件在空临时目录加载存储服务，只调用其独占锁接口，初始化不会打开或迁移用户会话。取得真实锁后仍由原修复流程备份并修改限定事件，宿主已持锁时拒绝写入。新旧宿主的普通与 Zstandard 日志均验证实际 CLI 修复、原样备份和重启后继续追加。

实际验证覆盖安装准入与启动、三个合成用量的持久化、配置读写、RPC 热加载与卸载、原生搜索计费，以及真实 Session / TokenMeter / ProjectionRegistry。浏览器使用实际发布的 dsh-context 0.68.1 与 alpha.5 的 SlotCore、会话页签逻辑，检查三个入口、反复开关、会话隔离、压缩校准总量和只改变上下文占用时的刷新。

仓库补充 alpha.5 的兼容性标记，peer 范围明确包含 `^0.2.1-0`。原来的范围已能通过 DSH 使用 `includePrerelease` 的准入检查，实际安装也能复用宿主依赖；补充范围让标准 npm 的预发布版本匹配也一致，不表示旧包在 alpha.5 无法运行。

自动回归的“新宿主”原先锁在 0.2.0-rc.1，现更新为 alpha.5。RPC 测试按新网关要求加载实际 RemoteAccess 服务，并显式提供测试调用方身份；旧宿主仍保留原调用方式。以上调整不改变生产权限、价格、历史账本或客户端布局。

相对旧回归宿主，0.2.1 的凭据库会优先采用已保存的 Key，再回退环境变量。插件沿用宿主的 `credentials.resolve()` 结果；测试分别验证新旧优先级，以及余额专用 Key 的保存、清除和隔离，不改变真实凭据或自行覆盖宿主规则。

验证对象是隔离 Web 宿主及组件集成，没有把这些结果描述为实际 Desktop 应用的完整界面复测，也没有升级用户的 DSH 客户端。

## English

Verified on 2026-10-16 against the official DSH 0.2.1-alpha.5 release. The existing public **dsh-cost-meter v1.8.34** package installs and starts successfully, shares the host credential/path modules, and records all three synthetic usage calls. Existing model-token accounting remains supported. **The offline repair command needs v1.8.35 on this host.**

New hosts expose persistence as a plugin rather than an exported class. The repair CLI mounts that official plugin in an empty temporary root solely to obtain its native exclusive lease. Initialization cannot scan or migrate user logs. The original bounded repair, byte-identical backup and refusal under active ownership remain intact; plain and Zstandard artifacts are tested through the actual CLI and a subsequent host restart on both old and new hosts.

The new model-label Slot is optional: pricing continues to use provider/model IDs rather than display labels. Sidebar clipping does not require changing the plugin's portal-based overlays. Skill, terminal, prompt and account-notification changes do not alter the billing interfaces consumed here. Prompt changes can affect actual input length; reported usage remains the billing source.

The repository adds the tested release marker and an explicit `^0.2.1-0` peer range for standard npm prerelease matching. DSH's existing prerelease-aware admission already accepts the old package, as confirmed by an actual installation. The next-host fixture advances from rc.1 to alpha.5; its RPC test loads the real RemoteAccess service and supplies an explicit local caller identity while retaining the older-host path. Production permissions, pricing, historical amounts and UI layout are unchanged.

Checks cover the real Web host, services and published context UI integration. They do not claim a full Desktop application UI test or upgrade the user's DSH application. No real credentials, user conversations or billable model requests are used.
