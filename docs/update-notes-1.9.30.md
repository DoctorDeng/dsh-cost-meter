# v1.9.30 更新说明

## 中文

本次更新解决后台线程失败后无法持续保存账本，以及 `dsh-opencode-go` 订阅用量被误计入 API 花费的问题。

### 后台保存

v1.9.29 已将账本线程独立打包，解决部分 Desktop/Web 安装中缺少宿主模块解析器的问题。本版本补齐失败后的保存路径：线程启动失败、导入失败或超时后，立即同步提交尚未保存的用量，后续定时保存继续走同步路径。本次运行只提示一次，不再每两秒启动同一个故障线程。重启 DSH 后重新尝试后台保存。

另一个宿主暂时占用账本锁时仍正常重试。线程已提交、但确认消息丢失时，先根据原子提交回执恢复结果，避免重复计费。

### OpenCode Go 计费

`dsh-opencode-go` 现在与 `opencode-go` 一样归入 Go 套餐家族，服务端与浏览器使用一致的别名。新调用按已保存的 Go 套餐归属分类：订阅用量保留 API 等值金额，API 花费为零；用户显式指定的渠道或模型分类仍优先。

本次不自动重算历史记录。历史修正不在 #389 的请求范围内，原有调用数、Token 数和已保存金额继续保留。

### 验证范围

- 真实 Worker 在独立目录中运行，覆盖缺少宿主依赖、启动异常、超时、持锁终止、正常定时保存和单次告警。
- 写入期间新增用量、多宿主合并、回执丢失、卸载等待及后续保存均保留原有数据。
- Go 别名覆盖大小写与 `llm-` 包装、三种报告中的模型及新模型，验证前后端分类、显式覆盖和实际持久化的 API 花费。

### 升级

在插件市场更新到 **1.9.30**，或按正在使用的环境执行：

```powershell
dsh plugin --profile desktop add dsh-cost-meter@1.9.30
```

网页端将 `desktop` 换成 `web`。升级后完全退出并重启对应的 DSH Desktop 或 Web 进程。

感谢 [@2239058652](https://github.com/2239058652) 在 [#387](https://github.com/Han-1413141/dsh-cost-meter/issues/387) 提供运行环境、最小复现、依赖链测试与异步失败定位；感谢 [@ZIye1208](https://github.com/ZIye1208) 在 [#389](https://github.com/Han-1413141/dsh-cost-meter/issues/389) 提供渠道对照、别名定位与补丁验证。

## English

This patch restores routine ledger saves after a worker failure and fixes billing classification for the dedicated `dsh-opencode-go` plugin.

- If worker startup, import or execution fails, save pending usage synchronously and keep subsequent scheduled saves on that path for the current process. Warn once and retry the worker after restarting DSH. Temporary lock contention still retries normally, and atomic receipts recover committed writes whose acknowledgement was lost.
- Map `dsh-opencode-go` to the Go family in both host and browser. New calls follow the persisted Go classification and explicit model/provider overrides. Plan usage retains its API-equivalent value with zero API spend. Historical amounts are not automatically recalculated in this patch.

Checks cover real worker failures, scheduled saves, single warnings, lock recovery, concurrent usage, lost acknowledgements, host/client classification and persisted amounts. Update to **1.9.30** and fully restart the relevant DSH Desktop or Web process.

Thanks to [@2239058652](https://github.com/2239058652) for the reproduction and asynchronous-failure analysis in [#387](https://github.com/Han-1413141/dsh-cost-meter/issues/387), and [@ZIye1208](https://github.com/ZIye1208) for the provider comparison, alias diagnosis and patch verification in [#389](https://github.com/Han-1413141/dsh-cost-meter/issues/389).
