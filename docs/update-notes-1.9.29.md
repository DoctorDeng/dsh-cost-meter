# v1.9.29 更新说明

## 中文

本次更新修复用户反馈的桌面侧栏布局、后台账本保存和插件卸载问题。

### 修复内容

- **账本保存失败：**v1.9.28 的后台线程没有继承 DSH 的模块解析环境，部分安装方式会反复报告找不到 `@deepseek-ai/dsh-home-paths`。现将线程及其依赖独立打包，可在没有宿主模块解析器的环境中运行。
- **卸载与重载卡住：**卸载时异步等待正在进行的写入，让宿主事件循环继续处理完成和失败消息。线程超时后终止并释放它持有的锁，再完成最终保存；提交回执仍防止重复记账。
- **桌面端底部空白：**费用区按内容占据高度，避免皮肤拉伸底部容器，使卡片与用户操作区保持紧邻。
- **OpenDesign 余额位置：**余额放在标题行右侧，下方保留 5h 和周额度，悬停提示保留完整含义。
- **紧凑同行布局：**今日金额与余额首行对齐，第二行 Token 数完整显示，不再被固定行高截断。

### 验证

- 后台线程在独立目录中运行；覆盖缺少宿主依赖、线程超时、持锁终止、卸载响应和用量只保存一次。
- 浏览器检查覆盖浅色与深色、标准/紧凑/合并/简洁布局、窄侧栏和插件隐藏后的宿主布局恢复。
- 使用真实 DSH 0.2.1-rc.2 宿主及模拟账号响应，验证已有的 pi-ai Codex 订阅读取、旧 RPC 清单兼容，以及多次加载、重载和取消。未查询真实供应商账号。

### 升级

在插件市场更新到 **1.9.29**，或按正在使用的环境执行：

```powershell
dsh plugin --profile desktop add dsh-cost-meter@1.9.29
```

网页端将 `desktop` 换成 `web`。升级后完全退出并重启对应的 DSH Desktop 或 Web 进程，确保新后台线程和宿主服务一并加载。

问题由用户通过截图和运行日志反馈，感谢提供桌面端表现、报错及重载现象。

## English

This patch fixes Desktop sidebar spacing, background ledger saves and plugin disposal.

- Bundle the ledger worker and its dependencies so it can run without the DSH module resolver. This fixes repeated missing `@deepseek-ai/dsh-home-paths` errors introduced by the v1.9.28 background writer in affected installations.
- Await active writes without blocking the host event loop. Terminate stalled workers, release only their own locks, and preserve pending usage through the final save. Atomic commit receipts continue to prevent duplicate billing.
- Keep footer cards next to user controls when a Desktop skin stretches the footer containers.
- Place the OpenDesign wallet balance beside the title, with the 5h and weekly quota rows below.
- Keep Today and Balance aligned while allowing both the amount and token count to remain fully visible.

Checks cover isolated workers, import failures, stalled workers holding locks, concurrent ledger writes, sidebar layouts and theme variants. Existing native pi-ai Codex quota and reload behavior was also verified with the real DSH 0.2.1-rc.2 runtime and simulated account responses; no live supplier account was queried.

Update to **1.9.29** through the plugin marketplace or use the command above. Use `web` instead of `desktop` for the Web profile. Fully exit and restart the relevant DSH process after upgrading.
