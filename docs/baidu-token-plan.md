# 百度千帆 Token Plan 额度

支持千帆 Token Plan 个人版的积分制和 Token 制，显示月度已用百分比、已用量 / 总额度及套餐到期时间。数值由百度控制台读取，不按模型调用费用换算。

## 配置

1. 登录 [百度智能云千帆控制台](https://console.bce.baidu.com/qianfan/resource/token-plan)，确认个人版套餐有效。
2. 打开浏览器开发者工具的「网络」，刷新页面，找到 `tokenPlanPersonal/resource` 请求，复制请求头中的完整 `Cookie`。
3. 在费用插件的「订阅额度」中启用「百度千帆 Token Plan」，展开卡片，将 Cookie 粘贴到凭据框并保存，点击刷新。也可在 DSH 主机配置 `BAIDU_QIANFAN_COOKIE` 环境变量。

Cookie 由 DSH 凭据库保管，不写入账本、配置备份或公开状态。登录过期后重新复制 Cookie。推理用的 API Key 不能代替控制台 Cookie；不要将 Cookie 发到 issue 或评论。

本次接入个人版套餐本身的额度；加油包、企业版和旧 Coding Plan 的独立窗口不在此卡片中。到期时间独立显示，不当作月度重置时间。既有 `baidu-coding` 计费分类保持兼容，并识别 `baidu-token-plan`、`qianfan-token-plan` 等别名。

## 接口依据与验证

2026-10-26 核对 [官方个人版文档](https://cloud.baidu.com/doc/qianfan/s/Dmrabu8b6)及控制台公开前端：

- [订阅查询代码](https://aip-static.cdn.bcebos.com/mb-static/resource/assets/useRedeemCodeActivation-74e52f9e.js)：`GET /api/qianfan/charge/tokenPlanPersonal/resource`，成功信封为 `success: true`，套餐在 `result.items` 中。
- `billingMode: "credit"` 使用 `usedCredits`、`totalCredits`；`"token"` 使用 `usedTokens`、`totalTokens`。`expiresAt` 是套餐到期时间，`resourceStatus: "Released"` 为已释放资源。
- [请求封装](https://aip-static.cdn.bcebos.com/mb-static/resource/assets/caller-368e0844.js)：GET 使用同源 Cookie 和 `X-Requested-With: XMLHttpRequest`，没有修改套餐的操作。
- 未登录访问该只读端点实测返回 HTTP 302。插件拒绝跟随重定向，Cookie 只发送到固定官方端点。

回归测试使用上述官方结构构造的数据，覆盖两种计量模式、过期套餐、无订阅、缺字段、认证失败、取消、凭据保管和状态编码。尚未使用真实付费账号核对数值。
