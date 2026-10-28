# v1.9.41：Web 启动修复与账本配置恢复

## 中文

本次更新修复 Web 端插件加载失败，并增加账本配置的独立备份与恢复。

- 为 `conversation.chat.turnTail` 补齐 chain 插槽要求的 `select`，修复启动时的 `requires options.select` 报错。
- 账本与 `ledger.json.config-bak` 均先写入同目录临时文件、刷盘，再替换目标文件。POSIX 系统同时同步目录；临时文件刷盘或替换失败时保留原文件。
- 正常账本加载时建立配置备份，之后仅在配置或迁移记录变化时更新。备份沿用现有脱敏规则，保留凭据占位符。
- 账本损坏或缺失时，从备份恢复自定义余额源等设置；保留损坏账本，并在日志中显示恢复结果。用量历史继续由现有补录流程处理。

此前已经全零且没有备份的文件，没有可恢复的配置内容。

感谢 [@korion3](https://github.com/korion3) 在 [#413](https://github.com/Han-1413141/dsh-cost-meter/issues/413) 报告、定位 Web 启动故障，并在 [#414](https://github.com/Han-1413141/dsh-cost-meter/pull/414) 提供修复；感谢 [@kevindawn11-hash](https://github.com/kevindawn11-hash) 在 [#412](https://github.com/Han-1413141/dsh-cost-meter/issues/412) 提供账本损坏证据与配置备份建议。

更新后完全重启 DSH，使插件服务端加载新版本。

## English

This update fixes Web plugin startup and adds independent configuration backup and recovery.

- Add the required `select` function to the `conversation.chat.turnTail` chain slot, fixing the startup error `requires options.select`.
- Write the ledger and `ledger.json.config-bak` to temporary files in the same directory, flush them, then replace their destinations. POSIX systems also flush the directory; file-sync or replacement failures preserve the original file.
- Create a configuration backup when a healthy ledger loads, then update it only when configuration or migration markers change. The backup uses existing secret filtering and preserves credential placeholders.
- Restore settings, including custom balance sources, when the ledger is corrupt or missing. Keep the corrupt ledger and log the restoration result. Usage history continues through the existing backfill process.

A file that was already zeroed before this protection, with no backup, contains no configuration to recover.

Thanks to [@korion3](https://github.com/korion3) for the report and diagnosis in [#413](https://github.com/Han-1413141/dsh-cost-meter/issues/413) and the fix in [#414](https://github.com/Han-1413141/dsh-cost-meter/pull/414), and to [@kevindawn11-hash](https://github.com/kevindawn11-hash) for the corruption evidence and backup suggestions in [#412](https://github.com/Han-1413141/dsh-cost-meter/issues/412). Fully restart DSH after updating.
