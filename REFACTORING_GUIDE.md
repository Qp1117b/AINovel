# 小说创作工作流引擎 - 架构设计文档

## 1. 设计目标

参考 ComfyUI 的节点式架构，设计一个专业的小说创作工作流系统。

### 1.1 核心原则

| 原则 | 说明 |
|------|------|
| **节点化** | 每个功能单元都是独立的节点，可组合、可复用 |
| **数据流驱动** | 数据沿连接流动，触发节点执行 |
| **可视化编辑** | 图形化的工作流编辑器 |
| **声明式配置** | 工作流以 JSON 格式声明，易于存储和分享 |
| **可扩展** | 新节点类型可轻松添加 |

### 1.2 对比

| 维度 | 当前系统 | 目标系统 |
|------|---------|---------|
| 架构 | 线性脚本 | 节点图 |
| 执行 | 硬编码顺序 | 数据流驱动 |
| 可视化 | 简单列表 | Canvas 编辑器 |
| 分支 | 隐式 if-else | 显式分支节点 |
| 扩展 | 修改源码 | 添加节点类 |
| 调试 | console.log | 执行高亮追踪 |

---

## 2. 核心数据结构

### 2.1 节点 (Node)

```typescript
interface NodePort {
  id: string;           // 端口唯一标识
  name: string;         // 显示名称
  type: 'string' | 'image' | 'audio' | 'array' | 'object' | 'any';
  direction: 'input' | 'output';
  required: boolean;    // 是否必需
  defaultValue?: any;   // 默认值
}

interface NodeDefinition {
  id: string;           // 节点实例ID
  type: string;         // 节点类型
  position: { x: number; y: number }; // 编辑器中的位置
  inputs: Record<string, any>;  // 输入值（连接或常量）
  params: Record<string, any>;   // 节点参数配置
  outputs: Record<string, any>;  // 输出值（执行后填充）
  state: 'idle' | 'running' | 'completed' | 'error';
}

interface NodeSpec {
  type: string;                    // 节点类型标识
  category: string;                 // 分类：llm/image/audio/control/io
  name: string;                     // 显示名称
  description: string;              // 说明
  inputs: NodePort[];               // 输入端口定义
  outputs: NodePort[];              // 输出端口定义
  params: ParamSpec[];              // 参数定义
  defaultParams: Record<string, any>; // 默认参数
  compute: (node: NodeDefinition, context: ExecutionContext) => Promise<void>;
}
```

### 2.2 连接 (Connection)

```typescript
interface Connection {
  id: string;
  fromNode: string;      // 源节点ID
  fromPort: string;      // 源端口名
  toNode: string;        // 目标节点ID
  toPort: string;        // 目标端口名
}
```

### 2.3 工作流 (Workflow)

```typescript
interface Workflow {
  id: string;
  name: string;
  version: string;
  nodes: NodeDefinition[];
  connections: Connection[];
  metadata: {
    created: number;
    modified: number;
    author: string;
    description: string;
  };
}
```

---

## 3. 节点类型体系

### 3.1 分类

| 分类 | 说明 | 节点类型 |
|------|------|---------|
| **LLM** | 大语言模型 | LLMNode, PromptNode, TemplateNode |
| **Image** | 图像生成 | ImageGenerator, ImageFusion, ImageVariator |
| **Audio** | 音频处理 | AudioGenerator, VoiceClone, AudioEditor |
| **Control** | 流程控制 | BranchNode, LoopNode, MergeNode, DelayNode |
| **IO** | 输入输出 | UserInput, StateBook, ChapterOutput, MemoryNode |
| **Utility** | 工具 | TextParser, JsonParser, VariableNode |

### 3.2 核心节点定义

#### LLM 节点
```typescript
const LLMNodeSpec: NodeSpec = {
  type: 'llm',
  category: 'llm',
  name: 'LLM 执行器',
  description: '调用 LLM API 生成文本',
  inputs: [
    { id: 'prompt', name: '提示词', type: 'string', direction: 'input', required: true },
    { id: 'system', name: '系统提示', type: 'string', direction: 'input', required: false },
  ],
  outputs: [
    { id: 'result', name: '结果', type: 'string', direction: 'output' },
    { id: 'tokens', name: 'Token数', type: 'object', direction: 'output' },
  ],
  params: [
    { id: 'model', name: '模型', type: 'select', options: [...], default: 'gpt-4' },
    { id: 'temperature', name: '温度', type: 'float', min: 0, max: 2, default: 0.7 },
  ],
  async compute(node, ctx) {
    const result = await ctx.callAPI('text', {
      model: node.params.model,
      prompt: node.inputs.prompt,
      system: node.inputs.system,
      temperature: node.params.temperature,
    });
    node.outputs.result = result.text;
    node.outputs.tokens = { input: result.tokensIn, output: result.tokensOut };
  }
};
```

