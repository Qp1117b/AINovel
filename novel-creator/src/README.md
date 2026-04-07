# 自动化小说创作系统 — 模块化源码说明

## 目录结构

```
脚本/主脚本/
├── src/                      ← 模块化源码（24个独立文件）
│   ├── config.js             ← 全局常量 CONFIG + 预定义角色列表
│   ├── errors.js             ← 错误类（UserInterruptError 等）
│   ├── state.js              ← 状态容器（StateStore / WORKFLOW_STATE）
│   ├── utils.js              ← 工具函数（deepMerge / countTokens 等）
│   ├── config-parser.js      ← 配置文件解析与验证
│   ├── indexeddb.js          ← IndexedDB 数据库层
│   ├── storage.js            ← 存储层（章节/设置/预选状态）
│   ├── mapping-manager.js    ← 互动小说映射表管理
│   ├── worldbook.js          ← 世界书工具函数（966行）
│   ├── branch.js             ← 分支系统辅助函数
│   ├── agent-state.js        ← Agent 状态管理器
│   ├── api.js                ← API 适配层（802行）
│   ├── preflight.js          ← 前置检测
│   ├── notify.js             ← 通知系统
│   ├── modal.js              ← 模态框栈
│   ├── snapshot.js           ← 状态快照与回滚
│   ├── media-store.js        ← 媒体文件存储（520行）
│   ├── styles.js             ← 样式注入（2175行）
│   ├── ui.js                 ← UI 主界面（7534行）
│   ├── config-editor.js      ← 可视化配置编辑器（3671行）
│   ├── galgame.js            ← Galgame 编辑器与播放器（1354行）
│   ├── history-ui.js         ← 历史记录 UI（2452行）
│   ├── workflow.js           ← 工作流引擎（8230行）
│   └── init.js               ← 全局暴露与启动守卫
│
├── auto.js                   ← 【打包产物】直接安装到 Tampermonkey
├── build.js                  ← 构建脚本（文本拼接 → auto.js）
├── manifest.js               ← 多模块清单（Electron / @require 用）
├── package.json              ← npm 脚本定义
└── split.ps1                 ← 一键重新拆分脚本（仅首次使用）
```

---

## 两种使用模式

### 模式一：打包模式（油猴单文件）

**适用场景**：安装到 Tampermonkey / Violentmonkey，正常使用。

```bash
# 在 脚本/主脚本/ 目录下
node build.js           # 构建 → 输出 auto.js
node build.js --minify  # 构建（轻量压缩）
node build.js --watch   # 监听 src/ 变化，自动重建
```

产物 `auto.js` 包含完整油猴脚本头部，直接拖入 Tampermonkey 即可安装。

---

### 模式二：多模块模式（Electron / @require）

**适用场景**：Electron 打包框架直接加载多个 JS 文件，无需构建步骤。

#### Electron 主进程注入（推荐）

```js
// 在 Electron 主进程 preload 或合适时机：
const { loadAllForElectron } = require('./manifest');
await loadAllForElectron(webContents);
```

#### 油猴 @require 多文件（本地开发）

```bash
# 打印 @require 列表
node manifest.js --print-requires
```

将打印的 `@require` 行粘贴到油猴脚本头部（替换原来加载 auto.js 的那行），
即可直接加载 src/ 下的独立文件，**修改后无需重新构建**。

---

## 模块加载顺序

> ⚠️ **重要**：所有模块共享同一 IIFE 闭包作用域，顺序不可打乱。

```
config → errors → state → utils → config-parser
→ indexeddb → storage → mapping-manager → worldbook
→ branch → agent-state → api → preflight → notify
→ modal → snapshot → media-store → styles → ui
→ config-editor → galgame → history-ui → workflow → init
```

---

## 开发工作流

```
修改 src/workflow.js
    ↓
node build.js          # 重新打包
    ↓
安装/刷新 auto.js 到油猴
```

或者开启监听模式，保存即自动重建：

```bash
node build.js --watch
```
