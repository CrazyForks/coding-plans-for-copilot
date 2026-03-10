import * as vscode from 'vscode';
import {
  BaseAIProvider,
  BaseLanguageModel,
  AIModelConfig,
  ChatMessage,
  ChatToolCall,
  ChatToolDefinition,
  getCompactErrorMessage,
  normalizeHttpBaseUrl
} from './baseProvider';
import { ConfigStore, VendorConfig, VendorModelConfig } from '../config/configStore';
import { getMessage, isChinese } from '../i18n/i18n';
import { logger } from '../logging/outputChannelLogger';

interface OpenAIChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  tool_choice?: 'auto' | 'required';
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface OpenAIChatResponse {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: ChatToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIResponsesToolDefinition {
  type: 'function';
  name: string;
  description?: string;
  parameters?: object;
}

interface OpenAIResponsesInputTextContent {
  type: 'input_text';
  text: string;
}

interface OpenAIResponsesInputToolCallContent {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

interface OpenAIResponsesInputToolResultContent {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

type OpenAIResponsesInputContent = OpenAIResponsesInputTextContent;

interface OpenAIResponsesInputMessage {
  type?: 'message';
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIResponsesInputContent[];
}

type OpenAIResponsesInputItem =
  | OpenAIResponsesInputMessage
  | OpenAIResponsesInputToolCallContent
  | OpenAIResponsesInputToolResultContent;

interface OpenAIResponsesRequest {
  model: string;
  input: OpenAIResponsesInputItem[];
  tools?: OpenAIResponsesToolDefinition[];
  tool_choice?: 'auto' | 'required';
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
}

interface OpenAIResponsesOutputTextContent {
  type: 'output_text';
  text?: string;
}

interface OpenAIResponsesFunctionCallItem {
  type: 'function_call';
  call_id?: string;
  name?: string;
  arguments?: string;
}

interface OpenAIResponsesMessageItem {
  type: 'message';
  role?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

type OpenAIResponsesOutputItem = OpenAIResponsesFunctionCallItem | OpenAIResponsesMessageItem;

interface OpenAIResponsesResponse {
  id: string;
  output?: OpenAIResponsesOutputItem[];
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema?: object;
}

interface AnthropicTextContentBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input?: unknown;
}

interface AnthropicToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

type AnthropicRequestContentBlock =
  | AnthropicTextContentBlock
  | AnthropicToolUseContentBlock
  | AnthropicToolResultContentBlock;

interface AnthropicChatMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicRequestContentBlock[];
}

interface AnthropicChatRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicChatMessage[];
  tools?: AnthropicToolDefinition[];
  tool_choice?: AnthropicToolChoice;
}

interface AnthropicToolChoice {
  type: 'auto' | 'any' | 'tool' | 'none';
  name?: string;
}

interface AnthropicResponseTextContentBlock {
  type: 'text';
  text?: string;
}

interface AnthropicResponseToolUseContentBlock {
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: unknown;
}

type AnthropicResponseContentBlock = AnthropicResponseTextContentBlock | AnthropicResponseToolUseContentBlock;

interface AnthropicChatResponse {
  id: string;
  role: 'assistant';
  content: AnthropicResponseContentBlock[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface GenericChatRequest {
  modelId: string;
  messages: vscode.LanguageModelChatMessage[];
  options?: vscode.LanguageModelChatRequestOptions;
  capabilities: vscode.LanguageModelChatCapabilities;
}

interface ModelVendorMapping {
  vendor: VendorConfig;
  modelName: string;
}

interface ModelDiscoveryResult {
  models: AIModelConfig[];
  failed: boolean;
  status?: number;
}

interface VendorDiscoveryState {
  signature: string;
  suppressRetry: boolean;
  cachedModels: AIModelConfig[];
}

interface RefreshModelsOptions {
  forceDiscoveryRetry?: boolean;
}

interface RetryWithV1PromptResult {
  baseUrl: string;
  vendor: VendorConfig;
}

const DEFAULT_CONTEXT_SIZE = 200000;
const DEFAULT_CONTEXT_WINDOW_SIZE = 400000;
const DEFAULT_MAX_TOKENS = 4000;
const DEFAULT_MODEL_TOOLS = true;
const DEFAULT_MODEL_VISION = true;
const NON_RETRYABLE_DISCOVERY_STATUS_CODES = new Set([400, 401, 403, 404]);

export class GenericLanguageModel extends BaseLanguageModel {
  constructor(provider: BaseAIProvider, modelInfo: AIModelConfig) {
    super(provider, modelInfo);
  }

  async sendRequest(
    messages: vscode.LanguageModelChatMessage[],
    options?: vscode.LanguageModelChatRequestOptions,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const provider = this.provider as GenericAIProvider;
    const request: GenericChatRequest = {
      modelId: this.id,
      messages,
      options,
      capabilities: this.capabilities
    };

    try {
      return await provider.sendRequest(request, token);
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      throw new vscode.LanguageModelError(getMessage('requestFailed', getCompactErrorMessage(error)));
    }
  }
}

export class GenericAIProvider extends BaseAIProvider {
  private modelVendorMap = new Map<string, ModelVendorMapping>();
  private readonly vendorDiscoveryState = new Map<string, VendorDiscoveryState>();
  private refreshModelsInFlight: Promise<void> | undefined;
  private refreshModelsPending = false;
  private forceDiscoveryRetryRequested = false;

  constructor(
    context: vscode.ExtensionContext,
    private readonly configStore: ConfigStore
  ) {
    super(context);
    this.disposables.push(
      this.configStore.onDidChange(() => void this.refreshModels())
    );
  }

  async initialize(): Promise<void> {
    await this.refreshModels();
  }

  getVendor(): string {
    return 'coding-plans';
  }

  getConfigSection(): string {
    return 'coding-plans';
  }

  getBaseUrl(): string {
    const vendors = this.configStore.getVendors();
    return vendors[0]?.baseUrl || '';
  }

  getApiKey(): string {
    return this.configStore.getVendors().length > 0 ? 'configured' : '';
  }

  async setApiKey(_apiKey: string): Promise<void> {
    // Per-vendor API keys are managed via configStore.setApiKey(vendorName, apiKey)
  }

  getPredefinedModels(): AIModelConfig[] {
    return [];
  }

  convertMessages(messages: vscode.LanguageModelChatMessage[]): ChatMessage[] {
    return this.toProviderMessages(messages);
  }

  async refreshModels(options: RefreshModelsOptions = {}): Promise<void> {
    if (options.forceDiscoveryRetry) {
      this.forceDiscoveryRetryRequested = true;
    }

    if (this.refreshModelsInFlight) {
      this.refreshModelsPending = true;
      return this.refreshModelsInFlight;
    }

    const running = (async () => {
      do {
        const forceDiscoveryRetry = this.forceDiscoveryRetryRequested;
        this.forceDiscoveryRetryRequested = false;
        this.refreshModelsPending = false;
        await this.refreshModelsInternal({ forceDiscoveryRetry });
      } while (this.refreshModelsPending || this.forceDiscoveryRetryRequested);
    })();

    this.refreshModelsInFlight = running;
    try {
      await running;
    } finally {
      if (this.refreshModelsInFlight === running) {
        this.refreshModelsInFlight = undefined;
      }
    }
  }

  private async refreshModelsInternal(options: RefreshModelsOptions = {}): Promise<void> {
    const forceDiscoveryRetry = options.forceDiscoveryRetry === true;
    const vendors = this.configStore.getVendors();
    logger.info('Refreshing Coding Plans vendor models', { vendorCount: vendors.length });
    this.modelVendorMap.clear();
    const allModelConfigs: AIModelConfig[] = [];
    const activeVendorKeys = new Set(vendors.map(vendor => this.toVendorStateKey(vendor.name)));

    for (const vendorKey of Array.from(this.vendorDiscoveryState.keys())) {
      if (!activeVendorKeys.has(vendorKey)) {
        this.vendorDiscoveryState.delete(vendorKey);
      }
    }

    for (const vendor of vendors) {
      if (!vendor.baseUrl) {
        logger.warn('Skip vendor with empty baseUrl', { vendor: vendor.name });
        continue;
      }
      const vendorKey = this.toVendorStateKey(vendor.name);
      const configuredModels = this.buildConfiguredModelsForVendor(vendor);
      logger.info('Evaluating vendor models', {
        vendor: vendor.name,
        useModelsEndpoint: vendor.useModelsEndpoint,
        configuredCount: configuredModels.length
      });

      if (!vendor.useModelsEndpoint) {
        this.vendorDiscoveryState.delete(vendorKey);
        logger.info('Using settings models for vendor', {
          vendor: vendor.name,
          modelCount: configuredModels.length
        });
        this.appendResolvedModels(vendor, configuredModels, allModelConfigs);
        continue;
      }

      const apiKey = await this.configStore.getApiKey(vendor.name);
      if (!apiKey) {
        this.vendorDiscoveryState.delete(vendorKey);
        logger.warn('Missing API key; falling back to settings models', {
          vendor: vendor.name,
          fallbackCount: configuredModels.length
        });
        this.appendResolvedModels(vendor, configuredModels, allModelConfigs);
        continue;
      }

      const signature = this.buildVendorDiscoverySignature(vendor, apiKey);
      const previousState = this.vendorDiscoveryState.get(vendorKey);

      if (previousState && previousState.signature === signature && previousState.suppressRetry && !forceDiscoveryRetry) {
        const cached = previousState.cachedModels.length > 0 ? previousState.cachedModels : configuredModels;
        logger.warn('Using cached/settings models because discovery retry is suppressed', {
          vendor: vendor.name,
          cachedCount: previousState.cachedModels.length,
          fallbackCount: configuredModels.length,
          resolvedCount: cached.length
        });
        this.appendResolvedModels(vendor, cached, allModelConfigs);
        continue;
      }

      if (previousState && previousState.signature === signature && previousState.suppressRetry && forceDiscoveryRetry) {
        logger.info('Force refresh bypassed suppressed discovery retry', { vendor: vendor.name });
      }

      const discovered = await this.discoverModelsFromApi(vendor, apiKey);
      if (discovered.failed) {
        const fallbackModels =
          previousState && previousState.signature === signature && previousState.cachedModels.length > 0
            ? previousState.cachedModels
            : configuredModels;
        logger.warn('Model discovery failed; using fallback models', {
          vendor: vendor.name,
          status: discovered.status,
          cachedCount: previousState?.cachedModels.length ?? 0,
          configuredCount: configuredModels.length,
          resolvedCount: fallbackModels.length
        });
        this.vendorDiscoveryState.set(vendorKey, {
          signature,
          suppressRetry: this.shouldSuppressDiscoveryRetry(discovered.status),
          cachedModels: fallbackModels
        });
        this.appendResolvedModels(vendor, fallbackModels, allModelConfigs);
        continue;
      }

      // When useModelsEndpoint is enabled, discovered model names are the source of truth.
      // Existing configured entries are preserved verbatim; only newly discovered names are appended.
      const discoveredVendorModels = this.toVendorModelConfigs(discovered.models);
      const mergedVendorModels = this.mergeConfiguredModelOverrides(vendor.models, discoveredVendorModels, vendor.defaultVision);
      const resolvedModels = this.buildConfiguredModelsFromVendorModels(vendor, mergedVendorModels);
      const discoveredSignature = this.buildVendorDiscoverySignature({ ...vendor, models: mergedVendorModels }, apiKey);
      logger.info('Using /models discovery results for vendor', {
        vendor: vendor.name,
        discoveredCount: discovered.models.length,
        normalizedCount: discoveredVendorModels.length,
        mergedCount: mergedVendorModels.length
      });

      try {
        await this.configStore.updateVendorModels(vendor.name, mergedVendorModels);
      } catch (error) {
        logger.warn(`Failed to update models config for ${vendor.name}.`, error);
      }

      this.vendorDiscoveryState.set(vendorKey, {
        signature: discoveredSignature,
        suppressRetry: false,
        cachedModels: resolvedModels
      });
      this.appendResolvedModels(vendor, resolvedModels, allModelConfigs);
    }

    this.models = allModelConfigs.map(m => this.createModel(m));
    logger.info('Coding Plans models refreshed', { modelIds: this.models.map(m => m.id) });
    this.modelChangedEmitter.fire();
  }

  async sendRequest(
    request: GenericChatRequest,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const mapping = this.modelVendorMap.get(request.modelId);
    if (!mapping) {
      throw new vscode.LanguageModelError(getMessage('vendorNotConfigured'));
    }

    const baseUrl = normalizeHttpBaseUrl(mapping.vendor.baseUrl);
    if (!baseUrl) {
      throw new vscode.LanguageModelError(getMessage('baseUrlInvalid'));
    }

    const apiKey = await this.configStore.getApiKey(mapping.vendor.name);
    if (!apiKey) {
      throw new vscode.LanguageModelError(getMessage('apiKeyRequired', mapping.vendor.name));
    }

    if (mapping.vendor.apiStyle === 'anthropic') {
      return this.sendAnthropicRequest(request, mapping.vendor, mapping.modelName, baseUrl, apiKey, token);
    }

    if (mapping.vendor.apiStyle === 'openai-responses') {
      return this.sendOpenAIResponsesRequest(request, mapping.vendor, mapping.modelName, baseUrl, apiKey, token);
    }

    return this.sendOpenAIChatRequest(request, mapping.vendor, mapping.modelName, baseUrl, apiKey, token);
  }

  protected createModel(modelInfo: AIModelConfig): BaseLanguageModel {
    return new GenericLanguageModel(this, modelInfo);
  }

  private buildModelFromVendorConfig(
    model: VendorModelConfig,
    vendor: VendorConfig,
    compositeId: string
  ): AIModelConfig {
    const maxInputTokens = model.maxInputTokens ?? DEFAULT_CONTEXT_SIZE;
    const maxOutputTokens = model.maxOutputTokens ?? DEFAULT_CONTEXT_SIZE;
    const configuredContextSize = model.contextSize ?? DEFAULT_CONTEXT_WINDOW_SIZE;
    const contextSize = Math.max(configuredContextSize, maxInputTokens, maxOutputTokens);
    const toolCalling = model.capabilities?.tools ?? DEFAULT_MODEL_TOOLS;
    const imageInput = model.capabilities?.vision ?? DEFAULT_MODEL_VISION;

    return {
      id: compositeId,
      vendor: 'coding-plans',
      family: vendor.name,
      name: model.name,
      version: vendor.name,
      maxTokens: contextSize,
      contextSize,
      maxInputTokens,
      maxOutputTokens,
      capabilities: { toolCalling, imageInput },
      description: model.description || getMessage('genericDynamicModelDescription', vendor.name, model.name)
    };
  }

  private buildConfiguredModelsForVendor(vendor: VendorConfig): AIModelConfig[] {
    return this.buildConfiguredModelsFromVendorModels(vendor, vendor.models);
  }

  private buildConfiguredModelsFromVendorModels(vendor: VendorConfig, vendorModels: VendorModelConfig[]): AIModelConfig[] {
    const models: AIModelConfig[] = [];
    for (const model of vendorModels) {
      const compositeId = `${vendor.name}/${model.name}`;
      models.push(this.buildModelFromVendorConfig(model, vendor, compositeId));
    }
    return models;
  }

  private appendResolvedModels(
    vendor: VendorConfig,
    models: AIModelConfig[],
    target: AIModelConfig[]
  ): void {
    for (const model of models) {
      const actualName = model.id.includes('/') ? model.id.substring(model.id.indexOf('/') + 1) : model.id;
      this.modelVendorMap.set(model.id, { vendor, modelName: actualName });
    }
    target.push(...models);
  }

  private async discoverModelsFromApi(vendor: VendorConfig, apiKey: string): Promise<ModelDiscoveryResult> {
    try {
      const baseUrl = normalizeHttpBaseUrl(vendor.baseUrl);
      if (!baseUrl) {
        return { models: [], failed: false };
      }

      const resolved = await this.withOptionalV1Retry(vendor, baseUrl, async retryBaseUrl => {
        const response = await this.fetchJson<any>(`${retryBaseUrl}/models`, {
          method: 'GET',
          ...this.buildRequestInit(apiKey, vendor.apiStyle)
        });
        return { response, baseUrl: retryBaseUrl };
      });
      const response = resolved.response;
      const data = response.data;
      const entries: any[] = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
          ? data.models
          : Array.isArray(data)
            ? data
            : [];

      const models: AIModelConfig[] = [];
      const seen = new Set<string>();

      for (const entry of entries) {
        const modelId =
          typeof entry.id === 'string' ? entry.id.trim() :
          typeof entry.model === 'string' ? entry.model.trim() :
          typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!modelId || seen.has(modelId.toLowerCase())) {
          continue;
        }
        if (!this.isLikelyChatModel(modelId)) {
          continue;
        }
        seen.add(modelId.toLowerCase());

        const compositeId = `${vendor.name}/${modelId}`;
        models.push({
          id: compositeId,
          vendor: 'coding-plans',
          family: vendor.name,
          name: modelId,
          version: vendor.name,
          maxTokens: DEFAULT_CONTEXT_WINDOW_SIZE,
          contextSize: DEFAULT_CONTEXT_WINDOW_SIZE,
          maxInputTokens: DEFAULT_CONTEXT_SIZE,
          maxOutputTokens: DEFAULT_CONTEXT_SIZE,
          capabilities: { toolCalling: DEFAULT_MODEL_TOOLS },
          description: getMessage('genericDynamicModelDescription', vendor.name, modelId)
        });
      }

      return { models, failed: false };
    } catch (error) {
      logger.warn(`Failed to discover models from ${vendor.name}`, error);
      return {
        models: [],
        failed: true,
        status: typeof (error as { response?: { status?: unknown } })?.response?.status === 'number'
          ? ((error as { response: { status: number } }).response.status)
          : undefined
      };
    }
  }

  private shouldSuppressDiscoveryRetry(status: number | undefined): boolean {
    return typeof status === 'number' && NON_RETRYABLE_DISCOVERY_STATUS_CODES.has(status);
  }

  private toVendorModelConfigs(discoveredModels: AIModelConfig[]): VendorModelConfig[] {
    const normalized: VendorModelConfig[] = [];
    const seen = new Set<string>();

    for (const model of discoveredModels) {
      const discovered = this.toVendorModelConfig(model);
      if (!discovered) {
        continue;
      }

      const key = discovered.name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      normalized.push(discovered);
    }

    return normalized;
  }

  private toVendorModelConfig(model: AIModelConfig): VendorModelConfig | undefined {
    const name = model.name.trim();
    if (name.length === 0) {
      return undefined;
    }

    const toolCalling = model.capabilities?.toolCalling;
    const tools = typeof toolCalling === 'number' ? toolCalling > 0 : (toolCalling ?? DEFAULT_MODEL_TOOLS);
    const imageInput = model.capabilities?.imageInput;
    const vision = typeof imageInput === 'boolean' ? imageInput : undefined;
    const contextSize = this.readPositiveTokenInteger(model.contextSize ?? model.maxTokens);

    return {
      name,
      description: model.description?.trim() || undefined,
      contextSize,
      maxInputTokens: this.readPositiveTokenInteger(model.maxInputTokens) ?? DEFAULT_CONTEXT_SIZE,
      maxOutputTokens: this.readPositiveTokenInteger(model.maxOutputTokens) ?? DEFAULT_CONTEXT_SIZE,
      capabilities: {
        tools,
        vision
      }
    };
  }

  private mergeConfiguredModelOverrides(
    currentModels: VendorModelConfig[],
    discoveredModels: VendorModelConfig[],
    defaultVisionForNewModels: boolean
  ): VendorModelConfig[] {
    const configuredByName = new Map<string, VendorModelConfig>();
    for (const model of currentModels) {
      const key = model.name.trim().toLowerCase();
      if (!key || configuredByName.has(key)) {
        continue;
      }
      configuredByName.set(key, model);
    }

    return discoveredModels.map(discovered => {
      const configured = configuredByName.get(discovered.name.trim().toLowerCase());
      if (!configured) {
        const discoveredVision = discovered.capabilities?.vision;
        if (typeof discoveredVision === 'boolean') {
          return discovered;
        }
        return {
          ...discovered,
          capabilities: {
            ...discovered.capabilities,
            vision: defaultVisionForNewModels
          }
        };
      }

      return configured;
    });
  }

  private readPositiveTokenInteger(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return undefined;
    }
    return Math.floor(value);
  }

  private toVendorStateKey(vendorName: string): string {
    return vendorName.trim().toLowerCase();
  }

  private buildVendorDiscoverySignature(vendor: VendorConfig, apiKey: string): string {
    const normalizedBaseUrl = normalizeHttpBaseUrl(vendor.baseUrl) || vendor.baseUrl.trim();
    const modelsSignature = this.hashText(JSON.stringify(vendor.models));
    const endpointFlag = vendor.useModelsEndpoint ? '1' : '0';
    return `${this.toVendorStateKey(vendor.name)}|${normalizedBaseUrl.toLowerCase()}|${vendor.apiStyle}|${endpointFlag}|${modelsSignature}|${this.hashText(apiKey.trim())}`;
  }

  private hashText(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  private async sendOpenAIChatRequest(
    request: GenericChatRequest,
    vendor: VendorConfig,
    modelName: string,
    baseUrl: string,
    apiKey: string,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const messages = this.convertMessages(request.messages);
    const supportsToolCalling = !!request.capabilities.toolCalling;

    const payload: OpenAIChatRequest = {
      model: modelName,
      messages,
      tools: supportsToolCalling ? this.buildToolDefinitions(request.options) : undefined,
      tool_choice: supportsToolCalling ? this.buildToolChoice(request.options) : undefined,
      stream: false,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: DEFAULT_MAX_TOKENS
    };

    try {
      const requestInit = this.buildRequestInit(apiKey, 'openai-chat', token);
      const response = await this.withOptionalV1Retry(vendor, baseUrl, retryBaseUrl => (
        this.postWithRetry(`${retryBaseUrl}/chat/completions`, payload, requestInit)
      ));
      const responseMessage = response.choices[0]?.message;
      const content = responseMessage?.content || '';
      const usageData = response.usage;
      const responseParts = this.buildResponseParts(content, responseMessage?.tool_calls);

      async function* streamText(text: string): AsyncIterable<string> {
        if (text.trim().length > 0) {
          yield text;
        }
      }

      async function* streamParts(parts: vscode.LanguageModelResponsePart[]): AsyncIterable<vscode.LanguageModelResponsePart> {
        for (const part of parts) {
          yield part;
        }
      }

      const result: vscode.LanguageModelChatResponse = {
        stream: streamParts(responseParts),
        text: streamText(content)
      };

      if (usageData) {
        (result as any).promptTokens = usageData.prompt_tokens;
        (result as any).completionTokens = usageData.completion_tokens;
        (result as any).totalTokens = usageData.total_tokens;
      }

      return result;
    } catch (error: any) {
      throw this.toProviderError(error);
    }
  }

  private async sendOpenAIResponsesRequest(
    request: GenericChatRequest,
    vendor: VendorConfig,
    modelName: string,
    baseUrl: string,
    apiKey: string,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const providerMessages = this.convertMessages(request.messages);
    const payload: OpenAIResponsesRequest = {
      model: modelName,
      input: this.toOpenAIResponsesInput(providerMessages),
      tools: request.capabilities.toolCalling ? this.buildOpenAIResponsesToolDefinitions(request.options) : undefined,
      tool_choice: request.capabilities.toolCalling ? this.buildToolChoice(request.options) : undefined,
      temperature: 0.7,
      top_p: 0.9,
      max_output_tokens: DEFAULT_MAX_TOKENS
    };

    try {
      const requestInit = this.buildRequestInit(apiKey, 'openai-responses', token);
      const response = await this.withOptionalV1Retry(vendor, baseUrl, retryBaseUrl => (
        this.postWithRetry(`${retryBaseUrl}/responses`, payload, requestInit)
      ));
      const parsed = this.parseOpenAIResponsesResponse(response);
      const responseParts = this.buildResponseParts(parsed.content, parsed.toolCalls);

      async function* streamText(text: string): AsyncIterable<string> {
        if (text.trim().length > 0) {
          yield text;
        }
      }

      async function* streamParts(parts: vscode.LanguageModelResponsePart[]): AsyncIterable<vscode.LanguageModelResponsePart> {
        for (const part of parts) {
          yield part;
        }
      }

      const result: vscode.LanguageModelChatResponse = {
        stream: streamParts(responseParts),
        text: streamText(parsed.content)
      };

      if (response.usage) {
        (result as any).promptTokens = response.usage.input_tokens;
        (result as any).completionTokens = response.usage.output_tokens;
        (result as any).totalTokens = response.usage.total_tokens
          ?? ((response.usage.input_tokens || 0) + (response.usage.output_tokens || 0));
      }

      return result;
    } catch (error: any) {
      throw this.toProviderError(error);
    }
  }

  private async sendAnthropicRequest(
    request: GenericChatRequest,
    vendor: VendorConfig,
    modelName: string,
    baseUrl: string,
    apiKey: string,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const providerMessages = this.convertMessages(request.messages);
    const { system, messages } = this.toAnthropicMessages(providerMessages);
    const tools = request.capabilities.toolCalling ? this.buildAnthropicToolDefinitions(request.options) : undefined;
    const payload: AnthropicChatRequest = {
      model: modelName,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: system || undefined,
      messages,
      tools,
      tool_choice: tools ? this.buildAnthropicToolChoice(request.options) : undefined
    };

    try {
      const requestInit = this.buildRequestInit(apiKey, 'anthropic', token);
      const response = await this.withOptionalV1Retry(vendor, baseUrl, retryBaseUrl => (
        this.postWithRetry(`${retryBaseUrl}/messages`, payload, requestInit)
      ));
      const parsed = this.parseAnthropicResponse(response);
      const responseParts = this.buildResponseParts(parsed.content, parsed.toolCalls);

      async function* streamText(text: string): AsyncIterable<string> {
        if (text.trim().length > 0) {
          yield text;
        }
      }

      async function* streamParts(parts: vscode.LanguageModelResponsePart[]): AsyncIterable<vscode.LanguageModelResponsePart> {
        for (const part of parts) {
          yield part;
        }
      }

      const result: vscode.LanguageModelChatResponse = {
        stream: streamParts(responseParts),
        text: streamText(parsed.content)
      };

      if (response.usage) {
        const promptTokens = response.usage.input_tokens;
        const completionTokens = response.usage.output_tokens;
        (result as any).promptTokens = promptTokens;
        (result as any).completionTokens = completionTokens;
        if (typeof promptTokens === 'number' || typeof completionTokens === 'number') {
          (result as any).totalTokens = (promptTokens || 0) + (completionTokens || 0);
        }
      }

      return result;
    } catch (error: any) {
      throw this.toProviderError(error);
    }
  }

  private async postWithRetry(
    url: string,
    payload: unknown,
    requestInit: RequestInit
  ): Promise<any> {
    const maxRetries = 2;
    let attempt = 0;

    while (true) {
      try {
        const response = await this.fetchJson<any>(url, {
          ...requestInit,
          method: 'POST',
          body: JSON.stringify(payload)
        });
        return response.data;
      } catch (error: any) {
        if (this.isAbortError(error)) {
          throw error;
        }

        const status = error?.response?.status;
        const shouldRetry = (status === 429 || (typeof status === 'number' && status >= 500)) && attempt < maxRetries;
        if (!shouldRetry) {
          throw error;
        }

        const delayMs = 800 * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        attempt += 1;
      }
    }
  }

  private async withOptionalV1Retry<T>(
    vendor: VendorConfig,
    baseUrl: string,
    execute: (resolvedBaseUrl: string) => Promise<T>
  ): Promise<T> {
    let currentBaseUrl = baseUrl;
    let retriedWithV1 = false;

    while (true) {
      try {
        return await execute(currentBaseUrl);
      } catch (error: any) {
        if (retriedWithV1 || !this.shouldOfferV1Retry(currentBaseUrl, error)) {
          throw error;
        }

        const retryTarget = await this.promptToAppendV1(vendor, currentBaseUrl);
        if (!retryTarget) {
          throw error;
        }

        currentBaseUrl = retryTarget.baseUrl;
        vendor = retryTarget.vendor;
        retriedWithV1 = true;
      }
    }
  }

  private shouldOfferV1Retry(baseUrl: string, error: any): boolean {
    if (error?.response?.status !== 404) {
      return false;
    }

    try {
      const url = new URL(baseUrl);
      return this.canAppendV1ToBaseUrl(url);
    } catch {
      return false;
    }
  }

  private canAppendV1ToBaseUrl(url: URL): boolean {
    const segments = url.pathname
      .split('/')
      .map(segment => segment.trim().toLowerCase())
      .filter(segment => segment.length > 0);

    if (segments.includes('v1')) {
      return false;
    }

    return segments.length === 0 || (segments.length === 1 && segments[0] === 'api');
  }

  private buildBaseUrlWithV1(baseUrl: string): string {
    const url = new URL(baseUrl);
    const pathname = url.pathname.replace(/\/$/, '');
    url.pathname = pathname + '/v1';
    return url.toString().replace(/\/$/, '');
  }

  private async promptToAppendV1(vendor: VendorConfig, baseUrl: string): Promise<RetryWithV1PromptResult | undefined> {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      return undefined;
    }

    if (!this.canAppendV1ToBaseUrl(url)) {
      return undefined;
    }

    const nextBaseUrl = this.buildBaseUrlWithV1(baseUrl);
    const action = this.getRetryWithV1ActionLabel();
    const picked = await vscode.window.showWarningMessage(
      this.getRetryWithV1PromptText(vendor.name, nextBaseUrl),
      action
    );

    if (picked !== action) {
      return undefined;
    }

    await this.configStore.updateVendorBaseUrl(vendor.name, nextBaseUrl);
    return {
      baseUrl: nextBaseUrl,
      vendor: {
        ...vendor,
        baseUrl: nextBaseUrl
      }
    };
  }

  private getRetryWithV1PromptText(vendorName: string, nextBaseUrl: string): string {
    const message = getMessage('retryWithV1Prompt', vendorName, nextBaseUrl);
    if (message !== 'retryWithV1Prompt') {
      return message;
    }

    if (isChinese()) {
      return `${vendorName} 请求返回 404，当前 baseUrl 可能缺少 /v1。是否改为 ${nextBaseUrl} 并立即重试？`;
    }

    return `${vendorName} returned 404. The current baseUrl may be missing /v1. Update it to ${nextBaseUrl} and retry now?`;
  }

  private getRetryWithV1ActionLabel(): string {
    const action = getMessage('retryWithV1Action');
    if (action !== 'retryWithV1Action') {
      return action;
    }

    return isChinese() ? '添加 /v1 并重试' : 'Add /v1 and retry';
  }

  private buildRequestInit(
    apiKey: string,
    apiStyle: 'openai-chat' | 'openai-responses' | 'anthropic',
    token?: vscode.CancellationToken
  ): RequestInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    if (apiStyle === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const init: RequestInit = { headers };

    if (token) {
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      init.signal = controller.signal;
    }

    return init;
  }

  private toProviderError(error: any): vscode.LanguageModelError {
    const detail = this.readApiErrorMessage(error);
    const compactDetail = detail ? getCompactErrorMessage(detail) : undefined;
    const apiErrorType = this.readApiErrorType(error);

    if (this.isAbortError(error)) {
      return new vscode.LanguageModelError(getMessage('requestCancelled'));
    }

    if (error.response?.status === 401 || error.response?.status === 403 || apiErrorType === 'authentication_error' || apiErrorType === 'permission_error') {
      return new vscode.LanguageModelError(compactDetail || getMessage('apiKeyInvalid'));
    }
    if (error.response?.status === 429 || apiErrorType === 'rate_limit_error') {
      return vscode.LanguageModelError.Blocked(
        compactDetail ? `${getMessage('rateLimitExceeded')}: ${compactDetail}` : getMessage('rateLimitExceeded')
      );
    }
    if (error.response?.status === 400 || apiErrorType === 'invalid_request_error') {
      const invalidDetail = compactDetail || getCompactErrorMessage(error.response.data?.error?.message || '');
      return new vscode.LanguageModelError(getMessage('invalidRequest', invalidDetail));
    }

    const message = compactDetail || getCompactErrorMessage(error) || getMessage('unknownError');
    return new vscode.LanguageModelError(getMessage('requestFailed', message));
  }

  private readApiErrorMessage(error: any): string | undefined {
    const responseData = error?.response?.data;
    if (!responseData) {
      return undefined;
    }

    const message = responseData?.error?.message || responseData?.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }

    if (typeof responseData === 'string' && responseData.trim().length > 0) {
      return responseData.trim();
    }

    return undefined;
  }

  private readApiErrorType(error: any): string | undefined {
    const type = error?.response?.data?.error?.type;
    if (typeof type === 'string' && type.trim().length > 0) {
      return type.trim();
    }
    return undefined;
  }

  private buildAnthropicToolDefinitions(
    options?: vscode.LanguageModelChatRequestOptions
  ): AnthropicToolDefinition[] | undefined {
    const tools = this.buildToolDefinitions(options);
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters
    }));
  }

  private buildAnthropicToolChoice(
    options?: vscode.LanguageModelChatRequestOptions
  ): AnthropicToolChoice | undefined {
    if (!options?.tools || options.tools.length === 0) {
      return undefined;
    }

    if (options.toolMode === vscode.LanguageModelChatToolMode.Required) {
      return { type: 'any' };
    }

    return { type: 'auto' };
  }

  private buildOpenAIResponsesToolDefinitions(
    options?: vscode.LanguageModelChatRequestOptions
  ): OpenAIResponsesToolDefinition[] | undefined {
    const tools = this.buildToolDefinitions(options);
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map(tool => ({
      type: 'function',
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    }));
  }

  private toOpenAIResponsesInput(messages: ChatMessage[]): OpenAIResponsesInputItem[] {
    const input: OpenAIResponsesInputItem[] = [];

    for (const message of messages) {
      if (message.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: message.tool_call_id || this.generateToolCallId(),
          output: message.content
        });
        continue;
      }

      if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
        if (message.content.trim().length > 0) {
          input.push({
            type: 'message',
            role: 'assistant',
            content: message.content
          });
        }

        for (const toolCall of message.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: toolCall.id || this.generateToolCallId(),
            name: toolCall.function.name,
            arguments: toolCall.function.arguments
          });
        }
        continue;
      }

      input.push({
        type: 'message',
        role: message.role,
        content: message.content
      });
    }

    return input;
  }

  private parseOpenAIResponsesResponse(response: OpenAIResponsesResponse): { content: string; toolCalls: ChatToolCall[] } {
    const textParts: string[] = [];
    const toolCalls: ChatToolCall[] = [];

    for (const item of response.output ?? []) {
      if (item.type === 'function_call' && typeof item.name === 'string' && item.name.trim().length > 0) {
        toolCalls.push({
          id: typeof item.call_id === 'string' && item.call_id.trim().length > 0 ? item.call_id : this.generateToolCallId(),
          type: 'function',
          function: {
            name: item.name,
            arguments: typeof item.arguments === 'string' ? item.arguments : '{}'
          }
        });
        continue;
      }

      if (item.type === 'message') {
        for (const contentPart of item.content ?? []) {
          if ((contentPart.type === 'output_text' || contentPart.type === 'text') && typeof contentPart.text === 'string' && contentPart.text.trim().length > 0) {
            textParts.push(contentPart.text);
          }
        }
      }
    }

    if (textParts.length === 0 && typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
      textParts.push(response.output_text);
    }

    return {
      content: textParts.join(''),
      toolCalls
    };
  }

  private toAnthropicMessages(messages: ChatMessage[]): { system: string; messages: AnthropicChatMessage[] } {
    const systemParts: string[] = [];
    const normalizedMessages: AnthropicChatMessage[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        if (message.content.trim().length > 0) {
          systemParts.push(message.content);
        }
        continue;
      }

      if (message.role === 'tool') {
        normalizedMessages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: message.tool_call_id || this.generateToolCallId(),
            content: message.content
          }]
        });
        continue;
      }

      if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
        const contentBlocks: AnthropicRequestContentBlock[] = [];
        if (message.content.trim().length > 0) {
          contentBlocks.push({ type: 'text', text: message.content });
        }
        for (const toolCall of message.tool_calls) {
          contentBlocks.push({
            type: 'tool_use',
            id: toolCall.id || this.generateToolCallId(),
            name: toolCall.function.name,
            input: this.parseToolArgumentsSafe(toolCall.function.arguments)
          });
        }
        normalizedMessages.push({ role: 'assistant', content: contentBlocks });
        continue;
      }

      const role = message.role === 'assistant' ? 'assistant' : 'user';
      normalizedMessages.push({ role, content: message.content });
    }

    return {
      system: systemParts.join('\n\n').trim(),
      messages: normalizedMessages
    };
  }

  private parseAnthropicResponse(response: AnthropicChatResponse): { content: string; toolCalls: ChatToolCall[] } {
    const textParts: string[] = [];
    const toolCalls: ChatToolCall[] = [];

    for (const block of response.content ?? []) {
      if (block.type === 'text') {
        if (typeof block.text === 'string' && block.text.trim().length > 0) {
          textParts.push(block.text);
        }
        continue;
      }

      if (block.type === 'tool_use' && typeof block.name === 'string' && block.name.trim().length > 0) {
        toolCalls.push({
          id: typeof block.id === 'string' && block.id.trim().length > 0 ? block.id : this.generateToolCallId(),
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {})
          }
        });
      }
    }

    return {
      content: textParts.join(''),
      toolCalls
    };
  }

  private parseToolArgumentsSafe(rawArgs: string): object {
    if (!rawArgs) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawArgs);
      if (parsed && typeof parsed === 'object') {
        return parsed as object;
      }
      return { value: parsed };
    } catch {
      return { raw: rawArgs };
    }
  }

  private generateToolCallId(): string {
    return `tool_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  private isAbortError(error: any): boolean {
    return !!error && typeof error === 'object' && error.name === 'AbortError';
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<{ data: T; status: number }> {
    const response = await fetch(url, init);
    const data = await this.readResponseData(response);

    if (!response.ok) {
      const error: any = new Error(`Request failed with status ${response.status}`);
      error.response = { status: response.status, data };
      throw error;
    }

    return { data: data as T, status: response.status };
  }

  private async readResponseData(response: Response): Promise<any> {
    const text = await response.text();
    if (!text) {
      return undefined;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