#### 分支节点
```typescript
const BranchNodeSpec: NodeSpec = {
  type: 'branch',
  category: 'control',
  name: '条件分支',
  description: '根据条件选择执行路径',
  inputs: [
    { id: 'condition', name: '条件', type: 'string', direction: 'input', required: true },
    { id: 'trueInput', name: 'True分支', type: 'any', direction: 'input', required: false },
    { id: 'falseInput', name: 'False分支', type: 'any', direction: 'input', required: false },
  ],
  outputs: [
    { id: 'trueOutput', name: 'True输出', type: 'any', direction: 'output' },
    { id: 'falseOutput', name: 'False输出', type: 'any', direction: 'output' },
  ],
  params: [
    { id: 'conditionType', name: '条件类型', type: 'select', 
      options: ['contains', 'equals', 'regex', 'exists', 'custom'], default: 'contains' },
    { id: 'pattern', name: '匹配模式', type: 'string', default: '' },
  ],
  async compute(node, ctx) {
    const condition = node.inputs.condition;
    const result = this.evaluateCondition(condition, node.params);
    node.outputs.trueOutput = result ? node.inputs.trueInput : undefined;
    node.outputs.falseOutput = result ? undefined : node.inputs.falseInput;
  }
};
```

---

## 4. 执行引擎

### 4.1 执行上下文

```typescript
class ExecutionContext {
  workflow: Workflow;
  nodeStates: Map<string, NodeState>;
  dataFlow: Map<string, any>;        // 节点输出数据缓存
  abortSignal: AbortSignal;
  eventBus: EventEmitter;
  
  // API 调用
  async callAPI(type: 'text' | 'image' | 'audio', config: any): Promise<any>;
  
  // 数据存取
  getPortValue(nodeId: string, portId: string): any;
  setPortValue(nodeId: string, portId: string, value: any): void;
  
  // 状态查询
  isNodeReady(nodeId: string): boolean;
  getExecutionQueue(): string[];
}
```

### 4.2 执行流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        执行流程                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 解析工作流 ──▶ 构建依赖图                                         │
│         │                                                           │
│         ▼                                                           │
│  2. 拓扑排序 ──▶ 确定执行顺序                                         │
│         │                                                           │
│         ▼                                                           │
│  3. 执行循环                                                         │
│     ┌────────────────────────────────────────┐                       │
│     │  a. 找到就绪节点（所有输入已就绪）        │                       │
│     │  b. 并行执行这些节点                     │                       │
│     │  c. 传播输出到下游节点                   │                       │
│     │  d. 更新节点状态                         │                       │
│     │  e. 检查是否有新就绪节点                  │                       │
│     └────────────────────────────────────────┘                       │
│         │                                                           │
│         ▼                                                           │
│  4. 完成或异常处理                                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 并行执行策略

```typescript
async executeWorkflow(workflow: Workflow) {
  const graph = this.buildDependencyGraph(workflow);
  const sorted = topologicalSort(graph);
  const readyQueue = new Set<string>();
  const pending = new Set<string>(sorted);
  const completed = new Set<string>();
  
  // 初始化：没有前置依赖的节点就绪
  for (const nodeId of sorted) {
    const deps = graph.getDependencies(nodeId);
    if (deps.length === 0) {
      readyQueue.add(nodeId);
    }
  }
  
  while (pending.size > 0) {
    if (this.aborted) throw new UserAbortError();
    
    // 获取所有就绪节点
    const currentBatch = this.getReadyBatch(readyQueue, completed);
    if (currentBatch.length === 0 && pending.size > 0) {
      // 死锁检测
      throw new DeadlockError('存在循环依赖或未满足的输入');
    }
    
    // 并行执行当前批次
    await Promise.all(currentBatch.map(nodeId => 
      this.executeNode(workflow.nodes[nodeId])
    ));
    
    // 更新状态
    currentBatch.forEach(id => {
      completed.add(id);
      readyQueue.delete(id);
      pending.delete(id);
    });
    
    // 传播输出，标记新的就绪节点
    for (const nodeId of pending) {
      if (this.isNodeReady(nodeId)) {
        readyQueue.add(nodeId);
      }
    }
    
    this.emit('progress', { completed, pending });
  }
}
```

---

