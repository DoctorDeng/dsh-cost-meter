# v1.9.40：费用提示与余额查询优化

## 中文

本次更新调整费用说明的展示位置，并优化余额查询的等待策略，减少无效重复请求及相关使用风险。

- billion-context 用量记录不完整时，在“设置 → 费用 → 概览”显示一行普通灰字：“billion-context 部分用量记录不完整，费用统计可能存在偏差。”正常状态下隐藏，不再自动弹窗。
- 官方余额与通用 HTTP 自定义余额收到 401/403 后，自动查询等待配置的刷新间隔；修正认证后仍可手动刷新。
- 收到 429 时，自动查询、连续手动刷新和排队刷新都遵守服务端 `Retry-After`。支持秒数和 HTTP 日期；缺失或无效时使用配置间隔，避免短时间反复请求。
- 查询恢复成功或切换凭据、查询来源后清除对应等待状态，错误信息保持可见，原有费用记录不变。

感谢 [@qingyu-ye](https://github.com/qingyu-ye) 在 [issue #409](https://github.com/Han-1413141/dsh-cost-meter/issues/409) 提供问题报告、截图和日志附件。

更新后完全重启 DSH，使插件服务端加载新版本。

## English

This update moves billing guidance into settings and improves balance-query backoff to reduce redundant requests and related operational risks.

- Show a brief, muted accuracy note in Settings → Cost → Overview when billion-context usage records are incomplete. Hide it when coverage is normal and remove automatic popups.
- After HTTP 401/403, official and generic HTTP custom balance queries wait for the configured refresh interval. Manual refresh remains available after correcting authentication.
- After HTTP 429, automatic, manual and queued refreshes respect `Retry-After`, supporting both seconds and HTTP dates. Missing or invalid headers fall back to the configured interval.
- Clear the corresponding wait state after recovery or a credential/source change, retain visible error information and preserve existing cost records.

Thanks to [@qingyu-ye](https://github.com/qingyu-ye) for the report, screenshots and log attachments in [issue #409](https://github.com/Han-1413141/dsh-cost-meter/issues/409). Fully restart DSH after updating.
