# v1.9.35：火山方舟计费与余额提示

火山方舟的 `deepseek-v4-1-flash-260910`、`deepseek-v4-1-flash-261017` 等日期快照现在可以自动匹配主模型价格。精确模型报价优先；精确匹配模式和不同日期快照之间的隔离保持原样。

`volcengine`、`ark` 及其 `llm-` 包装渠道在使用 DeepSeek 峰谷价格时，按火山的工作日日历选档：北京时间周一至周五 09:00–12:00、14:00–18:00 为峰时，其余为谷时，不额外豁免中国法定节假日。DeepSeek 官方渠道继续使用自己的节假日规则。当前标准版价格沿用已有 DeepSeek 价格表；本版没有新增经济版、缓存存储时长计费或火山账户余额查询。

侧栏峰谷进度优先跟随当前会话的渠道；无法取得会话投影时，通过宿主公开的 `agentDefaultModel.currentSelection()` 读取默认渠道。旧宿主没有该服务时保留原有显示。切换提醒与进度条共用同一日历。

余额卡现在直接显示“DeepSeek 余额”，表示 DeepSeek 官方开放平台账户余额。它不代表火山方舟或其他渠道的余额。已有的官方端点白名单保持原样，对账和余额进度中的今日消费仍只累计官方渠道。

余额悬停提示改成短行，保留总额、赠送与充值、异常提醒和点击刷新。搜索提示例如“今日 2 次搜索未完整计入统计”，不再展示网络实现等技术说明。具体缺失原因和运行环境仍保存在本地搜索覆盖诊断文件中。

旧价格版本继续保留记录时的匹配和日历规则。更新不会自动改写历史金额；需要补算之前未匹配的快照或修正节假日金额时，在价格设置中手动重算对应模型。

来源与致谢：[@littleyellowbicycle](https://github.com/littleyellowbicycle) 在 [#399](https://github.com/Han-1413141/dsh-cost-meter/issues/399) 提供快照模型名的复现、定位及补丁建议，在 [#400](https://github.com/Han-1413141/dsh-cost-meter/issues/400) 提供火山日历差异和金额对照，在 [#401](https://github.com/Han-1413141/dsh-cost-meter/issues/401) 提出余额来源标识和多渠道对账建议。

官方依据（核对日期：2026-10-24）：[火山模型价格](https://console.volcengine.com/ark/region:cn-beijing/docs/model-pricing)、[DeepSeek-V4.1-Flash 模型与日期版本](https://console.volcengine.com/ark/region:cn-beijing/docs/deepseek-v4-1-flash)。