## 5. 可视化编辑器

### 5.1 编辑器布局

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌─────────┐  小说创作工作流 v2.0    [保存] [运行] [导出]  ⚙️ 🔍 🔎   │
├───────────┼─────────────────────────────────────────────────────────┤
│           │                                                          │
│  节点面板  │                    Canvas 编辑区                          │
│  ┌─────┐  │     ┌───────┐         ┌───────┐         ┌───────┐      │
│  │LLM  │  │     │ Prompt├────────▶│  LLM  ├────────▶│ Output │      │
│  ├─────┤  │     └───────┘         └───────┘         └───────┘      │
│  │图像 │  │                                                          │
│  ├─────┤  │     ┌───────┐                                            │
│  │音频 │  │     │ Branch├────┬──▶ [图像生成]                         │
│  ├─────┤  │     └───┬───┘    │                                        │
│  │控制 │  │         │        └──▶ [音频生成]                         │
│  ├─────┤  │         ▼                                                │
│  │工具 │  │     ┌───────┐                                            │
│  └─────┘  │     │ Merge │                                            │
│           │     └───────┘                                            │
├───────────┴─────────────────────────────────────────────────────────┤
│  节点详情: LLM执行器 - 模型: GPT-4 | 温度: 0.7 | 最大Token: 2000     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 交互设计

| 操作 | 交互 |
|------|------|
| 创建节点 | 从面板拖拽到 Canvas |
| 连接 | 从输出端口拖拽到输入端口 |
| 删除连接 | 选中连接线，按 Delete |
| 移动节点 | 拖拽节点 |
| 选中多节点 | Shift+点击 或框选 |
| 缩放 | Ctrl+滚轮 |
| 平移 | 空格+拖拽 或 中键拖拽 |
| 撤销/重做 | Ctrl+Z / Ctrl+Shift+Z |

---

## 6. 配置格式

### 6.1 当前格式 vs 新格式

**当前格式（隐式依赖）：**
```json
{
  "agents": {
    "P1": { "inputs": ["S1.last"] },
    "W1": { "inputs": ["R1", "S1.last", "IA.last"] }
  },
  "workflowStages": [...]
}
```

**新格式（显式节点图）：**
```json
{
  "workflow": {
    "id": "novel-v2",
    "name": "互动小说创作流程",
    "nodes": [
      {
        "id": "summarizer-1",
        "type": "llm",
        "position": { "x": 100, "y": 100 },
        "params": { "role": "剧情概览师", "model": "gpt-4" },
        "inputs": {},
        "outputs": {}
      },
      {
        "id": "planner-1",
        "type": "llm",
        "position": { "x": 300, "y": 100 },
        "params": { "role": "剧情策划师" },
        "inputs": { "prompt": { "fromNode": "summarizer-1", "fromPort": "result" } },
        "outputs": {}
      },
      {
        "id": "branch-1",
        "type": "branch",
        "position": { "x": 500, "y": 100 },
        "params": { "conditionType": "contains", "pattern": "重要事件" },
        "inputs": { "condition": { "fromNode": "planner-1", "fromPort": "result" } },
        "outputs": {}
      }
    ],
    "connections": [
      { "from": "summarizer-1:result", "to": "planner-1:prompt" },
      { "from": "planner-1:result", "to": "branch-1:condition" }
    ]
  }
}
```

### 6.2 节点类型注册表

```typescript
const NODE_REGISTRY: Record<string, NodeSpec> = {
  // LLM 类
  'llm': LLMNodeSpec,
  'llm-template': LLMTemplateSpec,
  
  // 图像类
  'image-generator': ImageGeneratorSpec,
  'image-fusion': ImageFusionSpec,
  'image-variator': ImageVariatorSpec,
  
  // 音频类
  'audio-generator': AudioGeneratorSpec,
  'voice-clone': VoiceCloneSpec,
  'audio-editor': AudioEditorSpec,
  
  // 控制类
  'branch': BranchSpec,
  'loop': LoopSpec,
  'merge': MergeSpec,
  'switch': SwitchSpec,
  
  // IO 类
  'user-input': UserInputSpec,
  'state-book': StateBookSpec,
  'chapter-output': ChapterOutputSpec,
  'memory': MemorySpec,
  
  // 工具类
  'text-parser': TextParserSpec,
  'json-parser': JsonParserSpec,
  'variable': VariableSpec,
};
```

---

## 7. 实现计划

### Phase 1: 核心框架（2周）
- [ ] 节点基类和注册系统
- [ ] 连接和数据流管理
- [ ] 执行引擎
- [ ] 基本工作流验证

