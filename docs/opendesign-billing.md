# OpenDesign billing and quota / 计费与额度

## English

This release addresses [#274](https://github.com/Han-1413141/dsh-cost-meter/issues/274), requested by @playgithub. It adds an OpenDesign price channel and read-only workspace quota queries; it is included in version 1.8.27. It does not install OpenDesign, create an account or change a model route.

### Conversation costs

- The offline catalog contains 35 token-priced models checked on **2026-10-15**, from the [official public API](https://amr-api.open-design.ai/api/v1/public/model-prices). Prices are **USD per 1M tokens**, with cache read/write rates and long-context tiers where provided. The long tier applies to the entire request only above its input threshold, including cached input.
- Provider IDs `opendesign`, `open-design`, `open-design-api` and `amr-link.open-design.ai`, including DSH's `llm-` prefix, use this separate catalog. A custom price under the original alias takes priority. Other provider IDs can use the existing explicit price mapping and plan-assignment controls.
- OpenDesign prices never serve as fallback prices for another provider. Unknown OpenDesign models stay unpriced; the plugin does not borrow a direct-vendor price.
- **Settings → Cost → Prices → Sync official prices** also refreshes the public OpenDesign catalog. A used/enabled OpenDesign channel refreshes at startup and hourly. No key or model request is needed. User-edited prices and removed models stay intact. Saved price versions preserve existing details when rates change; recalculation is explicit and retains the original amounts. A historical price version that was never captured cannot be reconstructed.

OpenDesign uses shared subscription allowances and can fall back to its wallet; see its [model-credit rules](https://open-design.ai/model-credits/). Calls default to **Plan-equivalent cost**, which is not a subscription payment or a cash bill. Set wallet-funded calls to **API** in the billing-classification controls, or assign individual models explicitly. DSH's standard usage response does not identify each request's funding source, account-specific discount, image charge or automatic top-up. Those amounts are not invented from the list price or balance movement.

### Quota queries

1. Open **Settings → Cost → Quotas**, find **OpenDesign**, and expand its settings.
2. Enter the exact **workspace ID** from your OpenDesign Cloud workspace.
3. Configure a **Control Key** in the credential editor, or supply `OPENDESIGN_CONTROL_KEY` / `VELA_CONTROL_KEY` to the DSH host. An inference key from the Cloud API Keys page is a different credential and cannot be used for this query. The existing OpenDesign/Vela login keeps control credentials in its own profile; the plugin does not read or rewrite that profile automatically.
4. Enable the card and refresh. Select its location to also show it in the sidebar or quota strip.

The host issues only these authenticated GET requests to the fixed official HTTPS origin:

```text
https://amr-api.open-design.ai/api/v1/workspaces/{workspaceId}/billing/coding-plan-usage
https://amr-api.open-design.ai/api/v1/workspaces/{workspaceId}/wallet/balance
```

Quota and wallet responses must match the requested workspace. The wallet must identify its member; if the quota response provides a member identity, both must match. Credentials are never forwarded through a redirect. They use the existing DSH credential store and are excluded from the ledger and client snapshot.

Each returned allowance window has its own used percentage and reset time. Simultaneous windows are not added together or called unlimited. Wallet credit remains a separate USD-equivalent value, including a real zero. Invalid, unauthorized or missing responses show an error/unavailable state, never a fabricated zero allowance. The workspace setting is kept across restarts and invalidates the previous query when changed.

### Evidence and limits

The public catalog was fetched without authentication. The authenticated adapter and bilingual settings were verified with synthetic responses, including large credit counts, zero balances, mismatched identities, authorization failure and price-refresh persistence. **No live account query or paid model request was made.** Production Control Key permissions and response availability still require a configured account.

Endpoint provenance: the official Cloud bundles `cloud-root-B21Emo2w.js` and `pricing-refund-policy-BDFJHl33.js` served on 2026-10-15; the [workspace-wallet contract](https://github.com/nexu-io/open-design/blob/7abd6fc2b11987c3940eb4ffc461478ff37c0b33/packages/contracts/src/api/collab.ts) and [Vela billing adapter](https://github.com/nexu-io/open-design/blob/7abd6fc2b11987c3940eb4ffc461478ff37c0b33/apps/daemon/src/integrations/vela-billing.ts) at the inspected commit. The [official guide](https://open-design.ai/zh/model-credits/) explicitly lists DSH as a supported API client; the issue has a usable integration request. Its short promotional wording alone does not establish advertising or spam.

## 中文

本版本实现了 @playgithub 在 [#274](https://github.com/Han-1413141/dsh-cost-meter/issues/274) 提出的接入需求，随 1.8.27 发布。不会安装 OpenDesign、注册账户或改变模型路由。

### 会话计费

- 从[官方公开价表](https://amr-api.open-design.ai/api/v1/public/model-prices)加入 **35 个模型**，核对日期为 **2026-10-15**。单位为 **美元／百万 Token**，包含已公布的缓存读取、缓存写入和长上下文价格。超过输入阈值后，整次请求使用长档，输入阈值包含缓存输入。
- `opendesign`、`open-design`、`open-design-api`、`amr-link.open-design.ai` 及其 `llm-` 前缀使用独立目录；原渠道中手工配置的价格优先。其他自定义名称可通过既有价格映射和套餐归属入口关联。
- 未收录的 OpenDesign 模型标为未定价，不借用直连厂商价格；其他渠道也不会使用 OpenDesign 价作为兜底。
- **设置 → 费用 → 价格 → 同步官方价格**会同步公开目录。已使用或开启 OpenDesign 时，启动和每小时也会刷新；不需要密钥，不调用模型。自定义价格、取消挂载和已保存价格版本的历史明细保留。历史重算需要主动确认并保留原金额；未保存过的历史价格版本无法还原。

OpenDesign 的 API 与客户端共用套餐，套餐用尽后可以继续扣钱包，详见[官方额度规则](https://open-design.ai/zh/model-credits/)。因此默认计入 **Plan 等值费用**，不把额度当成现金支出。钱包付款可在计费分类中设为 **API**，也可逐模型配置。DSH 的标准用量回执没有逐次扣款来源、账户折扣、图片费用或自动充值金额，这些金额不会通过公开单价或余额变化猜算。

### 额度查询

1. 在 **设置 → 费用 → 额度**找到并展开 **OpenDesign**。
2. 填入 OpenDesign Cloud 中对应的**工作区 ID**。
3. 在凭据编辑器中配置 **Control Key**，或向 DSH 宿主提供 `OPENDESIGN_CONTROL_KEY` / `VELA_CONTROL_KEY`。Cloud API Keys 页生成的推理密钥与查询凭据不同，不能混用。已有 OpenDesign／Vela 登录将控制端凭据保存在其自身配置中，本插件不会自动读取或修改那个配置。
4. 开启并刷新，可选择在侧栏或额度横条显示。

查询只访问上文列出的固定官方 HTTPS GET 端点；核对工作区，钱包必须提供成员身份，额度响应提供成员身份时再核对二者一致。凭据由 DSH 凭据库管理，不回显、不写入账本，不跟随重定向。

所有实际返回的窗口分别显示已用百分比和重置时间，不相加、不标成无限。钱包作为独立的美元等值额度显示，真实零余额保留。认证失败、缺失回执或身份不匹配显示不可用，不显示虚构的零额度。工作区配置跨重启保留，改变后清理原查询缓存。

公开价表已经直接读取；认证查询与中英文设置使用模拟数据验证，覆盖大整数、零余额、串工作区／成员、认证失败、价格持久化等情况。**没有真实账户验证，没有调用付费模型。**真实账户的 Control Key 权限与服务端响应需要在配置后核对。

官方明确支持 DSH，说明这条 issue 有可执行的接入需求；仅凭“便宜、可能流行”的一句话，不能认定为广告。
