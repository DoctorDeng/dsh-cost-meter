# 多账号余额与额度查询

同一来源可以保留默认账号和最多 10 个命名账号，在设置中选择查询并显示哪个账号。每个账号的凭据单独存入 DSH 凭据库，账本只保存账号 ID、名称和当前选择。

## 设置方法

1. 官方余额：打开“费用 → 概览”，在余额凭据下点击“管理账号”。OpenCode Go：打开“费用 → 额度 → OpenCode Go”，点击“管理账号”。其他支持手动凭据的供应商直接在其展开设置中选择账号。
2. 输入账号名称，点击“添加账号”，等待配置保存，然后为该账号保存 API Key、OAuth Token 或 Cookie。火山方舟账号分别保存自己的 AK 和 SK。
3. 在“查询并显示的账号”中选择账号。侧栏、设置页和输入区使用同一选择；只查询所选账号，不会轮询全部已保存账号。
4. “清除”仅删除所选账号的当前凭据。“移除账号”删除该命名账号的凭据与配置，然后回到默认账号；其他账号继续保留。

默认账号继续使用原有凭据、环境变量和自动发现规则。新增账号只读取自己的凭据；未配置、凭据失效或缺少 AK/SK 时显示对应状态，不会换用默认账号或其他账号的密钥。

支持官方 DeepSeek 余额、OpenCode Go，以及 OpenDesign、Claude、智谱、MiniMax、Kimi、OpenRouter、SiliconFlow、Command Code、Cline Pass、Volcano Ark、小米 MiMo、百度千帆和 Factory 的手动凭据查询。区域、工作区、组织和刷新频率等设置由同一查询来源共用；选择跨区域或跨组织账号时同步调整这些设置。

WorkBuddy 使用已有的账号列表和勾选入口。Codex 与千问 CLI 使用各自连接插件或 CLI 的账号选择。自定义余额可以添加多条同来源条目，为不同账号使用独立的凭据变量，再逐条选择显示位置。

切换账号会取消旧查询、清除旧余额或额度缓存，并重新建立余额对账及额度变化采样基准。调用日志没有账号标识，因此费用仍按渠道和模型统计，账号选择不改写历史费用，也不把多个账号的余额相加。

## Multiple accounts

Each supported source can keep its existing default account plus up to ten named accounts. Open **Cost → Overview → Account balance → Manage accounts**, **Cost → Quotas → OpenCode Go → Manage accounts**, or expand another provider's settings. Add a name, wait for the configuration to save, and store that account's credential. Volcano Ark keeps a separate AK/SK pair per account.

**Account to query and display** selects the account used by the sidebar, settings and composer. Only that account is queried. **Clear** removes its credential; **Remove account** removes the named account and its credential, then selects Default. Other accounts are preserved.

Default retains existing credential discovery. Named accounts use only their own stored credentials, with no fallback to Default or another account. Region, workspace, organization and refresh settings are shared within the source. WorkBuddy retains its existing account picker; Codex and Qwen CLI use the account selection in their connector or CLI. Custom balances can use separate entries and credential variables for multiple accounts from the same source.

Switching cancels old requests and resets cached quota/balance data and observation baselines. Account selection changes quota queries only: recorded costs remain grouped by channel/model, and balances from different accounts are not added together. Credential values are never stored in the ledger or returned to the browser.
