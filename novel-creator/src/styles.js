    // ║  模块 18：样式注入                                                ║
    // ║  injectStyles — 所有 UI 的 CSS 注入                               ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module Styles — injectStyles() — 全部 UI CSS + 响应式断点注入 <head> */

    // ==================== 样式注入（修改版）====================

    function injectStyles() {
        if (document.getElementById('nc-styles')) return;
        const style = document.createElement('style');
        style.id = 'nc-styles';

        // 动态生成 Agent 按钮状态样式
        let agentButtonStyles = '';
        for (const [state, colors] of Object.entries(CONFIG.AGENT_STATUS_COLORS)) {
            // 处理 background：如果是 linear-gradient 则直接使用，否则使用颜色值
            const bg = colors.bg;
            const border = colors.border;
            const textColor = colors.text;

            // 生成该状态的样式规则
            agentButtonStyles += `
            .nc-workflow-agent-btn[data-state="${state}"] {
                background: ${bg};
                border-color: ${border};
                color: ${textColor};
                ${state === 'running' ? 'animation: nc-pulse 1.2s ease-in-out infinite;' : ''}
            }
        `;
        }

        style.textContent = `
        /* 原有样式保持不变，仅替换 .nc-workflow-agent-btn[data-state] 部分 */
        /* ── 响应式颜色变量（供 JS 内联样式使用） ─── */
        :root {
            --nc-color-amber:    #ffaa00;
            --nc-color-inactive: #4a4a6a;
            --nc-color-text:     #eaeaea;
            --nc-color-border:   #3a3a5a;
            --nc-color-panel:    #1a1a2e;
            --nc-color-card:     #2a2a3a;
            --nc-color-dark-bg:  #1e1e2e;
            --nc-color-red-alt:  #e74c3c;
            --nc-color-blue-alt: #3498db;
        }

        @keyframes nc-fade-in {
            from { opacity: 0; transform: scale(.95); }
            to   { opacity: 1; transform: scale(1); }
        }
        @keyframes nc-spin {
            to { transform: rotate(360deg); }
        }
        @keyframes nc-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        @keyframes nc-slide-in {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        .nc-font {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
        }

        .nc-scroll::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        .nc-scroll::-webkit-scrollbar-track {
            background: rgba(0,0,0,0.2);
            border-radius: 3px;
        }
        .nc-scroll::-webkit-scrollbar-thumb {
            background: rgba(102,126,234,0.4);
            border-radius: 3px;
        }
        .nc-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(102,126,234,0.6);
        }

        /* 遮罩层 */
        .nc-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.25);
            backdrop-filter: blur(4px);
            display: flex; justify-content: center; align-items: center;
            padding: 10px; box-sizing: border-box;
            color: #eaeaea;
            z-index: 99999;
        }

        /* 主面板 */
        .nc-panel {
            background: linear-gradient(145deg, #1a1a3e 0%, #16213e 50%, #0f3460 100%);
            border-radius: 16px;
            padding: 20px;
            width: min(1600px, 98vw);
            height: min(950px, 95vh);
            max-height: 95vh;
            box-shadow: 0 25px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.1);
            color: #eaeaea;
            position: relative;
            animation: nc-fade-in .3s ease both;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* 面板头部 */
        .nc-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 15px;
            border-bottom: 1px solid rgba(255,255,255,.1);
            margin-bottom: 15px;
            flex-shrink: 0;
        }

        .nc-panel-title {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .nc-panel-title-icon {
            font-size: 28px;
        }

        .nc-panel-title-text {
            font-size: 20px;
            font-weight: 700;
            background: linear-gradient(90deg,#667eea,#764ba2);
            -webkit-background-clip: text;
        }

        .nc-panel-title-sub {
            font-size: 12px;
            color: #888;
            margin-top: 2px;
        }

        /* 面板主体 - 四栏布局 */
        .nc-panel-body {
            display: grid;
            grid-template-columns: 240px 1fr 1fr 320px;
            gap: 15px;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }

        /* 面板底部 */
        .nc-panel-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 15px;
            border-top: 1px solid rgba(255,255,255,.1);
            margin-top: 15px;
            flex-shrink: 0;
        }

        /* 卡片样式 */
        .nc-card {
            background: rgba(255,255,255,.04);
            border-radius: 12px;
            padding: 12px;
            border: 1px solid rgba(255,255,255,.08);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .nc-card--accent { border-color: rgba(102,126,234,.3); background: rgba(102,126,234,.06); }
        .nc-card--dark { }
        .nc-card-title {
            font-weight: 600;
            font-size: 13px;
            color: #667eea;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }

        .nc-card-content {
            flex: 1;
            overflow-y: auto;
            min-height: 0;
        }

        /* 按钮样式 */
        .nc-btn {
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            padding: 10px 18px;
            transition: all .2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            white-space: nowrap;
        }
        .nc-btn:active {
            transform: scale(0.98);
            opacity: 0.9;
        }
        .nc-btn:disabled { opacity: .5; cursor: not-allowed; }
        .nc-btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 3px 12px rgba(102,126,234,.35);
        }
        .nc-btn-primary:not(:disabled):hover { filter: brightness(1.1); transform: translateY(-1px); }
        .nc-btn-danger { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: white; }
        .nc-btn-secondary { background: rgba(255,255,255,.1); color: white; border: 1px solid rgba(255,255,255,.15); }
        .nc-btn-ghost { background: rgba(255,255,255,.1); color: white; border: 1px solid rgba(255,255,255,.15); }
        .nc-btn-sm { font-size: 12px; padding: 8px 14px; border-radius: 6px; }
        .nc-btn-xs { padding: 5px 10px; border-radius: 5px; font-size: 11px; }

        /* 浮动按钮 */
        #nc-float-btn {
            position: fixed;
            bottom: 100px; right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px; border-radius: 25px;
            cursor: grab; z-index: 99998;
            font-weight: 700; font-size: 13px;
            box-shadow: 0 5px 18px rgba(102,126,234,.45), 0 0 0 1px rgba(255,255,255,.2);
            transition: box-shadow .25s, filter .25s;
            user-select: none;
            backdrop-filter: blur(10px);
        }
        #nc-float-btn:hover { filter: brightness(1.1); box-shadow: 0 7px 24px rgba(102,126,234,.6); }
        #nc-float-btn.nc-dragging { cursor: grabbing; filter: brightness(1.15); opacity: .92; transition: none; }

        /* 进度区域 */
        .nc-card-content {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }
        .nc-card-content > div:last-child {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }
        #nc-progress-content {
            flex: 1;
            overflow-y: auto;
            background: rgba(0,0,0,.2);
            padding: 10px;
            border-radius: 6px;
        }
        #nc-progress-content div { margin-bottom: 3px; }

        /* 输入框 */
        #nc-user-input {
            width: 100%;
            min-height: 120px;
            max-height: 120px;
            padding: 10px;
            border: 1px solid rgba(102,126,234,.25);
            border-radius: 8px;
            font-size: 13px;
            resize: none;
            background: rgba(0,0,0,.3);
            color: #eaeaea;
            font-family: inherit;
            line-height: 1.5;
            box-sizing: border-box;
            transition: border-color .2s;
        }
        #nc-user-input:focus { outline: none; border-color: #667eea; }
        #nc-user-input:disabled { opacity: .6; }

        /* ==================== 层次树形菜单样式 ==================== */
        .nc-tree-menu {
            font-size: 12px;
        }

        .nc-tree-item {
            margin-bottom: 4px;
        }

        .nc-tree-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            background: rgba(255,255,255,.05);
            border-radius: 8px;
            cursor: pointer;
            transition: all .2s;
            border: 1px solid transparent;
        }

        .nc-tree-header:hover {
            background: rgba(255,255,255,.08);
            border-color: rgba(102,126,234,.3);
        }

        .nc-tree-header.active {
            background: rgba(102,126,234,.2);
            border-color: rgba(102,126,234,.5);
        }

        .nc-tree-arrow {
            font-size: 10px;
            transition: transform .2s;
            color: #888;
        }

        .nc-tree-header.expanded .nc-tree-arrow {
            transform: rotate(90deg);
        }

        .nc-tree-icon {
            font-size: 14px;
        }

        .nc-tree-content {
            flex: 1;
        }

        .nc-tree-title {
            font-weight: 600;
            color: #eaeaea;
        }

        .nc-tree-desc {
            font-size: 11px;
            color: #afafaf;
            margin-top: 2px;
        }

        .nc-tree-children {
            margin-left: 16px;
            margin-top: 4px;
            padding-left: 12px;
            border-left: 2px solid rgba(102,126,234,.2);
            display: none;
        }

        .nc-tree-children.expanded {
            display: block;
        }

        .nc-tree-child-item {
            padding: 6px 10px;
            background: rgba(255,255,255,.03);
            border-radius: 6px;
            cursor: pointer;
            transition: all .2s;
            margin-bottom: 3px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .nc-tree-child-item:hover {
            background: rgba(255,255,255,.06);
        }

        .nc-tree-child-item.selected {
            background: rgba(102,126,234,.25);
            border: 1px solid rgba(102,126,234,.5);
        }

        .nc-tree-child-icon {
            font-size: 12px;
        }

        .nc-tree-child-content {
            flex: 1;
        }

        .nc-tree-child-title {
            font-size: 12px;
            color: #ffffff;
        }

        .nc-tree-child-desc {
            font-size: 11px;
            color: #afafaf;
        }

        /* Agent复选框 */
        .nc-agent-checkbox {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 5px 8px;
            background: rgba(255,255,255,.03);
            border-radius: 6px;
            cursor: pointer;
            transition: background .2s;
            font-size: 11px;
        }
        .nc-agent-checkbox:hover { background: rgba(255,255,255,.06); }
        .nc-agent-checkbox input { cursor: pointer; width: 14px; height: 14px; }
        .nc-agent-checkbox.disabled { opacity: .4; cursor: not-allowed; }
        .nc-agent-checkbox.required {
            background: rgba(40, 167, 69, 0.1);
            border: 1px solid rgba(40, 167, 69, 0.25);
        }
        .nc-required-badge {
            font-size: 9px;
            background: linear-gradient(135deg, #28a745, #218838);
            color: white;
            padding: 1px 4px;
            border-radius: 3px;
            margin-left: auto;
        }

        /* Agent状态按钮 */
        .nc-agent-status-btn {
            background: rgba(102,126,234,.15);
            color: #667eea;
            border: 1px solid rgba(102,126,234,.4);
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all .2s;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            white-space: nowrap;
        }
        .nc-agent-status-btn:hover:not(.nc-agent-status-btn--disabled) {
            filter: brightness(1.15);
            transform: translateY(-1px);
        }
        .nc-agent-status-btn--running {
            animation: nc-pulse 1.2s ease-in-out infinite;
        }
        .nc-agent-status-btn--disabled {
            opacity: 0.4;
            cursor: not-allowed;
            background: rgba(100,100,100,0.08) !important;
            border-color: #555 !important;
            color: #666 !important;
        }
        .nc-agent-status-btn--discard {
            background: linear-gradient(135deg,#dc3545,#c82333);
            border-color:#dc3545;
            color:white;
        }
        .nc-agent-status-btn .status-icon {
            font-size: 8px;
        }

        /* Agent分组 */
        .nc-agent-group {
            margin-bottom: 10px;
        }
        .nc-agent-group-title {
            font-size: 10px;
            font-weight: 600;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .nc-agent-group-title::before {
            content: '';
            width: 3px;
            height: 10px;
            background: #667eea;
            border-radius: 2px;
        }

        /* 工作流可视化 */
        .nc-workflow-stage {
            margin-bottom: 10px;
            padding: 8px;
            background: rgba(0,0,0,.2);
            border-radius: 8px;
        }
        .nc-workflow-stage-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
        }
        .nc-workflow-stage-name {
            font-size: 11px;
            font-weight: 600;
            color: #aaa;
        }
        .nc-workflow-stage-mode {
            font-size: 9px;
            background: rgba(102,126,234,.25);
            color: #a0a0ff;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .nc-workflow-agents {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
        }

        /* Token统计 */
        .nc-token-display {
            display: flex;
            align-items: center;
            gap: 15px;
            background: rgba(0,0,0,.25);
            padding: 10px 15px;
            border-radius: 10px;
        }
        .nc-token-main {
            display: flex;
            align-items: baseline;
            gap: 5px;
        }
        .nc-token-value {
            font-size: 22px;
            font-weight: 700;
            color: #667eea;
        }
        .nc-token-label {
            font-size: 11px;
            color: #888;
        }
        .nc-token-last {
            font-size: 11px;
            color: #4ecdc4;
        }

        /* 工具栏 */
        .nc-toolbar {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .nc-toolbar-btn {
            background: rgba(102,126,234,.15);
            color: #a0a0ff;
            border: 1px solid rgba(102,126,234,.3);
            padding: 5px 12px;
            border-radius: 15px;
            font-size: 11px;
            cursor: pointer;
            transition: all .2s;
        }
        .nc-toolbar-btn:hover {
            background: rgba(102,126,234,.25);
        }

        /* 章节信息 */
        .nc-chapter-info {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 12px;
            color: #888;
        }
        .nc-chapter-num {
            color: #4ecdc4;
            font-weight: 700;
        }

        /* 模态框 */
        .nc-modal-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.25);
            backdrop-filter: blur(4px);
            display: flex; justify-content: center; align-items: center;
            padding: 20px; box-sizing: border-box;
            z-index: 100010;
        }
        .nc-modal {
            background: #3a3a3a;
            color: #f0f0f0;
            border-radius: 16px;
            padding: 25px;
            max-width: 700px;          /* 统一宽度 */
            width: 100%;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: nc-fade-in .25s ease both;
            box-sizing: border-box;
        }
        .nc-modal-header {
            flex-shrink: 0; text-align: center;
            margin-bottom: 15px;
        }
        .nc-modal-body input,
        .nc-modal-body textarea {
            background: #1e293b !important;
            border: 1px solid #4a5568 !important;
            color: #f0f0f0 !important;
        }
        .nc-modal-body input:focus,
        .nc-modal-body textarea:focus {
            border-color: #667eea !important;
            outline: none;
        }
        .nc-modal-body {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 15px;
            padding: 12px;              /* 统一内边距 */
            border: 1px solid black;
            border-radius: 8px;
            background: #0f172a;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
            box-sizing: border-box;
        }
        .nc-modal-footer {
            flex-shrink: 0; display: flex;
            justify-content: center; gap: 10px;
        }
        .nc-modal-close-btn {
            background: #667eea; color: rgba(255, 255, 255,0.9); border: none;
            padding: 10px 25px; border-radius: 8px;
            cursor: pointer; font-size: 13px; font-weight: 600;
            transition: filter .2s;
        }
        .nc-modal-close-btn:hover { filter: brightness(1.15); }
        .nc-modal-copy-btn {
            background: #4ecdc4; color: rgba(255, 255, 255,0.9); border: none;
            padding: 10px 25px; border-radius: 8px;
            cursor: pointer; font-size: 13px; font-weight: 600;
            transition: filter .2s;
        }
        .nc-modal-copy-btn:hover { filter: brightness(1.15); }

        /* 历史面板 */
        .nc-history-panel {
            background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
            border-radius: 16px;
            padding: 25px;
            width: min(900px, 95vw);
            max-height: 90vh;
            box-shadow: 0 25px 80px rgba(0,0,0,.7);
            color: #eaeaea;
            overflow-y: auto;
            position: relative;
            animation: nc-fade-in .25s ease both;
        }

        /* 全选当前分支 - 使用主题紫色 */
        [data-action="selectBranch"] {
            background: linear-gradient(135deg, #667eea, #764ba2) !important;
            color: white !important;
            border: none !important;
            box-shadow: 0 2px 6px rgba(102, 126, 234, 0.4) !important;
        }
        [data-action="selectBranch"]:hover {
            filter: brightness(1.1) !important;
            transform: translateY(-1px) !important;
        }

        /* 刷新 - 使用清爽的蓝绿色 */
        [data-action="refresh"] {
            background: linear-gradient(135deg, #4ecdc4, #44a3aa) !important;
            color: white !important;
            border: none !important;
            box-shadow: 0 2px 6px rgba(78, 205, 196, 0.4) !important;
        }
        [data-action="refresh"]:hover {
            filter: brightness(1.1) !important;
            transform: translateY(-1px) !important;
        }

        /* 关闭 - 使用红色表示危险操作 */
        [data-action="close"] {
            background: linear-gradient(135deg, #ff6b6b, #ee5a6f) !important;
            color: white !important;
            border: none !important;
            box-shadow: 0 2px 6px rgba(255, 107, 107, 0.4) !important;
        }
        [data-action="close"]:hover {
            filter: brightness(1.1) !important;
            transform: translateY(-1px) !important;
        }

        /* 状态条目 */
        .nc-state-item {
            margin-bottom: 8px;
            border-radius: 6px;
            background: rgba(255,255,255,.04);
            border: 1px solid #333;
            border-left: 3px solid #667eea;
        }
        .nc-state-header {
            padding: 10px 12px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 600;
            font-size: 12px;
            color: #f0f0f0;
            background: rgba(0,0,0,.2);
            border-radius: 6px 6px 0 0;
            transition: background .2s;
        }
        .nc-state-header:hover,
        .nc-state-header.nc-state-open { background: rgba(102,126,234,.2); }
        .nc-state-arrow { font-size: 10px; transition: transform .2s; }
        .nc-state-header.nc-state-open .nc-state-arrow { transform: rotate(180deg); }
        .nc-state-content {
            padding: 0 12px 10px;
            font-size: 12px;
            line-height: 1.5;
            color: #f0f0f0;
            display: none;
            border-top: 1px solid rgba(255,255,255,.08);
        }
        .nc-state-content.nc-state-visible { display: block; }

        /* 章节列表项 */
        .nc-chapter-item {
            background: rgba(255,255,255,.04);
            border-radius: 10px;
            padding: 10px 14px;
            margin-bottom: 8px;
            border: 1px solid rgba(255,255,255,.06);
            transition: background .2s;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .nc-chapter-item:hover { background: rgba(255,255,255,.08); }

        /* Markdown */
        .markdown-body {
            background: black; color: #eaeaea;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            line-height: 1.5;
            font-size: 13px;
        }
        .markdown-body img {
            max-width: 100%;
            display: block;
            margin: 10px auto;
            border-radius: 8px;
            border: 1px solid #667eea;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .markdown-body h1,.markdown-body h2,.markdown-body h3,
        .markdown-body h4,.markdown-body h5,.markdown-body h6 {
            margin-top: .4em; margin-bottom: .4em; color: #eaeaea;
        }
        .markdown-body h1 { font-size: 1.5em; border-bottom: 1px solid #444; }
        .markdown-body h2 { font-size: 1.3em; border-bottom: 1px solid #444; }
        .markdown-body p { margin: .4em 0; }
        .markdown-body pre {
            background: #1e1e1e; padding: 10px; border-radius: 5px;
            overflow-x: auto; border: 1px solid #333;
        }
        .markdown-body code {
            background: #2d2d2d; padding: 2px 4px; border-radius: 3px;
            font-family: 'SF Mono', Monaco, Consolas, monospace; color: #ffb86b;
            font-size: 12px;
        }
        .markdown-body pre code { background: none; padding: 0; color: #eaeaea; }
        .markdown-body blockquote {
            border-left: 3px solid #667eea; padding: 0 0 0 .8em;
            margin: .4em 0; color: #aaa;
        }
        .markdown-body ul,.markdown-body ol { padding-left: 1.5em; }
        .markdown-body a { color: #58a6ff; text-decoration: none; }
        .markdown-body a:hover { text-decoration: underline; }
        .markdown-body table { border-collapse: collapse; width: 100%; font-size: 12px; }
        .markdown-body th,.markdown-body td { border: 1px solid #444; padding: 5px 10px; }
        .markdown-body img { max-width: 100%; }

        /* 错误面板 */
        .nc-error-panel {
            background: #1e1e2e;
            border: 1px solid #dc3545;
            max-width: 600px;
            width: 100%;
            padding: 15px;
            max-height: 80vh;
            height: auto;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 25px 80px rgba(0,0,0,.7);
            color: #eaeaea;
            position: relative;
            animation: nc-fade-in .3s ease both;
        }

        /* 错误列表区域 */
        .nc-error-panel .nc-error-list {
            flex: 1;
            overflow-y: auto;
            background: #2a2a3a;
            border-radius: 6px;
            padding: 12px;
            font-family: 'Consolas', monospace;
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-wrap;
            border: 1px solid #3a3a4a;
            color: #f0f0f0;
            margin: 10px 0;
        }

        /* 按钮组 */
        .nc-error-panel .nc-error-buttons {
            flex-shrink: 0;
            display: flex;
            gap: 10px;
            justify-content: center;
        }

        /* 标题区域 */
        .nc-error-panel .nc-error-title {
            flex-shrink: 0;
            text-align: center;
            margin-bottom: 10px;
        }

        /* 加载动画 */
        .nc-btn--loading {
            position: relative;
            color: transparent !important;
            pointer-events: none;
        }
        .nc-btn--loading::after {
            content: '';
            position: absolute;
            inset: 0; margin: auto;
            width: 16px; height: 16px;
            border: 2px solid rgba(255,255,255,.3);
            border-top-color: white;
            border-radius: 50%;
            animation: nc-spin .7s linear infinite;
        }

        /* 标签页 */
        .nc-tabs {
            display: flex;
            gap: 5px;
            margin-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,.1);
            padding-bottom: 8px;
        }
        .nc-tab {
            background: transparent;
            color: #888;
            border: none;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
            border-radius: 5px;
            transition: all .2s;
        }
        .nc-tab:hover { color: #aaa; background: rgba(255,255,255,.05); }
        .nc-tab.active { color: #667eea; background: rgba(102,126,234,.15); }

        /* 网格布局 */
        .nc-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .nc-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }

        /* 隐藏元素 */
        .nc-hidden { display: none !important; }

        /* 工作流Agent按钮基础样式 */
        .nc-workflow-agent-btn {
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all .2s ease; /* 添加平滑过渡 */
            display: inline-flex;
            align-items: center;
            gap: 5px;
            white-space: nowrap;
            border: 1px solid;
        }
        .nc-workflow-agent-btn:hover:not(:disabled) {
            filter: brightness(1.15);
            transform: translateY(-1px);
        }

        /* 动态生成的状态样式 */
        ${agentButtonStyles}

        .nc-workflow-agent-btn.nc-discard-btn {
            background: rgba(100,100,100,0.1);
            border-color: #666;
            color: #666;
        }
        .nc-workflow-agent-btn.nc-discard-btn.has-discard {
            background: linear-gradient(135deg,#dc3545,#c82333);
            border-color: #dc3545;
            color: white;
        }

        /* ==================== 响应式设计 ==================== */

        /* ════════════════════════════════════════════════════════
           响应式布局系统
           断点策略：
             ≥ 1400px  桌面大屏（四栏默认布局）
             1200-1399 桌面标准（三栏）
             1024-1199 笔记本/大平板（双栏）
              768-1023 平板竖屏（单栏滚动）
              480-767  手机横屏/大手机（单栏紧凑）
              < 480    手机竖屏（极致精简）
        ════════════════════════════════════════════════════════ */

        /* ── 1. 桌面标准 ≤ 1399px：三栏，最后一栏独占一行 ─── */
        @media (max-width: 1399px) {
            .nc-panel {
                width: min(1300px, 98vw);
            }
            .nc-panel-body {
                grid-template-columns: 220px 1fr 1fr 280px;
                gap: 12px;
            }
        }

        /* ── 2. 笔记本 ≤ 1199px：双栏，右侧卡片组叠放 ─────── */
        @media (max-width: 1199px) {
            .nc-panel {
                width: min(1000px, 98vw);
                height: min(860px, 95vh);
            }
            .nc-panel-body {
                grid-template-columns: 200px 1fr 260px;
                grid-template-rows: 1fr auto;
                gap: 10px;
            }
            /* 第4张卡（进度/输入）跨到第二行 */
            .nc-panel-body > .nc-card:last-child {
                grid-column: 1 / -1;
                max-height: 220px;
            }
            .nc-panel-title-sub {
                display: none;
            }
        }

        /* ── 3. 大平板 ≤ 1023px：单栏滚动，tab标签切换 ────── */
        @media (max-width: 1023px) {
            /* ---- 主面板 ---- */
            .nc-panel {
                width: 100vw;
                height: 100dvh;
                height: 100vh;
                max-height: 100vh;
                border-radius: 0;
                padding: 14px 16px;
                display: flex;
                flex-direction: column;
            }
            .nc-overlay {
                padding: 0;
                align-items: stretch;
            }
            .nc-panel-header {
                padding-bottom: 12px;
                margin-bottom: 12px;
                flex-shrink: 0;
            }
            .nc-panel-footer {
                flex-shrink: 0;
                padding-top: 10px;
                margin-top: 0;
            }

            /* ---- 主体改为选项卡式单栏 ---- */
            .nc-panel-body {
                display: flex;
                flex-direction: column;
                gap: 0;
                flex: 1;
                min-height: 0;
                overflow: hidden;
                position: relative;
            }

            /* 所有卡片默认隐藏，激活的显示 */
            .nc-panel-body > .nc-card {
                display: none;
                flex: 1;
                min-height: 0;
                border-radius: 0 0 12px 12px;
                border-top: none;
            }
            .nc-panel-body > .nc-card.nc-tab-active {
                display: flex;
            }

            /* 选项卡导航条 */
            .nc-tab-bar {
                display: flex !important;
                flex-shrink: 0;
                background: rgba(0,0,0,.25);
                border-radius: 10px 10px 0 0;
                border: 1px solid rgba(255,255,255,.08);
                border-bottom: none;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: none;
            }
            .nc-tab-bar::-webkit-scrollbar { display: none; }
            .nc-tab-btn {
                flex: 1;
                min-width: 64px;
                padding: 10px 8px;
                font-size: 11px;
                font-weight: 600;
                color: #888;
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                cursor: pointer;
                text-align: center;
                white-space: nowrap;
                transition: color .2s, border-color .2s;
            }
            .nc-tab-btn.nc-tab-active {
                color: #667eea;
                border-bottom-color: #667eea;
            }
            .nc-tab-btn:hover:not(.nc-tab-active) {
                color: #aaa;
            }

            /* ---- 字号/间距收紧 ---- */
            .nc-panel-title-text  { font-size: 17px; }
            .nc-panel-title-icon  { font-size: 24px; }
            .nc-panel-title-sub   { display: none; }
            .nc-card              { padding: 12px; }

            /* ---- 底部按钮栏 ---- */
            .nc-panel-footer {
                flex-wrap: wrap;
                gap: 8px;
            }
            .nc-panel-footer > div {
                flex: 1 1 auto;
                min-width: 120px;
                justify-content: center;
            }

            /* ---- 树形菜单触摸优化 ---- */
            .nc-tree-header,
            .nc-tree-child-item {
                min-height: 44px;
                padding: 10px 12px;
            }
            .nc-tree-children { display: none; }
            .nc-tree-header.expanded + .nc-tree-children { display: block; }

            /* ---- Agent 复选框 ---- */
            .nc-agent-checkbox {
                min-height: 44px;
                font-size: 13px;
                padding: 10px 12px;
            }

            /* ---- 工作流按钮 ---- */
            .nc-workflow-agents {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }
            .nc-workflow-agent-btn {
                flex: 1 1 calc(50% - 6px);
                font-size: 12px;
                padding: 10px 6px;
                white-space: normal;
                word-break: break-word;
                text-align: center;
            }

            /* ---- 用户输入框 ---- */
            #nc-user-input {
                min-height: 80px;
                max-height: 120px;
                font-size: 15px;
            }

            /* ---- Token 统计 ---- */
            .nc-token-display {
                flex-wrap: wrap;
                gap: 8px;
                padding: 8px 12px;
            }
            .nc-token-main { flex: 1 0 auto; }
            .nc-token-last { display: none; }

            /* ---- 模态框 ---- */
            .nc-modal {
                width: 96vw;
                max-width: 96vw;
                max-height: 90dvh;
                max-height: 90vh;
                padding: 18px;
            }
            .nc-modal-body { max-height: 60dvh; max-height: 60vh; }

            /* ---- 历史面板 ---- */
            .nc-history-panel {
                width: 96vw;
                padding: 18px;
            }

            /* ---- 历史章节列表 ---- */
            .nc-chapter-item {
                flex-wrap: wrap;
                gap: 8px;
            }
            .nc-chapter-item > div:first-child { width: 100%; }
            .nc-chapter-item button            { flex: 1 1 auto; }

            /* ---- 浮动按钮 ---- */
            #nc-float-btn {
                bottom: 24px !important;
                right: 16px;
                font-size: 13px;
                padding: 12px 18px;
            }

            /* ---- 配置编辑器面板 ---- */
            .nc-config-editor-layout {
                flex-direction: column !important;
            }
            .nc-config-editor-left {
                width: 100% !important;
                height: 220px;
                border-right: none !important;
                border-bottom: 1px solid rgba(255,255,255,.1);
                overflow-y: auto;
            }
            .nc-config-editor-right {
                flex: 1;
                overflow-y: auto;
            }

            /* ---- Galgame 制作器 ---- */
            .nc-gal-layout {
                flex-direction: column !important;
            }
            .nc-gal-sidebar {
                width: 100% !important;
                height: 160px;
                overflow-y: auto;
                border-right: none !important;
                border-bottom: 1px solid rgba(255,255,255,.1);
            }
            .nc-gal-properties {
                width: 100% !important;
                height: 180px;
                overflow-y: auto;
                border-left: none !important;
                border-top: 1px solid rgba(255,255,255,.1);
            }

            /* ---- 文件管理器标签 ---- */
            .nc-flex--tab-bar {
                flex-wrap: wrap;
                gap: 4px;
            }
            .nc-flex--tab-bar > .nc-btn {
                flex: 1 1 calc(33% - 4px);
                padding: 8px 4px;
                font-size: 11px;
            }

            /* ---- 来源头部 grid 改为纯列 ---- */
            .nc-grid--source-header {
                display: none !important;
            }
            .nc-card--source-card {
                gap: 8px;
            }
        }

        /* ── 4. 手机横屏/大手机 ≤ 767px ────────────────────── */
        @media (max-width: 767px) {
            /* ---- 面板 ---- */
            .nc-panel { padding: 10px 12px; }
            .nc-panel-header {
                padding-bottom: 8px;
                margin-bottom: 8px;
            }
            .nc-panel-footer { gap: 6px; }
            .nc-panel-footer > div { min-width: 90px; }

            /* ---- 选项卡文字极简 ---- */
            .nc-tab-btn { font-size: 10px; padding: 9px 6px; min-width: 52px; }

            /* ---- 卡片 ---- */
            .nc-card { padding: 10px; }
            .nc-card-title { font-size: 12px; }

            /* ---- 按钮 ---- */
            .nc-btn    { font-size: 12px; padding: 9px 14px; }
            .nc-btn-sm { font-size: 11px; padding: 7px 12px; }
            .nc-btn-xs { font-size: 10px; padding: 4px 8px; }

            /* ---- Agent 工作流：单列 ---- */
            .nc-workflow-agent-btn { flex: 1 1 100%; }
            .nc-agent-status-btn   { font-size: 10px; padding: 6px 8px; }

            /* ---- Agent grid：单列 ---- */
            .nc-grid-2 { grid-template-columns: 1fr !important; }

            /* ---- 隐藏次要元素 ---- */
            .nc-tree-desc,
            .nc-panel-title-sub,
            .nc-mode-label { display: none !important; }

            /* ---- 标题 ---- */
            .nc-panel-title-text { font-size: 15px; }
            .nc-panel-title-icon { font-size: 22px; }

            /* ---- Token ---- */
            .nc-token-value { font-size: 17px; }
            .nc-token-label { font-size: 10px; }

            /* ---- 历史章节操作按钮：换行堆叠 ---- */
            .nc-chapter-item > div:last-child {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                width: 100%;
            }
            .nc-chapter-item button { flex: 1 1 calc(50% - 4px); min-width: 60px; }

            /* ---- 模态框 ---- */
            .nc-modal {
                width: 100vw;
                max-width: 100vw;
                border-radius: 16px 16px 0 0;
                padding: 16px;
                position: fixed;
                bottom: 0;
                left: 0;
                max-height: 88dvh;
                max-height: 88vh;
            }
            .nc-modal-overlay {
                align-items: flex-end;
                padding: 0;
            }
            .nc-modal-body  { max-height: 55dvh; max-height: 55vh; }
            .nc-modal-footer { gap: 8px; flex-wrap: wrap; }
            .nc-modal-footer .nc-btn,
            .nc-modal-footer .nc-modal-copy-btn,
            .nc-modal-footer .nc-modal-close-btn {
                flex: 1 1 auto;
                min-width: 80px;
            }

            /* ---- 历史面板 ---- */
            .nc-history-panel {
                width: 100vw;
                border-radius: 16px 16px 0 0;
                position: fixed;
                bottom: 0;
                left: 0;
                max-height: 92dvh;
                max-height: 92vh;
                padding: 14px;
            }
            .nc-history-overlay {
                align-items: flex-end;
                padding: 0;
            }

            /* ---- 输入框 ---- */
            #nc-user-input { min-height: 70px; max-height: 100px; font-size: 14px; }

            /* ---- 浮动按钮 ---- */
            #nc-float-btn {
                bottom: 16px !important;
                right: 12px;
                padding: 10px 14px;
                font-size: 12px;
                border-radius: 20px;
            }

            /* ---- 文件管理器标签：2列 ---- */
            .nc-flex--tab-bar > .nc-btn {
                flex: 1 1 calc(50% - 4px);
            }

            /* ---- 图片库画廊：2列 ---- */
            .nc-flex--gallery {
                gap: 10px;
                justify-content: space-evenly;
            }
            .nc-flex-item--image-card {
                width: calc(50% - 10px);
            }

            /* ---- 属性面板标签字号 ---- */
            .nc-field-label--md { font-size: 12px; }
            .nc-prop-title--lg  { font-size: 14px; }
        }

        /* ── 5. 手机竖屏 ≤ 479px：极致精简 ─────────────────── */
        @media (max-width: 479px) {
            /* ---- 面板 ---- */
            .nc-panel { padding: 8px 10px; }
            .nc-panel-header { padding-bottom: 6px; margin-bottom: 6px; }
            .nc-panel-title-text { font-size: 13px; }
            .nc-panel-title-icon { font-size: 20px; }

            /* ---- 选项卡：允许横滑 ---- */
            .nc-tab-bar { border-radius: 8px 8px 0 0; }
            .nc-tab-btn { font-size: 9px; padding: 8px 4px; min-width: 44px; }

            /* ---- 底部 ---- */
            .nc-panel-footer { flex-direction: column; gap: 6px; }
            .nc-panel-footer > div {
                width: 100%;
                justify-content: center;
            }
            /* 中断按钮始终全宽 */
            #nc-stop-btn { width: 100%; }

            /* ---- 按钮 ---- */
            .nc-btn    { font-size: 11px; padding: 8px 10px; }
            .nc-btn-sm { font-size: 10px; padding: 6px 10px; }
            .nc-btn-xs { font-size: 9px;  padding: 3px 6px; }

            /* ---- 树形菜单 ---- */
            .nc-tree-title { font-size: 11px; }
            .nc-tree-header { padding: 8px 10px; min-height: 40px; }

            /* ---- Agent ---- */
            .nc-agent-checkbox    { font-size: 11px; padding: 8px 10px; min-height: 40px; }
            .nc-agent-status-btn  { font-size: 9px;  padding: 4px 6px; }
            .nc-required-badge    { display: none; }

            /* ---- 卡片 ---- */
            .nc-card      { padding: 8px; }
            .nc-card-title { font-size: 11px; margin-bottom: 8px; }

            /* ---- 输入框 ---- */
            #nc-user-input { min-height: 60px; max-height: 80px; font-size: 13px; }

            /* ---- Token ---- */
            .nc-token-display { padding: 6px 10px; gap: 6px; }
            .nc-token-value   { font-size: 16px; }
            .nc-token-main    { gap: 3px; }

            /* ---- 模态框 ---- */
            .nc-modal { padding: 14px; }
            .nc-modal-body { padding: 8px; max-height: 60dvh; max-height: 60vh; }

            /* ---- 历史面板按钮：单列 ---- */
            .nc-chapter-item button { flex: 1 1 100%; }
            .nc-hist-btn--view,
            .nc-hist-btn--status,
            .nc-hist-btn--rollback,
            .nc-hist-btn--delete,
            .nc-hist-btn--branch {
                width: 100%;
                justify-content: center;
            }

            /* ---- 图片库：单列 ---- */
            .nc-flex-item--image-card { width: 100%; }

            /* ---- 来源卡片输入框 ---- */
            .nc-source-input--main,
            .nc-source-input--flex { font-size: 12px; padding: 8px 10px; }
            .nc-source-select--flex { font-size: 12px; padding: 8px; }

            /* ---- 属性面板 ---- */
            .nc-field-input--md,
            .nc-field-input--sm { font-size: 12px; padding: 7px 10px; }
            .nc-prop-title--lg  { font-size: 13px; }
            .nc-prop-title--sm  { font-size: 12px; }

            /* ---- 浮动按钮 ---- */
            #nc-float-btn {
                bottom: 12px !important;
                right: 8px;
                padding: 9px 12px;
                font-size: 11px;
            }
        }

        /* ── 6. 横屏手机补丁（高度 < 500px）────────────────── */
        @media (max-height: 500px) and (orientation: landscape) {
            .nc-panel {
                padding: 6px 12px;
            }
            .nc-panel-header { padding-bottom: 6px; margin-bottom: 6px; }
            .nc-panel-title-sub { display: none; }
            #nc-user-input  { min-height: 50px; max-height: 60px; }
            .nc-modal       { max-height: 96dvh; max-height: 96vh; border-radius: 12px; }
            .nc-modal-body  { max-height: 60dvh; max-height: 60vh; }
            .nc-history-panel { max-height: 96dvh; max-height: 96vh; border-radius: 12px; }
            #nc-float-btn   { bottom: 8px !important; right: 8px; }
        }

        /* ── 7. 触摸设备通用优化（无悬停） ─────────────────── */
        @media (hover: none) and (pointer: coarse) {
            /* 加大所有可点击元素的最小点击区域 */
            .nc-btn,
            .nc-btn-sm,
            .nc-modal-copy-btn,
            .nc-modal-close-btn {
                min-height: 44px;
            }
            .nc-btn-xs { min-height: 36px; }

            /* 取消 hover transform，避免点击时跳动 */
            .nc-btn-primary:not(:disabled):hover {
                transform: none;
                filter: none;
            }
            .nc-tree-header:hover { background: rgba(255,255,255,.05); }

            /* 滚动容器添加惯性滚动 */
            .nc-scroll,
            .nc-card-content,
            .nc-modal-body,
            .nc-history-panel,
            .nc-panel-body,
            #nc-progress-content {
                -webkit-overflow-scrolling: touch;
                overscroll-behavior: contain;
            }

            /* 输入框放大，避免系统自动缩放（iOS） */
            input[type="text"],
            input[type="number"],
            input[type="password"],
            textarea,
            select {
                font-size: max(16px, 1em);
            }

            /* 浮动按钮加大 */
            #nc-float-btn { min-height: 44px; }
        }

        /* ── 8. 高分屏（Retina）轻微锐化阴影 ───────────────── */
        @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 2dppx) {
            .nc-panel {
                box-shadow: 0 20px 60px rgba(0,0,0,.6), 0 0 0 0.5px rgba(255,255,255,.12);
            }
            .nc-modal {
                box-shadow: 0 16px 50px rgba(0,0,0,.55), 0 0 0 0.5px rgba(255,255,255,.1);
            }
        }


        /* ── 按钮色彩主题 ──────────────────────────────── */
        /* 工具栏琥珀色实色按钮（检测配置） */
        .nc-btn--amber-solid { background: #ffaa00; border-color: #ffaa00; color: white; }
        /* 紫色渐变按钮（确认/编辑模式） */
        .nc-btn--grad-purple { background:linear-gradient(135deg,#667eea,#764ba2); }
        /* 紫渐变行动按钮（互动复制/跳过） */
        .nc-btn--grad-purple-action { background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 8px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; }
        /* 带阴影紫渐变按钮（查看源码） */
        .nc-btn--grad-purple-shadow { background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
        /* 红色渐变按钮（取消/关闭） */
        .nc-btn--grad-red { background:linear-gradient(135deg,#dc3545,#c82333); }
        /* 青色渐变按钮（自动生成ID） */
        .nc-btn--grad-teal { background:linear-gradient(135deg,#4ecdc4,#44a3aa); }
        /* 带阴影青渐变按钮（查看预览） */
        .nc-btn--grad-teal-shadow { background: linear-gradient(135deg, #4ecdc4, #44a3aa); color: white; border: none; box-shadow: 0 4px 12px rgba(78, 205, 196, 0.4); }
        /* 绿色按钮（Galgame新建/自动布局） */
        .nc-btn--green { background: #10b981; }
        /* 工具栏绿色实色按钮（应用配置） */
        .nc-btn--green-solid { background: #10b981; border-color: #10b981; color: white; }
        /* 橙色按钮（Galgame导出/导入） */
        .nc-btn--orange { background: #f39c12; }
        /* 工具栏橙色实色按钮（导出/导入配置） */
        .nc-btn--orange-solid { background: #f39c12; border-color: #f39c12; color: white; }
        /* 紫色按钮（保存/加载） */
        .nc-btn--purple { background: #667eea; }
        /* 紫色实色按钮（数据化全选/反选/翻页） */
        .nc-btn--purple-solid { background: #667eea; color: white; border: none; }
        /* 红色按钮（Galgame打包/危险操作） */
        .nc-btn--red { background: #dc3545; }
        /* 青色按钮（Galgame播放模式） */
        .nc-btn--teal { background: #4ecdc4; }
        /* Token重置按钮内边距 */
        .nc-btn--token-reset { padding:3px 8px; }

        /* ── 历史面板章节操作按钮 ──────────────────────────────── */
        /* 历史面板「从此分支」按钮 */
        .nc-hist-btn--branch { background:linear-gradient(135deg,#8e44ad,#6c3483); border:none; color:white; border-radius:15px; padding:4px 12px; font-size:11px; cursor:pointer; }
        /* 历史面板删除按钮 */
        .nc-hist-btn--delete { background:linear-gradient(135deg,#dc3545,#c82333); border:none; color:white; border-radius:15px; padding:4px 12px; font-size:11px; cursor:pointer; }
        /* 历史面板回滚按钮 */
        .nc-hist-btn--rollback { background:linear-gradient(135deg,#f39c12,#e67e22); border:none; color:white; border-radius:15px; padding:4px 12px; font-size:11px; cursor:pointer; }
        /* 历史面板查看状态按钮 */
        .nc-hist-btn--status { background:linear-gradient(135deg,#4ecdc4,#44a3aa); border:none; color:white; border-radius:15px; padding:4px 12px; font-size:11px; cursor:pointer; }
        /* 历史面板查看按钮 */
        .nc-hist-btn--view { background:linear-gradient(135deg,#667eea,#764ba2); border:none; color:white; border-radius:15px; padding:4px 12px; font-size:11px; cursor:pointer; }

        /* ── 历史面板工具栏按钮 ──────────────────────────────── */
        /* 历史工具栏深红按钮（关闭） */
        .nc-hist-toolbar-btn--crimson { background:linear-gradient(135deg,#dc3545,#c82333); border:none; color:white; border-radius:20px; padding:6px 16px; }
        /* 历史工具栏紫色按钮（全选分支/刷新） */
        .nc-hist-toolbar-btn--purple { background:linear-gradient(135deg,#667eea,#764ba2); border:none; color:white; border-radius:20px; padding:6px 16px; }
        /* 历史工具栏红色按钮（删除选中） */
        .nc-hist-toolbar-btn--red { background:linear-gradient(135deg,#ff6b6b,#ee5a6f); border:none; color:white; border-radius:20px; padding:6px 16px; }
        /* 历史工具栏青色按钮（导出/导入备份） */
        .nc-hist-toolbar-btn--teal { background:linear-gradient(135deg,#4ecdc4,#44a3aa); border:none; color:white; border-radius:20px; padding:6px 16px; }

        /* ── 配置编辑器操作按钮 ──────────────────────────────── */
        /* 配置编辑器全宽绿色按钮（管理Agent） */
        .nc-cfgedit-btn--add-full { background:linear-gradient(135deg, #10b981, #059669); border:none; color:white; border-radius:20px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; width:100%; }
        /* 配置编辑器中绿色添加按钮（添加回流条件/输入源） */
        .nc-cfgedit-btn--add-md { background:linear-gradient(135deg, #10b981, #059669); border:none; color:white; border-radius:20px; padding:6px 16px; font-size:13px; font-weight:600; cursor:pointer; }
        /* 配置编辑器小绿色添加按钮（添加选项） */
        .nc-cfgedit-btn--add-sm { background:linear-gradient(135deg, #10b981, #059669); border:none; color:white; border-radius:20px; padding:4px 12px; font-size:12px; font-weight:600; cursor:pointer; }
        /* 获取模型列表按钮 */
        .nc-cfgedit-btn--fetch-model { white-space:nowrap; background:linear-gradient(135deg, #10b981, #059669); border:none; color:white; border-radius:20px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; }
        /* 阶段删除红色按钮 */
        .nc-cfgedit-btn--stage-delete { background:linear-gradient(135deg, #dc3545, #c82333); border:none; color:white; border-radius:20px; padding:6px 16px; font-size:12px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; }
        /* 阶段插入紫色按钮（前/后插入阶段） */
        .nc-cfgedit-btn--stage-insert { background:linear-gradient(135deg, #667eea, #764ba2); border:none; color:white; border-radius:20px; padding:6px 16px; font-size:12px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; }
        /* 测试API连通性按钮（全宽） */
        .nc-cfgedit-btn--test-api { background:linear-gradient(135deg, #667eea, #764ba2); border:none; color:white; border-radius:20px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer; width:100%; }

        /* ── 内联图标/功能按钮 ──────────────────────────────── */
        /* API重新测试图标按钮 */
        .nc-icon-btn--retest { background:none; border:none; color:#667eea; cursor:pointer; font-size:11px; }
        /* 选择关联Agent按钮 */
        .nc-icon-btn--select-agents { background:#667eea; border:none; color:white; border-radius:6px; padding:6px 12px; font-size:11px; cursor:pointer; }
        /* 清空输入工具栏按钮（红色边框） */
        .nc-toolbar-btn--clear { color:#ff6b6b; border-color:rgba(255,107,107,.3); }

        /* ── Galgame 制作器专用 ──────────────────────────────── */
        /* Galgame添加变量按钮 */
        .nc-gal-btn--add-var { margin-top:5px; width:100%; padding:4px; background:#10b981; border:none; border-radius:4px; color:white; cursor:pointer; }
        /* Galgame删除连线按钮 */
        .nc-gal-btn--delete-edge { background:#dc3545; color:white; border:none; padding:5px; width:100%; border-radius:4px; }
        /* Galgame删除节点按钮 */
        .nc-gal-btn--delete-node { margin-top:10px; width:100%; padding:5px; background:#dc3545; border:none; border-radius:4px; color:white; cursor:pointer; }
        /* Galgame编辑模式按钮 */
        .nc-gal-btn--edit-mode { background: linear-gradient(135deg,#667eea,#764ba2); }
        /* Galgame从历史导入章节按钮 */
        .nc-gal-btn--import-chapter { margin-top:5px; width:100%; padding:4px; background:#667eea; border:none; border-radius:4px; color:white; cursor:pointer; }
        /* Galgame32px正方形删除图标按钮 */
        .nc-gal-btn--remove-32 { background:#dc3545; border:none; color:white; border-radius:4px; width:32px; height:32px; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        /* Galgame36px正方形删除图标按钮 */
        .nc-gal-btn--remove-36 { background:#dc3545; border:none; color:white; border-radius:4px; width:36px; height:36px; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        /* Galgame快照条目添加按钮 */
        .nc-gal-btn--snapshot-add { background:#10b981; border:none; color:white; border-radius:3px; cursor:pointer; padding:3px 8px; font-size:11px; }
        /* Galgame变量删除按钮 */
        .nc-gal-btn--var-delete { background:#dc3545; border:none; color:white; border-radius:3px; cursor:pointer; font-size:10px; }
        /* Galgame节点基础输入框（节点ID只读） */
        .nc-gal-input--base { width:100%; padding:5px; background:#2a2a3a; color:#eaeaea; border:1px solid #667eea; border-radius:4px; }
        /* Galgame节点脚本等宽输入框 */
        .nc-gal-input--mono { width:100%; padding:5px; background:#2a2a3a; color:#eaeaea; border:1px solid #667eea; border-radius:4px; font-family:monospace; }
        /* Galgame快照变量名输入框 */
        .nc-gal-input--snapshot-var { flex:1; padding:3px; background:#2a2a3a; color:#eaeaea; border:1px solid #667eea; border-radius:3px; }
        /* Galgame变量初始值小输入框 */
        .nc-gal-input--var-val { width:80px; background:#2a2a3a; color:#eaeaea; border:1px solid #667eea; border-radius:3px; font-size:10px; }
        /* Galgame项目列表紫渐变图标方块（40×40） */
        .nc-gal-project-icon { width:40px; height:40px; background:linear-gradient(135deg,#667eea,#764ba2); border-radius:8px; display:flex; align-items:center; justify-content:center; color:white; }

        /* ── AI 配置生成向导 ──────────────────────────────── */
        /* 配置生成器步骤指示器（激活） */
        .nc-wizard-step--active { background: #667eea; border-color: #667eea; color: white; }
        /* 配置生成器步骤指示器（完成） */
        .nc-wizard-step--done { background: #27ae60; border-color: #27ae60; color: white; }
        /* 配置生成器芯片（默认） */
        .nc-wizard-chip { cursor: pointer; transition: all 0.2s; }
        .nc-wizard-chip:hover { border-color: #667eea; background: rgba(102,126,234,0.1); }
        /* 配置生成器芯片（激活） */
        .nc-wizard-chip--active { border-color: #667eea !important; background: rgba(102,126,234,0.2) !important; color: #667eea !important; }
        /* 配置生成器卡片（默认） */
        .nc-wizard-card { cursor: pointer; transition: all 0.2s; }
        .nc-wizard-card:hover { border-color: #667eea; }
        /* 配置生成器卡片（激活） */
        .nc-wizard-card--active { border-color: #667eea !important; background: rgba(102,126,234,0.1) !important; }
        /* 配置生成器功能模块卡片（默认） */
        .nc-wizard-feature { cursor: pointer; transition: all 0.2s; }
        .nc-wizard-feature:hover { border-color: #667eea; background: rgba(102,126,234,0.05); }
        /* 配置生成器功能模块卡片（激活） */
        .nc-wizard-feature--active { border-color: #667eea !important; background: rgba(102,126,234,0.1) !important; }
        .nc-wizard-feature--disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Agent 选择卡片 ──────────────────────────────── */
        /* Agent 选择卡片容器 */
        .nc-agent-select-card { transition: all 0.2s; }
        .nc-agent-select-card:hover { border-color: #555 !important; }
        /* Agent 选项（默认） */
        .nc-agent-option { transition: all 0.2s; }
        .nc-agent-option:hover { transform: translateY(-2px); }
        /* Agent 选项（激活 - 通用） */
        .nc-agent-option--general.nc-agent-option--active { 
            border-color: #3498db !important; 
            background: rgba(52,152,219,0.15) !important; 
            box-shadow: 0 4px 12px rgba(52,152,219,0.3);
        }
        /* Agent 选项（激活 - 专用） */
        .nc-agent-option--special.nc-agent-option--active { 
            border-color: #9b59b6 !important; 
            background: rgba(155,89,182,0.15) !important; 
            box-shadow: 0 4px 12px rgba(155,89,182,0.3);
        }

        /* ── 功能模块卡片 ──────────────────────────────── */
        .nc-feature-module { transition: all 0.2s; }
        .nc-feature-module:hover { border-color: #555 !important; }
        .nc-feature-module--active { }
        .nc-feature-module--active:hover { transform: none !important; }

        /* ── Agent 工坊样式 ──────────────────────────────── */
        /* 工坊容器 */
        .nc-agent-workshop { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        /* 工坊标题 */
        .nc-workshop-title { font-size: 18px; font-weight: bold; color: #fff; }
        /* 工坊步骤指示器 */
        .nc-workshop-step { 
            width: 28px; height: 28px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: bold;
        }
        /* 工坊卡片 */
        .nc-workshop-card {
            border-radius: 12px; border: 1px solid #444; overflow: hidden;
            transition: all 0.2s;
        }
        .nc-workshop-card:hover { border-color: #555; }
        /* Agent 卡片 */
        .nc-agent-card {
            transition: all 0.2s;
        }
        .nc-agent-card:hover { border-color: #555 !important; }
        /* Agent 类型按钮 */
        .nc-agent-type-btn { transition: all 0.2s; }
        .nc-agent-type-btn:hover { transform: translateY(-2px); }
        .nc-agent-type-btn--active { }
        /* 角色卡编辑器 */
        .nc-card-editor { transition: all 0.2s; }
        .nc-card-header:hover { background: #2a2a40 !important; }
        /* 专用卡片生成 */
        .nc-special-card { transition: all 0.2s; }
        .nc-generate-btn:hover { background: #8e44ad !important; }

        /* ── 状态/徽章/横幅 ──────────────────────────────── */
        /* 信息提示横幅（配置模式说明） */
        .nc-banner--info { background: rgba(102, 126, 234, 0.3); color: #667eea; padding: 4px 8px; border-radius: 6px; margin-bottom: 10px; font-size: 12px; text-align: center; border: 1px solid #667eea; }
        /* 红色警告胶囊横幅 */
        .nc-banner--warning-red { background: linear-gradient(90deg, #ff6b6b, #c92a2a); color: white; padding: 8px 16px; border-radius: 30px; margin-bottom: 12px; font-weight: 600; text-align: center; box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4); display: inline-block; width: auto; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(4px); }
        /* Agent关联标签芯片 */
        .nc-tag--agent { background:#667eea; color:white; border-radius:4px; padding:2px 6px; font-size:10px; }

        /* ── 状态颜色文字 ──────────────────────────────── */
        /* 危险红色文字（API不可用 ❌） */
        .nc-text--danger { color:#dc3545; }
        /* 加粗红色（✗/❌ 标记替换） */
        .nc-text--danger-bold { color: #dc3545; font-weight: bold; }
        /* 成功绿色文字（API可用 ✅） */
        .nc-text--success { color:#28a745; }
        /* 加粗绿色（✓ 标记替换） */
        .nc-text--success-bold { color: #28a745; font-weight: bold; }
        /* 警告黄色文字（未测试 ⏳） */
        .nc-text--warn-yellow { color:#ffc107; }

        /* ── 通用颜色工具 ──────────────────────────────── */
        /* 错误红色文字 */
        .nc-color--error { color:#ff6b6b; }
        /* 可点击红色图标（删除Agent ✖） */
        .nc-color--error-btn { color:#ff6b6b; cursor:pointer; }
        /* 中号可点击红色图标（删除选项 ✖） */
        .nc-color--error-btn-md { color:#ff6b6b; cursor:pointer; font-size:14px; }
        /* 居中红色错误信息（编辑器实例丢失） */
        .nc-color--error-center { color:#ff6b6b; text-align:center; padding:20px; }
        /* 红色错误提示信息（角色卡缺失等） */
        .nc-color--error-msg { color:#ff6b6b; font-size:13px; margin-bottom:6px; }
        /* 带内边距红色错误信息（预览渲染失败） */
        .nc-color--error-padded { color:#ff6b6b; padding:20px; }
        /* 带内边距红色错误（加载失败，紧凑写法） */
        .nc-color--error-padded2 { color:#ff6b6b; padding:20px; }
        /* 红色错误标题 */
        .nc-color--error-title { color:#ff6b6b; font-weight:600; margin-bottom:6px; }
        /* 加粗红色错误标题（配置错误） */
        .nc-color--error-title-bold { color:#ff6b6b; font-weight:bold; margin-bottom:5px; }
        /* 灰色辅助文字 */
        .nc-color--muted { color:#aaa; }
        /* 居中灰色占位文字（未选中节点等） */
        .nc-color--muted-center { color:#aaa; text-align:center; }
        /* 带下边距灰色文字（文件名提示） */
        .nc-color--muted-mb5 { color:#aaa; margin-bottom:5px; }
        /* 中号灰色说明文字（修改后自动更新引用） */
        .nc-color--muted-md { color:#aaa; font-size:14px; }
        /* 大内边距居中灰色占位（属性面板空状态） */
        .nc-color--muted-placeholder { color:#aaa; text-align:center; padding:30px; }
        /* 小号灰色辅助文字（图片/音频空状态） */
        .nc-color--muted-sm { color:#aaa; font-size:12px; }
        /* 超小号灰色辅助文字（节点序号等） */
        .nc-color--muted-xs { color:#aaa; font-size:10px; }
        /* 主题紫色文字 */
        .nc-color--primary { color:#667eea; }
        /* 加粗主题紫色文字（文件ID/音频库标题） */
        .nc-color--primary-bold { color:#667eea; font-weight:600; }
        /* 下划线加粗紫色链接（查看错误详情） */
        .nc-color--primary-link { color:#667eea; text-decoration:underline; font-weight:bold; }
        /* 小号紫色可点击链接（返回手动输入） */
        .nc-color--primary-link-sm { color:#667eea; font-size:12px; cursor:pointer; }
        /* 中灰中等字重标签（关键词列表标题） */
        .nc-color--subtle-label { color:#ccc; font-weight:500; font-size:14px; }
        /* 可点击青色图标（编辑Agent ✎） */
        .nc-color--teal-btn { color:#4ecdc4; cursor:pointer; }
        /* 青色返回链接（返回阶段） */
        .nc-color--teal-link { color:#4ecdc4; cursor:pointer; font-size:14px; }
        /* 树形目录折叠箭头（主题紫，固定16px宽） */
        .nc-tree-arrow { color:#667eea; width:16px; display:inline-block; }

        /* ── 标题样式 ──────────────────────────────── */
        /* 灰色h4标题（资源库） */
        .nc-heading--muted-h4 { margin:0 0 10px; color:#aaa; }
        /* 主题色h3小标题带下边距（连线属性） */
        .nc-heading--primary-h3 { color:#667eea; margin:0 0 10px; }
        /* 主题色h4标题（变量监视器/节点属性） */
        .nc-heading--primary-h4 { margin:0 0 10px; color:#667eea; }
        /* 超大警告图标（⚠️） */
        .nc-icon--warn-xl { font-size:40px; margin-bottom:5px; }
        /* 半透明小号模态框副标题 */
        .nc-modal-subtitle { margin:0; opacity:.6; font-size:12px; }
        /* 灰色模态框副标题 */
        .nc-modal-subtitle--gray { margin:8px 0 0; font-size:12px; color:#aaa; }
        /* 错误红色模态框标题 */
        .nc-modal-title--error { margin:0; font-size:18px; color:#ff6b6b; }
        /* 主题色模态框标题 */
        .nc-modal-title--primary { margin:0; color:#667eea; }
        /* 主题色模态框标题（紧凑写法） */
        .nc-modal-title--primary-c { margin:0; color:#667eea; }
        /* 大号主题色模态框标题 */
        .nc-modal-title--primary-lg { margin:0; color:#667eea; font-size:20px; }
        /* 大号主题色模态框标题（紧凑写法） */
        .nc-modal-title--primary-lg-c { margin:0; color:#667eea; font-size:20px; }
        /* 区块大号标题（小说数据化） */
        .nc-section-title--lg { margin:0 0 6px; font-size:20px; }
        /* 区块大号标题（历史管理，紧凑） */
        .nc-section-title--lg-c { margin:0 0 6px; font-size:20px; }
        /* 工具栏大标题（Galgame制作器/配置编辑器） */
        .nc-toolbar-title { font-size: 18px; font-weight: 600; color: #667eea; }

        /* ── 属性面板区块标题 ──────────────────────────────── */
        /* 大号属性面板区块标题（API/Agent属性） */
        .nc-prop-title--lg { color:#667eea; font-size:16px; font-weight:600; margin-bottom:16px; border-bottom:1px solid #2d2d44; padding-bottom:8px; }
        /* 无下划线大号属性标题（输入源/内联） */
        .nc-prop-title--lg-inline { color:#667eea; font-size:16px; font-weight:600; border-bottom:none; padding-bottom:0; }
        /* 小号属性面板区块标题（阶段/分类/全局属性） */
        .nc-prop-title--sm { color:#667eea; font-size:14px; font-weight:600; margin-bottom:16px; border-bottom:1px solid #2d2d44; padding-bottom:8px; }
        /* 无下划线小号属性标题（选项列表/内联） */
        .nc-prop-title--sm-inline { color:#667eea; font-size:14px; font-weight:600; border-bottom:none; padding-bottom:0; }

        /* ── 属性面板字段标签 ──────────────────────────────── */
        /* 基础字段标签（文件ID/上传） */
        .nc-field-label--base { display:block; margin-bottom:5px; color:#aaa; }
        /* 基础字段标签（打回建议，紧凑） */
        .nc-field-label--base-c { display:block; margin-bottom:5px; color:#aaa; }
        /* 中号字段标签（API/Agent属性） */
        .nc-field-label--md { display:block; color:#aaa; font-size:14px; margin-bottom:4px; }
        /* 小号字段标签（阶段/分类/全局属性） */
        .nc-field-label--sm { display:block; color:#aaa; font-size:12px; margin-bottom:4px; }
        /* 小号字段标签（历史章节编辑，紧凑） */
        .nc-field-label--sm-c { display:block; margin-bottom:4px; color:#aaa; font-size:12px; }

        /* ── 属性面板输入框 ──────────────────────────────── */
        /* 颜色选择器输入框（阶段颜色） */
        .nc-field-input--color { width:100%; height:40px; background:#0f172a; border:1px solid #3a3a5a; border-radius:8px; padding:2px; }
        /* 中号深色输入框（API/Agent属性） */
        .nc-field-input--md { width:100%; background:#0f172a; color:#eaeaea; border:1px solid #3a3a5a; border-radius:8px; padding:10px 14px; font-size:14px; }
        /* 弹性宽中号深色输入框（API模型名称） */
        .nc-field-input--md-flex { flex:1; background:#0f172a; color:#eaeaea; border:1px solid #3a3a5a; border-radius:8px; padding:10px 14px; font-size:14px; }
        /* 等宽中号深色输入框（停止词/logit-bias textarea） */
        .nc-field-input--md-mono { width:100%; background:#0f172a; color:#eaeaea; border:1px solid #3a3a5a; border-radius:8px; padding:10px 14px; font-size:14px; font-family:monospace; line-height:1.5; }
        /* 大内边距等宽中号深色输入框（inputTemplate/description） */
        .nc-field-input--md-mono-lg { width:100%; background:#0f172a; color:#eaeaea; border:1px solid #3a3a5a; border-radius:8px; padding:12px 14px; font-size:14px; font-family:monospace; line-height:1.5; }
        /* 小号深色输入框（阶段/分类/全局属性） */
        .nc-field-input--sm { width:100%; background:#0f172a; color:#eaeaea; border:1px solid #3a3a5a; border-radius:8px; padding:8px 12px; font-size:13px; }
        /* 等宽小号深色输入框（阶段描述 textarea） */
        .nc-field-input--sm-mono { width:100%; background:#0f172a; color:#eaeaea; border:1px solid #3a3a5a; border-radius:8px; padding:8px 12px; font-size:13px; font-family:monospace; }
        /* 连线类型下拉框（较浅背景） */
        .nc-field-select--edge { width:100%; background:#2a2a3a; color:#eaeaea; border:1px solid #667eea; padding:5px; }

        /* ── 输入源编辑区控件 ──────────────────────────────── */
        /* 弹性宽输入源文字输入框 */
        .nc-source-input--flex { flex:1; background:#1e1e2f; color:#eaeaea; border:1px solid #667eea; border-radius:4px; padding:8px 12px; font-size:14px; }
        /* 输入源来源文本输入框 */
        .nc-source-input--main { width:100%; background:#1e1e2f; color:#eaeaea; border:1px solid #667eea; border-radius:6px; padding:10px 12px; font-size:14px; }
        /* 输入源类型小宽度输入框 */
        .nc-source-input--type { width:80px; background:#1e1e2f; color:#eaeaea; border:1px solid #667eea; border-radius:6px; padding:10px; font-size:14px; }
        /* 源码预览面板（显示状态，深色背景） */
        .nc-source-pane { display:block; flex:1; overflow:auto; background:#0f172a; box-sizing:border-box; }
        /* 弹性宽输入源模式下拉框 */
        .nc-source-select--flex { flex:1; background:#1e1e2f; color:#eaeaea; border:1px solid #667eea; border-radius:6px; padding:10px; font-size:14px; }

        /* ── 选项列表输入框 ──────────────────────────────── */
        /* 选项名称/描述/图标小输入框 */
        .nc-opt-input--sm { width:100%; background:#1e1e2f; color:#eaeaea; border:1px solid #3a3a5a; border-radius:6px; padding:6px 8px; font-size:12px; margin-bottom:4px; }

        /* ── 通用对话框表单控件 ──────────────────────────────── */
        /* Agent键名编辑输入框（200px固定宽） */
        .nc-modal-input--agent-key { width:200px; background:#0f172a; color:#eaeaea; border:1px solid #667eea; border-radius:6px; padding:8px 12px; font-size:16px; font-weight:600; }
        /* 通用模态框输入框（自定义文件ID等） */
        .nc-modal-input--base { width:100%; padding:8px; background:#2a2a3a; color:#eaeaea; border:1px solid #667eea; border-radius:5px; font-size:13px; }
        /* 深色半透明模态框输入框（章节标题编辑） */
        .nc-modal-input--dark { width:100%; padding:8px; background:rgba(0,0,0,0.4); color:#eaeaea; border:1px solid #667eea; border-radius:5px; font-size:13px; }
        /* 分页页码输入框（50px） */
        .nc-modal-input--page { width:50px; text-align:center; background:rgba(0,0,0,0.4); color:#eaeaea; border:1px solid #667eea; border-radius:4px; padding:4px; }
        /* 模态框状态书选择下拉框 */
        .nc-modal-select--book { margin-left:10px; padding:4px; background:#2a2a3a; color:#eaeaea; border:1px solid #667eea; border-radius:4px; }
        /* 通用模态框文件选择下拉框 */
        .nc-modal-select--file { width:100%; padding:5px; background:#2a2a3a; color:#eaeaea; border:1px solid #667eea; border-radius:5px; }
        /* 通用模态框多行输入框（打回建议） */
        .nc-modal-textarea--base { width:100%; padding:8px; background:#2a2a3a; color:#eaeaea; border:1px solid #667eea; border-radius:5px; font-size:13px; min-height:100px; }
        /* 章节内容编辑大文本框 */
        .nc-modal-textarea--chapter { width:100%; min-height:250px; padding:10px; background:rgba(0,0,0,0.4); color:#eaeaea; border:1px solid #667eea; border-radius:5px; font-family:Consolas,monospace; font-size:12px; line-height:1.5; }

        /* ── checkbox / radio 控件 ──────────────────────────────── */
        /* 章节列表复选框（16×16） */
        .nc-checkbox--base { width: 16px; height: 16px; cursor: pointer; }
        /* 主题色中号复选框（图像/流式参数） */
        .nc-checkbox--purple-md { accent-color:#667eea; width:16px; height:16px; }
        /* 中号复选框标签（API参数/Agent必需） */
        .nc-checkbox-label--md { display:flex; align-items:center; gap:6px; color:#ccc; font-size:14px; cursor:pointer; }
        /* 小号复选框标签（执行模式单选） */
        .nc-checkbox-label--sm { display:flex; align-items:center; gap:6px; color:#ccc; font-size:13px; cursor:pointer; }
        /* 超小号复选框标签（Galgame网格对齐） */
        .nc-checkbox-label--xs { display: flex; align-items: center; gap: 4px; color: #ccc; font-size: 12px; }
        /* 主题色 radio 按钮（执行模式） */
        .nc-radio--purple { accent-color:#667eea; }

        /* ── flex 行布局 ──────────────────────────────── */
        /* 输入区行动栏（按钮行，上边距8） */
        .nc-flex--action-bar { display: flex; margin-top: 8px; gap: 8px; align-items: center; flex-wrap: wrap; }
        /* 居中换行按钮组（历史工具栏） */
        .nc-flex--btn-group-center { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-bottom:8px; }
        /* 章节列表行（可点击，下边距8） */
        .nc-flex--chapter-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; cursor: pointer; }
        /* 章节查看按钮行（源码/预览，上边距10） */
        .nc-flex--chapter-view-btns { margin-top:10px; display:flex; gap:12px; justify-content:center; }
        /* flex复选框组行布局（API参数） */
        .nc-flex--checkbox-group { display:flex; gap:20px; flex-wrap:wrap; margin-bottom:16px; }
        /* flex列布局，间距10，占满高度（卡片内容配置区） */
        .nc-flex--col-10-full { display:flex; flex-direction:column; gap:10px; height:100%; }
        /* flex列布局，间距10（音频/文件列表，带空格） */
        .nc-flex--col-10-sp { display: flex; flex-direction: column; gap: 10px; }
        /* flex列布局，占满高度，溢出隐藏（Agent选择面板） */
        .nc-flex--col-full { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        /* flex列布局，占满剩余高度，溢出隐藏（卡片内容区） */
        .nc-flex--col-grow-overflow { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
        /* flex列布局，60vh高度（源码/预览模态框内容区） */
        .nc-flex--col-modal-60vh { display: flex; flex-direction: column; padding:0; height:60vh; overflow:hidden; }
        /* flex行，间距10，水平居中（模态框底部） */
        .nc-flex--footer-10-center { display:flex; gap:10px; justify-content:center; }
        /* flex行，间距10，水平居中（紧凑） */
        .nc-flex--footer-10-center-c { display:flex; gap:10px; justify-content:center; }
        /* flex行，间距10，居中换行（模态框底部，带空格） */
        .nc-flex--footer-10-wrap-sp { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        /* flex行，间距8，居中换行（章节选择底部） */
        .nc-flex--footer-8-wrap { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
        /* 图片库画廊弹性换行居中 */
        .nc-flex--gallery { display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; }
        /* 信息提示行（超小灰字，换行） */
        .nc-flex--info-hint-row { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:5px; font-size:11px; color:#888; }
        /* 模态框标题行两端对齐 */
        .nc-flex--modal-header { display: flex; align-items: center; justify-content: space-between; }
        /* flex行，间距10，垂直居中 */
        .nc-flex--row-10-middle { display:flex; align-items:center; gap:10px; }
        /* flex行，间距15，垂直居中 */
        .nc-flex--row-15-middle { display:flex; gap:15px; align-items:center; }
        /* flex行，间距15，垂直居中（打回附加内容，紧凑） */
        .nc-flex--row-15-middle-c { display:flex; gap:15px; align-items:center; }
        /* flex行，间距15，垂直居中（带空格） */
        .nc-flex--row-15-middle-sp { display: flex; gap: 15px; align-items: center; }
        /* flex行，间距20（执行模式单选组容器） */
        .nc-flex--row-20 { display:flex; gap:20px; }
        /* flex行，间距5 */
        .nc-flex--row-5 { display:flex; gap:5px; }
        /* flex行，间距5，水平居中 */
        .nc-flex--row-5-center { display:flex; gap:5px; justify-content:center; }
        /* flex行，间距5，水平居中（图片/音频操作，带空格） */
        .nc-flex--row-5-center-sp { display: flex; gap: 5px; justify-content: center; }
        /* flex行，间距5，垂直居中（底部开关组） */
        .nc-flex--row-5-middle { display:flex; align-items:center; gap:5px; }
        /* flex行，间距5，上边距5（媒体操作按钮组） */
        .nc-flex--row-5-mt5 { display:flex; gap:5px; margin-top: 5px; }
        /* flex行，间距5，上边距5（Galgame音频操作，紧凑） */
        .nc-flex--row-5-mt5-c { margin-top:5px; display:flex; gap:5px; }
        /* flex行，间距5，上边距5（带空格） */
        .nc-flex--row-5-mt5-sp { display: flex; gap: 5px; margin-top: 5px; }
        /* flex行，间距5，上边距5，换行（其余文件操作） */
        .nc-flex--row-5-mt5-wrap { display:flex; gap:5px; margin-top: 5px; flex-wrap: wrap; }
        /* flex行，间距5，上边距5，换行（带空格） */
        .nc-flex--row-5-mt5-wrap-sp { display: flex; gap: 5px; margin-top: 5px; flex-wrap: wrap; }
        /* flex行，间距5（Galgame项目按钮组，带空格） */
        .nc-flex--row-5-sp { display: flex; gap: 5px; }
        /* flex行，间距6，下边距6，垂直居中（回流关键词行） */
        .nc-flex--row-6-mb6-mid { display:flex; gap:6px; margin-bottom:6px; align-items:center; }
        /* flex行，间距8 */
        .nc-flex--row-8 { display:flex; gap:8px; }
        /* flex行，间距8，垂直居中 */
        .nc-flex--row-8-center { display:flex; gap:8px; align-items:center; }
        /* flex行，间距8，垂直居中（带空格） */
        .nc-flex--row-8-center-sp { display: flex; gap: 8px; align-items: center; }
        /* flex行，间距8，下边距8 */
        .nc-flex--row-8-mb8 { display:flex; gap:8px; margin-bottom:8px; }
        /* flex行，间距8，垂直居中 */
        .nc-flex--row-8-middle { display:flex; align-items:center; gap:8px; }
        /* flex行，间距8，垂直居中，下边距8 */
        .nc-flex--row-8-middle-mb8 { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
        /* flex行，间距8（带空格） */
        .nc-flex--row-8-sp { display: flex; gap: 8px; }
        /* flex行，间距8，允许换行 */
        .nc-flex--row-8-wrap { display:flex; gap:8px; flex-wrap:wrap; }
        /* API状态列表每行布局（两端对齐，下边距3，小字） */
        .nc-flex--row-api-item { display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; font-size:11px; }
        /* flex行，两端对齐（Agent名称与序号） */
        .nc-flex--row-between { display:flex; justify-content:space-between; }
        /* flex行，两端对齐（紧凑） */
        .nc-flex--row-between-c { display:flex; justify-content:space-between; }
        /* flex行，两端对齐，垂直居中，下边距12（选项/输入源标题行） */
        .nc-flex--row-between-mb12 { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
        /* flex行，两端对齐，垂直居中，下边距5 */
        .nc-flex--row-between-mb5 { display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; }
        /* flex行，两端对齐，垂直居中，下边距5（带空格） */
        .nc-flex--row-between-mb5-sp { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
        /* flex行，两端对齐，垂直居中，下边距8 */
        .nc-flex--row-between-mb8 { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        /* flex行，两端对齐，垂直居中（带空格） */
        .nc-flex--row-between-mid-sp { display: flex; justify-content: space-between; align-items: center; }
        /* flex行，两端对齐，垂直居中，上边距10（章节查看源码/预览） */
        .nc-flex--row-between-mt10 { display:flex; justify-content:space-between; align-items:center; margin-top:10px; }
        /* Galgame快照条目行（小字，下边距） */
        .nc-flex--snapshot-row { display:flex; align-items:center; gap:5px; margin-bottom:5px; font-size:12px; }
        /* 文件管理器标签页横向排列 */
        .nc-flex--tab-bar { display: flex; gap: 10px; padding: 0 10px; margin-bottom: 10px; flex-wrap: wrap; }
        /* 弹性换行居中，间距10（图片展示行） */
        .nc-flex--wrap-center { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }

        /* ── flex 子项属性 ──────────────────────────────── */
        /* Agent选择面板已启用区域（固定30%高度） */
        .nc-flex-item--agent-enabled { flex: 0 0 30%; min-height: 0; overflow-y: auto; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; }
        /* Agent标签展示容器（弹性宽，最低28px） */
        .nc-flex-item--agent-tags { flex:1; display:flex; flex-wrap:wrap; gap:4px; min-height:28px; background:#1e1e2f; border:1px solid #3a3a5a; border-radius:6px; padding:4px; }
        /* API状态容器底部（不压缩，上边框） */
        .nc-flex-item--api-footer { flex-shrink: 0; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); }
        /* 快照条目名称（固定120px，溢出截断） */
        .nc-flex-item--entry-name { flex:0 0 120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* 文件信息文字（右对齐，灰色） */
        .nc-flex-item--file-info { flex:1; text-align:right; font-size:12px; color:#888; }
        /* 面板底部居中按钮组 */
        .nc-flex-item--footer-center { flex:1; display:flex; justify-content:center; gap:8px; }
        /* 面板底部左侧按钮组 */
        .nc-flex-item--footer-left { flex:1; display:flex; justify-content:flex-start; gap:8px; }
        /* 面板底部右侧按钮组 */
        .nc-flex-item--footer-right { flex:1; display:flex; gap:10px; justify-content:flex-end; }
        /* flex子项，占满可用空间 */
        .nc-flex-item--grow { flex:1; }
        /* flex子项，占2份（面板主体区） */
        .nc-flex-item--grow2 { flex:2; min-height:0; }
        /* 图片库卡片容器（固定200px宽） */
        .nc-flex-item--image-card { flex: 0 0 auto; width: 200px; margin: 5px; text-align: center; }
        /* 互动场景模态框正文滚动区 */
        .nc-flex-item--interaction { flex:1; overflow-y: auto; padding:12px; }
        /* 互动场景模态框底部按钮行（不压缩） */
        .nc-flex-item--modal-footer { flex-shrink:0; display:flex; gap:10px; justify-content:center; padding:12px; border-top:1px solid rgba(255,255,255,0.1); }
        /* 可滚动模态框内容区（Agent选择表） */
        .nc-flex-item--modal-scroll { flex:1; overflow-y:auto; padding:10px; }
        /* flex子项，禁止压缩（textarea等） */
        .nc-flex-item--no-shrink { flex-shrink: 0; }
        /* flex子项，禁止压缩，下边距4 */
        .nc-flex-item--no-shrink-mb4 { flex-shrink: 0; margin-bottom: 4px; }
        /* flex子项，禁止压缩，上下边距4 */
        .nc-flex-item--no-shrink-my4 { flex-shrink: 0; margin: 4px 0; }
        /* 执行进度区（flex占满+暗背景圆角） */
        .nc-flex-item--progress { flex: 1; overflow-y: auto; background:rgba(0,0,0,.2); padding:10px; border-radius:6px; }
        /* 输入源来源框容器（相对定位） */
        .nc-flex-item--relative { flex:1; position:relative; }
        /* flex可滚动面板（Agent全分类列表） */
        .nc-flex-item--scroll-panel { flex: 1; min-height: 0; overflow-y: auto; }
        /* 上传文件按钮（0.5份宽，绿色背景） */
        .nc-flex-item--upload-btn { flex:0.5; background: #10b981; }
        /* 工作流可视化容器 */
        .nc-flex-item--workflow-viz { flex:1; overflow-y:auto; min-height:0; padding-right:4px; }
        /* gap间距6（当前已启用Agent网格） */
        .nc-gap--6 { gap: 6px; }
        /* 输入源列表表头网格（5列固定宽度） */
        .nc-grid--source-header { display:grid; grid-template-columns:1fr 90px 70px 1fr 30px; gap:8px; margin-bottom:8px; padding:0 4px; color:#888; font-size:12px; font-weight:500; text-transform:uppercase; }

        /* ── 显示/隐藏 ──────────────────────────────── */
        /* .nc-hidden 已在基础CSS中定义为 display:none !important；JS 侧请用 classList.toggle */
        /* 模型选择容器（默认隐藏，点击获取后显示） */
        .nc-hidden--model-select { display:none; margin-bottom:16px; }
        /* 预览面板（默认隐藏，切换后显示） */
        .nc-hidden--preview-pane { display:none; flex:1; overflow-y:auto; padding:12px; background:#0f172a; box-sizing:border-box; }

        /* ── 尺寸/滚动限制 ──────────────────────────────── */
        /* 数据化章节列表（50vh，右内边距，下边距） */
        .nc-size--chapter-list { max-height:50vh; overflow-y:auto; padding-right:4px; margin-bottom:10px; }
        /* 历史章节树形列表容器（60vh） */
        .nc-size--chapter-tree { height:60vh; overflow-y:auto; position:relative; }
        /* 文件管理器内容区（可滚动，内边距10） */
        .nc-size--file-content { overflow-y: auto; padding: 10px; }
        /* 占满父容器高度 */
        .nc-size--full-h { height:100%; }
        /* 模态框正文最大高度50vh */
        .nc-size--max50vh { max-height:50vh; }
        /* 状态书编辑模态框正文最大高度55vh */
        .nc-size--max55vh { max-height:55vh; }
        /* 模态框正文最大60vh，可滚动 */
        .nc-size--max60vh { max-height:60vh; overflow-y:auto; }
        /* 模态框正文50vh带内边距（Galgame项目选择） */
        .nc-size--modal-50vh-pad { max-height:50vh; overflow-y:auto; padding:10px; }
        /* 可滚动200px容器（Galgame快照条目） */
        .nc-size--scroll-200 { max-height:200px; overflow-y:auto; }
        /* 可滚动200px容器（回流条件列表） */
        .nc-size--scroll-200-mb8 { max-height:200px; overflow-y:auto; margin-bottom:8px; }
        /* 可滚动280px容器（输入源列表） */
        .nc-size--scroll-280 { max-height:280px; overflow-y:auto; }
        /* 可滚动300px容器（选项列表） */
        .nc-size--scroll-300 { max-height:300px; overflow-y:auto; }

        /* ── 内容/正文区 ──────────────────────────────── */
        /* 章节查看模态框正文区（滚动，位置相对） */
        .nc-body--chapter-view { padding:12px; overflow-y:auto; max-height:60vh; position:relative; }
        /* 居中灰色空状态提示 */
        .nc-body--empty { padding: 20px; text-align: center; color: #aaa; }
        /* 居中灰色加载提示区域 */
        .nc-body--loading { padding: 20px; overflow-y: auto; text-align: center; color: #aaa; }
        /* 正文内边距12（历史章节编辑模态框） */
        .nc-body--pad12 { padding:12px; }
        /* 正文内边距20（通用模态框） */
        .nc-body--pad20 { padding:20px; }
        /* 带滚动大内边距容器（图片展示区） */
        .nc-body--pad20-scroll { padding: 20px; overflow-y: auto; }

        /* ── 卡片/面板块 ──────────────────────────────── */
        /* 中深色卡片（音频/文件列表项） */
        .nc-card--dark-md { padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; }
        /* 带下边距中深色卡片（其余文件列表项） */
        .nc-card--dark-md-mb10 { margin-bottom: 10px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; }
        /* 深色卡片行布局（Galgame项目列表项） */
        .nc-card--dark-row { padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
        /* 小深色卡片（节点变量分析/快照导入区） */
        .nc-card--dark-sm { background:rgba(0,0,0,0.2); padding:8px; border-radius:4px; }
        /* 图片库缩略图卡片（150px宽） */
        .nc-card--image-thumb { width: 150px; text-align: center; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; }
        /* Galgame项目选择卡片（可hover，带过渡） */
        .nc-card--project-item { padding:10px; margin-bottom:8px; background:rgba(255,255,255,0.05); border-radius:8px; cursor:pointer; transition:background 0.2s; border:1px solid transparent; }
        /* 输入源编辑卡片容器 */
        .nc-card--source-card { background:#2a2a3a; border-radius:8px; padding:12px; margin-bottom:8px; border:1px solid #3a3a5a; }

        /* ── 表格 ──────────────────────────────── */
        /* 紧凑表格（Agent选择表） */
        .nc-table--sm { width:100%; border-collapse:collapse; font-size:12px; }
        /* 紧凑表格（变量监视器表，不同属性顺序） */
        .nc-table--sm2 { width:100%; font-size:12px; border-collapse:collapse; }
        /* 表体行底部边框（暗灰色） */
        .nc-table-row--body { border-bottom:1px solid #333; }
        /* 表头行底部边框（主题紫色） */
        .nc-table-row--header { border-bottom:1px solid #667eea; }
        /* 带内边距5表格单元格 */
        .nc-td--padded { padding:5px; }
        /* 上下内边距2表格单元格（变量列表） */
        .nc-td--tight { padding:2px 0; }
        /* 复选框列表头（30px固定宽） */
        .nc-th--checkbox { text-align:left; padding:5px; width:30px; }
        /* 灰色左对齐表头单元格 */
        .nc-th--muted { text-align:left; color:#aaa; }
        /* 带内边距左对齐表头单元格 */
        .nc-th--padded { text-align:left; padding:5px; }

        /* ── 分隔线 ──────────────────────────────── */
        /* 暗灰色水平分隔线（属性面板区块间） */
        .nc-divider { border-color:#333; margin:15px 0; }
        /* 区块底部分隔线（Galgame变量监视器） */
        .nc-section--border-bottom { border-bottom: 1px solid #333; padding-bottom: 10px; }

        /* ── 图片/媒体 ──────────────────────────────── */
        /* 紧凑音频播放器（最高40px） */
        .nc-audio--compact { width:100%; max-height:40px; }
        /* 全宽音频播放器（Galgame资源库） */
        .nc-audio--full { width:100%; }
        /* Galgame资源库预览图（60px高，封面裁剪） */
        .nc-img--cover-60 { width:100%; max-height:60px; object-fit:cover; border-radius:4px; }
        /* 全宽带紫边框卡片图片 */
        .nc-img--full-card { width: 100%; height: auto; border-radius: 8px; border: 2px solid #667eea; }
        /* Markdown/预览内嵌图片 */
        .nc-img--markdown { max-width:100%; border-radius:8px; border:1px solid #667eea; }
        /* 图片库缩略图（最高100px） */
        .nc-img--thumb-100 { max-width:100%; max-height:100px; border-radius:4px; }

        /* ── 代码/源码预览 ──────────────────────────────── */
        /* Markdown预览代码块 */
        .nc-code-block { background:#1e1e1e; padding:10px; border-radius:5px; }
        /* 错误信息代码块（红字深底） */
        .nc-code-block--error { color:#ff6b6b; background:#1e1e1e; padding:10px; border-radius:5px; }
        /* 源码查看 pre 块（等宽，自动换行） */
        .nc-code-block--pre { background:#1e1e1e; padding:10px; border-radius:5px; font-family:monospace; font-size:12px; white-space:pre-wrap; }
        /* 配置/章节源码主 pre 样式 */
        .nc-code-pre--main { margin:0; padding:12px; font-family:Consolas,monospace; font-size:12px; line-height:1.5; color:#eaeaea; white-space:pre-wrap; word-wrap:break-word; }
        /* 小型代码预览（其余文件库内容预览） */
        .nc-code-pre--mini { font-size:11px; background: #1e1e1e; padding: 5px; border-radius: 4px; max-height: 100px; overflow: auto; }

        /* ── 文字/排版 ──────────────────────────────── */
        /* 音频书条目名称文字 */
        .nc-text--audio-name { font-size:12px; margin-bottom:5px; color:#ccc; }
        /* 加粗文字（章节标题） */
        .nc-text--bold { font-weight:600; }
        /* 加粗灰色文字（节点分析标题等） */
        .nc-text--bold-muted { font-weight:600; color:#aaa; }
        /* 加粗主题色文字（文件ID/音频库标题） */
        .nc-text--bold-primary { font-weight:600; color:#667eea; }
        /* 更粗主题色文字（Agent显示名） */
        .nc-text--bolder-primary { font-weight:bold; color:#667eea; }
        /* 不压缩小号卡片标题（执行进度） */
        .nc-text--card-title { font-size:12px; flex-shrink: 0; }
        /* 居中灰色元信息（章节时间戳等） */
        .nc-text--meta-center { font-size:12px; color:#aaa; margin:5px 0; text-align:center; }
        /* 模型选择橙黄色提示文字 */
        .nc-text--model-tip { font-size:12px; color:#ffaa00; margin-top:4px; }
        /* 右外边距8（开始数据化按钮） */
        .nc-text--mr8 { margin-right:8px; }
        /* 带内边距灰色说明（无快照提示） */
        .nc-text--muted-padded { font-size:12px; color:#aaa; padding:5px; }
        /* API状态小节标题 */
        .nc-text--section-hd { font-size:12px; font-weight:600; margin-bottom:5px; }
        /* 小号文字（变量监视器内容） */
        .nc-text--sm { font-size:12px; }
        /* 可点击小号文字（自动/分支标签） */
        .nc-text--sm-clickable { font-size:12px; cursor:pointer; }
        /* 小号灰色提示文字（-1表示随机等） */
        .nc-text--sm-muted { font-size:12px; color:#888; }
        /* 带上边距小号灰色提示（阶段选择说明） */
        .nc-text--sm-muted-mt2 { font-size:12px; color:#888; margin-top:2px; }
        /* 小号灰色提示文字（暂无启用Agent等，属性顺序不同） */
        .nc-text--sm-muted2 { color:#888; font-size:12px; }
        /* 超小号可换行灰色文字（图片ID） */
        .nc-text--xs-break { font-size:11px; color:#aaa; margin:5px 0; word-break:break-all; }
        /* 居中超小灰色文字（未配置自定义API） */
        .nc-text--xs-center-muted { font-size:11px; color:#888; text-align:center; }
        /* 半透明超小灰色文字（内容长度，带空格） */
        .nc-text--xs-faded { font-size:11px; opacity:.6; color:#aaa; }
        /* 半透明超小灰色文字（紧凑写法） */
        .nc-text--xs-faded-c { font-size:11px; opacity:.6; color:#aaa; }
        /* 超小号浅灰文字（变量分析区内容） */
        .nc-text--xs-light { font-size:11px; color:#ccc; }
        /* 带上边距超小浅灰文字（Agent角色） */
        .nc-text--xs-light-mt4 { font-size:11px; color:#ccc; margin-top:4px; }
        /* 超小号灰色辅助文字（类型/执行间隔说明） */
        .nc-text--xs-muted { font-size:11px; color:#aaa; }
        /* 超小灰色文字（紧凑写法） */
        .nc-text--xs-muted-c { font-size:11px; color:#888; }
        /* 带上边距超小字（脚本变量说明） */
        .nc-text--xs-muted-mt3 { font-size:11px; color:#aaa; margin-top:3px; }
        /* 带上边距超小灰色提示（按住Ctrl多选） */
        .nc-text--xs-muted-mt4 { font-size:11px; color:#888; margin-top:4px; }
        /* 带上边距超小灰色提示（ID格式说明） */
        .nc-text--xs-muted-mt5 { font-size:11px; color:#888; margin-top:5px; }
        /* 带上边距超小字（快照添加说明） */
        .nc-text--xs-muted-mt5-cff0 { font-size:11px; color:#aaa; margin-top:5px; }
        /* 超小号灰色辅助文字（日期/更新时间） */
        .nc-text--xxs-muted { font-size:10px; color:#888; }
        /* 超小号灰色辅助文字（图片ID） */
        .nc-text--xxs-muted2 { font-size:10px; color:#aaa; }

        /* ── 间距工具 ──────────────────────────────── */
        /* 图片加载错误提示（带外边距） */
        .nc-error-img-item { margin:5px; color:#ff6b6b; }
        /* 下外边距10（资源库区块/图片音频分组） */
        .nc-mb10 { margin-bottom:10px; }
        /* 右对齐按钮行（数据化全选/反选） */
        .nc-mb10--btn-row-right { margin-bottom:10px; display:flex; gap:8px; justify-content:flex-end; }
        /* 下外边距12（章节编辑字段组） */
        .nc-mb12 { margin-bottom:12px; }
        /* 下外边距15（通用表单字段间距） */
        .nc-mb15 { margin-bottom:15px; }
        /* 确认对话框居中消息（可折行） */
        .nc-mb15--confirm-msg { margin-bottom:15px; text-align:center; word-wrap:break-word; }
        /* 文件选择行布局（带下边距15） */
        .nc-mb15--file-selector { margin-bottom:15px; display:flex; gap:8px; align-items:center; }
        /* 下外边距16（配置编辑器字段组） */
        .nc-mb16 { margin-bottom:16px; }
        /* 下外边距6（选项卡片标题行） */
        .nc-mb6 { margin-bottom:6px; }
        /* 下外边距8（媒体项目块） */
        .nc-mb8 { margin-bottom:8px; }
        /* Galgame快照条目滚动区（上边距10） */
        .nc-mt10--snapshot-scroll { margin-top:10px; max-height:200px; overflow-y:auto; }
        /* 上外边距12（管理Agent按钮上方间距） */
        .nc-mt12 { margin-top:12px; }
        /* 执行进度区块（上边框 + flex列布局） */
        .nc-mt12--progress-section { margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,.1); display: flex; flex-direction: column; flex: 1; min-height: 0; }
        /* 右对齐上边距4（返回手动输入链接） */
        .nc-mt4--right { margin-top:4px; text-align:right; }
        /* API测试结果文字区 */
        .nc-mt8--test-result { margin-top:8px; font-size:13px; color:#aaa; }
        /* 上下外边距10（音频/图片分组标题） */
        .nc-my10 { margin:10px 0; }

        /* ── 文字对齐 ──────────────────────────────── */
        /* 居中确认对话框内容（可折行） */
        .nc-center--confirm { text-align:center; padding:20px; word-wrap:break-word; }
        /* 居中文字下边距20（数据化标题区） */
        .nc-center--mb20 { text-align:center; margin-bottom:20px; }
        /* 居中下边距20（历史管理标题，紧凑） */
        .nc-center--mb20-c { text-align:center; margin-bottom:20px; }
        /* 居中内边距20（加载中/空状态提示） */
        .nc-center--pad20 { text-align:center; padding:20px; }
        /* 居中内边距20（紧凑） */
        .nc-center--pad20-c { text-align:center; padding:20px; }
        /* 居中内边距20灰色文字（空状态/加载中） */
        .nc-center--pad20-muted { text-align:center; padding:20px; color:#aaa; }
        /* 居中内边距20灰色（紧凑） */
        .nc-center--pad20-muted-c { text-align:center; padding:20px; color:#aaa; }

        /* ── 其他/自动生成 ──────────────────────────────── */
        /* 输入区工具栏（两端对齐，不压缩） */
        .nc-flex--input-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-shrink: 0; }
        /* 关联Agents超小块级灰色标签 */
        .nc-label--agents-hint { color:#aaa; font-size:11px; display:block; margin-bottom:2px; }
        /* 块级灰色标签（连线类型） */
        .nc-label--muted { color:#aaa; display:block; }
        /* 橙黄色警告提示（未检测到角色卡） */
        .nc-text--warning-tip { color:#ffaa00; font-size:13px; margin-top:4px; }
    `;
        document.head.appendChild(style);
    }


    // ╔══════════════════════════════════════════════════════════════════╗
