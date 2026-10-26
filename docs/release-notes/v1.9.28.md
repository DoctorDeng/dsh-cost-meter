# v1.9.28

## 中文

本版修复代码审查确认的 9 个问题，完成 6 项计费、存储、网络与测试优化，并保留 v1.9.27 已发布的 pi-ai Codex、billion-context、Antigravity 与 OpenRouter 冷却修复。

### 9 项问题修复

| 编号 | 问题 | 本版处理 |
| --- | --- | --- |
| F1 | 单个合法 zstd 帧超过 8 MiB 时，历史记录被跳过 | 区分未完整帧与无效帧，继续读取跨块压缩帧；保留截断尾部处理。 |
| F2 | 解压预算计算压缩字节，未限制实际输出 | 按实际解压字节执行预算；普通 JSONL 同样受字节、行长和事件数限制。大型文本块跳过后继续读取用量记录。 |
| F3 | 并发请求乱序结束时，独立调用被错误去重 | 按请求时刻的绝对间隔匹配，保留有界候选；实时入账、历史重放和宿主投影采用一致判定。 |
| F4 | billion-context 已完成、但没有调用明细时漏记宿主用量 | 独立读取完成的 stream，补记一次有效宿主用量；重启、重复导入和日志归档后仍能恢复，且不重复计费。 |
| F5 | 推理 Token 在部分总量统计中被重复相加 | 统一总量为输入、输出、缓存读写之和；推理保留为输出细分，不额外叠加到 Token 总数。已有独立推理单价规则保持有效。 |
| F6 | 周/月套餐统计忽略供应商实际重置周期 | 优先采用接口起点、窗口时长和重置时刻，区分固定与滚动窗口；小时桶保留 35 天，覆盖周期首日的部分时段。缺少窗口信息时才回退自然周期。 |
| F7 | 已有发布标签可能指向旧代码 | 发布前刷新并核对 master、本地标签、远端标签和 HEAD；提交不符时终止。远端缺标签时推送已核验标签，创建 Release 必须使用已存在的标签。 |
| F8 | 网关把空值或布尔值当作 0% 已用 | 只接收有限数值或非空数字字符串；缺少比例但明确耗尽时显示 100% 已用，其他缺失数据保持未知。 |
| F9 | 生成发布说明被自身写入操作拦截 | `--regen-notes` 独立生成素材，允许在开发分支使用；正式发布只读取已提交的文案，仍要求版本一致且工作树干净。 |

### 6 项优化

| 编号 | 优化 | 实现与边界 |
| --- | --- | --- |
| O1 | 减少保存账本时的主线程停顿 | 日常保存交给串行工作线程，继续使用跨进程锁和原子替换；显式保存及卸载等待同一事务。文件内保存有界提交回执，处理“已写入但确认消息丢失”，避免重复入账。 |
| O2 | 分离套餐归属与额度查询开关 | 首次读取旧配置时保存既有自动套餐集合；随后开关查询或显示不再改变历史 API/Plan 归属。需要改变归属时，显式修改提供商或模型的计费分类。 |
| O3 | 辅助日志轮转、归档与增量发现 | billion-context 调用日志和原生搜索日志达到 8 MiB 后轮转。只压缩封存且至少 5 分钟未变化的分段，每小时执行受限归档；历史读取透明支持 gzip。变更标记、文件游标和定期清单共同发现增量。stream/分组元数据保留，历史文件不自动删除。 |
| O4 | 统一网络读取边界 | 余额、套餐、汇率和价格页面复用有界流式读取、解压输出限制、正文超时及取消清理；不依赖 `Content-Length` 判断实际体积。各接口保留相应大小限制。 |
| O5 | 集中计费计算并补充边界回归 | 抽出共享 Token 总量函数；新增日志、乱序去重、零明细补记、重启恢复、跨宿主后台保存、归档及发布命令的行为测试。后台预热与去重缓存设置容量上限。 |
| O6 | 对齐网络声明与实现 | 补充 `chatgpt.com` 权限声明，说明 Codex 额度查询及 MiniMax 用户配置的可信 HTTPS 来源；自定义来源仍拒绝重定向。 |

### 保留 v1.9.27 的兼容修复

- **pi-ai Codex：**直接读取 DSH 内置 pi-ai OAuth 登录的额度，自动回退并兼容只有周额度的账号；超时后释放等待，凭据更新后可重试。
- **重载与卸载：**直接重载宿主入口后恢复 RPC 和 billion-context 观察器，卸载时取消额度请求。
- **billion-context：**代理用量缺失但宿主有效时按流补记，保留独立压缩费用；修复旧版错误覆盖状态，无法明确拆分的混合用量保留原记录并提示核对。兼容基线更新至 0.1.204。
- **Codex 连接插件：**验证 dsh-codex-subscription 3.1.4 的实际发布包。
- **Antigravity：**过滤占位项目 ID，逐模型保留 Gemini 额度和重置时间，取消后停止回退。
- **既有布局修复：**今日消费金额与余额首行对齐，WorkBuddy 紧凑布局标题横跨整张卡片，避免余额被截断。

### 验证与性能

