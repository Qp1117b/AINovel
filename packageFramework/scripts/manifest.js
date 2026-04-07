/**
 * scripts/manifest.js
 *
 * 模块加载清单 — 定义 src/ 目录下各模块的加载顺序和元数据
 * preload.js 和 main.js 共享此清单
 *
 * 规则：
 * - 必须严格按顺序加载，因模块间共享同一全局作用域（window）
 * - 每个模块的顶层 var 变量通过 window 对象共享
 * - 模块内部用 const/let 声明的局部变量各自独立
 */

module.exports = {
  /**
   * 源码模式：直接从 src/ 目录加载各模块文件（开发调试用）
   * true = 加载 src/*.js | false = 加载打包后的 auto.js
   */
  useSrcModules: true,

  /**
   * src/ 目录路径（相对于 packageFramework 根目录）
   */
  srcDir: '../novel-creator/src',

  /**
   * 模块加载顺序（严格保持，共享 window 全局作用域）
   *
   * 说明：
   *  config.js      → 定义 CONFIG 全局常量、预定义角色列表
   *  errors.js      → 定义 Errors 对象（错误处理）
   *  state.js       → 定义 WORKFLOW_STATE 全局状态
   *  utils.js       → 定义 Utils 对象（工具函数）
   *  config-parser.js → 定义 ConfigParser（配置解析）
   *  indexeddb.js   → 定义 IndexedDBWrapper（持久存储）
   *  storage.js     → 定义 Storage 对象（localStorage 封装）
   *  mapping-manager.js → 定义 MappingManager（映射管理）
   *  worldbook.js   → 定义 WorldBook 对象（世界书操作）
   *  branch.js      → 定义 BranchManager（分支管理）
   *  agent-state.js → 定义 AgentState（Agent 状态）
   *  api.js         → 定义 API 对象（TavernHelper 封装）
   *  preflight.js   → 定义 PreflightChecker（预检）
   *  notify.js      → 定义 Notify 对象（通知）
   *  modal.js       → 定义 Modal 对象（模态框）
   *  snapshot.js    → 定义 SnapshotManager（快照管理）
   *  media-store.js → 定义 MediaStore（媒体存储）
   *  styles.js      → 定义 Styles 对象（样式注入）
   *  ui.js          → 定义 UI 对象（主界面）
   *  config-editor.js → 定义 ConfigEditor（配置编辑器）
   *  galgame.js     → 定义 Galgame（互动小说）
   *  history-ui.js  → 定义 HistoryUI（历史界面）
   *  workflow.js    → 定义 WorkflowEngine（工作流引擎）
   *  init.js        → 调用 baseInit() 初始化入口
   */
  modules: [
    'config.js',
    'errors.js',
    'state.js',
    'utils.js',
    'config-parser.js',
    'indexeddb.js',
    'storage.js',
    'mapping-manager.js',
    'worldbook.js',
    'branch.js',
    'agent-state.js',
    'api.js',
    'preflight.js',
    'notify.js',
    'modal.js',
    'snapshot.js',
    'media-store.js',
    'styles.js',
    'ui.js',
    'config-editor.js',
    'galgame.js',
    'history-ui.js',
    'workflow.js',
    'init.js',
  ],

  /**
   * 外部依赖（通过 <script src> 加载）
   * 优先使用本地 vendor 目录，降级 CDN
   */
  externalDeps: [
    {
      name: 'marked',
      local: 'vendor/marked.min.js',
      cdn: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    },
    {
      name: 'JSZip',
      local: 'vendor/jszip.min.js',
      cdn: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    },
    {
      name: 'GPTTokenizer',
      local: 'vendor/gpt-tokenizer.js',
      cdn: 'https://unpkg.com/gpt-tokenizer',
    },
  ],
};
