# v1.9.37：对话费用导出与额度窗口排序

## 中文

打开单个对话的“费用明细”，点击右上角“导出费用记录”，即可导出该对话。费用设置的“概览”也增加了统一入口；“计费统计”右上角可以导出当前筛选范围或全部保留记录。

支持三种格式：

- CSV 汇总：每个对话一行，使用账本中保存的费用和 Token。
- CSV 调用明细：每次调用一行，包含对话、模型、时间、Token 和费用。
- JSON 完整费用记录：包含账本汇总、调用明细及计费单价，便于自行处理。

文件同时保留 API 费用和 Plan 等值，金额使用当前显示币种；有历史价格和汇率记录时沿用历史记录。导出不受界面 25 个对话 / 50 次调用分页限制。开启“计入子代理费用”时，子代理归入所属对话，每次调用只导出一次。

导出不包含对话正文、工具输入输出或凭据。对话 ID 和标题会保留，分享前可自行修改。若调用日志缺失或与账本不同，文件及下载提示会标注；JSON 和汇总 CSV 保留账本金额，调用 CSV 不补造缺失调用。未归属到对话的旧账单独列在总体汇总中。

导出期间可取消。文件上限 64 MiB、调用明细上限 20 万条，超限时提示缩小范围，不会静默截断。导出只生成本地下载文件，不上传记录。

额度窗口按 5h → 日 → 周 → 月排列，只显示该订阅实际支持的窗口。根据[火山官方说明](https://docs.volcengine.com/docs/ark/coding-plan-personal-faq?lang=zh)，火山 Coding Plan 只有 5h、周和订阅月；此次删除混入的日窗口。其他产品原有的日额度继续保留。

## English

Use **Export cost records** in a conversation's cost details to export that conversation. The cost settings overview also has an export entry; the statistics page supports current filters or all retained records.

Choose summary CSV (one row per conversation), call CSV (one row per call), or JSON with recorded totals, call details and rates. Files include API costs and Plan equivalents in the selected display currency, using retained historical pricing and FX where available. Conversation and call pagination does not limit exports. Enabled subagent costs belong to their conversation and are exported once.

Conversation IDs/titles are included; message text, tool content and credentials are excluded. Missing or differing details are marked. JSON and summary CSV preserve recorded ledger amounts; call CSV never fabricates missing calls. Unassigned legacy ledger amounts appear separately in overall summaries.

Downloads can be cancelled and are local only. Exports above 64 MiB or 200,000 calls ask for a narrower range instead of truncating data.

Supported quota windows are ordered 5h, daily, weekly, monthly. Volcano Coding Plan only displays its official 5h, weekly and subscription-month windows. Daily windows for other products remain available.
