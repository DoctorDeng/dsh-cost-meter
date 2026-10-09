# OpenRouter model prices / 模型价格

## English

Open **Settings → Cost → Prices → OpenRouter model prices** before choosing a model. Search by name or full model ID (for example, `flash`), sort by input or output price, and follow a model link to its OpenRouter page.

The panel shows public input, output, cache-read and cache-write prices in **USD per million tokens**, plus context length. `$0` is a published zero rate; `—` means that the catalog did not provide the field. Paid models and `:free` variants are separate rows. Automatic routing entries with negative placeholder prices are omitted.

Opening the Prices tab fetches the public catalog. While the tab and browser are visible, it refreshes every minute; returning to the foreground also refreshes. **Refresh prices** requests an update immediately, with a shared 15-second cache to limit duplicate requests across windows. The timestamp shows the last successful fetch. A failed request preserves the previous prices and timestamp and displays an error. **Price changed** marks token-rate changes since the previous successful refresh while this panel is open.

This lookup only sends an unauthenticated `GET` to [OpenRouter's public models endpoint](https://openrouter.ai/api/v1/models). It requires no API key, sends no model inference requests and incurs no model usage charges. Browsing does not change configured billing rates, credentials or the historical ledger. The existing background billing-price synchronization remains separate.

The catalog is a reference, not a binding quote for the next request. Provider routing, price tiers, promotions and additional image/search/request fees can affect the actual bill. Open the model's official page for those details. The UI uses the existing DSH theme variables and controls, supports Chinese and English, and requires the host's asynchronous module loader (also used by Cost statistics).

## 中文

选择模型前，打开 **设置 → 费用 → 价格 → OpenRouter 模型价格**。可以按模型名或完整模型 ID 搜索，例如 `flash`，按输入价或输出价排序，并点击模型名称查看 OpenRouter 官方页面。

面板显示输入、输出、缓存读取和缓存写入价格，单位为 **美元 / 百万 tokens**，同时列出上下文长度。`$0` 表示目录中的价格为零，`—` 表示目录没有提供该字段。付费模型与 `:free` 版本分别列出；负数占位价格的自动路由条目不显示。

打开价格标签页时查询公开目录，面板与浏览器处于前台时每分钟刷新一次，返回前台时也会刷新。点击 **刷新价格** 可立即请求更新；多个窗口共享 15 秒缓存，避免重复请求。更新时间始终对应最近一次成功查询。查询失败时保留旧价格和原时间，并显示错误。面板打开期间，相比上次成功刷新发生变化的 token 单价标记为 **价格已变动**。

查询仅对 [OpenRouter 公开模型接口](https://openrouter.ai/api/v1/models) 发送不带凭据的 `GET` 请求，无需 API Key，不发送模型推理请求，不产生模型使用费用。浏览价格不会修改计费单价配置、凭据或历史账本。原有后台计费价格同步继续独立运行。

目录价格是参考价，具体路由、价格阶梯、优惠以及图片、搜索、请求等附加费用以 OpenRouter 为准，可点击模型查看详情。界面沿用 DSH 主题变量和控件，支持中英文；需要宿主支持异步模块加载，与费用统计页要求一致。
