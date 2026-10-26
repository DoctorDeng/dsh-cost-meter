# v1.9.38：dsh-xdpool 的 WorkBuddy 积分适配

## 中文

在“费用 → 额度”开启并展开“WorkBuddy 积分”，即可读取同一 DSH 中的 dsh-xdpool 账号积分，无需复制登录凭据。已验证 dsh-xdpool 2.4.6 的发布包接口。

“积分来源”支持自动识别、WorkBuddy 连接插件和 dsh-xdpool。自动识别优先读取 dsh-connect-workbuddy 的账号列表，其次读取 XD Pool；旧连接插件的状态接口与明文登录文件兼容方式继续保留。多个插件同时使用时，选择 dsh-xdpool 并刷新即可指定来源。

“统计账号”继续支持当前账号、全部账号和勾选账号。XD Pool 的当前账号按其状态接口返回的 activeAccountId 确定，国内和国际分别读取。账号 ID 区分地区和插件来源，已有的连接插件账号筛选不会误选同 ID 的池账号。

积分读取失败、冷却期间未返回积分或已移除的勾选账号显示未知值，完整汇总显示“—”；已读取的积分可在账号列表查看。观测减少量沿用现有统计规则：充值或赠送不算减少，过期可能算减少，积分不折算为货币账单。

xdpool 和 xdpool-global 两条 WorkBuddy 路由按现有 WorkBuddy 的 API / Plan 设置归类，并尊重手动覆盖。升级时仅修正账本的 API / Plan 归属，保留总金额、Token、调用和历史汇率；其他聚合、扫码及组合路由不据此归入 WorkBuddy。

兼容验证执行了发布包中的实际状态路由与序列化函数，并检查国内／国际账号、来源选择、失败及冷却状态、双端 codec、保存后重开和窄屏设置界面。积分查询使用同一宿主的 GET 状态接口，不执行切号、签到、自动化或模型测试。

需求建议来自 [@qiyeren 的 issue #404](https://github.com/Han-1413141/dsh-cost-meter/issues/404)；接口来源为 [@XDTrees 维护的 dsh-xdpool](https://github.com/XDTrees/dsh-xdpool)。

## English

Enable **WorkBuddy credits** under cost settings → quotas to read dsh-xdpool accounts from the same DSH host. No credential copying is required. Compatibility was checked against the published dsh-xdpool 2.4.6 status route and serializers.

**Credit source** supports Automatic, WorkBuddy connectors and dsh-xdpool. Automatic uses dsh-connect-workbuddy account lists first, then XD Pool. Select dsh-xdpool and refresh when multiple connectors are installed. Existing legacy connector/file compatibility remains available.

Current, all and selected accounts are supported. Current uses the pool's activeAccountId per region. Account IDs include region and source so selections and observed credit decreases do not mix different plugins. Missing, failed or unavailable cooling balances remain unknown, and incomplete totals display a dash.

Only xdpool and xdpool-global belong to WorkBuddy billing. Existing API / Plan settings and explicit overrides apply. Historical classification repairs preserve recorded totals, tokens, calls and FX. Other aggregate, OAuth and combo routes are not treated as WorkBuddy credits.

Tests cover the published status implementation, source selection, partial data, codecs, persistence and narrow layouts. Integration only reads local GET status endpoints; it does not switch accounts, claim rewards, run automation or probe models.

Requested by [@qiyeren in issue #404](https://github.com/Han-1413141/dsh-cost-meter/issues/404), using the public interface maintained by [@XDTrees](https://github.com/XDTrees/dsh-xdpool).
