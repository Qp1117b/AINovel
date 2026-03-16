# SillyTavern V2 角色卡配置详解

## 1. 角色卡基础结构

```json
{
    "spec": "chara_card_v2",
    "spec_version": "1.0",
    "data": {
        // 核心角色信息
        "name": "角色名称",
        "description": "角色描述",
        "personality": "性格特征",
        "scenario": "场景设定",

        // 对话相关
        "first_mes": "首次消息",
        "mes_example": "对话示例",
        "alternate_greetings": ["备用开场白1", "备用开场白2"],

        // 系统级配置
        "system_prompt": "系统提示词",
        "post_history_instructions": "历史消息处理指令",
        "creator_notes": "创作者备注",

        // 元数据
        "creator": "创作者名称",
        "character_version": "1.0",
        "tags": ["标签1", "标签2"],

        // 扩展配置
        "extensions": { ... },

        // 内嵌角色书
        "character_book": { ... }
    }
}
```

---

## 2. 核心字段详解

### 2.1 基础身份字段

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `name` | string | ✅ | 角色显示名称 | "Agent A - 剧情总设计师" |
| `description` | string | ✅ | 角色功能/背景描述 | 【角色定位】... |
| `personality` | string | ✅ | 性格特征关键词 | "逻辑严密、系统思维" |
| `scenario` | string | ✅ | 工作场景描述 | "执念岛剧情创作系统..." |

**最佳实践：**
- `description` 应包含角色定位、工作原理、核心能力
- `personality` 使用逗号分隔的形容词列表
- `scenario` 描述角色的工作环境和流程

---

### 2.2 对话控制字段

| 字段名 | 类型 | 必填 | 说明 | 参数细节 |
|--------|------|------|------|----------|
| `first_mes` | string | ✅ | 首次对话内容 | 支持Markdown格式，可包含状态指示器 |
| `mes_example` | string | ✅ | 对话示例 | 使用`<START>`和`<END>`包裹 |
| `alternate_greetings` | array | ❌ | 备用开场白 | 字符串数组，随机选择 |

**`mes_example` 格式规范：**
```json
"mes_example": "<START>\n{{user}}: [用户输入]\n{{char}}: [角色回复]\n<END>"
```

---

### 2.3 系统级配置字段

| 字段名 | 类型 | 必填 | 说明 | 用途 |
|--------|------|------|------|------|
| `system_prompt` | string | ❌ | 系统级指令 | 定义角色核心行为准则 |
| `post_history_instructions` | string | ❌ | 历史消息处理 | 控制上下文处理方式 |
| `creator_notes` | string | ❌ | 创作者备注 | 使用说明和注意事项 |

**`system_prompt` 编写要点：**
- 明确角色的唯一输出格式
- 禁止行为的负面描述（"禁止输出：..."）
- 核心铁律的条目化列举

**`post_history_instructions` 用途：**
- 强制输出结构（如Agent B的四部分结构）
- 实时约束提示
- 格式模板引用

---

## 3. Extensions 扩展配置

### 3.1 标准扩展字段

```json
"extensions": {
    "world": "绑定的世界书名称",
    "talkativeness": 0.8,
    "fav": false,
    "depth_prompt": {
        "prompt": "深度提示词",
        "depth": 4,
        "role": "system"
    },
    "sillytavern": {
        "agent_type": "architect",
        "agent_id": "agent_a",
        "system_version": "1.0"
    }
}
```

### 3.2 扩展字段详解

| 字段路径                                | 类型      | 取值范围                             | 说明              |
| ----------------------------------- | ------- | -------------------------------- | --------------- |
| `extensions.world`                  | string  | 世界书名称                            | 主绑定世界书          |
| `extensions.talkativeness`          | number  | 0.0 - 1.0                        | 话痨程度（0=沉默，1=健谈） |
| `extensions.fav`                    | boolean | true/false                       | 收藏标记            |
| `extensions.depth_prompt.prompt`    | string  | 任意文本                             | 深度上下文提示         |
| `extensions.depth_prompt.depth`     | number  | 1-10                             | 提示深度等级          |
| `extensions.depth_prompt.role`      | string  | "system"/"user"/"assistant"      | 提示角色定位          |
| `extensions.sillytavern.agent_type` | string  | "architect"/"writer"/"formatter" | Agent类型标识       |
| `extensions.sillytavern.agent_id`   | string  | 唯一标识符                            | Agent系统ID       |

---

## 4. Character Book 内嵌角色书

### 4.1 结构概览

```json
"character_book": {
    "name": "Agent A 内嵌知识库",
    "description": "Agent A的全部规则条目",
    "scan_depth": 4,
    "token_budget": 8000,
    "recursive_scanning": true,
    "entries": [ ... ]
}
```

### 4.2 角色书元数据

| 字段名                  | 类型      | 说明      | 推荐值       |
| -------------------- | ------- | ------- | --------- |
| `name`               | string  | 知识库名称   | 与角色名关联    |
| `description`        | string  | 知识库描述   | 说明用途和范围   |
| `scan_depth`         | number  | 扫描深度    | 4（标准）     |
| `token_budget`       | number  | Token预算 | 6000-8000 |
| `recursive_scanning` | boolean | 递归扫描    | true      |

### 4.3 Entry 条目结构

