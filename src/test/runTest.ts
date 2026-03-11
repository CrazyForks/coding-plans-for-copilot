import assert from 'node:assert/strict';

type ConfigChangeListener = (event: { affectsConfiguration: (section: string) => boolean }) => void;

type UpdateCall = {
  key: string;
  value: unknown;
  target: unknown;
};

type VendorModelRecord = {
  name: string;
  description?: string;
  capabilities?: {
    tools?: boolean;
    vision?: boolean;
  };
  contextSize?: number;
};

type VendorRecord = {
  name: string;
  baseUrl: string;
  models: VendorModelRecord[];
};

type MockState = {
  vendors: unknown[];
  updates: UpdateCall[];
  listeners: Set<ConfigChangeListener>;
};

type ConfigStoreModule = typeof import('../config/configStore');
type ConfigStoreCtor = ConfigStoreModule['ConfigStore'];

type TestContext = {
  state: MockState;
  changeCount: () => number;
};

type TestCase = {
  name: string;
  initialVendors: VendorRecord[];
  discoveredModels?: VendorModelRecord[];
  run?: (configStore: InstanceType<ConfigStoreCtor>) => Promise<void>;
  verify: (context: TestContext) => void;
};

class FakeDisposable {
  constructor(private readonly callback: () => void = () => {}) {}

  dispose(): void {
    this.callback();
  }
}

class FakeEventEmitter<T> {
  private listeners = new Set<(event: T) => void>();

  public readonly event = (listener: (event: T) => void): FakeDisposable => {
    this.listeners.add(listener);
    return new FakeDisposable(() => {
      this.listeners.delete(listener);
    });
  };

