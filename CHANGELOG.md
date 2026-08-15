# Changelog

All notable changes to this project will be documented in this file.

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

## [0.12.4] - 2026-07-10
- fix(scripts)#188: 修复腾讯云 Coding Plan 页面解析超时问题
- build(ci): 升级 GitHub Pages 部署工作流的 Action 版本

## [0.12.3] - 2026-06-27
- fix(provider): 兼容 OpenAI function 形态工具定义并保留 function.name
- build(deps): 升级项目版本并添加 eslint-config-prettier
- feat(provider): 将 Responses API 的 Personality 默认值改为 none

## [0.12.2] - 2026-06-26
- feat(app): 完善模型目录与服务兜底逻辑
- feat(pricing): 更新服务商套餐数据与前端展示逻辑
- feat(provider): 支持关闭额外请求封装并优化 Grok 协议与 Token 计数

## [0.12.1] - 2026-06-26
- feat(app): 完善模型目录与服务兜底逻辑
- feat(pricing): 更新服务商套餐数据与前端展示逻辑