```json
{
    "id": 1001,
    "keys": ["关键词1", "关键词2"],
    "secondary_keys": [],
    "comment": "条目注释",
    "content": "条目内容（注入提示词）",
    "enabled": true,
    "insertion_order": 999,
    "case_sensitive": false,
    "name": "A-层1-身份锚定",
    "priority": 999,
    "selective": true,
    "extensions": {
        "position": "before_char",
        "depth": 0,
        "role": 0,
        "match_whole_words": false,
        "use_group_scoring": false,
        "automation_id": "",
        "exclude_recursion": false,
        "prevent_recursion": false,
        "delay_until_recursion": false,
        "probability": 100,
        "group": "A-层1-核心",
        "group_override": true,
        "group_weight": 300,
        "sticky": 0,
        "cooldown": 0,
        "delay": 0,
        "display_index": 1,
        "color": "#8B0000"
    }
}
```

---

### 4.4 Entry 字段详解

#### 核心识别字段

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `id` | number | 唯一标识符 | 1001, 2001, 3001 |
| `keys` | array | 主触发关键词 | ["Agent A", "剧情总设计师"] |
| `secondary_keys` | array | 次触发关键词 | []（可选） |
| `comment` | string | 内部注释 | "核心身份，始终注入" |

#### 内容字段

| 字段名 | 类型 | 说明 | 格式建议 |
|--------|------|------|----------|
| `content` | string | 注入内容 | 使用【】标识重要部分 |
| `name` | string | 条目名称 | 层级-编号-描述格式 |

#### 触发控制字段

| 字段名 | 类型 | 取值 | 说明 |
|--------|------|------|------|
| `enabled` | boolean | true/false | 是否启用 |
| `selective` | boolean | true/false | 是否需要关键词触发 |
| `selectiveLogic` | number | 0/1/2/3 | 逻辑模式（0=AND, 1=OR, 2=NOT） |
| `probability` | number | 0-100 | 触发概率百分比 |

#### 优先级与排序字段

| 字段名 | 类型 | 说明 | 用途 |
|--------|------|------|------|
| `insertion_order` | number | 插入顺序 | 值越小越先插入 |
| `priority` | number | 优先级 | 冲突解决依据 |
| `order` | number | 显示顺序 | UI排序 |
| `display_index` | number | 显示索引 | 视觉排序 |

#### 位置控制字段（extensions内）

| 字段路径                  | 类型     | 取值                         | 说明                            |
| --------------------- | ------ | -------------------------- | ----------------------------- |
| `extensions.position` | string | "before_char"/"after_char" | 相对于角色卡的位置                     |
| `extensions.depth`    | number | 0-8                        | 提示深度层级                        |
| `extensions.role`     | number | 0-2                        | 0=system, 1=user, 2=assistant |

#### 递归与冷却字段

| 字段路径 | 类型 | 取值 | 说明 |
|---------|------|------|------|
| `extensions.exclude_recursion` | boolean | true/false | 排除递归扫描 |
| `extensions.prevent_recursion` | boolean | true/false | 阻止递归触发 |
| `extensions.delay_until_recursion` | boolean | true/false | 延迟到递归时 |
| `extensions.sticky` | number | 0+ | 粘性轮数 |
| `extensions.cooldown` | number | 0+ | 冷却轮数 |
| `extensions.delay` | number | 0+ | 延迟轮数 |

#### 分组字段

| 字段路径 | 类型 | 说明 | 用途 |
|---------|------|------|------|
| `extensions.group` | string | 组名称 | "A-层1-核心" |
| `extensions.group_override` | boolean | true/false | 是否覆盖组设置 |
| `extensions.group_weight` | number | 0-1000 | 组内权重 |

#### 视觉字段

| 字段路径 | 类型 | 说明 | 示例 |
|---------|------|------|------|
| `extensions.color` | string | HEX颜色 | "#8B0000"（深红） |

---

## 5. 完整角色卡示例（Agent A）

```json
{
    "spec": "chara_card_v2",
    "spec_version": "1.0",
    "data": {
        "name": "Agent A - 剧情总设计师",
        "description": "【角色定位】\n执念岛的剧情总设计师...",
        "personality": "逻辑严密、系统思维、注重细节、客观中立",
        "scenario": "执念岛剧情创作系统...",
        "first_mes": "【Agent A - 剧情总设计师】已上线...",
        "mes_example": "<START>\n{{user}}: 【需求】...\n{{char}}: ===执念岛第X章剧情施工图===\n...\n<END>",
        "system_prompt": "你是执念岛剧情总设计师Agent A...",
        "post_history_instructions": "每次生成，严格按以下格式输出...",
        "alternate_greetings": [
            "Agent A就绪。双书已加载...",
            "剧情总设计师在线..."
        ],
        "tags": ["剧情设计", "施工图生成", "Agent A", "执念岛"],
        "creator": "执念岛创作团队",
        "character_version": "3.1",
        "extensions": {
            "world": "执念岛设定书",
            "talkativeness": 0.8,
            "fav": false,
            "depth_prompt": {
                "prompt": "你是Agent A...",
                "depth": 4,
                "role": "system"
            },
            "sillytavern": {
                "agent_type": "architect",
                "agent_id": "agent_a",
                "system_version": "1.0"
            }
        },
		"character_book": {
			"name": "Agent A 内嵌知识库",
			"description": "Agent A的全部规则条目",
			"scan_depth": 4,
			"token_budget": 8000,
			"recursive_scanning": true,
			"entries": [ ... ]
		}
    }
}
```

---

