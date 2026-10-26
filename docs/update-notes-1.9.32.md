# v1.9.32 更新说明

## 中文

新增 `dsh-chatgpt-sub` 的图形化额度显示。它与此前支持的 `@eddyskywalker/dsh-chatgpt-subscription` 是两个独立插件，现已接入现有 ChatGPT (Codex) 额度卡片。

### 使用

1. 在 `dsh-chatgpt-sub` 中完成 ChatGPT 登录。
2. 进入“设置 → 费用 → 显示 → 侧栏”，在“调整组件”中选择“Codex 额度”，打开额度显示，数据源选择 **dsh-chatgpt-sub**。自动检测也包含该来源。
3. 在“输入区”中可单独开启 Codex 额度横条。两个位置共用查询结果，点击卡片可刷新。

侧栏显示 5 小时和每周的剩余进度条，右上角显示重置时间。账号只提供每周窗口时只显示每周额度，不补造 5 小时窗口。查询失败或解除绑定后显示重试提示，不继续展示本次刷新前的额度。

### 数据来源与验证

适配 [songoao25/dsh-chatgpt-sub 0.6.3](https://github.com/songoao25/dsh-chatgpt-sub)：先检查其同源绑定状态，再由费用插件服务端读取它保存在 DSH 中的凭据，向官方额度地址发起只读查询。前端和账本不接收令牌，不读取或修改共享 Codex 登录文件，不需要安装 Bottom Info Bar。额度显示和计费归类保持独立。

使用真实 DSH 0.2.1-rc.2 宿主、发布的浏览器产物与模拟账号响应，检查了双窗口、周窗口、百分比方向、重置时间、登录恢复、解除绑定、来源切换、凭据轮换、错误与超时、卸载和旧 RPC 清单兼容。模拟额度只用于检查显示，没有查询真实供应商账号。

### 升级

在插件市场更新到 **1.9.32**，完全退出并重启对应的 DSH Desktop 或 Web 进程，然后按上方步骤开启显示。

## English

Add graphical quota for `dsh-chatgpt-sub`, independently of the already supported multi-provider ChatGPT subscription plugin.

Sign in through `dsh-chatgpt-sub`, then open Settings → Cost → Display → Sidebar, select Codex quota, enable it and choose **dsh-chatgpt-sub**. Auto-detection also includes this source. The composer quota strip has a separate display switch.

Both positions show remaining 5h/weekly quota and share one cached query. Weekly-only accounts do not get an invented 5h window. Clicking refresh after unbinding clears the old graph. The host reads the plugin-managed DSH credential after the browser verifies the current binding; tokens never reach the browser or ledger, and shared Codex login files are not read or changed.

Validation uses the real DSH 0.2.1-rc.2 host, shipped browser bundles and synthetic account responses. Update to **1.9.32** and fully restart DSH before enabling the display.
