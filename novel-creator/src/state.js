    // ║  模块 03：状态管理                                                  ║
    // ║  StateStore — 统一状态容器，按职责分组，支持订阅与重置               ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /**
     * @module StateStore
     * 唯一全局状态容器，取代散乱的 WORKFLOW_STATE 直接赋值。
     *
     * 用法：
     *   StateStore.get('isRunning')          // 读取
     *   StateStore.set('isRunning', true)     // 写入（自动通知订阅者）
     *   StateStore.reset('chapter')           // 按分组重置
     *   StateStore.subscribe('isRunning', cb) // 监听变化
     *
     * 分组（GROUP）：
     *   runtime   — 工作流运行时核心状态（可跨章节持续）
     *   chapter   — 每章开始时清零的临时状态
     *   input     — 用户输入与等待队列
     *   reflow    — 回流子系统专属状态
     *   ui        — 面板/历史/Galgame UI 状态
     *   config    — 配置与 profile 状态
     *   agent     — Agent 运行状态（原 AgentStateManager）
     */
    const StateStore = (() => {
        // ── 状态定义（字段 + 默认值 + 所属分组） ──────────────────────
        const SCHEMA = {
            // ─── runtime：运行时核心（跨章节持续） ───
            isRunning: { default: false, group: 'runtime' },
            shouldStop: { default: false, group: 'runtime' },
            startTime: { default: null, group: 'runtime' },
            currentStep: { default: '', group: 'runtime' },
            currentChapter: { default: 1, group: 'runtime' },
            enabledAgents: { default: [], group: 'runtime' },
            agentExecutionOrder: { default: [], group: 'runtime' },
            tokenStats: { default: () => ({ totalInput: 0, totalOutput: 0, lastInput: 0, lastOutput: 0 }), group: 'runtime' },
            progressLog: { default: [], group: 'runtime' },
            abortController: { default: null, group: 'runtime' },
            lastCheckFailed: { default: false, group: 'runtime' },
            lastCheckErrorMessage: { default: '', group: 'runtime' },
            lastAgentError: { default: {}, group: 'runtime' },
            apiStatus: { default: {}, group: 'runtime' },
            chapterMemory: { default: {}, group: 'runtime' },
            lastSerialOutput: { default: null, group: 'runtime' }, // { agentKey, output }
            beforeDependencies: { default: null, group: 'runtime' },
            currentParentNum: { default: null, group: 'runtime' },
            dataficationCache: { default: null, group: 'runtime' },
            autoMode: { default: false, group: 'runtime' },

            // ─── chapter：每章开始时清零 ───
            outputs: { default: {}, group: 'chapter' },
            agentRawOutputs: { default: {}, group: 'chapter' },
            discarded: { default: false, group: 'chapter' },
            discardedChapter: { default: null, group: 'chapter' },
            discardReason: { default: null, group: 'chapter' },
            lastStateContents: { default: null, group: 'chapter' },
            currentInteractionResult: { default: null, group: 'chapter' },

            // ─── input：用户输入与等待队列 ───
            awaitingInput: { default: false, group: 'input' },
            inputResolver: { default: null, group: 'input' },
            inputRejector: { default: null, group: 'input' },
            pendingUserInput: { default: '', group: 'input' },
            pendingInputMode: { default: null, group: 'input' },
            currentWaitingAgent: { default: null, group: 'input' },
            currentWaitingInputIndex: { default: null, group: 'input' },
            inputRequestQueue: { default: [], group: 'input' },
            isProcessingInput: { default: false, group: 'input' },
            userInputCache: { default: '', group: 'input' },
            currentUserInput: { default: '', group: 'input' },
            lastInputCache: { default: {}, group: 'input' },
            agentInputCache: { default: {}, group: 'input' },
            pendingInputBySrc: { default: {}, group: 'input' },

            // ─── reflow：回流子系统 ───
            reflowInputCache: { default: {}, group: 'reflow' },
            reflowCacheStack: { default: [], group: 'reflow' },
            currentReflowCache: { default: null, group: 'reflow' },
            reflowMap: { default: {}, group: 'reflow' },
            reflowWaiting: { default: {}, group: 'reflow' },
            reflowTargetLastSource: { default: {}, group: 'reflow' },
            reflowTargetCount: { default: {}, group: 'reflow' },

            // ─── ui：界面与导航状态 ───
            activeChapterNum: { default: undefined, group: 'ui' },
            currentBranchStart: { default: undefined, group: 'ui' },
            currentBranchLatest: { default: undefined, group: 'ui' },
            galProject: { default: null, group: 'ui' },
            galProjectId: { default: null, group: 'ui' },

            // ─── config：配置与 profile ───
            currentProfile: { default: 'standard', group: 'config' },
            currentConfigFile: { default: null, group: 'config' },
            configMode: { default: 'normal', group: 'config' },
            configVersion: { default: null, group: 'config' },
            configDescription: { default: null, group: 'config' },
            globalPrompt: { default: null, group: 'config' },
            selectionState: { default: {}, group: 'config' },
            enforceUniqueBranches: { default: false, group: 'config' },
        };

        // ── 内部状态对象 ──────────────────────────────────────────────
        const _state = {};
        const _listeners = {}; // key -> Set<callback>

        // 用工厂函数初始化，避免多处共享同一个对象引用
        function _defaultVal(key) {
            const def = SCHEMA[key].default;
            return typeof def === 'function' ? def() : (
                def !== null && typeof def === 'object' ? JSON.parse(JSON.stringify(def)) : def
            );
        }

        function _init() {
            for (const key of Object.keys(SCHEMA)) {
                _state[key] = _defaultVal(key);
            }
        }
        _init();

        // ── 公共 API ──────────────────────────────────────────────────
        const store = {
            /**
             * 读取状态字段
             * @param {string} key
             */
            get(key) {
                if (!(key in SCHEMA)) {
                    console.warn(`[StateStore.get] 未知字段: "${key}"`);
                }
                return _state[key];
            },

            /**
             * 写入状态字段，值变化时通知订阅者
             * @param {string} key
             * @param {*} value
             */
            set(key, value) {
                if (!(key in SCHEMA)) {
                    console.warn(`[StateStore.set] 未知字段: "${key}"，已忽略`);
                    return;
                }
                const prev = _state[key];
                _state[key] = value;
                if (prev !== value && _listeners[key]) {
                    for (const cb of _listeners[key]) {
                        try { cb(value, prev); } catch (e) { console.error(`[StateStore] 订阅回调出错(${key}):`, e); }
                    }
                }
            },

            /**
             * 订阅字段变化
             * @param {string} key
             * @param {function} callback  (newValue, oldValue) => void
             * @returns {function} 取消订阅函数
             */
            subscribe(key, callback) {
                if (!_listeners[key]) _listeners[key] = new Set();
                _listeners[key].add(callback);
                return () => _listeners[key].delete(callback);
            },

            /**
             * 按分组重置（不传则重置全部）
             * @param {'runtime'|'chapter'|'input'|'reflow'|'ui'|'config'|'agent'|undefined} group
             */
            reset(group) {
                for (const [key, schema] of Object.entries(SCHEMA)) {
                    if (!group || schema.group === group) {
                        const newVal = _defaultVal(key);
                        const prev = _state[key];
                        _state[key] = newVal;
                        if (prev !== newVal && _listeners[key]) {
                            for (const cb of _listeners[key]) {
                                try { cb(newVal, prev); } catch (e) { }
                            }
                        }
                    }
                }
            },

            /**
             * 返回当前全部状态的快照（用于调试/导出）
             */
            snapshot() {
                return { ..._state };
            },

            /**
             * 列出某分组的所有字段（用于调试）
             */
            groupFields(group) {
                return Object.entries(SCHEMA)
                    .filter(([_, s]) => s.group === group)
                    .map(([k]) => k);
            },
        };

        // ── Agent 状态子模块（原 AgentStateManager，内嵌于 StateStore） ──
        const _agentStates = {}; // agentKey -> AgentStatus

        store.agent = {
            /** 初始化所有 Agent 为 idle */
            init() {
                if (!CONFIG.AGENTS || typeof CONFIG.AGENTS !== 'object') {
                    console.warn('[StateStore.agent.init] CONFIG.AGENTS 无效');
                    return;
                }
                for (const key of Object.keys(CONFIG.AGENTS)) {
                    _agentStates[key] = 'idle';
                }
            },

            /** 设置单个 Agent 状态，仅在值变化时通知 UI */
            setState(agentKey, status) {
                if (!CONFIG.AGENTS?.[agentKey]) return;
                if (_agentStates[agentKey] === status) return;
                _agentStates[agentKey] = status;
                UI.updateAgentStatusButton(agentKey);
            },

            /** 读取单个 Agent 状态 */
            getState(agentKey) {
                return _agentStates[agentKey] || 'idle';
            },

            /** 重置全部 Agent 为 idle，并刷新 UI */
            reset() {
                if (!CONFIG.AGENTS) return;
                for (const key of Object.keys(CONFIG.AGENTS)) {
                    _agentStates[key] = 'idle';
                }
                UI.updateAllAgentStatusButtons();
            },

            /** 返回所有 Agent 状态快照 */
            snapshot() { return { ..._agentStates }; },
        };

        return store;
    })();

    // ── 向后兼容代理 ──────────────────────────────────────────────────
    // 保持 WORKFLOW_STATE.xxx 读写语法不变，内部路由到 StateStore
    // 新代码请直接使用 StateStore.get/set
    const WORKFLOW_STATE = new Proxy({}, {
        get(_, key) { return StateStore.get(key); },
        set(_, key, value) { StateStore.set(key, value); return true; },
    });

    // ── 历史缓存（非工作流状态，单独保留） ────────────────────────────
    let HISTORY_CACHE = { chapters: [], lastUpdate: null };

    // ── 状态模板缓存（ConfigParser 填充，UI 读取） ─────────────────────
    let stateTemplatesByBook = {};

    // ── 全局快捷键 ────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const top = ModalStack._stack[ModalStack._stack.length - 1];
            if (top) UI._closeModal(top);
        }
    });


    // ╔══════════════════════════════════════════════════════════════════╗