### Phase 2: 节点实现（2周）
- [ ] LLM 节点（通用生成）
- [ ] 图像生成节点（SD、DALL-E）
- [ ] 音频节点
- [ ] 控制节点（分支、循环）

### Phase 3: 可视化编辑器（2周）
- [ ] Canvas 渲染
- [ ] 节点拖拽和连接
- [ ] 面板和属性编辑
- [ ] 执行状态可视化

### Phase 4: 集成和迁移（1周）
- [ ] 与现有系统集成
- [ ] 配置格式迁移工具
- [ ] 测试和优化

---

## 8. 目录结构

```
novel-workflow-engine/
├── src/
│   ├── core/                      # 核心框架
│   │   ├── node.ts               # 节点基类
│   │   ├── connection.ts          # 连接管理
│   │   ├── workflow.ts           # 工作流定义
│   │   ├── executor.ts           # 执行引擎
│   │   └── registry.ts           # 节点注册表
│   │
│   ├── nodes/                     # 节点实现
│   │   ├── llm/                  # LLM 节点
│   │   │   ├── base.ts
│   │   │   ├── generator.ts
│   │   │   └── template.ts
│   │   ├── image/                # 图像节点
│   │   │   ├── generator.ts
│   │   │   ├── fusion.ts
│   │   │   └── variator.ts
│   │   ├── audio/                # 音频节点
│   │   │   ├── generator.ts
│   │   │   ├── voice.ts
│   │   │   └── editor.ts
│   │   ├── control/              # 控制节点
│   │   │   ├── branch.ts
│   │   │   ├── loop.ts
│   │   │   ├── merge.ts
│   │   │   └── switch.ts
│   │   └── io/                   # IO 节点
│   │       ├── user-input.ts
│   │       ├── state-book.ts
│   │       ├── chapter.ts
│   │       └── memory.ts
│   │
│   ├── editor/                    # 可视化编辑器
│   │   ├── canvas.ts             # Canvas 渲染
│   │   ├── node-renderer.ts       # 节点渲染
│   │   ├── connection-renderer.ts # 连接线渲染
│   │   ├── palette.ts            # 节点面板
│   │   ├── inspector.ts          # 属性检查器
│   │   └── toolbar.ts            # 工具栏
│   │
│   ├── storage/                   # 存储和序列化
│   │   ├── serializer.ts          # JSON 序列化
│   │   ├── migrator.ts           # 旧格式迁移
│   │   └── storage.ts             # 本地存储
│   │
│   └── utils/                     # 工具函数
│       ├── graph.ts              # 图算法
│       ├── event.ts              # 事件系统
│       └── debounce.ts           # 防抖
│
├── build/                         # 构建脚本
│   └── build.js
│
└── package.json
```

---

## 9. 向后兼容性

### 9.1 旧配置迁移

提供迁移工具，将旧格式配置转换为新格式：

```typescript
class ConfigMigrator {
  migrate(oldConfig: OldConfig): Workflow {
    const nodes: NodeDefinition[] = [];
    const connections: Connection[] = [];
    
    // 转换 Agent 为 LLM 节点
    for (const [key, agent] of Object.entries(oldConfig.agents)) {
      nodes.push(this.migrateAgent(key, agent));
    }
    
    // 转换隐式依赖为显式连接
    for (const [key, agent] of Object.entries(oldConfig.agents)) {
      for (const input of agent.inputs || []) {
        const sourceNode = this.resolveInputSource(input);
        if (sourceNode) {
          connections.push({
            from: sourceNode,
            fromPort: 'result',
            to: key,
            toPort: 'prompt'
          });
        }
      }
    }
    
    return { nodes, connections };
  }
}
```

### 9.2 混合模式

新系统支持两种模式：
1. **节点图模式**：完整的可视化编辑
2. **兼容模式**：加载旧配置，自动转换为节点图

---

## 10. 扩展性

### 10.1 自定义节点

用户可以编写自定义节点：

```typescript
// custom-node.js
import { registerNode } from 'novel-workflow';

registerNode({
  type: 'my-custom-node',
  category: 'custom',
  name: '我的自定义节点',
  inputs: [...],
  outputs: [...],
  params: [...],
  compute: async (node, ctx) => {
    // 自定义逻辑
    node.outputs.result = doSomething(node.inputs);
  }
});
```

### 10.2 节点市场

未来支持从市场安装预制节点：

```typescript
// 从市场加载节点
await NodeMarket.install('novel-studio/image-upscaler');
```