- 完整回归通过；覆盖真实 DSH 宿主会话读取、RPC 生命周期、8 个并发账本进程、重启及提交确认丢失恢复。
- 本机 Windows / Node.js 24 的 10,000 行合成账本后台保存样本：主线程最大延迟约 **40 ms**，完整事务约 **251 ms**；审查时的旧同步保存样本约 **421 ms**。两者是单次合成测量，不代表生产环境平均值。
- 独立浏览器测试：冷缓存、无悬停预取、4,800 次调用、3 个会话、两层子代理，浏览器 CPU 限速 4 倍；弹窗约 **115 ms** 出现，约 **760 ms** 显示完整真实统计，未发起外部请求。
- 测试使用临时账本及模拟上游响应，没有查询真实供应商账号。纯外观调整不属于本次审查范围。

### 升级与历史数据

通过插件市场更新，或在终端运行：

```powershell
dsh plugin --profile web add dsh-cost-meter@1.9.28
```

更新后完全退出并重启 DSH。首次启动会利用现存会话记录恢复套餐小时统计，并清理旧估算样本；没有可读历史时保留恢复状态等待后续读取。此恢复不按新单价重算历史金额。小时桶按小时近似，窗口边界不足一小时仍存在粒度误差；旧版已经裁剪且没有可回放日志的数据无法凭空补全。

### 贡献署名

- [@Sieuno](https://github.com/Sieuno)：在 [#382](https://github.com/Han-1413141/dsh-cost-meter/issues/382) 独立复现 billion-context 用量漏记。
- [@Oct1AtJoe](https://github.com/Oct1AtJoe)：在 [PR #381](https://github.com/Han-1413141/dsh-cost-meter/pull/381) 提交 Antigravity 项目与 Gemini 额度支持代码；合并前补充审查修正。
- [@SternChiri](https://github.com/SternChiri)：在 [#377](https://github.com/Han-1413141/dsh-cost-meter/issues/377) 提出对齐反馈，触发 WorkBuddy 紧凑布局检查。报告者已撤回原先的“文字左对齐”定位；最终修复依据浏览器中实际的标题宽度与余额位置。
- [#379](https://github.com/Han-1413141/dsh-cost-meter/issues/379)、[#380](https://github.com/Han-1413141/dsh-cost-meter/issues/380) 为自动兼容监控记录，对应发布包已纳入验证。

## English

This release fixes all nine defects from the code review and implements six billing, persistence, network and test improvements. It retains the pi-ai Codex, billion-context, Antigravity and OpenRouter cooldown changes published in v1.9.27.

### Correctness

- Read complete zstd frames spanning multiple input chunks. Bound actual decompressed bytes, ordinary JSONL, line size and event counts; skip large packed text blocks without dropping later usage.
- Deduplicate out-of-order requests by absolute request-time distance, retaining bounded candidates across live billing, replay and host projection.
- Recover valid host usage once per completed billion-context stream even when the proxy journal has no call rows; retain restart and archived-history recovery.
- Count reasoning as an output breakdown rather than adding it twice to token totals. Use provider reset times and explicit durations for quota estimates, with a 35-day hourly history.
- Reject null, empty and boolean gateway percentages. Preserve explicit quota-exhausted signals.
- Separate release-note generation from publication. Verify local and remote tags against the release commit; never move an existing mismatched version tag.

### Persistence and integration

- Save routine ledger transactions in a worker while retaining atomic replacement, cross-process locking, shutdown barriers and recovery when a commit acknowledgement is lost.
- Persist the automatic Plan provider set on configuration migration. Quota query/display switches no longer reclassify historical API spending; explicit provider/model billing settings control attribution.
- Rotate billion-context and native-search journals at 8 MiB. Compress only sealed, unchanged segments, preserve all history, and combine change markers, cursors and periodic inventory checks. Stream/group metadata remains available; no history is automatically deleted.
- Share bounded HTTP body reading, decoded-output limits, timeouts and cancellation across balance, quota, exchange-rate and pricing requests. Centralize token totals, bound caches and add behavior-based regression tests.
- Document actual MiniMax custom HTTPS origins and declare `chatgpt.com` for native Codex quota queries.
- Read native DSH pi-ai OAuth quotas, restore observers/RPC after direct reload, preserve per-model Antigravity quotas, and ship the pending Today/Balance and compact WorkBuddy alignment fixes. Contributor links are listed above.

### Validation and upgrade

The full regression suite passed, including real-host session/RPC lifecycles, concurrent ledger writers, restart, lost-acknowledgement recovery and archived journals. A local 10,000-row synthetic background save recorded about 40 ms maximum main-loop delay and 251 ms total duration. A separate cold-browser test with 4,800 calls and nested subagents displayed full totals in 760 ms under 4× CPU throttling. These are individual synthetic measurements, not production averages or universal latency guarantees.

Update with the command above and fully restart DSH. Startup rebuilds derived quota-hour statistics from available session records without repricing historical charges. Hour-boundary estimates retain hourly granularity, and missing historical source data cannot be reconstructed. Tests used temporary ledgers and simulated upstream responses, without querying live supplier accounts.
