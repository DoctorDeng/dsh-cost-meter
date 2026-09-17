# OpenRouter 透传定价

OpenRouter 网关按原样透传上游模型价格。本插件之前 `DEFAULT_PROVIDER_PRICE_TABLE` 缺少 `openrouter` vendor，OpenRouter 模型一律记 `$0`；v1.7.30 起内置快照并自动刷新。

- **静态快照**：`lib/pricing.js` 内置 4 模型快照（2026-09-17，USD/百万 token，flat 口径）：`meta/muse-spark-1.3-contributor`、`google/gemini-3.8-flash`、`qwen/qwen3.8-flash`、`z-ai/glm-5.3-flash`。键为 OpenRouter 完整模型 id（含厂商前缀），与账本 `openrouter:<id>` 精确对应；离线时用快照计费。
- **旧账本回填**：`pricing-openrouter-v1` 迁移在启动时把已有账本里 `$0` 的 `openrouter:*` 桶按新快照重算一次，不需要手动导入。
- **实时刷新**：公开目录 `GET https://openrouter.ai/api/v1/models`（无需认证）返回 USD/token 字符串；`parseOpenRouterModels` 纯函数解析为 USD/百万 token（6 位小数，与快照写法一致），跳过空 id、无 pricing、`prompt`/`completion` 缺失或负数/非数字的行——路由聚合模型（如 `openrouter/auto` 用 `prompt: "-1"` 占位）无真实单价会被跳过；可选缓存键（`input_cache_read`/`input_cache_write`）只在有限非负时收录，`0`（免费模型）收录为 0。
- **刷新时机与合并语义**：官方价格同步（成功失败都附加该腿，不翻转官方同步的 ok 状态）、插件启动、每小时 `setInterval`（unref，不阻塞退出）自动刷新。逐条 `normalizePrice` 校验后**加法合并**：保留未被覆盖的旧 id（含快照与离线期条目），同 id 用远端值替换。目录载荷约 735KB，响应上限放宽到 4MB；失败 fail-soft，保留本地快照并在同步消息里用中英双语备注说明（`openrouterRefreshed` / `openrouterRefreshFailed`）。
- **计价口径**：OpenRouter 条目恒为美元（`usdFromCost` 恒等），与账本美元记账一致，不随显示币种折算。

手动触发：在「设置 → 费用」点价格同步即可连带刷新 OpenRouter 价目，消息尾部会注明刷新结果。

## English

OpenRouter gateways pass upstream model prices through untouched. Before v1.7.30 this plugin had no `openrouter` vendor in `DEFAULT_PROVIDER_PRICE_TABLE`, so OpenRouter models were always costed at `$0`; v1.7.30 adds a snapshot plus automatic refresh.

- Static snapshot: 4 models in `lib/pricing.js` (2026-09-17, USD per million tokens, flat): `meta/muse-spark-1.3-contributor`, `google/gemini-3.8-flash`, `qwen/qwen3.8-flash`, `z-ai/glm-5.3-flash`. Keys are full OpenRouter model ids (with vendor prefix) matching ledger buckets `openrouter:<id>` exactly; the snapshot covers offline use.
- Backfill: the `pricing-openrouter-v1` migration re-costs existing `$0` `openrouter:*` buckets once at startup — no manual import needed.
- Live refresh: the public catalog `GET https://openrouter.ai/api/v1/models` (no auth) returns USD/token strings; the pure function `parseOpenRouterModels` converts them to USD per million tokens (6 decimals, same style as the snapshot). Rows with empty ids, missing pricing, or missing/negative/non-numeric `prompt`/`completion` are skipped — aggregate router models (e.g. `openrouter/auto` with `prompt: "-1"`) have no real unit price. Optional cache keys (`input_cache_read`/`input_cache_write`) are kept only when finite and non-negative; `0` (free models) is kept as 0.
- Timing and merge: refresh runs as an attached leg of official price sync (never flips its ok status), at plugin startup, and hourly via `setInterval` (unref\u2019d, never blocks exit). Entries are validated with `normalizePrice` and merged additively: old ids not covered by the refresh (including the snapshot and offline entries) are kept; matching ids take the remote value. The catalog payload is ~735KB, so the response cap is raised to 4MB; failures are fail-soft — the local snapshot is kept and a bilingual note (`openrouterRefreshed` / `openrouterRefreshFailed`) is appended to the sync message.
- Billing basis: OpenRouter entries are always USD (`usdFromCost` is identity), consistent with the USD-denominated ledger, and are never converted with the display currency.

To trigger manually: run price sync under Settings → Cost; the trailing note reports the OpenRouter refresh result.
