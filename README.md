# Chronicle
可以往里面扔点史的小网站

## Traffic API

`/api/traffic` 优先从 Google Analytics 4 Data API 读取统计。

需要配置：
- `server/data/settings.json` 或设置页里的 `gaPropertyId`
- `GA_SERVICE_ACCOUNT_JSON` 或 `GOOGLE_APPLICATION_CREDENTIALS`

如果 GA 配置缺失或请求失败，会回退到本地访问日志统计。
