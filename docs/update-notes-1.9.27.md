# v1.9.27

## 中文

### OpenRouter 重启冷却

修复每次启动都重新下载 OpenRouter 价目表的问题。启动与小时级定时任务共用跨重启的一小时冷却，下载失败或中途退出后也保留冷却；多个共用账本的宿主只放行一次自动任务。冷却期间不改写账本或刷新状态，继续使用已有价格。手动同步仍可立即执行。

按 issue 中每 11.4 秒启动一次的频率模拟 4,300 次启动，实际冷却检查只放行 14 次自动刷新任务；另验证了四个并行进程、小时边界、失败重启、无效缓存和手动同步。此结果是本地测试，不是对报告者真实流量的再次测量。

感谢 [@yanzhaohui1999](https://github.com/yanzhaohui1999) 在 [issue #384](https://github.com/Han-1413141/dsh-cost-meter/issues/384) 提供重启循环的流量测量、代码定位和持久化冷却建议。

### 本版同时发布的已合并修复

- 直接读取 DSH 内置 pi-ai 登录的 Codex 额度，支持自动回退和只有每周额度的账号；超时后释放等待状态，令牌更新后可重试。直接重载插件时恢复 billion-context 观察器和 RPC，卸载时取消额度查询。来自 [PR #383](https://github.com/Han-1413141/dsh-cost-meter/pull/383)。
- 恢复代理未报告模型用量、但宿主记录有效用量的 billion-context 调用，保留独立压缩费用，重启与重复导入不重复入账。感谢 [@Sieuno](https://github.com/Sieuno) 在 [#382](https://github.com/Han-1413141/dsh-cost-meter/issues/382) 独立复现并报告。
- Antigravity 过滤占位项目 ID，补全 Gemini 模型额度，并保留逐模型的重置时间；感谢 [@Oct1AtJoe](https://github.com/Oct1AtJoe) 在 [PR #381](https://github.com/Han-1413141/dsh-cost-meter/pull/381) 贡献代码。
- WorkBuddy 紧凑侧栏标题占满整行，余额靠右显示；[@SternChiri](https://github.com/SternChiri) 的 [#377](https://github.com/Han-1413141/dsh-cost-meter/issues/377) 触发排查。同步发布今日消费与余额同行的金额对齐修复。
- 更新 billion-context 0.1.204、dsh-codex-subscription 3.1.4 的发布包兼容验证与 CI 基线（[#379](https://github.com/Han-1413141/dsh-cost-meter/issues/379)、[#380](https://github.com/Han-1413141/dsh-cost-meter/issues/380)）。

更新后完全退出并重启 DSH。无须新增设置；需要立即更新价格时仍可手动同步。

## English

### OpenRouter restart cooldown

Startup and hourly billing-price checks now share a persistent one-hour cooldown, including after failed or interrupted downloads. Hosts sharing a ledger admit one automatic task per cooldown. A recent snapshot requires no ledger or refresh-state writes. Existing prices remain available, and manual synchronization can run immediately.

At the reported 11.4-second restart cadence, a local simulation of 4,300 starts admitted 14 automatic tasks. Checks also cover four concurrent processes, hourly boundaries, failed restarts, invalid metadata and manual synchronization. This is synthetic validation, not a remeasurement of the reporter's traffic. Thanks to [@yanzhaohui1999](https://github.com/yanzhaohui1999) for the measurements, code pointers and cooldown proposal in [#384](https://github.com/Han-1413141/dsh-cost-meter/issues/384).

### Previously merged fixes included in this release

- Native pi-ai Codex quota queries, weekly-only accounts, bounded cancellation, direct-reload observer/RPC recovery and inline Today/Balance alignment from [PR #383](https://github.com/Han-1413141/dsh-cost-meter/pull/383).
- Recover missing billion-context model usage without duplicating compression costs or replayed calls; reported independently by [@Sieuno in #382](https://github.com/Han-1413141/dsh-cost-meter/issues/382).
- Antigravity project filtering and per-model Gemini quota/reset handling, contributed by [@Oct1AtJoe in PR #381](https://github.com/Han-1413141/dsh-cost-meter/pull/381).
- Full-width compact WorkBuddy headings, investigated after [@SternChiri's #377](https://github.com/Han-1413141/dsh-cost-meter/issues/377), plus published-package compatibility baselines for billion-context 0.1.204 and dsh-codex-subscription 3.1.4.

Fully quit and restart DSH after updating. No new setting is required; use manual synchronization whenever an immediate price update is needed.
