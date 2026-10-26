# v1.9.39：计费读取恢复、请求取消与导出资源清理

## 中文

本次检查覆盖费用计算、账本保存、代理计费记录及归档、额度查询、配置和凭据变更、统计缓存与费用导出。

- Zod 从 4.6.5 升级至 4.6.6，修复 [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)。超长受限数组会直接拒绝，避免为每个元素累积错误对象；回归样本的错误对象从 2001 个降为 1 个。公告将分析贡献署名为 [@MohamedEslam04](https://github.com/MohamedEslam04)。
- 代理计费目录扫描中途失败时，下次继续发现未交付的记录；单个文件或归档暂时无法读取时保留重试，其他正常记录继续导入。读取恢复后自动补齐，沿用账本收据避免重复收费。格式无效的文件仍会跳过，空闲目录保持增量扫描。
- 压缩已封存的调用日志时，先同步压缩文件，再发布归档和移除原文件；支持目录同步的平台也会同步目录。同步失败保留原始记录。
- 本进程活跃计费流读取最近一次成功保存的元数据快照，避免异步读取占用文件期间，Windows 上的同步替换失败。历史和其他进程记录继续从磁盘读取。
- 网关停用、来源删除、配置变化、密钥更换或清除、插件卸载时取消旧请求；取消传递到账号发现、响应体读取、重试等待和后续账号查询。重定向被拒绝时释放响应体。
- WorkBuddy 连接插件和 XD Pool 的账号积分查询在读取响应体时也响应取消，释放不再使用的请求。
- 导出任务在最后一次访问后 10 分钟主动清理。单个对话的大量调用分批处理，取消可及时生效；收集过程限制数据量，CSV 按行检查输出大小，超过限制时提示缩小日期范围或选择单个对话。
- 某个 Token 分项为无穷大等非法值时，仅忽略该分项，其他有效 Token 继续按对应价格计费。

新增测试模拟扫描中断、文件和归档读取失败、归档同步失败、响应体取消、重试取消、导出过期、大量调用取消及非法 Token，并检查配置和凭据变化后的请求状态。既有费用、历史价格、归档恢复、界面和兼容性检查继续纳入发布验证。

更新后完全重启 DSH，使插件服务端加载新版本。

## English

This maintenance release covers billing calculation, ledger persistence, proxy journals and archives, quota requests, configuration and credential changes, statistics caches, and exports.

- Upgrade Zod from 4.6.5 to 4.6.6 for [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). A constrained oversized-array regression now produces one issue instead of 2,001. The advisory credits [@MohamedEslam04](https://github.com/MohamedEslam04) for analysis.
- Retry incomplete inventory scans and transient stream/archive read failures without blocking healthy records. Existing ledger receipts prevent duplicate charges; unchanged directories retain incremental scanning.
- Sync compressed sealed journals before publishing archives and removing originals. Sync the parent directory on supported platforms. Preserve original records if syncing fails.
- Read successfully persisted in-memory metadata for streams owned by this process, avoiding Windows replacement conflicts with asynchronous reads. Historical and external streams still read from disk.
- Cancel gateway requests when a source is disabled, removed or changed, when its key changes or is cleared, and when the plugin unloads. Propagate cancellation through discovery, response bodies, retry waits and queued accounts; release refused redirect responses.
- Cancel WorkBuddy connector and XD Pool response-body reads when their requests become obsolete.
- Release inactive export jobs after ten minutes without requiring another API request. Yield during large single-conversation exports, bound collected data, and check CSV size while encoding rows.
- Ignore invalid Token buckets individually so valid usage retains its calculated cost.

Regression coverage includes injected filesystem failures, cancellation, idle export expiry, large-export limits, malformed Token values and gateway lifecycle changes. Fully restart DSH after updating.
