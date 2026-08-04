import { VendorApiStyle, VendorConfig, VendorModelConfig } from './configStore';

/**
 * chatLanguageModels.json 模型级配置对象。
 * 字段与 VS Code 官方 Model configuration reference 对齐。
 */
export interface ChatLanguageModelsModelConfig {
  apiType?: 'chat-completions' | 'responses' | 'messages';
  contextWindow?: number;
  editTools?: string[];
  id: string;
  maxOutputTokens?: number;
  name: string;
  reasoningEffortFormat?: 'chat-completions' | 'responses';
  streaming?: boolean;
  supportsReasoningEffort?: string[];
  thinking?: boolean;
  toolCalling?: boolean;
  url: string;
  vision?: boolean;
  zeroDataRetentionEnabled?: boolean;
}

/** 固定输出值：拷贝到 chatLanguageModels.json 时使用的模型属性。 */
export const CHAT_LANGUAGE_MODELS_FIXED_EDIT_TOOLS = ['apply-patch', 'find-replace', 'multi-find-replace'];
export const CHAT_LANGUAGE_MODELS_FIXED_MAX_OUTPUT_TOKENS = 100000;
export const CHAT_LANGUAGE_MODELS_FIXED_SUPPORTS_REASONING_EFFORT = ['xhigh', 'high', 'max'];

export function toChatLanguageModelsApiType(
  apiStyle: VendorApiStyle | undefined,
  apiType: VendorModelConfig['apiType'],
): 'chat-completions' | 'responses' | 'messages' {
  if (apiType === 'responses') {
    return 'responses';
  }
  if (apiType === 'anthropic') {
    return 'messages';
  }
  if (apiStyle === 'openai-responses') {
    return 'responses';
  }
  if (apiStyle === 'anthropic') {
    return 'messages';
  }
  return 'chat-completions';
}

function toChatLanguageModelsReasoningEffortFormat(
  apiType: 'chat-completions' | 'responses' | 'messages',
): 'chat-completions' | 'responses' | undefined {
  // reasoningEffortFormat 与 apiType 保持一致；messages（Anthropic）无对应格式，省略。
  return apiType === 'chat-completions' || apiType === 'responses' ? apiType : undefined;
}

/**
 * 将扩展内部的 vendor+model 配置转换为 chatLanguageModels.json 的模型对象。
 * 字段按字母序排列，与 VS Code 保存 chatLanguageModels.json 时的顺序一致；
 * maxOutputTokens/editTools/supportsReasoningEffort/zeroDataRetentionEnabled 使用固定值。
 */
export function toChatLanguageModelsModelConfig(
  vendor: VendorConfig,
  model: VendorModelConfig,
): ChatLanguageModelsModelConfig {
  const apiType = toChatLanguageModelsApiType(model.apiStyle ?? vendor.defaultApiStyle, model.apiType);
  const config: ChatLanguageModelsModelConfig = {
    apiType,
    id: `${vendor.name}/${model.name}`,
    name: model.name,
    url: vendor.baseUrl,
  };

  if (model.contextSize !== undefined) {
    config.contextWindow = model.contextSize;
  }
  config.editTools = [...CHAT_LANGUAGE_MODELS_FIXED_EDIT_TOOLS];
  config.maxOutputTokens = CHAT_LANGUAGE_MODELS_FIXED_MAX_OUTPUT_TOKENS;
  const reasoningEffortFormat = toChatLanguageModelsReasoningEffortFormat(apiType);
  if (reasoningEffortFormat !== undefined) {
    config.reasoningEffortFormat = reasoningEffortFormat;
  }
  if (model.streaming !== undefined) {
    config.streaming = model.streaming;
  }
  config.supportsReasoningEffort = [...CHAT_LANGUAGE_MODELS_FIXED_SUPPORTS_REASONING_EFFORT];
  if (typeof model.capabilities?.thinking === 'boolean') {
    config.thinking = model.capabilities.thinking;
  }
  if (typeof model.capabilities?.tools === 'boolean') {
    config.toolCalling = model.capabilities.tools;
  }
  if (typeof model.capabilities?.vision === 'boolean') {
    config.vision = model.capabilities.vision;
  }
  config.zeroDataRetentionEnabled = true;

  return config;
}

/** 序列化为可直接粘贴到 chatLanguageModels.json 的 JSON 字符串。 */
export function serializeChatLanguageModelsModelConfig(config: ChatLanguageModelsModelConfig): string {
  return JSON.stringify(config, null, 2);
}
