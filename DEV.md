# 开发指南

## 编译

```bash
npm run compile
```

## 监听模式

```bash
npm run watch
```

## 代码检查

```bash
npm run lint
```

## 打包发布

```bash
npm run package:vsix
```

发布到插件市场：

```bash
# Linux / macOS
export VSCE_PAT=your_pat
npm run publish:marketplace

# PowerShell
$env:VSCE_PAT="your_pat"
npm run publish:marketplace
```

说明：`npm run publish:marketplace` 会在发布前自动更新 `CHANGELOG.md`（按当前 `package.json` 版本生成对应条目）。

## 提交消息高级配置示例

在 VS Code `settings.json` 中可配置：

```json
{
  "coding-plans.commitMessage.options": {
    "maxBodyBulletCount": 7,
    "subjectMaxLength": 72,
    "requireConventionalType": true,
    "warnOnValidationFailure": true
  }
}
```

说明：`maxBodyBulletCount` 是正文 bullet 最大条数。

## 编码套餐价格抓取

执行 `npm run pricing:fetch` 抓取编码套餐价格，结果写入：

- `assets/provider-pricing.json`（扩展和 GitHub Pages 的统一数据源）

GitHub Pages 部署时会将 `assets/provider-pricing.json` 同步到 `docs/provider-pricing.json` 作为站点构建产物（不入库）。

## 多协议供应商接入说明

- `coding-plans.vendors[].apiStyle` 用于声明供应商协议风格：
  - `openai-chat`：请求 `baseUrl + /chat/completions`
  - `openai-responses`：请求 `baseUrl + /responses`
  - `anthropic`：请求 `baseUrl + /messages`
- 当前无需考虑旧枚举兼容，未配置 `apiStyle` 时默认按 `openai-chat` 处理。
- `anthropic` 与 `openai-responses` 目前重点覆盖聊天与工具调用；模型发现仍建议使用 `useModelsEndpoint: false` 并手动维护 `models`。
- 当 `useModelsEndpoint: true` 时，刷新模型列表只按 `name` 同步增删；设置中已有模型项的 `description`、`capabilities`、`contextSize` 等字段应保持原样。
- 若修改协议相关行为，请同步检查：
  - `src/providers/genericProvider.ts`
  - `src/config/configStore.ts`
  - `package.json`
  - `README.md`
  - `README_en.md`
