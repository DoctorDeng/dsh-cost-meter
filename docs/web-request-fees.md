# DeepSeek 网页搜索与抓取计费

## 中文

v1.8.35 支持官方 `POST /v1/tools/search` 和 `POST /v1/tools/fetch` 的次数费。根据 [官方指南](https://api-docs.deepseek.com/zh-cn/guides/search/)与[价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)，两者均为每 1,000 次成功请求 ¥5，即每次 ¥0.005。

- 只计 HTTP 200 且有结果的请求：Search 的 `results` 非空；Fetch 返回非空网页正文。搜索结果条数不影响价格。
- 失败、空结果、无正文、超时和取消不会凭空生成费用。同一请求同时经过网络诊断与 JSON 观察时只计一次，重试则分别判断是否成功。
- 费用计入会话、每日、预算及 API 支出；统计明细显示“搜索请求／抓取请求”和“次数 × 每次单价”。五类模型 Token 不增加，也不套用模型倍率、Coding Plan 或峰谷折扣。
- 记录保存在插件自己的用量文件中，保留请求标识、类型、单价和时间，不保存 URL、搜索词、页面正文或凭据。历史回放按请求去重，沿用调用当时的汇率；升级不为旧调用估补次数费。

**区分三个来源：**

| 来源 | 本版处理 |
|---|---|
| 官方独立 Search／Fetch API | 在 DSH 网页服务或工具执行期间观察真实成功响应，按上面的规则入账。支持直接工具调用及宿主网页服务调用。 |
| DSH 的本地 HTTP 抓取后端 | 没有官方 Fetch API 请求就不增加次数费。模型随后阅读网页的 Token 仍由正常用量记录计费。 |
| Anthropic／Responses 接口的内置搜索 | 保留现有模型用量计费。官方公告 Claude Code／Codex 内置搜索暂免 Search 请求费，正式开始计费时间另行通知；本版不猜测截止日期、不因工具名称或 `web_search_call` 等展示项额外收费。 |

只有官方域名和精确端点被纳入上述固定单价，第三方渠道不会被强行套价。没有会话／工具作用域的独立进程请求不在此插件的观察范围。插件不主动发起搜索或抓取，不替换提供方，不自动重试，也不修改宿主网络策略。

“网页抓取”在用途图、矩形图、代理归属和步骤筛选中独立显示。它汇总相关模型步骤与已观察到的 Fetch API 次数费；同一步混用搜索和抓取归入“多类工具”，费用只计一次。次数费不能作为模型价格表中的 Token 单价编辑。

验证使用真实 DSH 工具注册、Web 服务和 HTTP 传输，官方请求地址被测试连接固定到本机服务器；不使用真实 Key 或收费接口。另覆盖空结果、失败、并发会话、重复观察、重启、历史汇率和旧宿主。

## English

v1.8.35 meters the official standalone Search and Fetch endpoints separately from model tokens: CNY 5 per 1,000 successful requests. Only HTTP 200 with nonempty search results or fetched content is charged. Failures and empty results do not incur a request fee; the number of search results does not multiply it.

Request fees use their own billing rows, remain API expenses, and retain historical exchange rates. They do not add tokens or inherit model multipliers, peak discounts or subscriptions. Observations are limited to exact official endpoints in DSH web/tool execution scopes; local HTTP fetching and third-party providers are not assigned this price. Journals contain no queries, URLs, page bodies or credentials. The plugin makes no search/fetch requests itself.

Existing model-token accounting remains intact. The announced Claude Code/Codex built-in search waiver is not given an invented end date, and presentation items alone do not create charges. See the [official billing rules](https://api-docs.deepseek.com/guides/search/).
