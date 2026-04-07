    // ║  模块 24：全局暴露与初始化                                        ║
    // ║  window.NovelCreator / baseInit / 启动守卫                       ║
    // ║  入口：baseInit() → injectStyles → Storage.init → UI.createPanel ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module Init — window.NovelCreator 暴露 + baseInit 启动守卫 */

    // ==================== 全局暴露 ====================

    window.NovelCreator = {
        version: CONFIG.VERSION,
        // Agent 工坊入口
        openAgentWorkshop: () => {
            if (typeof AgentWorkshop !== 'undefined') {
                const workshop = new AgentWorkshop();
                workshop.openWorkshop();
                return workshop;
            }
            Notify.error('Agent 工坊模块未加载');
            return null;
        }
    };

    // 主初始化函数
    async function baseInit() {

        injectStyles();

        let ready = false;
        for (let i = 0; i < 60; i++) {
            try {
                API.getContext();
                ready = true;
                break;
            } catch (_) {
                await API.sleep(1000);
            }
        }
        if (!ready) {
            Notify.error('无法获取 SillyTavern 上下文', '初始化失败');
            return;
        }

        const helperKeys = ['getWorldbook', 'updateWorldbookWith', 'triggerSlash', 'stopAllGeneration', 'generate'];
        let helperReady = false;
        for (let i = 0; i < 60; i++) {
            if (typeof TavernHelper !== 'undefined' && helperKeys.every(k => typeof TavernHelper[k] === 'function')) {
                helperReady = true;
                break;
            }
            await API.sleep(1000);
        }
        if (!helperReady) {
            Notify.error('酒馆助手 (TavernHelper) 未正确加载', '初始化失败');
            return;
        }

        try {
            const saved = localStorage.getItem(CONFIG.TOKEN_STATS_KEY);
            if (saved) WORKFLOW_STATE.tokenStats = JSON.parse(saved);
        } catch (_) {
            // localStorage 损坏或不可用，使用默认 tokenStats，不影响启动
        }

        // 加载保存的预选状态（此时可能为空）
        const savedSelection = Storage.loadSelectionState();
        WORKFLOW_STATE.selectionState = { ...WORKFLOW_STATE.selectionState, ...savedSelection };

        // 在 baseInit 中，找到 Storage.init 调用之后（约第9800行）
        try {
            await Storage.init();
        } catch (e) {
            console.error('[Storage] 初始化失败，但仍尝试继续', e);
            HISTORY_CACHE = { chapters: [], lastUpdate: Date.now() };
        }

        try {
            await MappingManager.loadAll();

        } catch (e) {
            console.error('[baseInit] 加载映射表失败', e);
        }

        const settings = Storage.loadSettings();
        WORKFLOW_STATE.currentProfile = settings.profile || 'standard';

        WORKFLOW_STATE.autoMode = Storage.loadAutoMode();

        if (!CONFIG.AGENTS || typeof CONFIG.AGENTS !== 'object') {
            CONFIG.AGENTS = {};
        }

        if (!WORKFLOW_STATE.isRunning) {
            AgentStateManager.init(); // 未运行时重置为idle
        } else {
            // 运行时保留现有状态，但确保所有配置中的agent都有状态（防止遗漏）
            for (const key of Object.keys(CONFIG.AGENTS)) {
                if (AgentStateManager.states[key] === undefined) {
                    AgentStateManager.states[key] = 'idle';
                }
            }
        }

        UI.createFloatButton();
        localStorage.removeItem(CONFIG.SETTINGS_KEY);  // 清除保存的设置

        Notify.success(`${CONFIG.NAME} v${CONFIG.VERSION} 已加载，请先加载配置文件`, '', { timeOut: 2000 });
    }

    if (!window.__novelCreatorInit) {
        window.__novelCreatorInit = true;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', baseInit);
        } else {
            setTimeout(baseInit, 100);
        }
    }
