# Changelog

All notable changes to this project will be documented in this file.

## [0.5.2] - 2026-03-11
- feat(pages): 添加 GitHub Pages 冒烟测试和更新定价数据
- feat(config): 改进模型配置处理逻辑
- #6 feat(pricing): 添加讯飞星辰定价信息
- chore(pricing): 更新定价数据和脚本名称
- feat(model): 保留已配置模型对象的完整字段
- chore(changelog): 更新 0.5.0 发布日志
- feat(provider): 支持多协议供应商接入
- feat(scripts): 增加 Redpill 自定义解析及界面调整
- chore(docs): 更新价格指标文档与数据

## [0.5.1] - 2026-03-11
- feat(config): 改进模型配置处理逻辑
- #6 feat(pricing): 添加讯飞星辰定价信息
- chore(pricing): 更新定价数据和脚本名称
- feat(model): 保留已配置模型对象的完整字段

## [0.5.0] - 2026-03-06
- feat(provider): 支持多协议供应商接入
- feat(scripts): 增加 Redpill 自定义解析及界面调整
- chore(docs): 更新价格指标文档与数据
- feat(config): 优化模型配置存储逻辑，仅持久化模型名称
- feat(generator): 优化提示词处理和提交风格参考
- feat: 添加OpenRouter模型性能看板
- feat(provider): 添加强制模型发现重试功能

## [0.4.15] - 2026-03-05
- feat(config): 为供应商模型添加默认视觉能力配置
- feat(pricing): 支持人民币/美元符号自动识别并统一价格格式

## [0.4.14] - 2026-03-04
- fix(commit-message-generator): 优化仓库上下文解析
- fix(ci): 修正更新价格推送分支
- Update workflow for pricing fetching

## [0.4.13] - 2026-03-03
- feat(commit-message): 增强模型选择缓存与日志

## [0.4.12] - 2026-03-02
- Maintenance updates

## [0.4.11] - 2026-02-28
- feat(core): 添加统一日志系统并增强模型刷新机制

## [0.4.10] - 2026-02-28
- fix(extension): 添加模型刷新错误处理并通知信息变更
- feat: 更新编码套餐数据抓取与展示，支持多语言
- chore(changelog): add 0.4.9 release notes

## [0.4.9] - 2026-02-26
- refactor: update commit message options and add Chinese README
- refactor(config): 更新默认模型设置并合并供应商模型
- feat(config): add useModelsEndpoint and improve model discovery
- feat(commitMessage): 支持命令可见性控制及模仿最近提交风格
- feat(commit-msg): 改进生成提交信息时的进度反馈
- refactor(core): 拆分上下文配置为独立的输入输出令牌限制
- feat(core): implement unified config and generic provider
- chore(ci): update pricing data and consolidate source of truth
- ci: add version tagging workflow and pricing failure detection
- feat!: rebrand to "Coding Plans for Copilot" and rename namespace to coding-plans
- feat: 添加生成提交消息功能，支持选择模型和语言设置
- chore: update version
- feat(docs): 添加 github 仓库链接按钮
- chore: 更新 GitHub Pages 访问路径，删除 Lint 问题修复计划文档

## [0.4.8] - 2026-02-26
- refactor(config): 更新默认模型设置并合并供应商模型
- feat(config): add useModelsEndpoint and improve model discovery
- feat(commitMessage): 支持命令可见性控制及模仿最近提交风格
- feat(commit-msg): 改进生成提交信息时的进度反馈
- refactor(core): 拆分上下文配置为独立的输入输出令牌限制
- feat(core): implement unified config and generic provider
- chore(ci): update pricing data and consolidate source of truth
- ci: add version tagging workflow and pricing failure detection
- feat!: rebrand to "Coding Plans for Copilot" and rename namespace to coding-plans
- feat: 添加生成提交消息功能，支持选择模型和语言设置
- chore: update version
- feat(docs): 添加 github 仓库链接按钮
- chore: 更新 GitHub Pages 访问路径，删除 Lint 问题修复计划文档
- feat: add AI pricing dashboard with provider data and pricing plans

## [0.4.0] - 2026-02-26
- feat(core): implement unified config and generic provider

## [0.2.0] - 2026-02-23
- ci: add version tagging workflow and pricing failure detection
- feat!: rebrand to "Coding Plans for Copilot" and rename namespace to coding-plans
- feat: 添加生成提交消息功能，支持选择模型和语言设置
- chore: update version
- feat(docs): 添加 github 仓库链接按钮
- chore: 更新 GitHub Pages 访问路径，删除 Lint 问题修复计划文档
- feat: add AI pricing dashboard with provider data and pricing plans
- feat: 添加开发指南文档，包含编译、监听模式、代码检查和发布步骤
- feat: update extension name and descriptions to reflect new branding as "Chinese AI Plans for Copilot"
- feat: Add support for Aliyun, Minimax, and enhance existing providers
- feat: Update configuration for AI providers to include region settings
- feat: 更新智谱 API 基础 URL，增强工具调用支持
- feat: Add support for multiple Chinese AI models in Copilot extension

## [0.1.0] - 2026-02-22
- feat!: rebrand to "Coding Plans for Copilot" and rename command/config namespace to `coding-plans` (breaking)
- feat: persist commit message model selection in settings and add a dedicated command to set it
- feat: migrate legacy `Chinese-AI.*` settings to `coding-plans.*` on first activation (best-effort)

## [0.0.4] - 2026-02-20
- chore: update version
- feat(docs): 添加 github 仓库链接按钮
- chore: 更新 GitHub Pages 访问路径，删除 Lint 问题修复计划文档
- feat: add AI pricing dashboard with provider data and pricing plans
- feat: 添加开发指南文档，包含编译、监听模式、代码检查和发布步骤
- feat: update extension name and descriptions to reflect new branding as "Chinese AI Plans for Copilot"
- feat: Add support for Aliyun, Minimax, and enhance existing providers
- feat: Update configuration for AI providers to include region settings
- feat: 更新智谱 API 基础 URL，增强工具调用支持
- feat: Add support for multiple Chinese AI models in Copilot extension

## [0.0.2] - 2026-02-17
- feat: 添加开发指南文档，包含编译、监听模式、代码检查和发布步骤
- feat: update extension name and descriptions to reflect new branding as "Chinese AI Plans for Copilot"
- feat: Add support for Aliyun, Minimax, and enhance existing providers
- feat: Update configuration for AI providers to include region settings
- feat: 更新智谱 API 基础 URL，增强工具调用支持
- feat: Add support for multiple Chinese AI models in Copilot extension
