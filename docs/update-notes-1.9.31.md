# v1.9.31 更新说明

## 中文

本次更新把完整费用设置接入插件详情页，并修复代码审查中复现的配置保存和金额一致性问题。

### 页面入口

左下角「设置 → 费用」与「插件 → 费用计量」显示同一个完整设置组件，共用配置、实时数据和自动保存。插件管理器晚于费用插件加载时也能接入；旧宿主继续使用原有设置入口。

未来使用的纯展示页已做好，包含实时费用、余额、额度、预算、Token 用量和今日会话，没有配置控件。**本版本不启用该页面**；后续只需切换构建常量，详见[设置页说明](settings-pages.md)。

### 修复

- 两个入口快速提交修改时，较慢的旧请求可能最后写入，覆盖后一次操作。保存现在共用串行队列，单次失败不会阻塞后续保存。
- 外部逐调用快照、旧账本价格修复曾把显示汇率用于人民币计费。在回归样例中，人民币 7.2 元本应折合 1 美元；美元显示时错误得到 7.2 美元，欧元汇率为 0.9 时错误得到 8 美元。现在均使用 CNY 汇率，三个显示币种得到相同美元成本。
- 旧价格修复同时调整已冻结的人民币、欧元金额，并保留原记录的汇率和其他费用。按完整会话校正日级模型汇总时，也检查币种金额；缺失的历史币种明细不作为零值覆盖。

本版本没有新增全账本重算任务，也不修改费用统计口径。上述旧价格修复仍只在既有迁移或明确修复路径中执行。

### 验证范围

回归测试覆盖三种显示币种、冻结金额和重复修复、部分旧记录、并发及失败保存、插件管理器延迟加载、双入口共享配置、语言切换和卸载清理。浏览器合成数据检查覆盖展示页无配置控件、费用与额度实时更新、查询错误及 960/560/360 像素宽度。

本次代码审查覆盖计费与历史导入、账本并发持久化、套餐与余额、配置和凭据、网络读取边界、客户端生命周期、构建和安装发布路径。验证使用本地回归及合成响应，不代表对所有供应商真实账号逐一查询。

### 升级

在插件市场更新到 **1.9.31**，或执行：

```powershell
dsh plugin --profile desktop add dsh-cost-meter@1.9.31
```

网页端将 `desktop` 换成 `web`。更新后完全退出并重启对应的 DSH 客户端。

## English

This patch adds the complete cost settings to plugin details, sharing the component, live state and save queue with the existing settings entry. A read-only page for live costs and quotas is prepared but **remains disabled**.

- Serialize saves across both entries so a slow earlier request cannot overwrite a later edit; a failed save does not block subsequent saves.
- Use the CNY conversion rate for CNY-priced external calls and legacy pricing repair, regardless of the display currency.
- Update frozen CNY/EUR amounts alongside repaired USD costs, retaining recorded FX rates and unrelated amounts. Reconcile complete model currency totals even when USD totals already match; missing legacy currency fields do not imply zero.

No new full-ledger repricing task is introduced. Tests cover currencies, idempotence, partial legacy rows, concurrent/failed saves, slot lifecycle and responsive read-only rendering with synthetic data. Update to **1.9.31** and restart DSH.
