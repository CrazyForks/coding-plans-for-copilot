# Changelog

All notable changes to this project will be documented in this file.

## [0.14.4] - 2026-08-26
- fix(provider): 流式与非流式响应先发出思考过程，再发出正文，对齐原生 Custom Endpoint

## [0.14.3] - 2026-08-26
- fix(config): 移除 enableExtraRequestWrapping，请求路径固定为原生 Custom Endpoint 行为

## [0.14.2] - 2026-08-26
- fix(provider): 默认请求包对齐原生 Custom Endpoint：openai-chat 默认只发 reasoning_effort；openai-chat/responses 下发输出上限；anthropic 只使用 x-api-key

## [0.14.1] - 2026-08-26
- fix(provider): openai-chat Thinking Type 默认改为 enabled，使 Thinking Effort 实际下发 thinking
- fix(config): enableExtraRequestWrapping 默认改为 false

## [0.14.0] - 2026-08-15
- feat(web): add VS Code Web extension entry point and browser-compatible bundle
- feat(web): support coding model providers, model refresh, Secret Storage, and SCM-based commit generation in vscode.dev and github.dev
- build(web): package and verify separate Node.js and browser extension bundles

## [0.13.5] - 2026-08-15
- feat(web): add VS Code Web extension entry point and browser-compatible bundle
- feat(web): support coding model providers, model refresh, Secret Storage, and SCM-based commit generation in vscode.dev and github.dev
- build(web): package and verify separate Node.js and browser extension bundles

## [0.13.4] - 2026-08-04
- fix(config): chatLanguageModels.json 导出完整 endpoint url 与运行时一致
- feat(command): 新增 "Copy Model as chatLanguageModels.json" 命令

## [0.13.2] - 2026-08-04
- feat(command): 新增 "Copy Model as chatLanguageModels.json" 命令，将供应商模型拷贝为 chatLanguageModels.json 模型对象

## [0.13.1] - 2026-07-18
- feat(logging): 优化 Coding Plans 日志系统
- refactor(crawler): 优化 GitHub 标签缓存与 LinuxDo 数据获取
- feat(parser): 更新供应商定价解析逻辑

## [0.13.0] - 2026-07-11
- Maintenance updates