  fire(event: T): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

function createState(vendors: unknown[]): MockState {
  return {
    vendors,
    updates: [],
    listeners: new Set<ConfigChangeListener>()
  };
}

let activeState = createState([]);

function createVscodeMock() {
  const configurationTarget = {
    WorkspaceFolder: 1,
    Workspace: 2,
    Global: 3
  };

  return {
    EventEmitter: FakeEventEmitter,
    Disposable: FakeDisposable,
    ConfigurationTarget: configurationTarget,
    workspace: {
      onDidChangeConfiguration(listener: ConfigChangeListener): FakeDisposable {
        activeState.listeners.add(listener);
        return new FakeDisposable(() => {
          activeState.listeners.delete(listener);
        });
      },
      getConfiguration(section: string) {
        assert.equal(section, 'coding-plans');
        return {
          get<T>(key: string, defaultValue: T): T {
            return key === 'vendors' ? (activeState.vendors as T) : defaultValue;
          },
          inspect<T>(key: string): { globalValue: T } {
            assert.equal(key, 'vendors');
            return { globalValue: activeState.vendors as T };
          },
          async update(key: string, value: unknown, target: unknown): Promise<void> {
            activeState.updates.push({ key, value, target });
            if (key === 'vendors') {
              activeState.vendors = value as unknown[];
              for (const listener of [...activeState.listeners]) {
                listener({
                  affectsConfiguration(changedSection: string): boolean {
                    return changedSection === 'coding-plans.vendors';
                  }
                });
              }
            }
          }
        };
      }
    }
  };
}

function installVscodeMock(): () => void {
  const moduleLoader = require('node:module') as Record<string, unknown>;
  const originalLoad = moduleLoader['_load'] as (request: string, parent: unknown, isMain: boolean) => unknown;
  const vscodeMock = createVscodeMock();

  moduleLoader['_load'] = function patchedLoad(request: string, parent: unknown, isMain: boolean): unknown {
    if (request === 'vscode') {
      return vscodeMock;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  return () => {
    moduleLoader['_load'] = originalLoad;
  };
}

function createExtensionContext(): { secrets: { get(): Promise<undefined>; store(): Promise<void>; delete(): Promise<void>; }; } {
  return {
    secrets: {
      async get(): Promise<undefined> {
        return undefined;
      },
      async store(): Promise<void> {
        return undefined;
      },
      async delete(): Promise<void> {
        return undefined;
      }
    }
  };
}

function createVendorWithSpacedModelName(): VendorRecord {
  return {
    name: 'Vendor',
    baseUrl: 'https://example.test/v1',
    models: [
      {
        name: ' gpt-4o ',
        description: 'Keep me',
        capabilities: { tools: true, vision: false },
        contextSize: 128000
      }
    ]
  };
}

function getUpdatedVendor(state: MockState): VendorRecord {
  return (state.vendors as VendorRecord[])[0];
}

function verifyNoWriteback(context: TestContext, message: string): void {
  assert.equal(context.state.updates.length, 0, `${message}时不应写回 vendors 配置`);
  assert.equal(context.changeCount(), 0, `${message}时不应触发 ConfigStore 变更事件`);
}

const testCases: TestCase[] = [
  {
    name: '仅名称前后空格不同不写回',
    initialVendors: [createVendorWithSpacedModelName()],
    discoveredModels: [{ name: 'gpt-4o' }],
    verify(context) {
      verifyNoWriteback(context, '仅名称空格差异');
    }
  },
  {
    name: '仅大小写不同不写回',
    initialVendors: [
      {
        name: 'Vendor',
        baseUrl: 'https://example.test/v1',
        models: [
          {
            name: 'GPT-4o',
            description: 'Case stable',
            capabilities: { tools: true, vision: false },
            contextSize: 128000
          }
        ]
      }
    ],
    discoveredModels: [{ name: 'gpt-4o' }],
    verify(context) {
      verifyNoWriteback(context, '仅名称大小写差异');
    }
  },
  {
    name: '成员变化时规范化旧名称并保留字段',
    initialVendors: [createVendorWithSpacedModelName()],
    discoveredModels: [{ name: 'gpt-4o' }, { name: 'gpt-4.1' }],
    verify(context) {
      assert.equal(context.state.updates.length, 1, '成员变化时应写回一次 vendors 配置');
      assert.equal(context.changeCount(), 2, '成员变化时应触发两次 ConfigStore 变更事件（配置变更 + 手动通知）');

      const updatedVendor = getUpdatedVendor(context.state);
      const existingModel = updatedVendor.models.find(model => model.name === 'gpt-4o');
      const newModel = updatedVendor.models.find(model => model.name === 'gpt-4.1');

      assert.ok(existingModel, '已有模型应保留且名称被规范化');
      assert.equal(existingModel?.description, 'Keep me');
      assert.deepEqual(existingModel?.capabilities, { tools: true, vision: false });
      assert.equal(existingModel?.contextSize, 128000);
      assert.ok(newModel, '新模型应被追加到配置中');
      assert.equal(newModel?.description, undefined);
      assert.ok(!updatedVendor.models.some(model => model.name === ' gpt-4o '), '写回配置时不应保留带空格名称');
    }
  },
  {
    name: '新增模型写回时保留发现到的字段',
    initialVendors: [createVendorWithSpacedModelName()],
    discoveredModels: [
      { name: 'gpt-4o' },
      {
        name: 'gpt-4.1',
        description: 'Fresh from /models',
        capabilities: { tools: true, vision: true },
        contextSize: 256000
      }
    ],
    verify(context) {
      assert.equal(context.state.updates.length, 1, '新增模型时应写回一次 vendors 配置');

      const updatedVendor = getUpdatedVendor(context.state);
      const newModel = updatedVendor.models.find(model => model.name === 'gpt-4.1');

      assert.ok(newModel, '新增模型应被写回到配置');
      assert.equal(newModel?.description, 'Fresh from /models');
      assert.deepEqual(newModel?.capabilities, { tools: true, vision: true });
      assert.equal(newModel?.contextSize, 256000);
    }
  },
  {
    name: '重复刷新两次后不再写回',
    initialVendors: [createVendorWithSpacedModelName()],
    async run(configStore) {
      await configStore.updateVendorModels('Vendor', [{ name: 'gpt-4o' }, { name: 'gpt-4.1' }]);
      await configStore.updateVendorModels('Vendor', [{ name: 'gpt-4o' }, { name: 'gpt-4.1' }]);
    },
    verify(context) {
      assert.equal(context.state.updates.length, 1, '同一发现结果连续刷新两次时只应写回一次');
      assert.equal(context.changeCount(), 2, '第二次刷新不应再触发新的 ConfigStore 变更事件');

      const updatedVendor = getUpdatedVendor(context.state);
      assert.ok(updatedVendor.models.some(model => model.name === 'gpt-4o'), '第一次刷新后的规范化名称应被保留');
      assert.ok(updatedVendor.models.some(model => model.name === 'gpt-4.1'), '第一次刷新新增的模型应被保留');
      assert.ok(!updatedVendor.models.some(model => model.name === ' gpt-4o '), '第二次刷新后仍不应写回带空格名称');
    }
  },
  {
    name: '首次稳定顺序后相同集合换序不写回',
    initialVendors: [createVendorWithSpacedModelName()],
    async run(configStore) {
      await configStore.updateVendorModels('Vendor', [{ name: 'gpt-4o' }, { name: 'gpt-4.1' }]);
      await configStore.updateVendorModels('Vendor', [{ name: 'gpt-4.1' }, { name: 'gpt-4o' }]);
    },
    verify(context) {
      assert.equal(context.state.updates.length, 1, '相同集合仅顺序变化时第二次刷新不应再次写回');
      assert.equal(context.changeCount(), 2, '相同集合仅顺序变化时第二次刷新不应新增事件');

      const updatedVendor = getUpdatedVendor(context.state);
      assert.deepEqual(
        updatedVendor.models.map(model => model.name),
        ['gpt-4.1', 'gpt-4o'],
        '第一次刷新后模型顺序应稳定，第二次换序不应改写顺序'
      );
    }
  },
  {
    name: '发现列表含重复模型名时只写回一次且结果去重',
    initialVendors: [createVendorWithSpacedModelName()],
    async run(configStore) {
      await configStore.updateVendorModels('Vendor', [
        { name: 'gpt-4o' },
        { name: 'gpt-4.1' },
        { name: 'gpt-4o' },
        { name: 'GPT-4.1' }
      ]);
      await configStore.updateVendorModels('Vendor', [
        { name: 'gpt-4o' },
        { name: 'gpt-4.1' },
        { name: 'gpt-4o' },
        { name: 'GPT-4.1' }
      ]);
    },
    verify(context) {
      assert.equal(context.state.updates.length, 1, '发现列表有重复模型名时只应写回一次');
      assert.equal(context.changeCount(), 2, '第二次相同重复发现结果不应新增事件');

      const updatedVendor = getUpdatedVendor(context.state);
      assert.deepEqual(
        updatedVendor.models.map(model => model.name),
        ['gpt-4.1', 'gpt-4o'],
        '写回配置时应按名称去重并保持稳定顺序'
      );
    }
  },
  {
    name: '发现列表含空名称时被忽略且不影响幂等',
    initialVendors: [createVendorWithSpacedModelName()],
    async run(configStore) {
      await configStore.updateVendorModels('Vendor', [
        { name: 'gpt-4o' },
        { name: '' },
        { name: '   ' },
        { name: 'gpt-4.1' }
      ]);
      await configStore.updateVendorModels('Vendor', [
        { name: 'gpt-4o' },
        { name: '   ' },
        { name: '' },
        { name: 'gpt-4.1' }
      ]);
    },
    verify(context) {
      assert.equal(context.state.updates.length, 1, '空名称和空白名称不应导致额外写回');
      assert.equal(context.changeCount(), 2, '第二次仅空名称顺序变化时不应新增事件');

      const updatedVendor = getUpdatedVendor(context.state);
      assert.deepEqual(
        updatedVendor.models.map(model => model.name),
        ['gpt-4.1', 'gpt-4o'],
        '空名称和空白名称应被忽略，最终结果只保留有效模型'
      );
    }
  },
  {
    name: '未知 vendor 名称时不写回且不触发事件',
    initialVendors: [createVendorWithSpacedModelName()],
    async run(configStore) {
      await configStore.updateVendorModels('Unknown Vendor', [
        { name: 'gpt-4o' },
        { name: 'gpt-4.1' }
      ]);
    },
    verify(context) {
      assert.equal(context.state.updates.length, 0, '未知 vendor 名称时不应写回 vendors 配置');
      assert.equal(context.changeCount(), 0, '未知 vendor 名称时不应触发 ConfigStore 变更事件');

      const updatedVendor = getUpdatedVendor(context.state);
      assert.deepEqual(
        updatedVendor.models.map(model => model.name),
        [' gpt-4o '],
        '未知 vendor 名称时应保持原始配置不变'
      );
    }
  },
  {
    name: '空 vendorName 时直接 no-op',
    initialVendors: [createVendorWithSpacedModelName()],
    async run(configStore) {
      await configStore.updateVendorModels('', [
        { name: 'gpt-4o' },
        { name: 'gpt-4.1' }
      ]);
      await configStore.updateVendorModels('   ', [
        { name: 'gpt-4o' },
        { name: 'gpt-4.1' }
      ]);
    },
    verify(context) {
      assert.equal(context.state.updates.length, 0, '空 vendorName 或空白 vendorName 时不应写回 vendors 配置');
      assert.equal(context.changeCount(), 0, '空 vendorName 或空白 vendorName 时不应触发 ConfigStore 变更事件');

      const updatedVendor = getUpdatedVendor(context.state);
      assert.deepEqual(
        updatedVendor.models.map(model => model.name),
        [' gpt-4o '],
        '空 vendorName 或空白 vendorName 时应保持原始配置不变'
      );
    }
  },
  {
    name: 'models 为空数组时清空已有模型且二次调用幂等',
    initialVendors: [createVendorWithSpacedModelName()],
    async run(configStore) {
      await configStore.updateVendorModels('Vendor', []);
      await configStore.updateVendorModels('Vendor', []);
    },
    verify(context) {
      assert.equal(context.state.updates.length, 1, '首次传入空数组时应只写回一次以清空模型');
      assert.equal(context.changeCount(), 2, '二次传入空数组时不应新增事件');

      const updatedVendor = getUpdatedVendor(context.state);
      assert.deepEqual(updatedVendor.models, [], '传入空数组时应正确清空已有模型');
    }
  }
];

async function runTestCase(configStoreCtor: ConfigStoreCtor, testCase: TestCase): Promise<void> {
  activeState = createState(testCase.initialVendors);

  const configStore = new configStoreCtor(createExtensionContext() as never);
  let changeCount = 0;
  const subscription = configStore.onDidChange(() => {
    changeCount += 1;
  });

  try {
    if (testCase.run) {
      await testCase.run(configStore as InstanceType<ConfigStoreCtor>);
    } else {
      await configStore.updateVendorModels('Vendor', testCase.discoveredModels ?? []);
    }

    testCase.verify({
      state: activeState,
      changeCount: () => changeCount
    });
    console.log(`PASS ${testCase.name}`);
  } finally {
    subscription.dispose();
    configStore.dispose();
  }
}

async function main(): Promise<void> {
  const restore = installVscodeMock();
  try {
    const { ConfigStore } = require('../config/configStore') as ConfigStoreModule;
    for (const testCase of testCases) {
      await runTestCase(ConfigStore, testCase);
    }
  } finally {
    restore();
  }

  console.log('ConfigStore tests passed.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});






