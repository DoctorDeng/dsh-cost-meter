# v1.9.34 更新说明

## 中文

修复 billion-context 长时间运行后，空闲计费扫描周期性阻塞主线程的问题。原先每轮扫描都会同步查询每个 stream 文件的状态；现在异步检查会话目录变化，只重新读取变化目录中的计费流，同时继续跟进未完成流和追加写入的调用日志。

新增「费用设置 → 用量 → 计费历史存储」，显示文件数量、大小、最早与最新修改时间，支持清理预览、确认和取消。原始辅助文件默认保留 7 天，也可改为 30 天或全部保留；自动维护每小时检查一次。

旧的已完成流先合并压缩，再移除未被修改的原文件；过期且完成的请求回执可删除。保留账本、调用记录、费用、次数和历史明细，并覆盖清理中断、并发修改、重新导入和重复执行。新增等价 CLI，默认预览，使用 `--apply` 才执行。[操作与备份说明](billing-storage.md)。

### 性能复现

本地合成数据包含 **10,744 个 stream 文件、38 个会话目录**。为模拟 issue 中文件系统过滤驱动造成的开销，对旧实现的每次同步文件状态查询增加 **0.25 毫秒**，触发其 30 秒强制重扫。

| 指标 | 1.9.33 | 1.9.34 |
| --- | ---: | ---: |
| 空闲扫描耗时 | 2,918.61 ms | 3.21 ms |
| 扫描期间最大事件循环间隔 | 2,920.07 ms | 15.32 ms |
| 已完成 stream 文件同步状态查询 | 10,744 次 | 0 次 |

这是受控复现数据，不是报告者电脑的实测。回归测试同时确认：原子替换旧文件后仍可发现新用量，未变化目录不逐文件查询，损坏元数据不会阻塞其他流。浏览器验证使用合成数据，覆盖预览、确认、取消、保留时间保存、错误反馈、中英文和 360/560/960 像素宽度。

本地完整验证通过 314 组检查；另通过真实 DSH Registry/Gateway 的接口调用、参数校验和保留时间回显检查。前端主包为 259,018 字节，存储面板独立按需加载。

感谢 **[@ZiYuan258](https://github.com/ZiYuan258)** 在 [#397](https://github.com/Han-1413141/dsh-cost-meter/issues/397) 提供问题报告、文件规模与主线程耗时证据、同步扫描定位，以及异步处理、清理入口和保留时间建议。

## English

Fix periodic main-thread stalls during idle billion-context billing scans. Replace per-file synchronous scanning with asynchronous session-directory revisions, while continuing to follow unfinished streams and append-only call journals.

Add on-demand billing storage statistics and a preview/confirm cleanup flow. Retain original auxiliary files for 7 days by default, with 30-day and keep-all options. Hourly maintenance durably archives completed stream metadata before removing unchanged originals and removes expired completed request receipts. Preserve ledger totals, call counts, historical details and replay data. The new CLI previews by default and requires `--apply` to execute; see the [storage guide](billing-storage.md).

A controlled fixture with 10,744 streams in 38 sessions and a simulated 0.25 ms synchronous-stat cost reduced idle scan time from 2,918.61 ms to 3.21 ms. This is a synthetic benchmark, not a measurement on the reporter's machine. Regression checks cover replay, interruption, concurrent writes, repeated cleanup and invalid metadata; browser checks use synthetic data.

Credit **@ZiYuan258** for the report, reproduction evidence, synchronous-scan diagnosis and cleanup/retention proposals in [#397](https://github.com/Han-1413141/dsh-cost-meter/issues/397).
