# SillyTavern World Book（世界书）配置详解

## 1. 世界书基础结构

```json
{
    "entries": {
        "0": { ... },
        "1": { ... },
        "9999": { ... }
    },
    "name": "世界书名称"
}
```

---

## 2. 核心字段详解

### 2.1 根级字段

| 字段名       | 类型     | 必填  | 说明    | 示例                       |
| --------- | ------ | --- | ----- | ------------------------ |
| `entries` | object | ✅   | 条目集合  | {"0": {...}, "1": {...}} |
| `name`    | string | ✅   | 世界书名称 | "执念岛设定书"                 |

---

### 2.2 Entry 条目完整字段

```json
{
    "uid": 0,
    "displayIndex": 0,
    "comment": "条目注释",
    "disable": false,
    "constant": true,
    "selective": true,
    "key": ["关键词1", "关键词2"],
    "selectiveLogic": 0,
    "keysecondary": [],
    "scanDepth": 4,
    "vectorized": false,
    "position": 0,
    "role": 0,
    "depth": 0,
    "order": 0,
    "content": "条目内容",
    "useProbability": true,
    "probability": 100,
    "excludeRecursion": false,
    "preventRecursion": false,
    "delayUntilRecursion": false,
    "sticky": 0,
    "cooldown": 0,
    "delay": 0,
    "addMemo": true,
    "matchPersonaDescription": false,
    "matchCharacterDescription": false,
    "matchCharacterPersonality": false,
    "matchCharacterDepthPrompt": false,
    "matchScenario": false,
    "matchCreatorNotes": false,
    "group": "",
    "groupOverride": false,
    "groupWeight": 100,
    "caseSensitive": false,
    "matchWholeWords": false,
    "useGroupScoring": false,
    "automationId": "",
    "outletName": "",
    "triggers": [],
    "ignoreBudget": true,
    "characterFilter": {
        "isExclude": false,
        "names": [],
        "tags": []
    }
}
```

---

## 3. Entry 字段分类详解

### 3.1 基础识别字段

| 字段名            | 类型            | 说明     | 最佳实践               |
| -------------- | ------------- | ------ | ------------------ |
| `uid`          | number/string | 唯一标识符  | 设定书用0-49，状态书用9001+ |
| `displayIndex` | number        | 显示顺序索引 | 与uid保持一致           |
| `comment`      | string        | 内部注释   | 格式：类别-描述（触发词：...）  |

---

### 3.2 内容字段

| 字段名       | 类型     | 说明   | 格式建议           |
| --------- | ------ | ---- | -------------- |
| `content` | string | 核心内容 | 使用结构化标记如【】、=== |
| `comment` | string | 条目名称 | 层级编号+描述        |

**Content 编写规范：**
```json
"content": "【标题】\n\n核心定义：...\n\n详细说明：...\n\n===分类===\n- 项目1：...\n- 项目2：..."
```

---

### 3.3 触发机制字段

#### 关键词触发

| 字段名 | 类型 | 说明 | 参数 |
|--------|------|------|------|
| `key` | array | 主触发词 | 字符串数组，如["执念岛", "岛屿本质"] |
| `keysecondary` | array | 次触发词 | 辅助匹配词 |
| `selective` | boolean | 是否选择性触发 | true=需要关键词，false=始终触发 |
| `selectiveLogic` | number | 逻辑模式 | 0=AND（全部匹配），1=OR（任一匹配），2=NOT（排除），3=任意次关键词 |

#### 概率触发

| 字段名 | 类型 | 取值 | 说明 |
|--------|------|------|------|
| `useProbability` | boolean | true/false | 是否启用概率 |
| `probability` | number | 0-100 | 触发概率百分比 |
| `ignoreBudget` | boolean | true/false | 是否忽略Token预算限制 |

---

### 3.4 位置与深度字段

| 字段名 | 类型 | 取值 | 说明 |
|--------|------|------|------|
| `position` | number | 0/1 | 0=Character（角色定义前），1=Scenario（场景后） |
| `role` | number | 0/1/2 | 0=system，1=user，2=assistant |
| `depth` | number | 0-8 | 提示深度层级（0=最浅，8=最深） |
| `scanDepth` | number | 1-10 | 扫描对话历史的深度 |

**Position 详解：**
- `0` (Character)：插入在角色定义之前，影响角色基础行为
- `1` (Scenario)：插入在场景描述之后，影响具体情境响应

**Depth 层级：**
| 层级 | 用途 |
|------|------|
| 0 | 系统级基础设定 |
| 1-2 | 角色核心身份 |
| 3-4 | 行为规则协议 |
| 5-6 | 专项技能指导 |
| 7-8 | 实时约束提示 |

---

### 3.5 递归控制字段

| 字段名 | 类型 | 说明 | 使用场景 |
|--------|------|------|----------|
| `excludeRecursion` | boolean | 排除递归扫描 | 防止条目被递归引用 |
| `preventRecursion` | boolean | 阻止递归触发 | 防止循环触发 |
| `delayUntilRecursion` | boolean | 延迟到递归 | 仅在递归时激活 |
| `vectorized` | boolean | 向量化存储 | 启用语义搜索 |

**递归场景说明：**
- 正常扫描：分析当前用户输入
- 递归扫描：分析已触发的条目内容

---

### 3.6 时序控制字段

| 字段名 | 类型 | 取值 | 说明 |
|--------|------|------|------|
| `sticky` | number | 0+ | 粘性轮数（持续生效轮数） |
| `cooldown` | number | 0+ | 冷却轮数（触发后禁用轮数） |
| `delay` | number | 0+ | 延迟轮数（首次触发前等待） |

**时序控制示例：**
```json
// 触发后持续3轮，然后冷却2轮
"sticky": 3,
"cooldown": 2,
"delay": 0
```

---

### 3.7 匹配控制字段

| 字段名 | 类型 | 取值 | 说明 |
|--------|------|------|------|
| `caseSensitive` | boolean | true/false | 大小写敏感 |
| `matchWholeWords` | boolean | true/false | 整词匹配（非子串） |
| `useGroupScoring` | boolean | true/false | 启用组评分 |

**匹配模式组合：**

| caseSensitive | matchWholeWords | 效果 |
|---------------|-----------------|------|
| false | false | "执念"匹配"执念岛"（默认） |
| false | true | "执念"只匹配独立词"执念" |
| true | false | "执念"不匹配"执念岛" |
| true | true | 精确匹配，大小写敏感 |

---

### 3.8 分组字段

| 字段名 | 类型 | 说明 | 用途 |
|--------|------|------|------|
| `group` | string | 组名称 | "世界状态"、"核心设定" |
| `groupOverride` | boolean | 覆盖组设置 | 个体优先于组 |
| `groupWeight` | number | 0-1000 | 组内优先级 |

**分组策略：**
```json
// 设定书分组示例
"group": "地理信息",        // 条目5-14
"group": "角色设定",        // 条目36-37
"group": "能力系统",        // 条目38-42

// 状态书分组示例
"group": "世界状态",        // 所有状态条目
"groupOverride": true,
"groupWeight": 200
```

---

### 3.9 角色过滤字段

| 字段路径 | 类型 | 说明 |
|---------|------|------|
| `characterFilter.isExclude` | boolean | true=排除，false=包含 |
| `characterFilter.names` | array | 角色名称列表 |
| `characterFilter.tags` | array | 角色标签列表 |

**过滤示例：**
```json
// 仅对特定角色生效
"characterFilter": {
    "isExclude": false,
    "names": ["Agent A", "Agent B"],
    "tags": ["系统Agent"]
}

// 排除特定角色
"characterFilter": {
    "isExclude": true,
    "names": ["Agent C"],
    "tags": []
}
```

---

### 3.10 高级字段

| 字段名 | 类型 | 说明 | 用途 |
|--------|------|------|------|
| `automationId` | string | 自动化标识 | 与外部系统对接 |
| `outletName` | string | 输出通道 | 多输出路由 |
| `triggers` | array | 触发器列表 | 复杂触发条件 |
| `matchPersonaDescription` | boolean | 匹配角色描述 | 自动触发 |
| `matchCharacterDescription` | boolean | 匹配角色卡描述 | 自动触发 |
| `matchCharacterPersonality` | boolean | 匹配性格字段 | 自动触发 |
| `matchCharacterDepthPrompt` | boolean | 匹配深度提示 | 自动触发 |
| `matchScenario` | boolean | 匹配场景字段 | 自动触发 |
| `matchCreatorNotes` | boolean | 匹配创作者备注 | 自动触发 |

---

## 4. 世界书类型设计模式

### 4.1 设定书模式（静态世界观）

```json
{
    "entries": {
        "0": {
            "uid": 0,
            "constant": true,        // 始终激活
            "selective": true,
            "key": ["执念岛", "岛屿本质"],
            "probability": 100,
            "position": 0,
            "order": 0,
            "group": "",
            "content": "核心世界观定义..."
        },
        "5": {
            "uid": 5,
            "constant": false,       // 关键词触发
            "selective": true,
            "key": ["地理", "地图", "北侧"],
            "probability": 100,
            "position": 1,           // 场景后插入
            "order": 50,
            "scanDepth": 6,          // 更深扫描
            "preventRecursion": true, // 阻止递归
            "group": "",
            "content": "地理信息..."
        }
    },
    "name": "执念岛设定书"
}
```

**设计要点：**
- 核心条目（0-4）：`constant: true`，始终注入
- 分类条目（5+）：`constant: false`，关键词触发
- 地理条目：`position: 1`，场景后插入
- 创作规范条目：`position: 9`，深度8，最后处理

---

## 5. 完整世界书示例

### 5.1 设定书条目示例（条目0 - 岛屿本质）

```json
{
    "uid": 0,
    "key": ["执念岛", "岛屿本质", "实验场", "高维文明"],
    "keysecondary": [],
    "comment": "岛屿本质：高维文明实验场（触发词：执念岛, 岛屿本质, 实验场, 高维文明, Constant）",
    "content": "执念岛本质：高维文明构建的实验场，用于观测人类在极端环境下的相互理解、共鸣、敌对与合作行为。",
    "vectorized": false,
    "selective": true,
    "selectiveLogic": 0,
    "addMemo": true,
    "disable": false,
    "matchPersonaDescription": false,
    "matchCharacterDescription": false,
    "matchCharacterPersonality": false,
    "matchCharacterDepthPrompt": false,
    "matchScenario": false,
    "matchCreatorNotes": false,
    "delayUntilRecursion": false,
    "useProbability": true,
    "outletName": "",
    "group": "",
    "groupOverride": false,
    "caseSensitive": false,
    "matchWholeWords": false,
    "useGroupScoring": false,
    "automationId": "",
    "role": 0,
    "triggers": [],
    "displayIndex": 0,
    "constant": true,
    "probability": 100,
    "ignoreBudget": true,
    "position": 0,
    "order": 0,
    "depth": 0,
    "scanDepth": 4,
    "excludeRecursion": false,
    "preventRecursion": false,
    "sticky": 0,
    "cooldown": 0,
    "delay": 0,
    "groupWeight": 100,
    "characterFilter": {
        "isExclude": false,
        "names": [],
        "tags": []
    }
}
```


## 6. 配置最佳实践

### 6.1 UID规划

| 范围 | 用途 | 示例 |
|------|------|------|
| 0-99 | 核心世界观 | 岛屿本质、传送机制 |
| 100-199 | 角色设定 | 林风、苏婉婉 |
| 200-299 | 能力系统 | 奖励系统、千面化身 |
| 300-399 | 剧情主线 | Day 1时间轴 |
| 400-499 | 创作规范 | 输出格式、系统描写 |
| 9000-9998 | 动态状态 | 时空锚点、物资台账 |
| 9999 | 特殊模板 | 状态协议格式 |

### 6.2 Order规划

| 范围 | 优先级 | 用途 |
|------|--------|------|
| 0-9 | 最高 | 核心身份锚定 |
| 10-99 | 高 | 基础规则 |
| 100-199 | 中高 | 角色设定 |
| 200-299 | 中 | 能力系统 |
| 900-999 | 低 | 创作规范（最后处理） |

### 6.3 Depth规划

| 层级 | 内容类型 |
|------|----------|
| 0 | 系统级常量（岛屿本质） |
| 1-2 | 角色核心身份 |
| 3-4 | 行为规则协议 |
| 4-6 | 专项技能指导 |
| 8 | 实时约束提示（创作规范） |
