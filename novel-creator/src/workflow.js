    // ║  模块 23：工作流                                                 ║
    // ║  openPanelWithCheck / activateAllExistingStateBooks / Workflow — 主执行引擎║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module Workflow — 核心执行引擎：多 Agent 串/并行、回流、人工审核 */

    // ── 保持原有全局函数名（被大量调用点引用） ────────────────────────
    async function openPanelWithCheck(force = false) {


        // 如果存在上次检查失败的结果且不是强制重新检查，则直接显示错误面板
        if (!force && WORKFLOW_STATE.lastCheckFailed) {

            UI.showErrorPanel(WORKFLOW_STATE.lastCheckErrorMessage);
            return;
        }

        try {
            UI.closeAll();


            const checkResults = await PreCheck.checkAll();


            if (!checkResults.allPassed) {
                const errorMsg = PreCheck.formatErrorMessage(checkResults);
                console.warn('[openPanelWithCheck] 前置检测未通过，格式化后的错误信息：\n', errorMsg);
                UI.showErrorPanel(errorMsg);
                return;
            }

            WORKFLOW_STATE.apiStatus = checkResults.apiStatus || {};


            try {

                const templates = await loadAllStateTemplates();
                stateTemplatesByBook = {};
                templates.forEach(t => {
                    stateTemplatesByBook[t.bookIndex] = t.categoryMap;
                });

            } catch (e) {
                console.warn('[openPanelWithCheck] 加载状态模板失败，状态编辑器可能降级为文本模式', e);
                stateTemplatesByBook = {};
            }


            await UI.createPanel();


        } catch (e) {
            console.error('[openPanelWithCheck] 未捕获的错误:', e);
            UI.showErrorPanel('打开面板时发生错误：\n' + e.message + '\n\n' + e.stack);
        }
    }

    // ==================== 工作流 ====================

    async function activateAllExistingStateBooks() {

        // 获取所有存在的状态书（通过尝试读取）
        const allExisting = [];
        let index = 1;
        while (index <= CONFIG.MAX_STATE_BOOKS) {
            const bookName = `${CONFIG.STATE_BOOK_PREFIX}${index}`;
            try {
                const book = await API.getWorldbook(bookName);
                if (book && (Array.isArray(book) ? book.length : (book.entries && Object.keys(book.entries).length) > 0)) {
                    allExisting.push(bookName);
                } else {
                    break; // 遇到不存在的停止
                }
            } catch (e) {
                break;
            }
            index++;
        }

        if (allExisting.length === 0) return;

        // 获取当前激活列表
        let currentGlobalBooks = [];
        try {
            if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                currentGlobalBooks = await TavernHelper.getGlobalWorldbookNames();
            } else if (typeof window.getGlobalWorldbookNames === 'function') {
                currentGlobalBooks = await window.getGlobalWorldbookNames();
            } else {
                console.warn('[activateAllExistingStateBooks] 无法获取全局激活列表，跳过激活');
                return;
            }
        } catch (e) {
            console.warn('[activateAllExistingStateBooks] 获取激活列表失败:', e);
            return;
        }

        // 需要激活的 = 存在但不在激活列表中的
        const toActivate = allExisting.filter(book => !currentGlobalBooks.includes(book));
        if (toActivate.length === 0) return;

        const newGlobalBooks = [...new Set([...currentGlobalBooks, ...toActivate])];
        try {
            if (typeof TavernHelper?.rebindGlobalWorldbooks === 'function') {
                await TavernHelper.rebindGlobalWorldbooks(newGlobalBooks);
                UI.updateProgress(`已激活 ${toActivate.length} 本状态书: ${toActivate.join(', ')}`);
            } else {
                console.warn('[activateAllExistingStateBooks] rebindGlobalWorldbooks 不可用');
            }
        } catch (e) {
            console.error('[activateAllExistingStateBooks] 激活失败:', e);
        }
    }

    const Workflow = {

        // 执行单章工作流
        async executeOneChapter() {
            // 获取用户输入（每次重新读取文本框）
            const userInput = document.getElementById('nc-user-input')?.value.trim() || '';

            // 根据预选配置计算启用的Agent
            const calculatedAgents = UI.calculateAgentsFromSelection();

            // 检查必需Agent
            const requiredAgents = Object.entries(CONFIG.AGENTS)
                .filter(([_, agent]) => agent.required)
                .map(([key]) => key);
            const missingRequired = requiredAgents.filter(req => !calculatedAgents.includes(req));
            if (missingRequired.length > 0) {
                const missingNames = missingRequired.map(k => CONFIG.AGENTS[k]?.name || k).join(', ');
                Notify.error(`配置缺少以下必选Agent:\n${missingNames}`, '配置错误');
                return { success: false, error: '缺少必选Agent' };
            }

            WORKFLOW_STATE.enabledAgents = calculatedAgents;

            // 重置本章开始前的状态（chapter / input / reflow 三个分组全部清零）
            StateStore.reset('chapter');
            StateStore.reset('input');
            StateStore.reset('reflow');

            AgentStateManager.reset();

            // 每章开始时创建新的AbortController
            if (WORKFLOW_STATE.abortController) {
                try {
                    WORKFLOW_STATE.abortController.abort();
                } catch (_) {
                    // 重复 abort() 是安全的，浏览器有时仍抛出；静默忽略
                }
            }
            WORKFLOW_STATE.abortController = new AbortController();


            // 计算下一章编号
            const chapters = Storage.loadChapters();
            const nextChapterNum = chapters.length > 0 ? Math.max(...chapters.map(c => c.num)) + 1 : 1;
            WORKFLOW_STATE.currentChapter = nextChapterNum;

            // ===== 分支系统：确定父章节号 =====
            let parentNum = null;
            if (WORKFLOW_STATE.currentBranchLatest !== undefined) {
                parentNum = WORKFLOW_STATE.currentBranchLatest;

            } else {
                const last = chapters.length ? Math.max(...chapters.map(c => c.num)) : 0;
                parentNum = last > 0 ? last : null;

            }
            // 存入临时状态，供 executeWorkflow 使用
            WORKFLOW_STATE.currentParentNum = parentNum;

            // 显示章节开始分隔线
            UI.updateProgress(`=== 开始第 ${nextChapterNum} 章 ===`);

            // 动态构建分类名称显示
            if (CONFIG.categories) {
                for (const [catKey, cat] of Object.entries(CONFIG.categories)) {
                    const selected = WORKFLOW_STATE.selectionState[catKey];
                    if (selected) {
                        const optionName = cat.options[selected]?.name || selected;
                        UI.updateProgress(`${cat.name}: ${optionName}`);
                    }
                }
            }
            UI.updateProgress(`启用Agent: ${calculatedAgents.length}个`);

            // 执行工作流
            return await this.executeWorkflow(calculatedAgents, userInput);
        },

        // 新增：数据化模式标志及当前处理章节信息
        isDataficationMode: false,
        dataficationChapterContent: '',
        dataficationChapterNum: 0,
        dataficationChapters: [],
        dataficationCurrentIndex: 0,

        async startDatafication(chapters) {
            if (!chapters || chapters.length === 0) {
                Notify.warning('没有选中任何章节，请先选择要数据化的章节', '', { timeOut: 2000 });
                return;
            }

            if (WORKFLOW_STATE.isRunning) {
                Notify.warning('已有工作流正在运行，请先停止', '', { timeOut: 2000 });
                return;
            }

            // ==== 重置Agent相关内存数据，但不影响世界书和历史章节 ====
            // 保留配置文件信息
            const oldConfigFile = WORKFLOW_STATE.currentConfigFile;
            const oldSelectionState = WORKFLOW_STATE.selectionState;
            const oldCurrentProfile = WORKFLOW_STATE.currentProfile;
            const oldAutoMode = WORKFLOW_STATE.autoMode;

            // 重置Agent执行相关字段
            WORKFLOW_STATE.outputs = {};
            WORKFLOW_STATE.agentRawOutputs = {};  // <--- 新增
            WORKFLOW_STATE.chapterMemory = {};
            WORKFLOW_STATE.lastSerialOutput = null;
            WORKFLOW_STATE.lastInputCache = {};
            WORKFLOW_STATE.agentInputCache = {};
            WORKFLOW_STATE.reflowMap = {};
            WORKFLOW_STATE.reflowWaiting = {};
            WORKFLOW_STATE.reflowTargetLastSource = {};
            WORKFLOW_STATE.reflowTargetCount = {};
            WORKFLOW_STATE.currentReflowCache = null;
            WORKFLOW_STATE.reflowCacheStack = [];
            WORKFLOW_STATE.currentStep = '';
            WORKFLOW_STATE.discarded = false;
            WORKFLOW_STATE.discardedChapter = null;
            WORKFLOW_STATE.userInputCache = '';
            WORKFLOW_STATE.progressLog = [];
            WORKFLOW_STATE.awaitingInput = false;
            WORKFLOW_STATE.inputResolver = null;
            WORKFLOW_STATE.pendingUserInput = '';
            WORKFLOW_STATE.currentWaitingAgent = null;
            WORKFLOW_STATE.currentWaitingInputIndex = null;
            WORKFLOW_STATE.inputRequestQueue = [];
            WORKFLOW_STATE.isProcessingInput = false;
            WORKFLOW_STATE.currentUserInput = '';
            WORKFLOW_STATE.pendingInputBySrc = {};
            WORKFLOW_STATE.reflowInputCache = {};

            // 保留配置文件相关字段
            WORKFLOW_STATE.currentConfigFile = oldConfigFile;
            WORKFLOW_STATE.selectionState = oldSelectionState;
            WORKFLOW_STATE.currentProfile = oldCurrentProfile;
            WORKFLOW_STATE.autoMode = oldAutoMode;

            // 重置Agent状态管理器
            AgentStateManager.reset();

            this.isDataficationMode = true;
            UI.updateWorkflowViz();  // 立即刷新工作流预览，显示“数据化模式”横幅

            this.dataficationChapters = chapters;
            this.dataficationCurrentIndex = 0;

            WORKFLOW_STATE.autoMode = true; // 数据化模式强制自动
            WORKFLOW_STATE.isRunning = true;
            WORKFLOW_STATE.shouldStop = false;

            UI.updateFloatButtonText();
            UI.setLoading(true);
            UI.clearProgress();

            try {
                for (let i = 0; i < chapters.length; i++) {
                    if (WORKFLOW_STATE.shouldStop) {
                        UI.updateProgress('⏸️ 用户中断数据化');
                        break;
                    }

                    const chapter = chapters[i];
                    const fullChapterContent = `第${chapter.num}章 ${chapter.title || ''}\n\n${chapter.content}`;

                    UI.updateProgress(`=== 开始数据化第 ${chapter.num} 章：${chapter.title} ===`);

                    this.dataficationChapterNum = chapter.num;
                    this.dataficationChapterContent = fullChapterContent;

                    const result = await this._executeDataficationChapter(chapter);

                    if (!result.success) {
                        UI.updateProgress(`❌ 第 ${chapter.num} 章数据化失败，已停止`, true);
                        break;
                    }

                    UI.updateProgress(`✅ 第 ${chapter.num} 章数据化完成`);
                    await API.sleep(500);
                }
            } catch (e) {
                if (e.name === 'UserInterruptError') {
                    UI.updateProgress('⏸️ 用户中断数据化', true);
                } else {
                    UI.updateProgress(`❌ 数据化异常：${e.message}`, true);
                    console.error('[DEBUG][Workflow.startDatafication] 异常:', e);
                    Notify.error('数据化过程中发生错误');
                }
            } finally {
                this.isDataficationMode = false;
                WORKFLOW_STATE.isRunning = false;
                UI.setLoading(false);
                Storage.saveTokenStats(WORKFLOW_STATE.tokenStats);
                UI.updateAllAgentStatusButtons();
                UI.updateFloatButtonText();
                UI.updateWorkflowViz();  // 刷新工作流预览，隐藏数据化横幅
                Notify.success('数据化处理结束', '', { timeOut: 2000 });
            }
        },

        _resetStateBooksForDatafication: async function () {
            let allBooks = [];

            // 获取所有世界书列表（尝试多种方法）
            // 尝试1: TavernHelper.getAllWorldbookNames
            if (typeof TavernHelper?.getAllWorldbookNames === 'function') {
                try {
                    allBooks = await TavernHelper.getAllWorldbookNames();
                } catch (e) {
                    console.warn('[Workflow._resetStateBooksForDatafication] 调用 TavernHelper.getAllWorldbookNames 失败:', e);
                    allBooks = [];
                }
            }

            // 尝试2: 从 context.worldInfo 提取
            if (allBooks.length === 0) {
                try {
                    const context = API.getContext();
                    if (context.worldInfo && Array.isArray(context.worldInfo)) {
                        allBooks = context.worldInfo.map(w => w.name).filter(Boolean);
                    } else {
                    }
                } catch (e) {
                    console.warn('[Workflow._resetStateBooksForDatafication] 尝试获取 context.worldInfo 失败:', e);
                }
            }

            // 尝试3: 回退到全局激活的世界书列表（仅激活的，可能不全）
            if (allBooks.length === 0) {
                console.warn('[Workflow._resetStateBooksForDatafication] 无法获取所有世界书列表，将尝试从激活列表中获取（可能不完整）');
                try {
                    if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                        allBooks = await TavernHelper.getGlobalWorldbookNames();
                    } else if (typeof window.getGlobalWorldbookNames === 'function') {
                        allBooks = await window.getGlobalWorldbookNames();
                    }
                } catch (e) {
                    console.warn('[Workflow._resetStateBooksForDatafication] 获取激活列表失败:', e);
                }
            }

            // 如果没有获取到任何世界书，直接返回
            if (allBooks.length === 0) {
                console.warn('[Workflow._resetStateBooksForDatafication] 未找到任何世界书，返回');
                return { deletedCount: 0, deactivatedCount: 0 };
            }

            // 分类：状态书 和 其他书（仅用于统计）
            const stateBooks = allBooks.filter(name => name && name.startsWith(CONFIG.STATE_BOOK_PREFIX));
            const nonStateBooks = allBooks.filter(name => name && !name.startsWith(CONFIG.STATE_BOOK_PREFIX));

            // 1. 删除所有状态书
            let deletedCount = 0;
            for (const bookName of stateBooks) {
                UI.updateProgress(`  删除状态书: ${bookName}...`);

                try {
                    let success = false;
                    if (typeof TavernHelper?.deleteWorldbook === 'function') {
                        const result = await TavernHelper.deleteWorldbook(bookName);
                        success = result === true;
                    } else if (typeof window.deleteWorldbook === 'function') {
                        const result = await window.deleteWorldbook(bookName);
                        success = result === true;
                    } else {
                        throw new Error('deleteWorldbook API 不可用');
                    }

                    if (success) {
                        UI.updateProgress(`    ✅ 已删除 ${bookName}`);
                        deletedCount++;
                    } else {
                        UI.updateProgress(`    ⚠️ ${bookName} 删除失败（可能不存在）`, true);
                        console.warn(`[Workflow._resetStateBooksForDatafication] ${bookName} 删除失败，可能不存在`);
                    }
                } catch (e) {
                    UI.updateProgress(`    ❌ 删除 ${bookName} 时出错: ${e.message}`, true);
                    console.error(`[Workflow._resetStateBooksForDatafication] 删除 ${bookName} 时发生异常:`, e);
                }
                await API.sleep(100);
            }

            // 2. 记录当前激活列表的长度（用于统计），然后调用 _deactivateAllWorldbooks 取消激活所有世界书
            let currentGlobalBooks = [];
            try {
                if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                    currentGlobalBooks = await TavernHelper.getGlobalWorldbookNames();
                }
            } catch (e) {
                console.warn('[Workflow._resetStateBooksForDatafication] 获取当前激活列表失败（不影响后续取消激活）:', e);
            }

            const deactivatedCount = currentGlobalBooks.length;

            // 调用专用的取消激活函数
            try {
                await this._deactivateAllWorldbooks();
            } catch (e) {
                console.error('[Workflow._resetStateBooksForDatafication] 调用 _deactivateAllWorldbooks 时出错:', e);
                UI.updateProgress(`  ⚠️ 取消激活世界书时出错: ${e.message}`, true);
            }

            return { deletedCount, deactivatedCount };
        },

        async _deactivateAllWorldbooks() {

            try {
                // 获取当前全局激活的世界书列表
                let currentGlobalBooks = [];
                if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                    currentGlobalBooks = await TavernHelper.getGlobalWorldbookNames();

                } else {
                    console.warn('[Workflow._deactivateAllWorldbooks] TavernHelper.getGlobalWorldbookNames 不可用');
                    return;
                }

                // 清空全局激活列表
                if (typeof TavernHelper?.rebindGlobalWorldbooks === 'function') {
                    await TavernHelper.rebindGlobalWorldbooks([]);

                } else {
                    console.warn('[Workflow._deactivateAllWorldbooks] TavernHelper.rebindGlobalWorldbooks 不可用');
                    return;
                }

                // 验证是否成功清空
                await API.sleep(300);
                let afterBooks = [];
                if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                    afterBooks = await TavernHelper.getGlobalWorldbookNames();

                    if (afterBooks.length > 0) {
                        console.warn('[Workflow._deactivateAllWorldbooks] 仍有世界书激活:', afterBooks);
                    } else {

                    }
                }
            } catch (e) {
                console.error('[Workflow._deactivateAllWorldbooks] 取消激活世界书时出错:', e);
                UI.updateProgress(`⚠️ 取消激活世界书失败: ${e.message}`, true);
            }
        },

        /**
         * 根据 Agent 角色执行对应的专用函数
         * @param {string} agentKey - Agent 键
         * @param {boolean} isReflow - 是否为回流执行
         * @param {Object} options - 执行选项，包含 { userInput, isParallel, parallelBeforeSnapshot }
         * @returns {Promise<void>}
         */
        async _executeAgentByRole(agentKey, isReflow, options = {}) {
            const { userInput = '', isParallel = false, parallelBeforeSnapshot = null } = options;
            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) return;

            switch (agent.role) {
                // 图像相关
                case 'fusionGenerator':
                    await this._executeFusionGenerator(agentKey, userInput, isReflow, {
                        isParallel,
                        parallelBeforeSnapshot
                    });
                    break;
                case 'imageGenerator':
                    await this._executeImageGenerator(agentKey, userInput, isReflow, {
                        isParallel,
                        parallelBeforeSnapshot
                    });
                    break;
                case 'imageVariator':
                    await this._executeImageVariator(agentKey, isReflow, { isParallel, parallelBeforeSnapshot });
                    break;
                case 'imageLibrarian':
                    await this._executeImageLibrarian(agentKey, isReflow, { isParallel, parallelBeforeSnapshot });
                    break;
                case 'typesetter':
                    await this._executeTypesetter(agentKey, isReflow, { isParallel, parallelBeforeSnapshot });
                    break;

                // 状态管理（优化师、维护师暂不支持回流和并行参数）
                case 'optimizer':
                    await this._executeOptimizer(agentKey);
                    break;
                case 'updater':
                    await this._executeUpdater(agentKey);
                    break;

                // 音频相关
                case 'musicGenerator':
                    await this._executeMusicGenerator(agentKey, isReflow, { isParallel, parallelBeforeSnapshot });
                    break;
                case 'voiceCloner':
                    await this._executeVoiceCloner(agentKey, isReflow, { isParallel, parallelBeforeSnapshot });
                    break;
                case 'audioEditor':
                    await this._executeAudioEditor(agentKey, isReflow, { isParallel, parallelBeforeSnapshot });
                    break;
                case 'audioLibrarian':
                    await this._executeAudioLibrarian(agentKey, isReflow, { isParallel, parallelBeforeSnapshot });
                    break;

                // 默认通用 Agent
                default:
                    await this._executeAgent(agentKey, userInput, isReflow, { isParallel, parallelBeforeSnapshot });
            }
        },

        /**
         * 执行单章数据化
         * @param {Object} chapter - 章节对象 { num, title, content }
         * @returns {Promise<{success: boolean}>}
         */
        async _executeDataficationChapter(chapter) {
            WORKFLOW_STATE.currentChapter = chapter.num;

            // 重置本章状态
            WORKFLOW_STATE.outputs = {};
            WORKFLOW_STATE.agentRawOutputs = {};
            WORKFLOW_STATE.reflowCacheStack = [];
            WORKFLOW_STATE.currentReflowCache = null;
            WORKFLOW_STATE.reflowMap = {};
            WORKFLOW_STATE.reflowWaiting = {};
            WORKFLOW_STATE.discarded = false;
            WORKFLOW_STATE.discardedChapter = null;
            WORKFLOW_STATE.currentWaitingAgent = null;
            WORKFLOW_STATE.awaitingInput = false;
            WORKFLOW_STATE.inputResolver = null;
            WORKFLOW_STATE.pendingInputMode = null;
            WORKFLOW_STATE.currentUserInput = '';
            WORKFLOW_STATE.lastInputCache = {};
            WORKFLOW_STATE.agentInputCache = {};
            WORKFLOW_STATE.pendingInputBySrc = {};
            WORKFLOW_STATE.reflowInputCache = {};
            WORKFLOW_STATE.reflowTargetLastSource = {};
            WORKFLOW_STATE.reflowTargetCount = {};

            AgentStateManager.reset();

            const enabledAgents = UI.calculateAgentsFromSelection();
            WORKFLOW_STATE.enabledAgents = enabledAgents;

            // 数据化模式下无需用户输入，但后续调用需要 userInput 参数
            const userInput = '';

            // 获取最终章节师的键
            const finalAgentKey = this._getAgentKeyByRole('finalChapter');

            // 数据化模式下，跳过 finalChapter 的生成，直接使用导入的原始章节内容
            if (finalAgentKey) {
                WORKFLOW_STATE.outputs[finalAgentKey] = Workflow.dataficationChapterContent;
                AgentStateManager.setState(finalAgentKey, 'completed');
                UI.updateProgress(`✅ ${getAgentDisplayName(finalAgentKey)} (跳过生成，使用原始章节)`);
            } else {
                console.error(`[DEBUG][_executeDataficationChapter] 未找到 finalChapter 角色，数据化可能失败`);
                UI.updateProgress(`❌ 未找到最终章节师角色，无法继续`, true);
                return { success: false };
            }

            const preSnapshot = await Snapshot.create();

            // 获取所有工作流阶段并按 stage 排序
            const sortedStages = CONFIG.WORKFLOW_STAGES.sort((a, b) => a.stage - b.stage);

            let aborted = false; // 标记是否因废章而终止

            try {
                for (const stage of sortedStages) {
                    // 阶段开始时检查中断
                    if (WORKFLOW_STATE.shouldStop) {
                        throw new UserInterruptError();
                    }

                    const stageAgents = stage.agents.filter(key => enabledAgents.includes(key));
                    if (stageAgents.length === 0) continue;

                    UI.updateProgress(`=== 阶段${stage.stage}: ${stage.name} ${stage.mode === 'parallel' ? '(并行)' : ''} ===`);

                    if (stage.mode === 'serial') {
                        // 串行执行：按 order 排序后依次执行
                        const sorted = stageAgents.sort((a, b) =>
                            (CONFIG.AGENTS[a]?.order || 999) - (CONFIG.AGENTS[b]?.order || 999)
                        );
                        for (const agentKey of sorted) {
                            // ===== 替换点：串行阶段调用公共函数 =====
                            await this._executeAgentByRole(agentKey, false, { userInput, isParallel: false });
                        }
                    } else {
                        // 并行阶段：需要处理 before 快照
                        const parallelBeforeSnapshot = WORKFLOW_STATE.lastSerialOutput;

                        const parallelAgents = stageAgents.filter(key => CONFIG.AGENTS[key]?.parallel === true)
                            .sort((a, b) => (CONFIG.AGENTS[a]?.order || 999) - (CONFIG.AGENTS[b]?.order || 999));
                        const serialAgents = stageAgents.filter(key => CONFIG.AGENTS[key]?.parallel !== true)
                            .sort((a, b) => (CONFIG.AGENTS[a]?.order || 999) - (CONFIG.AGENTS[b]?.order || 999));

                        if (parallelAgents.length > 0) {
                            UI.updateProgress(`  并行执行: ${parallelAgents.map(k => CONFIG.AGENTS[k].name).join(', ')}`);

                            const parallelPromises = parallelAgents.map(async (agentKey) => {
                                // ===== 替换点：并行组调用公共函数，传入 isParallel: true =====
                                await this._executeAgentByRole(agentKey, false, {
                                    userInput,
                                    isParallel: true,
                                    parallelBeforeSnapshot
                                });
                            });
                            await Promise.all(parallelPromises);

                            if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();
                            if (WORKFLOW_STATE.discarded) throw new AbortChapterError();
                        }

                        if (serialAgents.length > 0) {
                            UI.updateProgress(`  串行执行: ${serialAgents.map(k => CONFIG.AGENTS[k].name).join(', ')}`);

                            for (const agentKey of serialAgents) {
                                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                                // ===== 替换点：并行阶段内的串行组也调用公共函数，但 isParallel: true（因为仍在并行阶段）=====
                                await this._executeAgentByRole(agentKey, false, {
                                    userInput,
                                    isParallel: true,
                                    parallelBeforeSnapshot
                                });

                                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();
                                if (WORKFLOW_STATE.discarded) throw new AbortChapterError();
                            }
                        }

                        // 并行阶段结束后统一处理回流
                        const processing = Object.keys(AgentStateManager.states).filter(
                            k => AgentStateManager.states[k] === 'reflow_processing'
                        );
                        if (processing.length > 0) {
                            UI.updateProgress(`  检测到 ${processing.length} 个 Agent 需要重新执行（由于回流）`);
                            await this.processReflow();
                            if (WORKFLOW_STATE.shouldStop) {
                                throw new UserInterruptError();
                            }
                            if (WORKFLOW_STATE.discarded) {
                                aborted = true;
                                throw new AbortChapterError();
                            }
                        }
                    }

                    // 阶段结束后检查中断（再次确保）
                    if (WORKFLOW_STATE.shouldStop) {
                        throw new UserInterruptError();
                    }
                }

                // 检查中断
                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();
                if (WORKFLOW_STATE.discarded) throw new AbortChapterError();

                // 获取最终章节师的输出（已在前面设置）
                const finalContent = finalAgentKey ? (WORKFLOW_STATE.outputs[finalAgentKey] || '') : '';

                const snapshot = await Snapshot.create();
                const title = chapter.title || `第${chapter.num}章`;
                const saveSuccess = Storage.saveChapter({ title, content: finalContent }, chapter.num, snapshot);
                if (saveSuccess) {
                    UI.updateProgress(`📚 第${chapter.num}章已保存`);
                    UI.updateCurrentChapterNum();
                } else {
                    UI.updateProgress(`⚠️ 第${chapter.num}章保存可能失败`, true);
                }

                // 更新跨章记忆
                for (const [agentKey, output] of Object.entries(WORKFLOW_STATE.outputs)) {
                    const role = CONFIG.AGENTS[agentKey]?.role;
                    WORKFLOW_STATE.chapterMemory[agentKey] = output;
                    if (role && role.trim() !== '') {
                        WORKFLOW_STATE.chapterMemory[role] = output;
                    }
                }

                return { success: true };

            } catch (error) {
                if (error.name === 'AbortChapterError') {
                    UI.updateProgress('⚠️ 本章因连续回流超限或状态更新失败被标记为废章，回滚状态书');
                    // WORKFLOW_STATE.discarded 已被设置为 true
                } else if (error.name === 'UserInterruptError') {
                    throw error; // 让外层捕获，停止循环
                } else {
                    UI.updateProgress(`❌ 本章执行异常: ${error.message}`, true);
                    WORKFLOW_STATE.discarded = true;
                }

                return { success: false };
            }
        },

        async start() {
            // 如果已经在运行，直接返回
            if (WORKFLOW_STATE.isRunning) return;

            // 启动前初始化
            WORKFLOW_STATE.lastAgentError = {};


            // 启动前检查API状态
            const apiStatus = WORKFLOW_STATE.apiStatus || {};
            const unavailable = Object.entries(apiStatus).filter(([_, s]) => !s.ok).map(([id]) => id);
            if (unavailable.length > 0) {
                Notify.error(`无法启动：以下API不可用：${unavailable.join(', ')}`);
                console.error('[Workflow.start] 启动失败，API不可用:', unavailable);
                return;
            }


            // 创建新的AbortController用于本章的图像请求
            if (WORKFLOW_STATE.abortController) {
                try {
                    WORKFLOW_STATE.abortController.abort();
                } catch (_) {
                    // 重复 abort() 静默忽略
                }
            }
            WORKFLOW_STATE.abortController = new AbortController();

            // 初始化运行标志
            WORKFLOW_STATE.isRunning = true;
            WORKFLOW_STATE.shouldStop = false;
            WORKFLOW_STATE.tokenStats.lastInput = 0;
            WORKFLOW_STATE.tokenStats.lastOutput = 0;

            UI.updateFloatButtonText();
            UI.setLoading(true);
            UI.clearProgress();

            let interrupted = false;
            let agentError = null;

            try {
                do {
                    // ===== 每次迭代前重新读取复选框状态，确保实时响应 =====
                    const autoCheckbox = document.getElementById('nc-auto-mode');
                    if (autoCheckbox) {
                        const newAutoMode = autoCheckbox.checked;
                        if (newAutoMode !== WORKFLOW_STATE.autoMode) {
                            WORKFLOW_STATE.autoMode = newAutoMode;
                        }
                    } else {
                        console.warn('[DEBUG][Workflow.start] 未找到 #nc-auto-mode 元素');
                    }

                    const result = await this.executeOneChapter();

                    // ✅ 新增：根据 result 类型显示不同消息
                    if (result && result.branchConflict) {
                        UI.updateProgress('❌ 因分支冲突，本章创作已中断', true);
                        break;
                    } else if (result && result.aborted) {
                        UI.updateProgress('❌ 因连续回流超限，本章强制终止并回滚', true);
                        break;
                    } else if (!result || !result.success) {
                        // 一般错误
                        if (WORKFLOW_STATE.autoMode) {
                            UI.updateProgress('❌ 章节创作失败，自动模式已停止', true);
                        } else {
                            UI.updateProgress('❌ 章节创作失败', true);
                        }
                        break;
                    }

                    if (WORKFLOW_STATE.shouldStop) {
                        interrupted = true;
                        break;
                    }

                    if (!WORKFLOW_STATE.autoMode) {
                        break;
                    }

                    UI.updateProgress('⏳ 自动模式：准备开始下一章...');
                    await API.sleep(1000);

                } while (WORKFLOW_STATE.autoMode && !WORKFLOW_STATE.shouldStop);

                if (!interrupted) {
                    Notify.success('工作流已停止', '', { timeOut: 2000 });
                }

            } catch (e) {
                console.error('[Workflow.start] 捕获到错误:', e);  // 打印完整错误堆栈
                if (e.name === 'UserInterruptError') {
                    interrupted = true;
                    UI.updateProgress('⏸️ 用户中断');
                    Notify.warning('工作流已中断', '', { timeOut: 2000 });
                } else {
                    agentError = e;
                    let errorMsg = e.message;
                    if (e.agentKey) {
                        const agentName = getAgentDisplayName(e.agentKey) || e.agentKey;
                        errorMsg = `${agentName} 执行出错: ${e.message}`;
                    }
                    if (!e.message.includes('Agent') && !e.message.includes('调用失败')) {
                        UI.updateProgress(`❌ 工作流错误: ${errorMsg}`, true);
                        Notify.error(errorMsg, '工作流错误');
                    }
                }
            } finally {
                WORKFLOW_STATE.isRunning = false;
                UI.setLoading(false);
                Storage.saveTokenStats(WORKFLOW_STATE.tokenStats);
                UI.updateAllAgentStatusButtons();
                UI.updateFloatButtonText();
            }
        },

        /**
         * 构建优化师上下文：按书号收集每个类别的模板定义和对应状态条目的属性配置
         * @returns {Promise<string>} 格式化后的上下文文本
         */
        async _buildOptimizerContext() {

            const books = await getAllStateBooks();


            let result = '';
            const perBookInfo = [];

            for (const bookName of books) {
                const bookIndex = parseInt(bookName.split('-')[1]);


                // 读取世界书
                const book = await API.getWorldbook(bookName);
                const entries = Array.isArray(book) ? book : (book.entries || []);


                // 1. 查找模板条目
                const templateEntryName = `${CONFIG.STATE_TEMPLATE_PREFIX}${bookIndex}`;
                const templateEntry = entries.find(e => e.name === templateEntryName);
                if (!templateEntry) {

                    result += `【${bookName}】无模板条目\n\n`;
                    continue;
                }


                // 2. 解析模板条目，得到每个类别的定义
                const categoryMap = new Map(); // key: catId, value: { catName, definition }
                const categoryRegex = /^\*\*类别(\d+):([^*]+)\*\*\n([\s\S]*?)(?=\n\*\*类别\d+:|$)/g;
                let match;
                while ((match = categoryRegex.exec(templateEntry.content)) !== null) {
                    const catId = match[1];
                    const catName = match[2].trim();
                    const definition = match[3].trim(); // 字段列表部分（不含类别标题行）
                    categoryMap.set(catId, { catName, definition });

                }

                if (categoryMap.size === 0) {
                    result += `【${bookName}】模板中无有效类别\n\n`;
                    continue;
                }

                // 3. 遍历每个类别，查找对应的状态条目
                const categoriesOutput = [];
                for (const [catId, { catName, definition }] of categoryMap.entries()) {
                    // 构造状态条目名称格式：状态-书号-类别编号-类别名
                    const expectedStateEntryName = `状态-${bookIndex}-${catId.padStart(2, '0')}-${catName}`;


                    // 查找状态条目（可能存在名称不一致，但按名称匹配）
                    const stateEntry = entries.find(e => e.name === expectedStateEntryName);
                    if (!stateEntry) {

                        // 仍输出模板信息，但无属性
                        categoriesOutput.push(`【缺失对应状态条目】${bookIndex}-?: **类别${catId}:${catName}**\n${definition}\n`);
                        continue;
                    }

                    // 提取状态条目的属性（排除 content 和 name）
                    const entryCopy = { ...stateEntry };
                    delete entryCopy.content;
                    delete entryCopy.name;
                    // 将属性对象转换为扁平化的键值对数组
                    const propPairs = [];
                    for (const [key, val] of Object.entries(entryCopy)) {
                        if (val === undefined || val === null) continue;
                        const flatPairs = this._flattenObjectForOptimizer(key, val);
                        propPairs.push(...flatPairs);
                    }
                    const propLine = propPairs.join('；');

                    // 构造输出块：只包含模板定义和属性配置，不包含状态条目的 content
                    const block = `${bookIndex}-${stateEntry.uid}：**类别${catId}:${catName}**\n${definition}\n${propLine}\n`;
                    categoriesOutput.push(block);
                }

                // 统计该书的状态条目数
                const stateEntriesCount = entries.filter(e => e?.name?.startsWith(CONFIG.STATE_ENTRY_PREFIX)).length;
                perBookInfo.push(`${bookName}: ${stateEntriesCount}/${CONFIG.STATE_TYPE_LIMIT}`);

                result += `【${bookName}】\n` + categoriesOutput.join('\n') + '\n';
            }

            // 添加总体统计信息
            const header = `当前状态条目分布：${perBookInfo.join('；')}\n总条目数：${perBookInfo.reduce((sum, info) => sum + parseInt(info.split(':')[1].split('/')[0]), 0)}\n最大状态书数量：${CONFIG.MAX_STATE_BOOKS}\n每本书上限：${CONFIG.STATE_TYPE_LIMIT}\n\n`;
            result = header + result;


            return result;
        },

        /**
         * 将嵌套对象展平为点号形式的键值对，值格式化为字符串
         * @param {string} prefix 当前键的前缀
         * @param {any} obj 要展平的值
         * @returns {Array} 字符串数组，每个元素如 "characterFilter.names：值"
         */
        _flattenObjectForOptimizer(prefix, obj) {
            const results = [];
            if (obj === null || obj === undefined) return results;

            if (Array.isArray(obj)) {
                // 数组转换为中文逗号分隔的字符串
                const str = obj.map(item => String(item)).join('，');
                results.push(`${prefix}：${str}`);
            } else if (typeof obj === 'object') {
                for (const [key, val] of Object.entries(obj)) {
                    const newPrefix = prefix ? `${prefix}.${key}` : key;
                    const subResults = this._flattenObjectForOptimizer(newPrefix, val);
                    results.push(...subResults);
                }
            } else {
                // 基本类型
                results.push(`${prefix}：${String(obj)}`);
            }
            return results;
        },

        // ==================== 辅助函数 ====================

        _collectStageOutput(stageId) {
            const stageAgents = Object.entries(CONFIG.AGENTS)
                .filter(([key, agent]) => agent.stage === stageId && WORKFLOW_STATE.outputs[key] !== undefined)
                .sort((a, b) => (a[1].order || 999) - (b[1].order || 999));
            if (stageAgents.length === 0) return '';
            return stageAgents.map(([key, agent]) =>
                `${agent.name}：\n${this._stripImagePlaceholders(WORKFLOW_STATE.outputs[key])}`
            ).join('\n\n');
        },

        /**
         * 移除文本中的图片占位符（如 ![图片](id:xxx)），确保传递给 Agent 的是纯文本
         * @param {string} text - 原始文本
         * @returns {string} 纯文本（图片占位符替换为可选的描述文字，若无描述则替换为 '[图片]'）
         */
        _stripImagePlaceholders(text) {
            if (!text) return text;
            // 匹配 ![alt](id:图片ID) 格式
            return text.replace(/!\[([^\]]*)\]\(id:[^)]+\)/g, (match, alt) => {
                return alt ? `[${alt}]` : '[图片]';
            });
        },

        /**
         * 自动提取历史章节内容
         * @param {number} count - 提取章节数量（0 表示全部）
         * @param {string} mode - 提取模式：'chapter'、'status'、'all'
         * @returns {string} 合并后的纯文本（已剔除图片占位符）
         */
        _collectAutoOutput(count, mode) {
            const chapters = Storage.loadChapters().sort((a, b) => b.num - a.num); // 降序
            let selected = (count === 0) ? chapters : chapters.slice(0, count);
            selected = selected.sort((a, b) => a.num - b.num); // 升序输出
            const parts = [];
            for (const ch of selected) {
                const num = ch.num;
                let article = HistoryUI._extractPureContent(ch);
                // 剔除图片占位符
                article = this._stripImagePlaceholders(article);
                const stateText = ch.snapshot ? HistoryUI.getStateTextFromChapter(ch) : '';
                if (mode === 'chapter') {
                    parts.push(`第${num}章：\n${article}\n`);
                } else if (mode === 'status') {
                    parts.push(`第${num}章：\n${stateText}\n`);
                } else if (mode === 'all') {
                    parts.push(`第${num}章：\n文章：${article}\n状态：\n${stateText}\n`);
                }
            }
            return parts.join('\n');
        },

        _reflowQueue: Promise.resolve(),

        // ==================== 修改后的 _executeAgent 函数 ====================

        async _executeAgent(agentKey, initialUserInput, isReflow = false, options = {}) {
            const { isParallel = false, parallelBeforeSnapshot = null } = options;


            if (WORKFLOW_STATE.discarded) {
                console.warn(`[Workflow._executeAgent] 本章已被标记为废章，终止执行 ${agentKey}`);
                throw new AbortChapterError();
            }
            if (WORKFLOW_STATE.shouldStop) {
                console.warn(`[Workflow._executeAgent] 收到停止信号，终止执行 ${agentKey}`);
                throw new UserInterruptError();
            }

            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) {
                console.error(`[Workflow._executeAgent] 未找到 agentKey=${agentKey}`);
                return;
            }

            // 周期执行判断
            if (!isReflow && agent.executeInterval > 0) {
                const interval = agent.executeInterval;
                const currentChapter = WORKFLOW_STATE.currentChapter;
                const shouldExecute = (currentChapter % interval) === 0;

                if (!shouldExecute) {
                    AgentStateManager.setState(agentKey, 'idle');
                    WORKFLOW_STATE.outputs[agentKey] = '';
                    UI.updateProgress(`⏭️ ${getAgentDisplayName(agentKey)} 被跳过（周期执行）`);

                    return;
                }
            }

            WORKFLOW_STATE.currentStep = agentKey;
            AgentStateManager.setState(agentKey, 'running');
            UI.updateProgress(`→ ${getAgentDisplayName(agentKey)}`);

            // 记录当前 Agent 的 before 依赖目标
            let beforeTargetKey = null;
            if (isParallel && parallelBeforeSnapshot && parallelBeforeSnapshot.agentKey) {
                beforeTargetKey = parallelBeforeSnapshot.agentKey;
            } else if (!isParallel && WORKFLOW_STATE.lastSerialOutput && WORKFLOW_STATE.lastSerialOutput.agentKey) {
                beforeTargetKey = WORKFLOW_STATE.lastSerialOutput.agentKey;
            }

            if (!WORKFLOW_STATE.beforeDependencies) WORKFLOW_STATE.beforeDependencies = {};
            WORKFLOW_STATE.beforeDependencies[agentKey] = beforeTargetKey;

            try {
                // ========== 特殊处理 interactiveAgent ==========

                if (agent.role === 'interactiveAgent') {


                    // 收集所有输入源的内容（不等待用户输入）
                    const inputContents = [];
                    const userIndices = [];
                    for (let i = 0; i < agent.inputs.length; i++) {
                        const src = agent.inputs[i];

                        let content = '';
                        if (src === 'user') {
                            userIndices.push(i);
                            // 对于 user 源，我们暂时不填充内容，稍后处理
                            content = ''; // 占位，稍后由逻辑决定
                        } else {
                            // 非 user 源，直接获取现有内容（不触发用户输入）
                            content = await this._collectInputSourceWithoutWait(agentKey, i, isReflow, options);
                        }
                        inputContents.push({ index: i, src, content });

                    }

                    if (userIndices.length === 0) {
                        console.error('[Workflow._executeAgent] interactiveAgent 必须至少有一个 user 输入源');
                        throw new Error('interactiveAgent 必须至少有一个 user 输入源');
                    }

                    // 确定最后一个 user 的索引
                    const lastUserIndex = userIndices[userIndices.length - 1];


                    // 将所有非最后一个 user 的源的内容拼接起来（包括其他 user 和非 user）
                    const partsToMerge = [];
                    for (let i = 0; i < inputContents.length; i++) {
                        if (i === lastUserIndex) continue; // 最后一个 user 不参与拼接
                        if (inputContents[i].content) {
                            partsToMerge.push(inputContents[i].content);
                        }
                    }
                    const mergedHtml = partsToMerge.join('\n\n');


                    // 渲染交互并等待用户操作

                    const userChoice = await UI.renderAndWaitForInteraction(mergedHtml);


                    UI.updateProgress(`✅ 用户交互完成，选择: ${userChoice}`);
                    Notify.success('交互已响应', '', { timeOut: 2000 });

                    if (WORKFLOW_STATE.enforceUniqueBranches && WORKFLOW_STATE.currentParentNum) {
                        const parentNum = WORKFLOW_STATE.currentParentNum;

                        const existingMapping = MappingManager.getMapping(parentNum, userChoice);
                        if (existingMapping) {
                            const targetNum = existingMapping.targetChapterNum;
                            console.warn(`[Workflow._executeAgent] 检测到分支冲突：结果“${userChoice}”已指向章节 ${targetNum}`);
                            WORKFLOW_STATE.discarded = true;
                            WORKFLOW_STATE.discardReason = 'existing_branch';
                            UI.updateProgress(`❌ 互动结果“${userChoice}”已存在对应章节（第${targetNum}章），创作已中断。`, true);
                            Notify.error(`互动结果“${userChoice}”已用于第${targetNum}章，本次创作已中断。`);
                            throw new ExistingBranchError();
                        } else {

                        }
                    }

                    WORKFLOW_STATE.currentInteractionResult = userChoice;


                    // 构建最终的输入数组
                    const finalInputs = [];
                    for (let i = 0; i < inputContents.length; i++) {
                        if (i === lastUserIndex) {
                            finalInputs[i] = userChoice;
                        } else {
                            finalInputs[i] = inputContents[i].content;
                        }
                    }


                    // 构建提示词（替换占位符）
                    let prompt = agent.inputTemplate;
                    let placeholderIdx = 0;
                    prompt = prompt.replace(/【】/g, () => finalInputs[placeholderIdx++] || '');


                    // 添加回流反馈（如果有）
                    if (isReflow && WORKFLOW_STATE.reflowMap && WORKFLOW_STATE.reflowMap[agentKey]) {
                        const feedbackData = WORKFLOW_STATE.reflowMap[agentKey];
                        const feedbackParts = [];
                        for (const sourceKey of feedbackData.sources) {
                            const sourceOutput = feedbackData.outputs[sourceKey];
                            if (sourceOutput) {
                                const sourceName = getAgentDisplayName(sourceKey);
                                feedbackParts.push(`【来自 ${sourceName} 的反馈】\n${sourceOutput}`);
                            }
                        }
                        if (feedbackParts.length > 0) {
                            prompt += '\n\n' + feedbackParts.join('\n\n');

                        }
                    }

                    if (isReflow && WORKFLOW_STATE.reflowMap && WORKFLOW_STATE.reflowMap[agentKey] && WORKFLOW_STATE.reflowMap[agentKey].previousOutput !== undefined) {
                        const previousOutput = WORKFLOW_STATE.reflowMap[agentKey].previousOutput;
                        if (previousOutput && previousOutput.trim() !== '') {
                            prompt += '\n\n【上次输出】：\n' + previousOutput;

                        }
                    }

                    if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                    // 调用 Agent 生成输出

                    const responseText = await this.callAgent(agentKey, prompt);
                    console.log(`[DEBUG][_executeAgent] 调用 callAgent 后，WORKFLOW_STATE.outputs[${agentKey}] =`,
                        WORKFLOW_STATE.outputs[agentKey] ? `存在，长度 ${WORKFLOW_STATE.outputs[agentKey].length}` : '不存在');

                    if (!WORKFLOW_STATE.shouldStop && agent.review === true) {


                        const originalOutput = WORKFLOW_STATE.outputs[agentKey];

                        try {

                            const reviewResult = await UI.showReviewModal(agentKey, originalOutput);


                            if (reviewResult.action === 'continue') {
                                WORKFLOW_STATE.outputs[agentKey] = reviewResult.content;

                            } else if (reviewResult.action === 'reject') {

                                if (!WORKFLOW_STATE.reflowMap) WORKFLOW_STATE.reflowMap = {};
                                WORKFLOW_STATE.reflowMap[agentKey] = {
                                    previousOutput: originalOutput,
                                    sources: [],
                                    outputs: {}
                                };
                                WORKFLOW_STATE.reflowMap[agentKey].userFeedback = {
                                    suggestion: reviewResult.suggestion,
                                    attachType: reviewResult.attachType,
                                    modifiedContent: reviewResult.attachType === 'modified' ? WORKFLOW_STATE.outputs[agentKey] : null
                                };
                                await this.handleReflow(agentKey, true);

                                return;
                            }
                        } catch (err) {
                            console.error('[Workflow._executeAgent] 审核过程中捕获到异常:', err);
                            if (err.name === 'UserInterruptError') {

                                throw err;
                            } else {
                                console.error('[Workflow._executeAgent] 审核过程出错，继续执行，使用原始输出', err);
                                // 继续执行，使用原始输出
                            }
                        }
                    } else {

                    }

                    // 保存输出（注意：responseText 已在 callAgent 中赋值，不需要重复赋值）
                    AgentStateManager.setState(agentKey, 'completed');

                    if (!isParallel) {
                        WORKFLOW_STATE.lastSerialOutput = { agentKey, output: responseText };
                    }

                    // 检查回流条件
                    if (agent.reflowConditions && agent.reflowConditions.length > 0) {
                        const triggered = agent.reflowConditions.some(cond => responseText?.includes(cond) === true);
                        if (triggered) {
                            UI.updateProgress(`⚠️ Agent ${getAgentDisplayName(agentKey)} 触发回流`);

                            if (isReflow) {
                                await this.handleReflow(agentKey, true);
                            } else {
                                if (isParallel) {
                                    await this.handleReflow(agentKey, false);
                                } else {
                                    await this.handleReflow(agentKey, true);
                                }
                            }
                        }
                    }

                    return;
                }

                // ========== 通用 Agent 执行流程（非 interactiveAgent） ==========

                const collected = await this._collectInputs(agentKey, isReflow, options);


                let prompt = agent.inputTemplate;
                let placeholderIdx = 0;
                prompt = prompt.replace(/【】/g, () => collected[placeholderIdx++] || '');

                if (isReflow && WORKFLOW_STATE.reflowMap && WORKFLOW_STATE.reflowMap[agentKey]) {
                    const feedbackData = WORKFLOW_STATE.reflowMap[agentKey];
                    const feedbackParts = [];
                    for (const sourceKey of feedbackData.sources) {
                        const sourceOutput = feedbackData.outputs[sourceKey];
                        if (sourceOutput) {
                            const sourceName = getAgentDisplayName(sourceKey);
                            feedbackParts.push(`【来自 ${sourceName} 的反馈】\n${sourceOutput}`);
                        }
                    }
                    if (feedbackParts.length > 0) {
                        prompt += '\n\n' + feedbackParts.join('\n\n');
                    }
                }

                if (isReflow && WORKFLOW_STATE.reflowMap && WORKFLOW_STATE.reflowMap[agentKey] && WORKFLOW_STATE.reflowMap[agentKey].previousOutput !== undefined) {
                    const previousOutput = WORKFLOW_STATE.reflowMap[agentKey].previousOutput;
                    if (previousOutput && previousOutput.trim() !== '') {
                        prompt += '\n\n【上次输出】：\n' + previousOutput;
                    }
                }

                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                const responseText = await this.callAgent(agentKey, prompt);
                console.log(`[DEBUG][_executeAgent] 调用 callAgent 后，WORKFLOW_STATE.outputs[${agentKey}] =`,
                    WORKFLOW_STATE.outputs[agentKey] ? `存在，长度 ${WORKFLOW_STATE.outputs[agentKey].length}` : '不存在');

                if (!WORKFLOW_STATE.shouldStop && agent.review === true) {


                    const originalOutput = WORKFLOW_STATE.outputs[agentKey];

                    try {

                        const reviewResult = await UI.showReviewModal(agentKey, originalOutput);


                        if (reviewResult.action === 'continue') {
                            WORKFLOW_STATE.outputs[agentKey] = reviewResult.content;

                        } else if (reviewResult.action === 'reject') {

                            if (!WORKFLOW_STATE.reflowMap) WORKFLOW_STATE.reflowMap = {};
                            WORKFLOW_STATE.reflowMap[agentKey] = {
                                previousOutput: originalOutput,
                                sources: [],
                                outputs: {}
                            };
                            WORKFLOW_STATE.reflowMap[agentKey].userFeedback = {
                                suggestion: reviewResult.suggestion,
                                attachType: reviewResult.attachType,
                                modifiedContent: reviewResult.attachType === 'modified' ? WORKFLOW_STATE.outputs[agentKey] : null
                            };

                            await this.handleReflow(agentKey, true);

                            return; // 当前执行路径结束
                        }
                    } catch (err) {
                        console.error('[Workflow._executeAgent] 审核过程中捕获到异常:', err);
                        if (err.name === 'UserInterruptError') {

                            throw err;
                        } else {
                            console.error('[Workflow._executeAgent] 审核过程出错，继续执行，使用原始输出', err);
                            // 继续执行，使用原始输出
                        }
                    }
                } else {

                }

                AgentStateManager.setState(agentKey, 'completed');

                if (!isParallel) {
                    WORKFLOW_STATE.lastSerialOutput = { agentKey, output: responseText };
                }

                if (agent.reflowConditions && agent.reflowConditions.length > 0) {
                    const triggered = agent.reflowConditions.some(cond => responseText?.includes(cond) === true);
                    if (triggered) {
                        UI.updateProgress(`⚠️ Agent ${getAgentDisplayName(agentKey)} 触发回流`);
                        if (isReflow) {
                            await this.handleReflow(agentKey, true);
                        } else {
                            if (isParallel) {
                                await this.handleReflow(agentKey, false);
                            } else {
                                await this.handleReflow(agentKey, true);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`[Workflow._executeAgent] 执行出错:`, error);
                if (error.name === 'UserInterruptError') {
                    AgentStateManager.setState(agentKey, 'idle');
                    throw error;
                }

                // 包装错误，增加 agentKey 信息
                const enhancedError = new Error(error.message);
                enhancedError.agentKey = agentKey;
                enhancedError.originalError = error;
                enhancedError.name = error.name;

                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress(`❌ Agent ${getAgentDisplayName(agentKey)} 执行出错，已保存最佳内容作为废章`, true);
                }
                throw enhancedError;
            }
        },

        /**
         * 收集单个输入源的内容，但不等待用户输入（直接返回已有内容，若不存在则返回空字符串）
         * 用于 interactiveAgent 的特殊处理，避免在非最后一个 user 上触发 waitForUserInput
         */
        async _collectInputSourceWithoutWait(agentKey, inputIndex, isReflow, options) {
            const agent = CONFIG.AGENTS[agentKey];
            const src = agent.inputs[inputIndex];
            const mode = agent.inputMode[inputIndex] || 'txt';


            // 处理 before 源
            if (src === 'before') {
                if (options.isParallel) {
                    return options.parallelBeforeSnapshot?.output || '';
                } else {
                    return WORKFLOW_STATE.lastSerialOutput?.output || '';
                }
            }

            // 处理层 ID
            if (this._isStage(src)) {
                return this._collectStageOutput(src);
            }

            // 处理 auto 源
            if (src === 'auto') {
                const count = agent.autoConfig[inputIndex];
                return this._collectAutoOutput(count, mode);
            }

            // 处理 .last 源
            if (src.endsWith('.last')) {
                const targetKey = src.slice(0, -5);
                const isTargetEnabled = WORKFLOW_STATE.enabledAgents.includes(targetKey);
                if (!isTargetEnabled) {
                    const hasCached = WORKFLOW_STATE.lastInputCache.hasOwnProperty(targetKey);
                    if (!isReflow && hasCached) {
                        return WORKFLOW_STATE.lastInputCache[targetKey];
                    }
                    return ''; // 无缓存，返回空
                } else {
                    const targetRole = CONFIG.AGENTS[targetKey]?.role;
                    if (targetRole && targetRole.trim() !== '' && WORKFLOW_STATE.chapterMemory.hasOwnProperty(targetRole)) {
                        return this._stripImagePlaceholders(WORKFLOW_STATE.chapterMemory[targetRole]);
                    }
                    if (WORKFLOW_STATE.chapterMemory.hasOwnProperty(targetKey)) {
                        return this._stripImagePlaceholders(WORKFLOW_STATE.chapterMemory[targetKey]);
                    }
                    const hasCached = WORKFLOW_STATE.lastInputCache.hasOwnProperty(targetKey);
                    if (!isReflow && hasCached) {
                        return WORKFLOW_STATE.lastInputCache[targetKey];
                    }
                    return '';
                }
            }

            // 处理 read./save. 文件源（交互师不应该有，返回空）
            if (src.startsWith('read.') || src.startsWith('save.')) {
                console.warn(`[Workflow._collectInputSourceWithoutWait] 交互师遇到文件源 ${src}，将返回空字符串`);
                return '';
            }

            // 普通 Agent 键
            const isTargetEnabled = WORKFLOW_STATE.enabledAgents.includes(src);
            if (!isTargetEnabled) {
                const hasCached = WORKFLOW_STATE.agentInputCache.hasOwnProperty(src);
                if (!isReflow && hasCached) {
                    return WORKFLOW_STATE.agentInputCache[src];
                }
                return '';
            } else {
                return this._stripImagePlaceholders(WORKFLOW_STATE.outputs[src] || '');
            }
        },

        /**
         * 处理回流（修改版，支持用户反馈）
         * @param {string} sourceKey - 触发回流的 Agent 键
         * @param {boolean} immediate - 是否立即执行
         */
        async handleReflow(sourceKey, immediate = true) {


            // ========== 缓存层入栈 ==========
            if (immediate && WORKFLOW_STATE.currentReflowCache) {
                WORKFLOW_STATE.reflowCacheStack.push(WORKFLOW_STATE.currentReflowCache);
            }
            if (immediate) {
                WORKFLOW_STATE.currentReflowCache = {};
            }

            try {
                const sourceAgent = CONFIG.AGENTS[sourceKey];
                if (!sourceAgent) {
                    console.error(`[handleReflow] 触发源 Agent 不存在: ${sourceKey}`);
                    return;
                }

                AgentStateManager.setState(sourceKey, 'reflow_waiting');

                const targets = [];
                for (let i = 0; i < sourceAgent.inputs.length; i++) {
                    const src = sourceAgent.inputs[i];

                    if (src === 'user') {
                        continue;
                    }

                    if (src.endsWith('.last')) {

                        continue;
                    }

                    // ===== 处理 before 源 =====
                    if (src === 'before') {
                        const beforeTarget = WORKFLOW_STATE.beforeDependencies && WORKFLOW_STATE.beforeDependencies[sourceKey];
                        if (beforeTarget) {
                            targets.push(beforeTarget);
                        } else {
                            console.warn(`[handleReflow] 未找到 before 依赖目标 for agent ${sourceKey}，将跳过回流此源`);
                        }
                        continue;
                    }

                    let targetKey = src;
                    // 注意：虽然上面跳过了.last，但这里保留以防万一（实际上不会执行到）
                    if (src.endsWith('.last')) {
                        targetKey = src.slice(0, -5);
                    }

                    if (CONFIG.AGENTS[targetKey]) {
                        targets.push(targetKey);
                    } else if (this._isStage(src)) {
                        // 获取该层所有启用的 Agent
                        const stageAgents = Object.entries(CONFIG.AGENTS)
                            .filter(([key, agent]) => agent.stage === src && WORKFLOW_STATE.enabledAgents.includes(key))
                            .map(([key]) => key);
                        // 过滤出已经参与过执行的 Agent
                        const executedInLayer = stageAgents.filter(key => {
                            const state = AgentStateManager.getState(key);
                            const isExecuted = state !== 'idle' && state !== 'pending';
                            return isExecuted;
                        });
                        targets.push(...executedInLayer);
                    } else {
                        console.error(`[handleReflow] 无效的输入源: ${src}，无法解析为 Agent 键或层 ID`);
                        throw new Error(`回流目标无效：${src} 不是有效的 Agent 键或层 ID`);
                    }
                }

                // 修改后
                let uniqueTargets = [...new Set(targets)];   // 将 const 改为 let


                if (uniqueTargets.length === 0) {

                    uniqueTargets = [sourceKey];  // 现在可以正常赋值
                }

                // 校验所有回流目标是否在本章启用的 Agent 列表中
                const enabledAgents = WORKFLOW_STATE.enabledAgents || [];
                for (const target of uniqueTargets) {
                    if (this._isStage(target)) continue;
                    if (!enabledAgents.includes(target)) {
                        console.error(`[handleReflow] 回流目标 ${target} 未在本章启用`);
                        throw new Error(`回流目标 ${target} 未在本章启用，无法完成回流`);
                    }
                }

                if (!WORKFLOW_STATE.reflowMap) WORKFLOW_STATE.reflowMap = {};
                if (!WORKFLOW_STATE.reflowWaiting) WORKFLOW_STATE.reflowWaiting = {};

                WORKFLOW_STATE.reflowWaiting[sourceKey] = uniqueTargets;


                // ========== 保存旧输出 & 连续回流计数 & 处理用户反馈 ==========
                for (const target of uniqueTargets) {
                    // 初始化 reflowMap[target]
                    if (!WORKFLOW_STATE.reflowMap[target]) {
                        WORKFLOW_STATE.reflowMap[target] = { sources: [], outputs: {}, previousOutput: undefined };
                    }

                    // 保存目标当前的输出（剔除图片）作为“上次输出”
                    WORKFLOW_STATE.reflowMap[target].previousOutput = this._stripImagePlaceholders(WORKFLOW_STATE.outputs[target] || '');

                    // 记录触发源的输出（剔除图片）
                    let sourceOutput = this._stripImagePlaceholders(WORKFLOW_STATE.outputs[sourceKey] || '');

                    if (WORKFLOW_STATE.reflowMap[sourceKey] && WORKFLOW_STATE.reflowMap[sourceKey].userFeedback) {
                        const fb = WORKFLOW_STATE.reflowMap[sourceKey].userFeedback;
                        let feedbackText = `【用户打回建议】\n${fb.suggestion}\n\n`;
                        if (fb.attachType === 'original') {
                            feedbackText += `【用户附加的原始输出】\n${WORKFLOW_STATE.reflowMap[sourceKey].previousOutput}`;
                        } else {
                            feedbackText += `【用户附加的修改后输出】\n${fb.modifiedContent}`;
                        }
                        sourceOutput += '\n\n' + feedbackText;

                    }

                    if (!WORKFLOW_STATE.reflowMap[target].sources.includes(sourceKey)) {
                        WORKFLOW_STATE.reflowMap[target].sources.push(sourceKey);
                        WORKFLOW_STATE.reflowMap[target].outputs[sourceKey] = sourceOutput;
                    }

                    // 连续回流次数计数
                    if (!WORKFLOW_STATE.reflowTargetLastSource) WORKFLOW_STATE.reflowTargetLastSource = {};
                    if (!WORKFLOW_STATE.reflowTargetCount) WORKFLOW_STATE.reflowTargetCount = {};

                    const lastSource = WORKFLOW_STATE.reflowTargetLastSource[target];
                    if (lastSource === sourceKey) {
                        // 同一源连续触发
                        WORKFLOW_STATE.reflowTargetCount[target] = (WORKFLOW_STATE.reflowTargetCount[target] || 0) + 1;
                    } else {
                        // 不同源，重置计数
                        WORKFLOW_STATE.reflowTargetLastSource[target] = sourceKey;
                        WORKFLOW_STATE.reflowTargetCount[target] = 1;
                    }
                    const currentCount = WORKFLOW_STATE.reflowTargetCount[target];


                    if (currentCount >= CONFIG.MAX_CONSECUTIVE_REFLOWS) {
                        WORKFLOW_STATE.discarded = true;
                        const bestContent = this._getBestOutputForSaving();
                        if (bestContent) {
                            const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                            const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                            WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                        }
                        UI.updateProgress(`⚠️ 目标 ${target} 被同一源 ${sourceKey} 连续回流达到 ${CONFIG.MAX_CONSECUTIVE_REFLOWS} 次，本章标记为废章，立即终止`, true);
                        throw new AbortChapterError(`目标 ${target} 被同一源 ${sourceKey} 连续回流达到 ${CONFIG.MAX_CONSECUTIVE_REFLOWS} 次`);
                    }

                    // 清除该目标的输出，标记为 reflow_processing
                    AgentStateManager.setState(target, 'reflow_processing');
                    delete WORKFLOW_STATE.outputs[target];

                }

                // 如果 immediate 为 true，立即启动回流处理
                if (immediate) {

                    await this.processReflow();
                }

            } catch (error) {
                if (error instanceof AbortChapterError) {
                    throw error;
                }
                console.error(`[handleReflow] 发生错误:`, error);
                throw error;
            } finally {
                if (immediate && WORKFLOW_STATE.reflowCacheStack.length > 0) {
                    WORKFLOW_STATE.currentReflowCache = WORKFLOW_STATE.reflowCacheStack.pop();
                } else if (!immediate) {
                    // 延迟模式下，不操作缓存栈
                } else {
                    WORKFLOW_STATE.currentReflowCache = null;
                }
            }
        },

        // 替换 Workflow 对象中的 processReflow 方法
        async processReflow() {
            // 使用配置中的最大回流深度
            let maxLoop = CONFIG.MAX_REFLOOP_DEPTH;
            while (maxLoop-- > 0) {
                // 检查废章标志
                if (WORKFLOW_STATE.discarded) {
                    throw new AbortChapterError();
                }

                const processing = Object.keys(AgentStateManager.states).filter(
                    k => AgentStateManager.states[k] === 'reflow_processing'
                );


                if (processing.length === 0) break;

                const sorted = processing.sort(
                    (a, b) => (CONFIG.AGENTS[a]?.order || 999) - (CONFIG.AGENTS[b]?.order || 999)
                );
                for (const agentKey of sorted) {

                    await this._executeAgentByRole(agentKey, true, {
                        userInput: WORKFLOW_STATE.currentUserInput,
                        isParallel: false
                    });

                }
            }

            // 如果达到最大深度但仍未完成，可记录警告（可选）
            if (maxLoop <= 0 && Object.keys(AgentStateManager.states).some(k => AgentStateManager.states[k] === 'reflow_processing')) {
                console.warn(`[processReflow] 达到最大回流深度 ${CONFIG.MAX_REFLOOP_DEPTH}，但仍有依赖未完成，可能存在问题`);
            }

            if (!WORKFLOW_STATE.reflowWaiting) return;
            const waiting = Object.keys(WORKFLOW_STATE.reflowWaiting);

            for (const sourceKey of waiting) {
                if (WORKFLOW_STATE.discarded) throw new AbortChapterError();

                const targets = WORKFLOW_STATE.reflowWaiting[sourceKey];
                const allCompleted = targets.every(t =>
                    AgentStateManager.states[t] === 'completed' && WORKFLOW_STATE.outputs[t] !== undefined
                );
                if (allCompleted) {

                    AgentStateManager.setState(sourceKey, 'pending');
                    delete WORKFLOW_STATE.reflowWaiting[sourceKey];
                    await this._executeAgent(sourceKey, WORKFLOW_STATE.currentUserInput, false);
                } else {

                }
            }
        },

        _isStage(id) {


            if (!CONFIG.workflowStages) {
                console.warn('[Workflow._isStage] CONFIG.workflowStages 不存在，返回 false');
                return false;
            }
            const found = CONFIG.workflowStages.some(s => {
                const match = s.id === id;
                if (match)
                    return match;
            });

            return found;
        },

        // ==================== 完整 executeWorkflow 函数 ====================

        async executeWorkflow(agents, userInput) {
            console.time('executeWorkflow 总耗时');


            await activateAllExistingStateBooks();

            WORKFLOW_STATE.outputs = {};

            const chapters = Storage.loadChapters();
            const nextChapterNum = chapters.length > 0 ? Math.max(...chapters.map(c => c.num)) + 1 : 1;
            WORKFLOW_STATE.currentChapter = nextChapterNum;


            // 计算全局提示词（如果有）
            let globalPrompt = '';
            if (CONFIG.categories && CONFIG.categories.globalPrompts) {
                const selected = WORKFLOW_STATE.selectionState['globalPrompts'];
                if (selected && Array.isArray(selected)) {
                    const prompts = [];
                    for (const optKey of selected) {
                        const option = CONFIG.categories.globalPrompts.options[optKey];
                        if (option && option.injectPrompt) {
                            prompts.push(option.injectPrompt);
                        }
                    }
                    if (prompts.length > 0) {
                        globalPrompt = '【全局提示】\n' + prompts.join('\n\n') + '\n\n';
                    }
                }
            }
            WORKFLOW_STATE.globalPrompt = globalPrompt;

            const getAgentKeyByRole = (role) => {
                for (const [key, agent] of Object.entries(CONFIG.AGENTS)) {
                    if (agent.role === role) return key;
                }
                return null;
            };

            const finalAgentKey = getAgentKeyByRole('finalChapter');
            const interactiveAgentKey = getAgentKeyByRole('interactiveAgent');


            const preSnapshot = await Snapshot.create();
            WORKFLOW_STATE.currentUserInput = userInput;

            const sortedStages = CONFIG.WORKFLOW_STAGES.sort((a, b) => a.stage - b.stage);
            let aborted = false;

            try {
                for (const stage of sortedStages) {
                    const stageAgents = stage.agents.filter(key => agents.includes(key));
                    if (stageAgents.length === 0) continue;

                    console.time(`阶段 ${stage.stage}: ${stage.name}`);

                    UI.updateProgress(`=== 阶段${stage.stage}: ${stage.name} ${stage.mode === 'parallel' ? '(并行)' : ''} ===`);

                    if (stage.mode === 'serial') {
                        // 串行执行：按 order 排序后依次执行
                        const sorted = stageAgents.sort((a, b) =>
                            (CONFIG.AGENTS[a]?.order || 999) - (CONFIG.AGENTS[b]?.order || 999)
                        );
                        for (const agentKey of sorted) {
                            console.time(`Agent ${agentKey}`);
                            await this._executeAgentByRole(agentKey, false, { userInput, isParallel: false });
                            console.timeEnd(`Agent ${agentKey}`);

                            if (WORKFLOW_STATE.shouldStop) {
                                throw new UserInterruptError();
                            }
                        }
                    } else {
                        // 并行执行：所有Agent并发执行，不区分parallel属性
                        const parallelAgents = stageAgents.sort((a, b) =>
                            (CONFIG.AGENTS[a]?.order || 999) - (CONFIG.AGENTS[b]?.order || 999)
                        );
                        UI.updateProgress(`  并行执行: ${parallelAgents.map(k => CONFIG.AGENTS[k].name).join(', ')}`);

                        const parallelPromises = parallelAgents.map(async (agentKey) => {
                            console.time(`并行 Agent ${agentKey}`);
                            await this._executeAgentByRole(agentKey, false, {
                                userInput,
                                isParallel: true,
                                parallelBeforeSnapshot: null // 并行阶段没有 before 快照
                            });
                            console.timeEnd(`并行 Agent ${agentKey}`);
                        });

                        await Promise.all(parallelPromises);

                        if (WORKFLOW_STATE.shouldStop) {
                            throw new UserInterruptError();
                        }

                        // 并行阶段结束后统一处理延迟的回流
                        const processing = Object.keys(AgentStateManager.states).filter(
                            k => AgentStateManager.states[k] === 'reflow_processing'
                        );
                        if (processing.length > 0) {

                            console.time(`回流处理`);
                            await this.processReflow();
                            console.timeEnd(`回流处理`);
                            if (WORKFLOW_STATE.shouldStop) {
                                throw new UserInterruptError();
                            }
                        }
                    }

                    console.timeEnd(`阶段 ${stage.stage}: ${stage.name}`);

                    if (WORKFLOW_STATE.shouldStop) {
                        throw new UserInterruptError();
                    }
                }

                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();
                if (WORKFLOW_STATE.discarded) throw new AbortChapterError();

                // ========== 多 saver 拼接逻辑（按 order 顺序） ==========
                let contentToSave = '';

                // 获取所有角色为 saver 且启用的 Agent 键，按 order 排序
                const enabledSet = new Set(WORKFLOW_STATE.enabledAgents || []);
                const saverKeys = Object.entries(CONFIG.AGENTS)
                    .filter(([key, agent]) => agent.role === 'saver' && enabledSet.has(key))
                    .sort((a, b) => (a[1].order || 999) - (b[1].order || 999))
                    .map(([key]) => key);


                // 收集有输出的 saver 的输出
                const saverOutputs = [];
                for (const key of saverKeys) {
                    const output = WORKFLOW_STATE.outputs[key];
                    if (output !== undefined && output !== null && output !== '') {

                        saverOutputs.push(output);
                    } else {

                    }
                }

                if (saverOutputs.length > 0) {
                    // 拼接所有 saver 输出（直接连接）
                    contentToSave = saverOutputs.join('\n');

                } else {

                    // 原有回退逻辑
                    const typesetterKey = this._getAgentKeyByRole('typesetter');
                    if (typesetterKey && WORKFLOW_STATE.outputs[typesetterKey]) {
                        contentToSave = WORKFLOW_STATE.outputs[typesetterKey];

                    } else {
                        const finalKey = this._getAgentKeyByRole('finalChapter');
                        if (finalKey && WORKFLOW_STATE.outputs[finalKey]) {
                            contentToSave = WORKFLOW_STATE.outputs[finalKey];

                        } else {
                            const enabledAgents = WORKFLOW_STATE.enabledAgents || [];
                            let fallbackKey = null;
                            for (let i = enabledAgents.length - 1; i >= 0; i--) {
                                const key = enabledAgents[i];
                                if (WORKFLOW_STATE.outputs[key]) {
                                    fallbackKey = key;
                                    break;
                                }
                            }
                            if (fallbackKey) {
                                contentToSave = WORKFLOW_STATE.outputs[fallbackKey];

                            } else {
                                console.warn('[DEBUG][executeWorkflow] 没有任何 Agent 有输出，无法保存章节');
                            }
                        }
                    }
                }

                if (contentToSave && !WORKFLOW_STATE.discarded) {
                    // ---------- 新增：去除外层代码块标记 ----------
                    const strippedContent = this._stripOuterCodeBlock(contentToSave);
                    if (strippedContent !== contentToSave) {

                    } else {

                    }
                    // ---------- 结束新增 ----------

                    // ---------- 从内容中提取标题，但内容保持不变 ----------
                    const titleMatch = strippedContent.match(/^第(\d+)\s*章\s*(.+)$/m);
                    let title;
                    if (titleMatch) {
                        let contentPart = titleMatch[2].trim();
                        // 移除可能的 "第X章" 前缀（但保留其余部分作为标题）
                        contentPart = contentPart.replace(/^\s*第\d+章\s*/, '').trim();
                        title = contentPart || `第${nextChapterNum}章`;

                    } else {
                        title = `第${nextChapterNum}章`;

                    }
                    // 内容使用去除代码块后的 strippedContent，不剥离任何其他内容
                    const cleanContent = strippedContent;

                    // ---------- 结束修改 ----------

                    UI.updateProgress('→ 保存章节...');
                    const snapshot = await Snapshot.create();

                    const chapterData = { title, content: cleanContent };

                    // 判断是否为互动章节
                    const hasInteractive = agents.includes(interactiveAgentKey);
                    if (hasInteractive) {
                        chapterData.interactive = true;

                    }

                    // ===== 分支系统：获取父章节号 =====
                    const parentNum = WORKFLOW_STATE.currentParentNum;


                    // ===== 获取互动结果 =====
                    const interactionResult = WORKFLOW_STATE.currentInteractionResult;


                    const saveSuccess = Storage.saveChapter(chapterData, nextChapterNum, snapshot, parentNum, interactionResult);
                    if (saveSuccess) {
                        UI.updateProgress(`📚 第${nextChapterNum}章已保存: ${title}`);
                        UI.updateCurrentChapterNum();


                        // ===== 分支系统：更新当前分支最新章节 =====
                        if (WORKFLOW_STATE.currentBranchLatest !== undefined) {
                            WORKFLOW_STATE.currentBranchLatest = nextChapterNum;

                        }
                    } else {
                        UI.updateProgress(`⚠️ 第${nextChapterNum}章保存可能失败`, true);
                        console.warn('[DEBUG][executeWorkflow] 章节保存失败');
                    }

                    // 更新跨章记忆
                    for (const [agentKey, output] of Object.entries(WORKFLOW_STATE.outputs)) {
                        const role = CONFIG.AGENTS[agentKey]?.role;
                        WORKFLOW_STATE.chapterMemory[agentKey] = output;
                        if (role && role.trim() !== '') {
                            WORKFLOW_STATE.chapterMemory[role] = output;
                        }
                    }


                    // 重置当前互动结果，避免影响下一章
                    WORKFLOW_STATE.currentInteractionResult = null;
                } else if (WORKFLOW_STATE.discarded) {
                    UI.updateProgress('⏭️ 本章为废章，已跳过保存');

                }

                if (aborted) {

                    return { success: false, aborted: true };
                }

                console.timeEnd('executeWorkflow 总耗时');
                return { success: true };

            } catch (error) {
                console.error('[DEBUG][executeWorkflow] 捕获到异常:', error);
                console.timeEnd('executeWorkflow 总耗时');
                if (error.name === 'ExistingBranchError') {
                    WORKFLOW_STATE.discarded = true;
                    return { success: false, aborted: false, branchConflict: true };
                } else if (error.name === 'AbortChapterError') {
                    aborted = true;
                    WORKFLOW_STATE.discarded = true;
                    UI.updateProgress('⚠️ 因连续回流超限，本章强制终止并回滚', true);
                    return { success: false, aborted: true };
                } else if (error.name === 'UserInterruptError') {
                    throw error;
                } else {
                    throw error;
                }
            } finally {
                if (WORKFLOW_STATE.discarded && preSnapshot) {
                    if (WORKFLOW_STATE.discardReason === 'existing_branch') {
                        UI.updateProgress('→ 因分支冲突回滚状态书到本章开始前...');
                    } else {
                        UI.updateProgress('→ 回滚状态书到本章开始前...');
                    }

                    let restored;
                    if (WORKFLOW_STATE.currentChapter === 1) {
                        restored = await resetWorldStateToInitial();
                        UI.updateProgress(restored ? '✅ 状态书已清空（第一章废章）' : '❌ 状态书清空失败', !restored);
                    } else {
                        restored = await Snapshot.restore(preSnapshot);
                        const snapshotTime = preSnapshot.timestamp ? new Date(preSnapshot.timestamp).toLocaleString() : '未知时间';
                        UI.updateProgress(restored ? `✅ 状态书已回滚至 ${snapshotTime}` : '❌ 状态书回滚失败', !restored);
                    }

                    if (WORKFLOW_STATE.discardReason !== 'existing_branch') {
                        delete WORKFLOW_STATE.discardReason;
                    }
                }

            }
        },

        // 辅助函数：去除最外层的代码块标记（如 ```html ... ```）
        _stripOuterCodeBlock(text) {
            if (!text || typeof text !== 'string') return text;
            const trimmed = text.trim();
            const codeBlockRegex = /^\s*```(?:html|markdown)?\s*\n([\s\S]*?)\n\s*```\s*$/;
            const match = trimmed.match(codeBlockRegex);
            if (match) {

                return match[1];
            }
            return text;
        },

        callAgent: async function (agentKey, message) {
            // 函数开头检查中断
            if (WORKFLOW_STATE.shouldStop) {
                throw new UserInterruptError();
            }

            const agent = CONFIG.AGENTS[agentKey];
            const agentName = getAgentDisplayName(agentKey);
            const realName = agent?.name || agentKey;
            const apiConfigId = agent.apiConfigId;
            const useCustomAPI = apiConfigId && apiConfigId.trim() !== '';


            if (useCustomAPI) {
                // 检查输入中是否包含文件标记
                let cleanMessage = message;
                let fileIds = [];
                const fileRegex = /\[file:([^\]]+)\]\s*/g;
                let match;
                while ((match = fileRegex.exec(message)) !== null) {
                    fileIds.push(match[1]);
                }
                if (fileIds.length > 0) {
                    cleanMessage = message.replace(fileRegex, '').trim();

                }

                const config = CONFIG.apiConfigs[apiConfigId];
                const { source, apiUrl, key, model, timeout = 3600000 } = config;
                const url = apiUrl.replace(/\/+$/, '');

                // 构建组合信号（用于中断）
                const signals = [];
                if (WORKFLOW_STATE.abortController) {
                    signals.push(WORKFLOW_STATE.abortController.signal);
                }
                signals.push(AbortSignal.timeout(timeout));
                const combinedSignal = AbortSignal.any(signals);


                try {
                    // ========== OpenAI 兼容平台 (包括 deepseek, siliconflow, qwen, glm, mistral, groq, inference, openrouter, 4sapi, other) ==========
                    if (['openai', 'deepseek', 'siliconflow', 'qwen', 'glm', 'mistral', 'groq', 'inference', 'openrouter', '4sapi', 'other'].includes(source)) {
                        const requestBody = {
                            model: model,
                            messages: [{ role: 'user', content: cleanMessage }],
                            max_tokens: config.maxTokens,
                            temperature: config.temperature,
                            top_p: config.top_p,
                            frequency_penalty: config.frequency_penalty,
                            presence_penalty: config.presence_penalty,
                            stop: config.stop,
                        };
                        if (fileIds.length > 0) {
                            requestBody.file_ids = fileIds;
                        }
                        Object.keys(requestBody).forEach(k => requestBody[k] === undefined && delete requestBody[k]);

                        console.log(`[callAgent][${agentKey}] OpenAI 兼容请求体:`, {
                            ...requestBody,
                            messages: [{
                                role: 'user',
                                content: requestBody.messages[0].content.substring(0, 200) + '...'
                            }]
                        });

                        const response = await fetch(`${url}/chat/completions`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${key}`,
                            },
                            body: JSON.stringify(requestBody),
                            signal: combinedSignal,
                        });


                        if (!response.ok) {
                            const errText = await response.text();
                            console.error(`[callAgent][${agentKey}] 错误响应:`, errText);
                            throw new Error(`API 错误 (${response.status}): ${errText}`);
                        }
                        const data = await response.json();
                        console.log(`[callAgent][${agentKey}] 响应数据 (简化):`, {
                            choices: data.choices ? data.choices.map(c => ({
                                message: c.message ? { content_length: c.message.content?.length } : {},
                                text_length: c.text?.length
                            })) : '无choices'
                        });

                        let generatedText = data.choices?.[0]?.message?.content || data.choices?.[0]?.text;
                        if (!generatedText) {
                            console.error(`[callAgent][${agentKey}] 响应中无有效文本`, data);
                            throw new Error('响应中无有效文本');
                        }

                        WORKFLOW_STATE.outputs[agentKey] = generatedText;
                        AgentStateManager.setState(agentKey, 'completed');
                        UI.updateAgentStatusButton(agentKey);

                        return generatedText;
                    }

                    // ========== 豆包 (doubao) ==========
                    else if (source === 'doubao') {
                        // 构建请求体，兼容 OpenAI 格式
                        const requestBody = {
                            model: model,
                            messages: [{ role: 'user', content: cleanMessage }],
                            max_tokens: config.maxTokens,
                            temperature: config.temperature,
                            top_p: config.top_p,
                            frequency_penalty: config.frequency_penalty,
                            presence_penalty: config.presence_penalty,
                            stop: config.stop,
                        };
                        // 如果有文件 ID，添加到 file_ids 字段
                        if (fileIds.length > 0) {
                            requestBody.file_ids = fileIds;
                        }
                        Object.keys(requestBody).forEach(k => requestBody[k] === undefined && delete requestBody[k]);

                        console.log(`[callAgent][${agentKey}] 豆包请求体:`, {
                            ...requestBody,
                            messages: [{ role: 'user', content: requestBody.messages[0].content.substring(0, 200) + '...' }]
                        });

                        const response = await fetch(`${url}/chat/completions`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${key}`,
                            },
                            body: JSON.stringify(requestBody),
                            signal: combinedSignal,
                        });

                        if (!response.ok) {
                            const errText = await response.text();
                            console.error(`[callAgent][${agentKey}] 错误响应:`, errText);
                            throw new Error(`豆包错误 (${response.status}): ${errText}`);
                        }
                        const data = await response.json();
                        console.log(`[callAgent][${agentKey}] 响应数据:`, {
                            choices: data.choices ? data.choices.map(c => ({
                                message: c.message ? { content_length: c.message.content?.length } : {},
                                text_length: c.text?.length
                            })) : '无choices'
                        });

                        let generatedText = data.choices?.[0]?.message?.content || data.choices?.[0]?.text;
                        if (!generatedText) {
                            console.error(`[callAgent][${agentKey}] 响应中无有效文本`, data);
                            throw new Error('响应中无有效文本');
                        }

                        WORKFLOW_STATE.outputs[agentKey] = generatedText;
                        AgentStateManager.setState(agentKey, 'completed');
                        UI.updateAgentStatusButton(agentKey);

                        return generatedText;
                    }

                    // ========== Claude ==========
                    else if (source === 'claude') {
                        const requestBody = {
                            model: model,
                            messages: [{ role: 'user', content: cleanMessage }],
                            max_tokens: config.maxTokens,
                            temperature: config.temperature,
                            top_p: config.top_p,
                            stop_sequences: config.stop ? (Array.isArray(config.stop) ? config.stop : [config.stop]) : undefined,
                        };
                        if (fileIds.length > 0) {
                            requestBody.files = fileIds.map(id => ({ type: 'file', file_id: id }));
                        }
                        Object.keys(requestBody).forEach(k => requestBody[k] === undefined && delete requestBody[k]);

                        console.log(`[callAgent][${agentKey}] Claude 请求体:`, {
                            ...requestBody,
                            messages: [{
                                role: 'user',
                                content: requestBody.messages[0].content.substring(0, 200) + '...'
                            }]
                        });

                        const response = await fetch(`${url}/messages`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-api-key': key,
                                'anthropic-version': '2023-06-01',
                            },
                            body: JSON.stringify(requestBody),
                            signal: combinedSignal,
                        });


                        if (!response.ok) {
                            const errText = await response.text();
                            console.error(`[callAgent][${agentKey}] 错误响应:`, errText);
                            throw new Error(`Claude 错误 (${response.status}): ${errText}`);
                        }
                        const data = await response.json();
                        const generatedText = data.content?.[0]?.text;
                        if (!generatedText) throw new Error('Claude 响应中无有效文本');

                        WORKFLOW_STATE.outputs[agentKey] = generatedText;
                        AgentStateManager.setState(agentKey, 'completed');
                        UI.updateAgentStatusButton(agentKey);
                        return generatedText;
                    }

                    // ========== Gemini ==========
                    else if (source === 'gemini') {
                        const requestBody = {
                            contents: [{
                                parts: [{ text: cleanMessage }]
                            }]
                        };

                        const response = await fetch(`${url}/v1beta/models/${model}:generateContent?key=${key}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody),
                            signal: combinedSignal,
                        });

                        if (!response.ok) {
                            const errText = await response.text();
                            console.error(`[callAgent][${agentKey}] 错误响应:`, errText);
                            throw new Error(`Gemini 错误 (${response.status}): ${errText}`);
                        }
                        const data = await response.json();
                        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!generatedText) {
                            console.error(`[callAgent][${agentKey}] Gemini 响应中无有效文本`, data);
                            throw new Error('Gemini 响应中无有效文本');
                        }

                        WORKFLOW_STATE.outputs[agentKey] = generatedText;
                        AgentStateManager.setState(agentKey, 'completed');
                        UI.updateAgentStatusButton(agentKey);

                        return generatedText;
                    }

                    // ========== 文心一言 (wenxin) ==========
                    else if (source === 'wenxin') {


                        const requestBody = {
                            messages: [{ role: 'user', content: cleanMessage }],
                            stream: false,
                            ...(config.maxTokens && { max_tokens: config.maxTokens }),
                            ...(config.temperature && { temperature: config.temperature }),
                            ...(config.top_p && { top_p: config.top_p }),
                        };


                        const response = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${key}`,
                            },
                            body: JSON.stringify(requestBody),
                            signal: combinedSignal,
                        });


                        if (!response.ok) {
                            const errText = await response.text();
                            console.error(`[callAgent][${agentKey}] 文心一言错误响应:`, errText);
                            throw new Error(`文心一言错误 (${response.status}): ${errText}`);
                        }
                        const data = await response.json();


                        const generatedText = data.result || data.choices?.[0]?.message?.content;
                        if (!generatedText) throw new Error('文心一言响应中无有效文本');

                        WORKFLOW_STATE.outputs[agentKey] = generatedText;
                        AgentStateManager.setState(agentKey, 'completed');
                        UI.updateAgentStatusButton(agentKey);
                        return generatedText;
                    }

                    // ========== 图像平台 ==========
                    else if (['openai', 'stability', 'midjourney', 'flux', 'picsart', 'siliconflow', 'sdwebui', 'other'].includes(source) && type === 'image') {
                        // 图像平台的调用已由 _executeImageGenerator 等专用函数处理，此处不应进入
                        console.warn(`[callAgent][${agentKey}] 图像平台 ${source} 不应通过 callAgent 直接调用，请检查配置`);
                        throw new Error(`图像平台 ${source} 必须由专用函数调用`);
                    }

                    // ========== 音频平台 ==========
                    else if (['elevenlabs', 'stableaudio', 'huggingface', 'openai-tts', 'azure-tts', 'google-tts', 'custom', 'other'].includes(source) && type === 'audio') {
                        // 音频平台的调用已由 _executeMusicGenerator 等专用函数处理，此处不应进入
                        console.warn(`[callAgent][${agentKey}] 音频平台 ${source} 不应通过 callAgent 直接调用，请检查配置`);
                        throw new Error(`音频平台 ${source} 必须由专用函数调用`);
                    }

                    // ========== 其他平台 ==========
                    else {
                        throw new Error(`[callAgent] 不支持的文本平台: ${source}`);
                    }
                } catch (error) {
                    console.error(`[callAgent][${agentKey}] 调用失败:`, error);

                    if (WORKFLOW_STATE.shouldStop) {
                        throw new UserInterruptError();
                    }

                    const msg = error?.message || String(error);

                    // 保存详细错误信息
                    AgentStateManager.setState(agentKey, 'error');
                    WORKFLOW_STATE.lastAgentError = WORKFLOW_STATE.lastAgentError || {};
                    WORKFLOW_STATE.lastAgentError[agentKey] = {
                        message: msg,
                        stack: error.stack,
                        timestamp: Date.now(),
                        apiConfig: config ? { source, model, timeout } : null,
                        prompt: message.substring(0, 500)
                    };
                    // 显示友好错误信息到进度区域
                    let errorMsg = `${agentName}调用失败`;
                    if (msg.includes('401')) errorMsg += '：API密钥无效或已过期';
                    else if (msg.includes('429')) errorMsg += '：API速率限制超限，请稍后重试';
                    else if (msg.includes('timeout')) errorMsg += '：API请求超时，请检查网络或增大超时时间';
                    else if (msg.includes('AbortError')) errorMsg += '：用户中断了操作';
                    else if (msg.includes('Failed to fetch')) errorMsg += '：网络连接失败，请检查API地址';
                    else errorMsg += `：${msg}`;
                    UI.updateProgress(`❌ ${errorMsg}`, true);

                    WORKFLOW_STATE.discarded = true;
                    throw error;
                }
            } else {
                // 使用默认 SillyTavern 生成
                try {
                    if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();
                    await API.selectCharacter(realName);
                    if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                    await API.sleep(CONFIG.AGENT_SWITCH_DELAY);
                    if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                    const inputTokens = await countTokens(message, 'default');
                    WORKFLOW_STATE.tokenStats.lastInput = inputTokens;
                    WORKFLOW_STATE.tokenStats.totalInput += inputTokens;

                    if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                    const generationId = `agent_${agentKey}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                    const generatePromise = API.generate(message, {
                        generation_id: generationId,
                        should_silence: false
                    });

                    const response = await Promise.race([
                        generatePromise,
                        new Promise((_, reject) => {
                            const checkInterval = setInterval(() => {
                                if (WORKFLOW_STATE.shouldStop) {
                                    clearInterval(checkInterval);
                                    API.stopGeneration().then(() => {
                                        reject(new UserInterruptError());
                                    }).catch(() => {
                                        reject(new UserInterruptError());
                                    });
                                }
                            }, 200);
                        })
                    ]);

                    if (WORKFLOW_STATE.shouldStop) {
                        throw new UserInterruptError();
                    }

                    const outputTokens = await countTokens(response.mes, 'default');
                    WORKFLOW_STATE.tokenStats.lastOutput = outputTokens;
                    WORKFLOW_STATE.tokenStats.totalOutput += outputTokens;
                    UI.updateTokenDisplay();

                    WORKFLOW_STATE.outputs[agentKey] = response.mes;
                    AgentStateManager.setState(agentKey, 'completed');
                    UI.updateAgentStatusButton(agentKey);

                    return response.mes;
                } catch (e) {
                    if (WORKFLOW_STATE.shouldStop) {
                        throw new UserInterruptError();
                    }
                    if (e.name === 'UserInterruptError') {
                        throw e;
                    }

                    console.error(`[Workflow.callAgent] ${agentName}调用失败:`, e);
                    AgentStateManager.setState(agentKey, 'error');
                    WORKFLOW_STATE.lastAgentError = WORKFLOW_STATE.lastAgentError || {};
                    WORKFLOW_STATE.lastAgentError[agentKey] = {
                        message: e.message,
                        stack: e.stack,
                        timestamp: Date.now(),
                        apiConfig: null,
                        prompt: message.substring(0, 500)
                    };
                    let errorMsg = `${agentName}调用失败`;
                    if (e.message.includes('timeout')) errorMsg += '：请求超时';
                    else errorMsg += `：${e.message}`;
                    UI.updateProgress(`❌ ${errorMsg}`, true);
                    WORKFLOW_STATE.discarded = true;
                    throw new Error(`${agentName}调用失败: ${e.message}`);
                }
            }
        },

        _getBestOutputForSaving() {


            // 1. 获取所有启用的 saver Agent，按 order 排序
            const enabledSet = new Set(WORKFLOW_STATE.enabledAgents || []);
            const saverKeys = Object.entries(CONFIG.AGENTS)
                .filter(([key, agent]) => agent.role === 'saver' && enabledSet.has(key))
                .sort((a, b) => (a[1].order || 999) - (b[1].order || 999))
                .map(([key]) => key);


            // 收集有输出的 saver 输出
            const saverOutputs = [];
            for (const key of saverKeys) {
                const output = WORKFLOW_STATE.outputs[key];
                if (output !== undefined && output !== null && output !== '') {

                    saverOutputs.push(output);
                } else {

                }
            }

            if (saverOutputs.length > 0) {
                const result = saverOutputs.join('\n\n');

                return result;
            }

            // 2. 尝试 typesetter
            const typesetterKey = this._getAgentKeyByRole('typesetter');
            if (typesetterKey && WORKFLOW_STATE.outputs[typesetterKey]) {

                return WORKFLOW_STATE.outputs[typesetterKey];
            }

            // 3. 尝试 finalChapter
            const finalKey = this._getAgentKeyByRole('finalChapter');
            if (finalKey && WORKFLOW_STATE.outputs[finalKey]) {

                return WORKFLOW_STATE.outputs[finalKey];
            }

            // 4. 回退：从启用列表中反向查找第一个有输出的 Agent
            const enabled = WORKFLOW_STATE.enabledAgents || [];
            for (let i = enabled.length - 1; i >= 0; i--) {
                const key = enabled[i];
                if (WORKFLOW_STATE.outputs[key]) {

                    return WORKFLOW_STATE.outputs[key];
                }
            }

            console.warn('[DEBUG][_getBestOutputForSaving] 未找到任何可用的输出');
            return null;
        },

        /**
         * 根据 mode 获取对应的图像 API 配置
         * @param {string} mode - 模式：'txt2img'（文生图）、'img2img'（图生图）、'fusion'（融合图）
         * @returns {Object} 图像配置对象
         */
        _getImageConfig: function (mode) {
            const apiConfigs = CONFIG.apiConfigs || {};


            // 优先找 mode 匹配的
            for (const [id, cfg] of Object.entries(apiConfigs)) {
                if (cfg.type === 'image' && cfg.mode === mode) {

                    return cfg;
                }
            }

            // 降级：返回第一个 image 配置
            for (const [id, cfg] of Object.entries(apiConfigs)) {
                if (cfg.type === 'image') {
                    console.warn(`[getImageConfig] 未找到 mode=${mode} 的配置，使用默认 image 配置: ${id}`);
                    return cfg;
                }
            }

            throw new Error(`未找到任何 type 为 "image" 的配置`);
        },

        // 修改后的 parseProtocol 函数（属于 Workflow 对象）
        parseProtocol(protocolText) {
            // 匹配协议头部：===续写锁定协议===
            const headerMatch = protocolText.match(/===\s*续写锁定协议\s*===\s*/);

            if (!headerMatch) {

                return { success: false, error: '未找到协议头部' };
            }

            const chapterNum = WORKFLOW_STATE.currentChapter; // 使用当前章节号，不从头部提取
            const content = protocolText.substring(headerMatch[0].length).trim();


            const data = {};
            // 类别标题正则：允许前后空格，名称捕获直到下一个类别或结尾
            const categoryRegex = /\*\*\s*类别(\d+)\s*:\s*([^*]+?)\s*\*\*\s*\n?([\s\S]*?)(?=\n\*\*\s*类别\d+\s*:|$)/g;
            let catMatch;
            while ((catMatch = categoryRegex.exec(content)) !== null) {
                const catId = catMatch[1];
                const catName = catMatch[2].trim();
                const fieldsContent = catMatch[3].trim();

                data[catId] = { name: catName, content: fieldsContent };
            }

            if (Object.keys(data).length === 0) {

                return { success: false, error: '协议中未找到任何类别定义' };
            }


            return { success: true, chapterNum, data };
        },

        // ==================== 优化师专用执行函数 ====================

        async _executeOptimizer(agentKey) {
            const finalAgentKey = this._getAgentKeyByRole('finalChapter');
            const finalContent = finalAgentKey ? (WORKFLOW_STATE.outputs[finalAgentKey] || '') : '';
            if (!finalContent) {
                UI.updateProgress(`❌ 最终章节内容未就绪，无法调用优化师`, true);
                AgentStateManager.setState(agentKey, 'error');
                return;
            }

            const stateBooks = await getAllStateBooks();
            let totalEntries = 0;
            let distribution = '';
            let allTemplates = [];
            let configText = '';

            UI.updateProgress(`  正在加载所有状态模板...`);
            allTemplates = await loadAllStateTemplates();
            allTemplates.forEach(t => {
                const bookIndex = t.bookIndex;
                const count = Object.keys(t.categoryMap).length;
                totalEntries += count;
            });
            distribution = allTemplates.map(t => `状态书-${t.bookIndex}: ${Object.keys(t.categoryMap).length}/${CONFIG.STATE_TYPE_LIMIT} 条目`).join('；');
            UI.updateProgress(`  正在收集所有状态条目配置...`);
            configText = await getAllStateEntriesConfig();

            // 判断每本书是否有空间新增
            let hasRoomForNew = false;
            let roomDetails = [];
            for (const bookName of stateBooks) {
                const book = await API.getWorldbook(bookName);
                const entries = Array.isArray(book) ? book : (book.entries || []);
                const stateEntries = entries.filter(e => e?.name?.startsWith(CONFIG.STATE_ENTRY_PREFIX));
                const currentCount = stateEntries.length;
                const limit = CONFIG.STATE_TYPE_LIMIT;
                if (currentCount < limit) {
                    hasRoomForNew = true;
                    roomDetails.push(`${bookName}: ${currentCount}/${limit} (有空间)`);
                } else {
                    roomDetails.push(`${bookName}: ${currentCount}/${limit} (已满)`);
                }
            }
            const currentBookCount = stateBooks.length;
            const canCreateNewBook = currentBookCount < CONFIG.MAX_STATE_BOOKS;
            const isFull = !hasRoomForNew && !canCreateNewBook;

            UI.updateProgress(`→ 调用状态优化师 (${getAgentDisplayName(agentKey)})...`);
            AgentStateManager.setState(agentKey, 'running');

            let systemLimitMessage = `【系统限制】\n` +
                `- 最多可创建状态书数量：${CONFIG.MAX_STATE_BOOKS}\n` +
                `- 每本状态书最多允许状态条目数：${CONFIG.STATE_TYPE_LIMIT}\n` +
                `- 当前状态书总数：${stateBooks.length}\n` +
                `- 当前状态条目分布：${distribution || '无状态条目'}\n` +
                `- 当前状态条目总数：${totalEntries}\n`;

            if (isFull) {
                systemLimitMessage += `\n【重要提示】所有状态书均已满，且无法创建新书。你必须通过删除或合并现有条目来释放空间，才能新增类别。请优先考虑删除不再需要的旧类别（使用“书号-uid：delete”格式），或者修改现有类别的定义。新增类别时必须确保删除足够数量的旧条目，使得总条目数不超过限制。删除操作请在动作中使用“书号-uid：delete”格式。`;
            } else {
                systemLimitMessage += `\n【提示】你可以自由选择将新增类别放入已有状态书（若有空间）或创建新书。书号从1开始递增，建议按需分配。`;
            }

            const optimizerContext = await this._buildOptimizerContext();

            const optimizerPrompt = `最终文章：\n${finalContent}\n\n` +
                systemLimitMessage + `\n\n` +
                `【状态书当前状态】\n${optimizerContext}\n\n` +
                `【输出格式要求】\n` +
                `- 每行指令必须以 "书号-条目uid: " 开头，书号必须是正整数，与目标状态书对应。\n` +
                `- 例如 "1-1003: **类别03:势力关系**" 表示在状态书-1中操作 uid=1003 的条目。\n` +
                `- 如果你希望将新增类别放入状态书-2，请使用 "2-新uid: ..."。\n` +
                `- 删除操作使用 "书号-uid: delete"，例如 "2-1010: delete"。\n` +
                `- 请根据当前各状态书的剩余空间合理分配，不要把所有新增都塞到同一本书。`;

            UI.updateProgress(`  发送提示词给优化师...`);
            const response = await this.callAgent(agentKey, optimizerPrompt);

            const agent = CONFIG.AGENTS[agentKey];
            if (agent.reflowConditions && agent.reflowConditions.length > 0) {
                const triggered = agent.reflowConditions.some(cond => responseText?.includes(cond) === true);
                if (triggered) {
                    UI.updateProgress(`⚠️ Agent ${getAgentDisplayName(agentKey)} 触发回流`);
                    await this.handleReflow(agentKey);
                    return;
                }
            }

            UI.updateProgress(`  解析优化师输出...`);
            const actions = parseOptimizerOutput(response);

            const oldContents = {}; // 键: `${bookIndex}-${uid}`，值: content
            if (actions.length > 0) {
                UI.updateProgress(`  正在收集受影响条目的旧内容...`);
                // 获取所有状态书的当前条目
                const allBooks = await getAllStateBooks();
                for (const bookName of allBooks) {
                    const bookIndex = parseInt(bookName.split('-')[1]);
                    const book = await API.getWorldbook(bookName);
                    const entries = Array.isArray(book) ? book : (book.entries || []);
                    for (const action of actions) {
                        if (action.bookIndex === bookIndex && action.uid) {
                            const entry = entries.find(e => e.uid === action.uid);
                            if (entry) {
                                const key = `${bookIndex}-${action.uid}`;
                                oldContents[key] = entry.content;
                            }
                        }
                    }
                }
            }

            if (actions.length > 0) {
                new Set(actions.map(a => a.bookIndex));
            }

            if (isFull) {
                const hasDelete = actions.some(a => a.content === 'delete');
                if (!hasDelete) {
                    UI.updateProgress(`⚠️ 警告：当前状态书已满，但优化师未提供任何删除指令，可能无法释放空间。`, true);
                }
            }

            if (actions.length === 0) {
                UI.updateProgress(`  ⚠️ 优化师未返回任何有效动作`, true);
                console.warn('[DEBUG][_executeOptimizer] 优化师未返回有效动作');
            } else {
                UI.updateProgress(`  正在应用 ${actions.length} 个优化动作...`);
                await updateStateBooksFromOptimizerOutput(actions);
                UI.updateProgress(`  ✅ 状态书优化完成`);
            }

            WORKFLOW_STATE.lastStateContents = oldContents;

            AgentStateManager.setState(agentKey, 'completed');
        },

        // ==================== 维护师专用执行函数 ====================

        async _executeUpdater(agentKey) {
            const finalAgentKey = this._getAgentKeyByRole('finalChapter');
            const finalContent = finalAgentKey ? (WORKFLOW_STATE.outputs[finalAgentKey] || '') : '';
            if (!finalContent) {
                UI.updateProgress(`❌ 最终章节内容未就绪，无法调用维护师`, true);
                AgentStateManager.setState(agentKey, 'error');
                return;
            }

            UI.updateProgress(`→ 调用状态维护师 (${getAgentDisplayName(agentKey)})...`);
            AgentStateManager.setState(agentKey, 'running');

            let currentGlobalBooks = [];
            try {
                if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                    currentGlobalBooks = await TavernHelper.getGlobalWorldbookNames();
                } else if (typeof window.getGlobalWorldbookNames === 'function') {
                    currentGlobalBooks = await window.getGlobalWorldbookNames();
                }
            } catch (e) {
                UI.updateProgress(`  ⚠️ 获取当前全局世界书失败: ${e.message}`, true);
            }

            const booksToProcess = currentGlobalBooks.filter(name => name.startsWith(CONFIG.STATE_BOOK_PREFIX));
            UI.updateProgress(`  状态书: ${booksToProcess.join(', ') || '无'} (共 ${booksToProcess.length} 本)`);

            if (booksToProcess.length === 0) {
                UI.updateProgress(`  ❌ 没有可用的状态书，维护师无法执行（请检查优化师是否已创建并激活状态书）`, true);
                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress('⚠️ 无状态书，本章标记为废章，将回滚状态书...', true);
                }
                throw new AbortChapterError('无可用状态书，更新失败');
            }

            let hasAnyError = false;

            for (let i = 0; i < booksToProcess.length; i++) {
                const bookName = booksToProcess[i];
                UI.updateProgress(`  → 处理状态书 ${i + 1}/${booksToProcess.length}: ${bookName}`);

                let book;
                try {
                    book = await API.getWorldbook(bookName);
                } catch (e) {
                    UI.updateProgress(`    ❌ 无法读取状态书 ${bookName}: ${e.message}`, true);
                    console.error(`[DEBUG][_executeUpdater] 读取世界书失败:`, e);
                    hasAnyError = true;
                    continue;
                }

                const entries = Array.isArray(book) ? book : (book.entries || []);
                const bookIndex = parseInt(bookName.split('-')[1]);
                const templateEntryName = `${CONFIG.STATE_TEMPLATE_PREFIX}${bookIndex}`;
                const templateEntry = entries.find(e => e.name === templateEntryName);
                const templateContent = templateEntry ? templateEntry.content : '';

                let oldContentStr = '';
                if (WORKFLOW_STATE.lastStateContents) {
                    const relevantKeys = Object.keys(WORKFLOW_STATE.lastStateContents).filter(key => key.startsWith(`${bookIndex}-`));
                    if (relevantKeys.length > 0) {
                        const parts = [];
                        for (const key of relevantKeys) {
                            const uid = key.split('-')[1];
                            const content = WORKFLOW_STATE.lastStateContents[key];
                            parts.push(`【条目 uid=${uid}】\n${content}`);
                        }
                        oldContentStr = `\n\n【上一章被修改或删除的状态信息】\n${parts.join('\n\n')}`;
                    }
                }

                const updaterPrompt = `最终文章：\n${finalContent}\n\n当前状态书模板：\n${templateContent}${oldContentStr}\n\n请为当前状态书生成续写锁定协议。`;

                let response;
                try {
                    response = await this.callAgent(agentKey, updaterPrompt);
                } catch (e) {
                    UI.updateProgress(`    ❌ 调用失败: ${e.message}`, true);
                    console.error(`[DEBUG][_executeUpdater] 调用维护师失败:`, e);
                    hasAnyError = true;
                    continue;
                }

                const agent = CONFIG.AGENTS[agentKey];
                if (agent.reflowConditions && agent.reflowConditions.length > 0) {
                    const triggered = agent.reflowConditions.some(cond => responseText?.includes(cond) === true);
                    if (triggered) {
                        UI.updateProgress(`⚠️ Agent ${getAgentDisplayName(agentKey)} 触发回流`);
                        await this.handleReflow(agentKey);
                        return;
                    }
                }

                const protocol = response;

                const parseResult = this.parseProtocol(protocol);
                if (parseResult.success) {
                    try {
                        const { successIds, errorIds } = await updateWorldState(bookName, parseResult.data);
                        if (successIds.length) {
                            UI.updateProgress(`    ✅ 更新成功: ${successIds.join(', ')} (共 ${successIds.length} 个类别)`);
                        }
                        if (errorIds.length) {
                            UI.updateProgress(`    ❌ 更新失败: ${errorIds.join(', ')}`, true);
                            hasAnyError = true;
                        }
                    } catch (e) {
                        UI.updateProgress(`    ❌ 更新状态书时出错: ${e.message}`, true);
                        console.error(`[DEBUG][_executeUpdater] 更新状态书出错:`, e);
                        hasAnyError = true;
                    }
                } else {
                    UI.updateProgress(`    ❌ 协议解析失败: ${parseResult.error}`, true);
                    console.warn(`[DEBUG][_executeUpdater] 协议解析失败:`, parseResult.error);
                    hasAnyError = true;
                }
            }

            if (hasAnyError) {
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress('⚠️ 部分状态更新失败，本章标记为废章，将回滚状态书...', true);
                }
                AgentStateManager.setState(agentKey, 'error');
                throw new AbortChapterError('状态更新失败（协议解析错误或部分条目更新出错）');
            } else {
                WORKFLOW_STATE.discarded = false;
                AgentStateManager.setState(agentKey, 'completed');
            }
        },

        // ==================== 生图师专用执行函数 ====================

        async _executeImageGenerator(agentKey, initialUserInput = '', isReflow = false, options = {}) {

            const { isParallel = false, parallelBeforeSnapshot = null } = options;

            if (WORKFLOW_STATE.discarded) {
                console.warn(`[IMAGE DEBUG] 本章已被标记为废章，终止执行`);
                throw new AbortChapterError();
            }
            if (WORKFLOW_STATE.shouldStop) {
                console.warn(`[IMAGE DEBUG] 收到停止信号，终止执行`);
                throw new UserInterruptError();
            }

            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) {
                console.error(`[IMAGE DEBUG] 未找到 agentKey=${agentKey}`);
                return;
            }

            // 获取文生图专用图像配置
            let imageConfig = null;
            try {
                imageConfig = this._getImageConfig('txt2img');

            } catch (e) {
                console.warn(`[IMAGE DEBUG] 获取图像配置失败:`, e);
            }

            // 周期执行判断
            if (!isReflow && agent.executeInterval > 0) {
                const interval = agent.executeInterval;
                const currentChapter = WORKFLOW_STATE.currentChapter;
                const shouldExecute = (currentChapter % interval) === 0;

                if (!shouldExecute) {
                    AgentStateManager.setState(agentKey, 'idle');
                    WORKFLOW_STATE.outputs[agentKey] = '';
                    UI.updateProgress(`⏭️ ${getAgentDisplayName(agentKey)} 被跳过（周期执行）`);

                    return;
                }
            }

            // 回流时删除旧图片
            if (isReflow) {
                const oldOutput = WORKFLOW_STATE.outputs[agentKey];
                if (oldOutput) {

                    try {
                        const oldImages = JSON.parse(oldOutput);
                        if (Array.isArray(oldImages)) {
                            for (const img of oldImages) {
                                if (img.id) {
                                    await ImageStore.delete(img.id);

                                }
                            }
                        }
                    } catch (e) {
                        console.warn(`[IMAGE DEBUG] 解析旧输出失败，无法删除图片`, e);
                    }
                }
            }

            WORKFLOW_STATE.currentStep = agentKey;
            AgentStateManager.setState(agentKey, 'running');
            UI.updateProgress(`→ 调用生图师 (${getAgentDisplayName(agentKey)})...`);

            // 记录 before 依赖
            let beforeTargetKey = null;
            if (isParallel && parallelBeforeSnapshot?.agentKey) {
                beforeTargetKey = parallelBeforeSnapshot.agentKey;
            } else if (!isParallel && WORKFLOW_STATE.lastSerialOutput?.agentKey) {
                beforeTargetKey = WORKFLOW_STATE.lastSerialOutput.agentKey;
            }
            if (!WORKFLOW_STATE.beforeDependencies) WORKFLOW_STATE.beforeDependencies = {};
            WORKFLOW_STATE.beforeDependencies[agentKey] = beforeTargetKey;


            try {
                // 完整输入收集

                const collected = await this._collectInputs(agentKey, isReflow, options);

                // 构建基础 prompt
                let prompt = agent.inputTemplate;
                let placeholderIdx = 0;
                prompt = prompt.replace(/【】/g, () => collected[placeholderIdx++] || '');


                // 添加回流反馈
                if (isReflow && WORKFLOW_STATE.reflowMap?.[agentKey]) {
                    const feedbackData = WORKFLOW_STATE.reflowMap[agentKey];
                    const feedbackParts = [];
                    for (const sourceKey of feedbackData.sources) {
                        const sourceOutput = feedbackData.outputs[sourceKey];
                        if (sourceOutput) {
                            const sourceName = getAgentDisplayName(sourceKey);
                            feedbackParts.push(`【来自 ${sourceName} 的反馈】\n${sourceOutput}`);
                        }
                    }
                    if (feedbackParts.length > 0) {
                        prompt += '\n\n' + feedbackParts.join('\n\n');

                    }
                }

                if (isReflow && WORKFLOW_STATE.reflowMap?.[agentKey]?.previousOutput !== undefined) {
                    const previousOutput = WORKFLOW_STATE.reflowMap[agentKey].previousOutput;
                    if (previousOutput && previousOutput.trim() !== '') {
                        prompt += '\n\n【上次输出】：\n' + previousOutput;

                    }
                }

                // 获取最终章节内容并分段（如果需要）
                // 注意：如果 agent 的 role 是段落生图师，可能需要段落列表。但这里我们统一收集输入，由 agent 自行处理。
                // 我们可以提供段落列表变量，但当前代码中未使用，所以保持原样。

                // 附加图像模型配置
                if (imageConfig) {
                    prompt += `\n\n【图像模型完整配置】\n${JSON.stringify(imageConfig, null, 2)}`;
                }


                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                // 调用生图师 Agent

                const responseText = await this.callAgent(agentKey, prompt);


                // 保存原始输出
                if (!WORKFLOW_STATE.agentRawOutputs) WORKFLOW_STATE.agentRawOutputs = {};
                WORKFLOW_STATE.agentRawOutputs[agentKey] = responseText;

                // 解析输出为 JSON 数组
                let tasks = [];
                try {
                    tasks = JSON.parse(responseText);
                    if (!Array.isArray(tasks)) {
                        // 如果不是数组，尝试包装为数组
                        tasks = [tasks];
                        console.warn(`[IMAGE DEBUG] 解析结果不是数组，已包装为数组`);
                    }

                } catch (e) {
                    console.error(`[IMAGE DEBUG] 解析 JSON 失败，输出可能不是 JSON 格式`, e);
                    // 降级处理：尝试旧格式？这里我们不再支持旧格式，直接报错
                    throw new Error(`生图师输出不是有效的 JSON 数组: ${responseText}`);
                }

                // 串行生成图片，并显示进度
                const imageResults = [];
                if (tasks.length > 0) {
                    UI.updateProgress(`  生图师输出 ${tasks.length} 个图片任务，开始并发生成（并发数 2）...`);


                    const concurrency = 2; // 并发数
                    const queue = [...tasks];
                    const running = new Set();
                    const imageResults = [];

                    const runNext = async () => {
                        if (queue.length === 0) return;
                        const task = queue.shift();
                        const currentIndex = tasks.indexOf(task) + 1;
                        const taskId = `task_${currentIndex}`;
                        running.add(taskId);


                        try {
                            console.time(`图片生成任务 ${currentIndex}`);
                            const imageData = await this._callImageAPI(task.params);
                            console.timeEnd(`图片生成任务 ${currentIndex}`);

                            const imageId = await ImageStore.save(imageData);
                            imageResults.push({
                                type: task.element,
                                id: imageId,
                                start: task.start,
                                end: task.end
                            });
                            UI.updateProgress(`  ✅ 已完成图片 ${currentIndex}/${tasks.length}`);
                        } catch (err) {
                            console.error(`[IMAGE DEBUG] 任务 ${currentIndex} 失败:`, err);
                            UI.updateProgress(`  ❌ 图片 ${currentIndex}/${tasks.length} 生成失败: ${err.message}`, true);
                        } finally {
                            running.delete(taskId);
                            runNext(); // 继续下一个
                        }
                    };

                    // 启动初始并发
                    const initial = Math.min(concurrency, tasks.length);
                    for (let i = 0; i < initial; i++) {
                        runNext();
                    }

                    // 等待所有任务完成
                    await new Promise(resolve => {
                        const checkInterval = setInterval(() => {
                            if (imageResults.length + (tasks.length - queue.length - running.size) === tasks.length) {
                                clearInterval(checkInterval);
                                resolve();
                            }
                        }, 100);
                    });

                    // 存储结果
                    WORKFLOW_STATE.outputs[agentKey] = JSON.stringify(imageResults);

                }

                // 存储结果
                WORKFLOW_STATE.outputs[agentKey] = JSON.stringify(imageResults);


                AgentStateManager.setState(agentKey, 'completed');

                if (!isParallel) {
                    WORKFLOW_STATE.lastSerialOutput = { agentKey, output: responseText };
                }

                UI.updateProgress(`✅ 生图师执行完成，生成 ${imageResults.length} 张图片`);

                // 检查回流条件
                if (agent.reflowConditions?.length > 0 && agent.reflowConditions.some(cond => responseText.includes(cond))) {
                    UI.updateProgress(`⚠️ 生图师触发回流`);

                    await this.handleReflow(agentKey, true);
                }

            } catch (error) {
                console.error(`[IMAGE DEBUG] 执行出错:`, error);
                if (error.name === 'AbortError') {

                    throw new UserInterruptError();
                }
                if (error.name === 'UserInterruptError') {
                    AgentStateManager.setState(agentKey, 'idle');
                    throw error;
                }

                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress(`  ❌ 生图师出错，已保存最佳内容作为废章`, true);
                }

                throw error;
            }
        },

        // ==================== 排版师专用执行函数 ====================

        async _executeTypesetter(agentKey, isReflow = false, options = {}) {

            const { isParallel = false, parallelBeforeSnapshot = null } = options;

            if (WORKFLOW_STATE.discarded) {
                console.warn(`[TYPESETTER DEBUG] 本章已被标记为废章，终止执行`);
                throw new AbortChapterError();
            }
            if (WORKFLOW_STATE.shouldStop) {
                console.warn(`[TYPESETTER DEBUG] 收到停止信号，终止执行`);
                throw new UserInterruptError();
            }

            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) {
                console.error(`[TYPESETTER DEBUG] 未找到 agentKey=${agentKey}`);
                return;
            }

            // 周期执行判断
            if (!isReflow && agent.executeInterval > 0) {
                const interval = agent.executeInterval;
                const currentChapter = WORKFLOW_STATE.currentChapter;
                const shouldExecute = (currentChapter % interval) === 0;


                if (!shouldExecute) {
                    AgentStateManager.setState(agentKey, 'idle');
                    WORKFLOW_STATE.outputs[agentKey] = '';
                    UI.updateProgress(`⏭️ ${getAgentDisplayName(agentKey)} 被跳过（周期执行）`);

                    return;
                }
            }

            WORKFLOW_STATE.currentStep = agentKey;
            AgentStateManager.setState(agentKey, 'running');
            UI.updateProgress(`→ 排版师 ${getAgentDisplayName(agentKey)}`);

            // 记录 before 依赖
            let beforeTargetKey = null;
            if (isParallel && parallelBeforeSnapshot && parallelBeforeSnapshot.agentKey) {
                beforeTargetKey = parallelBeforeSnapshot.agentKey;
            } else if (!isParallel && WORKFLOW_STATE.lastSerialOutput && WORKFLOW_STATE.lastSerialOutput.agentKey) {
                beforeTargetKey = WORKFLOW_STATE.lastSerialOutput.agentKey;
            }

            if (!WORKFLOW_STATE.beforeDependencies) WORKFLOW_STATE.beforeDependencies = {};
            WORKFLOW_STATE.beforeDependencies[agentKey] = beforeTargetKey;


            try {

                const collected = await this._collectInputs(agentKey, isReflow, options);

                // 构建基础 prompt：替换所有 【】 占位符
                let prompt = agent.inputTemplate;
                let placeholderIdx = 0;
                prompt = prompt.replace(/【】/g, () => collected[placeholderIdx++] || '');


                // 添加回流反馈
                if (isReflow && WORKFLOW_STATE.reflowMap && WORKFLOW_STATE.reflowMap[agentKey]) {
                    const feedbackData = WORKFLOW_STATE.reflowMap[agentKey];
                    const feedbackParts = [];
                    for (const sourceKey of feedbackData.sources) {
                        const sourceOutput = feedbackData.outputs[sourceKey];
                        if (sourceOutput) {
                            const sourceName = getAgentDisplayName(sourceKey);
                            feedbackParts.push(`【来自 ${sourceName} 的反馈】\n${sourceOutput}`);
                        }
                    }
                    if (feedbackParts.length > 0) {
                        prompt += '\n\n' + feedbackParts.join('\n\n');

                    }
                }

                if (isReflow && WORKFLOW_STATE.reflowMap && WORKFLOW_STATE.reflowMap[agentKey] && WORKFLOW_STATE.reflowMap[agentKey].previousOutput !== undefined) {
                    const previousOutput = WORKFLOW_STATE.reflowMap[agentKey].previousOutput;
                    if (previousOutput && previousOutput.trim() !== '') {
                        prompt += '\n\n【上次输出】：\n' + previousOutput;

                    }
                }

                // ========== 获取环境信息并附加到 prompt ==========
                // 1. 获取查看器尺寸和背景色（带缓存）
                let viewerWidth = 800, viewerHeight = 600, viewerBgColor = '#ffffff';
                if (!Workflow._viewerCache) Workflow._viewerCache = {
                    width: 800,
                    height: 600,
                    bgColor: '#ffffff',
                    timestamp: 0
                };
                const cacheTimeout = 5000; // 5秒缓存

                if (Date.now() - Workflow._viewerCache.timestamp < cacheTimeout) {
                    viewerWidth = Workflow._viewerCache.width;
                    viewerHeight = Workflow._viewerCache.height;
                    viewerBgColor = Workflow._viewerCache.bgColor;

                } else {

                    let viewerElement = document.querySelector('.markdown-body');
                    if (!viewerElement) viewerElement = document.querySelector('.nc-modal-body');
                    if (viewerElement) {
                        const rect = viewerElement.getBoundingClientRect();
                        viewerWidth = Math.round(rect.width);
                        viewerHeight = Math.round(rect.height);


                        const bgColor = window.getComputedStyle(viewerElement).backgroundColor;
                        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
                            viewerBgColor = bgColor;

                        }
                        Workflow._viewerCache = {
                            width: viewerWidth,
                            height: viewerHeight,
                            bgColor: viewerBgColor,
                            timestamp: Date.now()
                        };

                    } else {
                        console.warn('[TYPESETTER DEBUG] 未找到任何内容容器，使用默认尺寸 800x600');
                    }
                }

                // 2. 获取图片 ID 列表（从输入源中查找生图师对应的项）
                let imageIdList = [];
                for (let i = 0; i < agent.inputs.length; i++) {
                    const src = agent.inputs[i];
                    if (CONFIG.AGENTS[src] && CONFIG.AGENTS[src].role === 'imageGenerator') {
                        try {
                            const jsonStr = collected[i];
                            if (jsonStr && jsonStr.trim().startsWith('[')) {
                                imageIdList = JSON.parse(jsonStr);

                            } else {
                                console.warn(`[TYPESETTER DEBUG] 输入源 ${src} 内容不是有效 JSON 数组:`, jsonStr);
                            }
                        } catch (e) {
                            console.warn(`[TYPESETTER DEBUG] 解析图片 ID 列表失败:`, e);
                        }
                        break;
                    }
                }

                // 3. 获取每张图片的真实尺寸（从 ImageStore）
                const imageSizes = [];
                if (imageIdList.length > 0) {

                    for (const imgInfo of imageIdList) {
                        if (imgInfo.id) {
                            try {
                                const blob = await ImageStore.get(imgInfo.id);
                                if (blob) {
                                    const img = new Image();
                                    const url = URL.createObjectURL(blob);
                                    await new Promise((resolve, reject) => {
                                        img.onload = () => {
                                            URL.revokeObjectURL(url);
                                            imageSizes.push({
                                                id: imgInfo.id,
                                                width: img.naturalWidth,
                                                height: img.naturalHeight,
                                                type: blob.type
                                            });

                                            resolve();
                                        };
                                        img.onerror = (err) => {
                                            URL.revokeObjectURL(url);
                                            console.warn(`[TYPESETTER DEBUG] 加载图片 ${imgInfo.id} 失败:`, err);
                                            resolve();
                                        };
                                        img.src = url;
                                    });
                                } else {
                                    console.warn(`[TYPESETTER DEBUG] 图片 ${imgInfo.id} 不存在于 ImageStore`);
                                }
                            } catch (err) {
                                console.warn(`[TYPESETTER DEBUG] 获取图片 ${imgInfo.id} 尺寸时出错:`, err);
                            }
                        }
                    }
                }

                // 4. 打包环境信息
                const envInfo = {
                    viewer: {
                        width: viewerWidth,
                        height: viewerHeight,
                        backgroundColor: viewerBgColor
                    },
                    images: imageSizes,
                    timestamp: Date.now()
                };
                const envInfoJson = JSON.stringify(envInfo, null, 2);


                prompt += `\n\n【环境信息】\n${envInfoJson}\n\n`;
                prompt += `请根据以上环境信息调整排版样式：\n`;
                prompt += `- 确保文字与背景对比度 ≥ 4.5:1（WCAG AA标准），避免背景掩盖文字。\n`;
                prompt += `- 图片应自适应容器宽度，可设置 max-width: 100%; height: auto; 并根据图片原始比例合理显示。\n`;
                prompt += `- 可根据 viewer 背景色选择协调的文本颜色（如深色背景用浅色文字）。\n`;
                prompt += `- 如果图片尺寸过小，可适当放大（但不超过容器宽度）；如果图片过大，则缩小以适应。\n`;
                prompt += `- 考虑移动端阅读体验，使用响应式设计。\n`;

                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();


                const responseText = await this.callAgent(agentKey, prompt);


                // 保存原始输出
                if (!WORKFLOW_STATE.agentRawOutputs) WORKFLOW_STATE.agentRawOutputs = {};
                WORKFLOW_STATE.agentRawOutputs[agentKey] = responseText;

                AgentStateManager.setState(agentKey, 'completed');

                if (!isParallel) {
                    WORKFLOW_STATE.lastSerialOutput = { agentKey, output: responseText };
                }

                // 回流条件检查
                if (agent.reflowConditions && agent.reflowConditions.length > 0) {
                    const triggered = agent.reflowConditions.some(cond => responseText?.includes(cond) === true);
                    if (triggered) {
                        UI.updateProgress(`⚠️ 排版师 ${getAgentDisplayName(agentKey)} 触发回流`);


                        if (isReflow) {
                            await this.handleReflow(agentKey, true);
                        } else {
                            if (isParallel) {
                                await this.handleReflow(agentKey, false);
                            } else {
                                await this.handleReflow(agentKey, true);
                            }
                        }
                    }
                }

            } catch (error) {
                console.error(`[TYPESETTER DEBUG] 执行出错:`, error);
                if (error.name === 'UserInterruptError') {
                    AgentStateManager.setState(agentKey, 'idle');
                    throw error;
                }

                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress(`  ❌ 排版师出错，已保存最佳内容作为废章`, true);
                }

                throw error;
            }
        },

        // ==================== 融合生图师专用执行函数 ====================

        async _executeFusionGenerator(agentKey, initialUserInput = '', isReflow = false, options = {}) {

            const { isParallel = false, parallelBeforeSnapshot = null } = options;

            if (WORKFLOW_STATE.discarded) {
                console.warn(`[FUSION DEBUG] 本章已被标记为废章，终止执行`);
                throw new AbortChapterError();
            }
            if (WORKFLOW_STATE.shouldStop) {
                console.warn(`[FUSION DEBUG] 收到停止信号，终止执行`);
                throw new UserInterruptError();
            }

            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) {
                console.error(`[FUSION DEBUG] 未找到 agentKey=${agentKey}`);
                return;
            }

            // 获取融合图专用图像配置
            let imageConfig = null;
            try {
                imageConfig = this._getImageConfig('fusion');

            } catch (e) {
                console.warn(`[FUSION DEBUG] 获取图像配置失败:`, e);
            }

            // 周期执行判断
            if (!isReflow && agent.executeInterval > 0) {
                const interval = agent.executeInterval;
                const currentChapter = WORKFLOW_STATE.currentChapter;
                const shouldExecute = (currentChapter % interval) === 0;

                if (!shouldExecute) {
                    AgentStateManager.setState(agentKey, 'idle');
                    WORKFLOW_STATE.outputs[agentKey] = '';
                    UI.updateProgress(`⏭️ ${getAgentDisplayName(agentKey)} 被跳过（周期执行）`);

                    return;
                }
            }

            WORKFLOW_STATE.currentStep = agentKey;
            AgentStateManager.setState(agentKey, 'running');
            UI.updateProgress(`→ 调用融合生图师 (${getAgentDisplayName(agentKey)})...`);

            let beforeTargetKey = null;
            if (isParallel && parallelBeforeSnapshot?.agentKey) {
                beforeTargetKey = parallelBeforeSnapshot.agentKey;
            } else if (!isParallel && WORKFLOW_STATE.lastSerialOutput?.agentKey) {
                beforeTargetKey = WORKFLOW_STATE.lastSerialOutput.agentKey;
            }
            if (!WORKFLOW_STATE.beforeDependencies) WORKFLOW_STATE.beforeDependencies = {};
            WORKFLOW_STATE.beforeDependencies[agentKey] = beforeTargetKey;


            try {
                // 收集输入

                const collected = await this._collectInputs(agentKey, isReflow, options);

                // 构建基础提示词
                let prompt = agent.inputTemplate;
                let placeholderIdx = 0;
                prompt = prompt.replace(/【】/g, () => collected[placeholderIdx++] || '');


                // 添加回流反馈
                if (isReflow && WORKFLOW_STATE.reflowMap?.[agentKey]) {
                    const feedbackData = WORKFLOW_STATE.reflowMap[agentKey];
                    const feedbackParts = [];
                    for (const sourceKey of feedbackData.sources) {
                        const sourceOutput = feedbackData.outputs[sourceKey];
                        if (sourceOutput) {
                            const sourceName = getAgentDisplayName(sourceKey);
                            feedbackParts.push(`【来自 ${sourceName} 的反馈】\n${sourceOutput}`);
                        }
                    }
                    if (feedbackParts.length > 0) {
                        prompt += '\n\n' + feedbackParts.join('\n\n');

                    }
                }

                if (isReflow && WORKFLOW_STATE.reflowMap?.[agentKey]?.previousOutput !== undefined) {
                    const previousOutput = WORKFLOW_STATE.reflowMap[agentKey].previousOutput;
                    if (previousOutput && previousOutput.trim() !== '') {
                        prompt += '\n\n【上次输出】：\n' + previousOutput;

                    }
                }

                // 附加图像配置
                if (imageConfig) {
                    prompt += `\n\n【图像模型完整配置】\n${JSON.stringify(imageConfig, null, 2)}`;
                }

                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                // 调用融合生图师 Agent

                const rawOutput = await this.callAgent(agentKey, prompt);


                // 保存原始输出
                if (!WORKFLOW_STATE.agentRawOutputs) WORKFLOW_STATE.agentRawOutputs = {};
                WORKFLOW_STATE.agentRawOutputs[agentKey] = rawOutput;

                // 解析输出为 JSON 对象
                let parsed;
                try {
                    parsed = JSON.parse(rawOutput);

                } catch (e) {
                    console.error(`[FUSION DEBUG] 解析 JSON 失败`, e);
                    throw new Error(`融合生图师输出不是有效的 JSON 对象: ${rawOutput}`);
                }

                const preprocessSteps = parsed.preprocessSteps || [];
                const fusionSteps = parsed.fusionSteps || [];


                let controlMap = {}; // 保存为 -> 实际图片ID

                // 执行预处理（如果存在）
                if (preprocessSteps.length > 0) {
                    UI.updateProgress(`  执行预处理...`);

                    try {
                        controlMap = await this._executePreprocessingStepsFromJSON(preprocessSteps);

                    } catch (e) {
                        console.error(`[FUSION DEBUG] 预处理失败:`, e);
                        UI.updateProgress(`  ❌ 预处理失败: ${e.message}`, true);
                        throw e;
                    }
                } else {
                    UI.updateProgress(`  ⚠️ 无预处理指令，将直接使用成品图作为控制图（可能效果不佳）`, true);
                    console.warn(`[FUSION DEBUG] 无预处理指令`);
                }

                // 执行融合步骤
                if (fusionSteps.length === 0) {
                    UI.updateProgress(`  ⚠️ 无有效融合指令，使用默认降级融合`, true);
                    console.warn(`[FUSION DEBUG] 无有效融合指令，进入降级融合`);
                    // 降级处理（从 collected 中获取元素列表和场景描述）
                    const elementListJson = collected[0];
                    const sceneDescription = collected[1];
                    let elementList = [];
                    try {
                        elementList = JSON.parse(elementListJson);
                    } catch (e) {
                        console.error(`[FUSION DEBUG] 元素列表 JSON 解析失败，无法降级`, e);
                        throw new Error('无法解析元素列表，融合失败');
                    }

                    let backgroundElement = elementList.find(e => e.type && e.type.includes('背景'));
                    if (!backgroundElement) {
                        backgroundElement = elementList[0];
                        console.warn(`[FUSION DEBUG] 未找到背景元素，使用第一个元素作为背景:`, backgroundElement);
                    }

                    const characterElements = elementList.filter(e => e.type && (e.type.includes('人物') || e.type.includes('角色')));

                    if (!backgroundElement) {
                        throw new Error('无法确定背景图，融合失败');
                    }


                    UI.updateProgress(`  → 降级融合：背景 ${backgroundElement.id}，人物 ${characterElements.length} 个`);

                    const resultBase64 = await this._simpleFusion(backgroundElement.id, characterElements.map(c => c.id), sceneDescription);
                    let imageData = resultBase64;
                    if (typeof resultBase64 === 'string' && !resultBase64.startsWith('data:')) {
                        imageData = `data:image/png;base64,${resultBase64}`;
                    }
                    const fusionId = await ImageStore.save(imageData, 'png');
                    WORKFLOW_STATE.outputs[agentKey] = JSON.stringify({ fusion_image_id: fusionId });
                    AgentStateManager.setState(agentKey, 'completed');
                    if (!isParallel) {
                        WORKFLOW_STATE.lastSerialOutput = { agentKey, output: fusionId };
                    }
                    UI.updateProgress(`✅ 融合生图师执行完成（降级），生成图片 ID: ${fusionId}`);

                    return;
                }

                // 验证第一步的源图是否为控制图ID（不能是引用）
                const firstStep = fusionSteps[0];
                if (typeof firstStep.sourceRef === 'string' && firstStep.sourceRef.startsWith('步骤')) {
                    UI.updateProgress(`  ⚠️ 第一步源图不能是引用，尝试使用预处理生成的控制图`, true);
                    console.warn(`[FUSION DEBUG] 第一步源图是引用: ${firstStep.sourceRef}`);
                    const bgKey = Object.keys(controlMap).find(k => k.includes('depth') || k.includes('bg'));
                    if (bgKey) {
                        firstStep.sourceRef = controlMap[bgKey];

                    } else {
                        throw new Error('第一步源图无效且无法确定背景图');
                    }
                } else {
                    if (controlMap[firstStep.sourceRef]) {

                        firstStep.sourceRef = controlMap[firstStep.sourceRef];
                    }
                }

                // 执行递进融合
                const stepResults = {}; // key: 步骤号, value: 图片ID
                let currentImageId = null;

                for (let i = 0; i < fusionSteps.length; i++) {
                    const step = fusionSteps[i];
                    const stepNum = step.step || i + 1;


                    // 确定底图ID
                    let baseId;
                    if (i === 0) {
                        baseId = step.sourceRef;

                    } else {
                        if (typeof step.sourceRef === 'number') {
                            // 引用上一步的结果
                            baseId = stepResults[step.sourceRef];
                            if (!baseId) {
                                throw new Error(`步骤${stepNum}引用的步骤${step.sourceRef}结果不存在`);
                            }

                        } else {
                            baseId = step.sourceRef;

                        }
                    }

                    // 获取控制图实际ID
                    let controlActualId = step.controlId;
                    if (controlMap[step.controlId]) {
                        controlActualId = controlMap[step.controlId];

                    }

                    // 加载图片

                    const baseBlob = await ImageStore.get(baseId);
                    if (!baseBlob) throw new Error(`底图 ${baseId} 不存在`);

                    const controlBlob = await ImageStore.get(controlActualId);
                    if (!controlBlob) throw new Error(`控制图 ${controlActualId} 不存在`);

                    // 调用单步融合，传入 step.params
                    const params = step.params || {};

                    const resultBase64 = await this._callSingleControlNetAPI(baseBlob, controlBlob, params);


                    let imageData = resultBase64;
                    if (typeof resultBase64 === 'string' && !resultBase64.startsWith('data:')) {
                        imageData = `data:image/png;base64,${resultBase64}`;
                    }
                    const newId = await ImageStore.save(imageData, 'png');
                    stepResults[stepNum] = newId;
                    currentImageId = newId;
                    UI.updateProgress(`  → 步骤${stepNum}完成，图片ID: ${newId}`);

                }

                const fusionId = currentImageId;
                WORKFLOW_STATE.outputs[agentKey] = JSON.stringify({ fusion_image_id: fusionId });
                AgentStateManager.setState(agentKey, 'completed');

                if (!isParallel) {
                    WORKFLOW_STATE.lastSerialOutput = { agentKey, output: fusionId };
                }

                UI.updateProgress(`✅ 融合生图师执行完成，生成图片 ID: ${fusionId}`);


            } catch (error) {
                console.error(`[FUSION DEBUG] 执行出错:`, error);
                if (error.name === 'AbortError') {

                    throw new UserInterruptError();
                }
                if (error.name === 'UserInterruptError') {
                    AgentStateManager.setState(agentKey, 'idle');
                    throw error;
                }

                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress(`  ❌ 融合生图师出错，已保存最佳内容作为废章`, true);
                }

                throw error;
            }
        },

        // ==================== 图片管理员专用执行函数 ====================

        /**
         * 图片管理员专用执行函数（通用输入源版本）
         * 负责根据新图片列表、章节正文、故事概览和图库现状，生成图库更新指令
         * @param {string} agentKey - Agent 键
         * @param {boolean} isReflow - 是否为回流
         * @param {object} options - 选项
         */
        async _executeImageLibrarian(agentKey, isReflow = false, options = {}) {


            const { isParallel = false, parallelBeforeSnapshot = null } = options;

            if (WORKFLOW_STATE.discarded) {
                console.warn('[ImageLibrarian] 本章已被标记为废章，终止执行');
                throw new AbortChapterError();
            }
            if (WORKFLOW_STATE.shouldStop) {
                console.warn('[ImageLibrarian] 收到停止信号，终止执行');
                throw new UserInterruptError();
            }

            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) {
                console.error(`[ImageLibrarian] 未找到 agentKey=${agentKey}`);
                return;
            }

            // 周期执行判断
            if (!isReflow && agent.executeInterval > 0) {
                const interval = agent.executeInterval;
                const currentChapter = WORKFLOW_STATE.currentChapter;
                const shouldExecute = (currentChapter % interval) === 0;

                if (!shouldExecute) {
                    AgentStateManager.setState(agentKey, 'idle');
                    WORKFLOW_STATE.outputs[agentKey] = '';
                    UI.updateProgress(`⏭️ ${getAgentDisplayName(agentKey)} 被跳过（周期执行）`);

                    return;
                }
            }

            WORKFLOW_STATE.currentStep = agentKey;
            AgentStateManager.setState(agentKey, 'running');
            UI.updateProgress(`→ 图片管理员 (${getAgentDisplayName(agentKey)})`);

            // 记录 before 依赖目标
            let beforeTargetKey = null;
            if (isParallel && parallelBeforeSnapshot?.agentKey) {
                beforeTargetKey = parallelBeforeSnapshot.agentKey;
            } else if (!isParallel && WORKFLOW_STATE.lastSerialOutput?.agentKey) {
                beforeTargetKey = WORKFLOW_STATE.lastSerialOutput.agentKey;
            }
            if (!WORKFLOW_STATE.beforeDependencies) WORKFLOW_STATE.beforeDependencies = {};
            WORKFLOW_STATE.beforeDependencies[agentKey] = beforeTargetKey;


            try {
                // ========== 通用输入收集 ==========

                const collected = await this._collectInputs(agentKey, isReflow, options);

                // ========== 构建提示词 ==========
                let prompt = agent.inputTemplate;
                let placeholderIdx = 0;
                prompt = prompt.replace(/【】/g, () => collected[placeholderIdx++] || '');


                // 添加回流反馈
                if (isReflow && WORKFLOW_STATE.reflowMap?.[agentKey]) {
                    const feedbackData = WORKFLOW_STATE.reflowMap[agentKey];
                    const feedbackParts = [];
                    for (const sourceKey of feedbackData.sources) {
                        const sourceOutput = feedbackData.outputs[sourceKey];
                        if (sourceOutput) {
                            const sourceName = getAgentDisplayName(sourceKey);
                            feedbackParts.push(`【来自 ${sourceName} 的反馈】\n${sourceOutput}`);
                        }
                    }
                    if (feedbackParts.length > 0) {
                        prompt += '\n\n' + feedbackParts.join('\n\n');

                    }
                }

                if (isReflow && WORKFLOW_STATE.reflowMap?.[agentKey]?.previousOutput !== undefined) {
                    const previousOutput = WORKFLOW_STATE.reflowMap[agentKey].previousOutput;
                    if (previousOutput && previousOutput.trim() !== '') {
                        prompt += '\n\n【上次输出】：\n' + previousOutput;

                    }
                }

                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                // ========== 调用 Agent ==========

                const responseText = await this.callAgent(agentKey, prompt);


                // 保存原始输出
                if (!WORKFLOW_STATE.agentRawOutputs) WORKFLOW_STATE.agentRawOutputs = {};
                WORKFLOW_STATE.agentRawOutputs[agentKey] = responseText;

                // ========== 解析输出 ==========

                const actions = this._parseImageLibrarianOutput(responseText);


                // ========== 执行更新 ==========
                if (actions.length > 0) {

                    await this._updateImageLibraryFromLibrarianOutput(actions);

                } else {

                }

                AgentStateManager.setState(agentKey, 'completed');
                WORKFLOW_STATE.outputs[agentKey] = responseText;

                if (!isParallel) {
                    WORKFLOW_STATE.lastSerialOutput = { agentKey, output: responseText };
                }

                UI.updateProgress(`✅ 图片管理员执行完成`);

                // 检查回流条件
                if (agent.reflowConditions && agent.reflowConditions.length > 0) {
                    const triggered = agent.reflowConditions.some(cond => responseText?.includes(cond) === true);
                    if (triggered) {
                        UI.updateProgress(`⚠️ 图片管理员 ${getAgentDisplayName(agentKey)} 触发回流`);

                        if (isReflow) {
                            await this.handleReflow(agentKey, true);
                        } else {
                            if (isParallel) {
                                await this.handleReflow(agentKey, false);
                            } else {
                                await this.handleReflow(agentKey, true);
                            }
                        }
                    }
                }

            } catch (error) {
                console.error('[ImageLibrarian] 执行出错:', error);
                if (error.name === 'UserInterruptError') {
                    AgentStateManager.setState(agentKey, 'idle');
                    throw error;
                }

                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress(`  ❌ 图片管理员出错，已保存最佳内容作为废章`, true);
                }
                throw error;
            } finally {

            }
        },

        // ==================== 变化生图师专用执行函数 ====================

        async _executeImageVariator(agentKey, isReflow = false, options = {}) {


            const { isParallel = false, parallelBeforeSnapshot = null } = options;

            if (WORKFLOW_STATE.discarded) {
                console.warn('[ImageVariator] 本章已被标记为废章，终止执行');
                throw new AbortChapterError();
            }
            if (WORKFLOW_STATE.shouldStop) {
                console.warn('[ImageVariator] 收到停止信号，终止执行');
                throw new UserInterruptError();
            }

            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) {
                console.error(`[ImageVariator] 未找到 agentKey=${agentKey}`);
                return;
            }

            // 周期执行判断
            if (!isReflow && agent.executeInterval > 0) {
                const interval = agent.executeInterval;
                const currentChapter = WORKFLOW_STATE.currentChapter;
                const shouldExecute = (currentChapter % interval) === 0;

                if (!shouldExecute) {
                    AgentStateManager.setState(agentKey, 'idle');
                    WORKFLOW_STATE.outputs[agentKey] = '';
                    UI.updateProgress(`⏭️ ${getAgentDisplayName(agentKey)} 被跳过（周期执行）`);

                    return;
                }
            }

            WORKFLOW_STATE.currentStep = agentKey;
            AgentStateManager.setState(agentKey, 'running');
            UI.updateProgress(`→ 变化生图师 (${getAgentDisplayName(agentKey)})`);

            let beforeTargetKey = null;
            if (isParallel && parallelBeforeSnapshot?.agentKey) {
                beforeTargetKey = parallelBeforeSnapshot.agentKey;
            } else if (!isParallel && WORKFLOW_STATE.lastSerialOutput?.agentKey) {
                beforeTargetKey = WORKFLOW_STATE.lastSerialOutput.agentKey;
            }
            if (!WORKFLOW_STATE.beforeDependencies) WORKFLOW_STATE.beforeDependencies = {};
            WORKFLOW_STATE.beforeDependencies[agentKey] = beforeTargetKey;


            try {
                // 收集输入

                const collected = await this._collectInputs(agentKey, isReflow, options);


                // 构建提示词，调用 Agent 生成指令
                let prompt = agent.inputTemplate;
                let placeholderIdx = 0;
                prompt = prompt.replace(/【】/g, () => collected[placeholderIdx++] || '');


                // 添加回流反馈
                if (isReflow && WORKFLOW_STATE.reflowMap?.[agentKey]) {
                    const feedbackData = WORKFLOW_STATE.reflowMap[agentKey];
                    const feedbackParts = [];
                    for (const sourceKey of feedbackData.sources) {
                        const sourceOutput = feedbackData.outputs[sourceKey];
                        if (sourceOutput) {
                            const sourceName = getAgentDisplayName(sourceKey);
                            feedbackParts.push(`【来自 ${sourceName} 的反馈】\n${sourceOutput}`);
                        }
                    }
                    if (feedbackParts.length > 0) {
                        prompt += '\n\n' + feedbackParts.join('\n\n');

                    }
                }

                if (isReflow && WORKFLOW_STATE.reflowMap?.[agentKey]?.previousOutput !== undefined) {
                    const previousOutput = WORKFLOW_STATE.reflowMap[agentKey].previousOutput;
                    if (previousOutput && previousOutput.trim() !== '') {
                        prompt += '\n\n【上次输出】：\n' + previousOutput;

                    }
                }

                // 附加图像模型配置
                const imageConfigForPrompt = this._getImageConfig('img2img');
                if (imageConfigForPrompt) {
                    prompt += `\n\n【图像模型完整配置】\n${JSON.stringify(imageConfigForPrompt, null, 2)}`;

                } else {
                    console.warn('[ImageVariator] 未找到 img2img 图像配置，无法提供模型信息');
                }

                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                // 调用 Agent 生成指令

                const responseText = await this.callAgent(agentKey, prompt);


                // 保存原始输出
                if (!WORKFLOW_STATE.agentRawOutputs) WORKFLOW_STATE.agentRawOutputs = {};
                WORKFLOW_STATE.agentRawOutputs[agentKey] = responseText;

                // 解析输出为 JSON 数组
                let instructions = [];
                try {
                    instructions = JSON.parse(responseText);
                    if (!Array.isArray(instructions)) {
                        instructions = [instructions];
                        console.warn(`[ImageVariator] 解析结果不是数组，已包装为数组`);
                    }

                } catch (e) {
                    console.error(`[ImageVariator] 解析 JSON 失败`, e);
                    throw new Error(`变化生图师输出不是有效的 JSON 数组: ${responseText}`);
                }

                if (instructions.length === 0) {
                    console.warn('[ImageVariator] 未解析到任何指令，将输出空数组');
                    WORKFLOW_STATE.outputs[agentKey] = '[]';
                    AgentStateManager.setState(agentKey, 'completed');
                    if (!isParallel) {
                        WORKFLOW_STATE.lastSerialOutput = { agentKey, output: '[]' };
                    }
                    UI.updateProgress(`✅ 变化生图师完成，无变体生成`);
                    return;
                }

                // 获取图生图专用图像配置
                const imageConfig = this._getImageConfig('img2img');


                // 循环处理每个变体指令
                const generatedImages = [];
                for (let i = 0; i < instructions.length; i++) {
                    const inst = instructions[i];


                    if (!inst.sourceId) {
                        console.warn(`[ImageVariator] 变体 ${i + 1} 缺少 sourceId，跳过`);
                        continue;
                    }

                    const sourceBlob = await ImageStore.get(inst.sourceId);
                    if (!sourceBlob) {
                        console.warn(`[ImageVariator] 源图片 ${inst.sourceId} 不存在，跳过`);
                        UI.updateProgress(`  ⚠️ 变体 ${i + 1} 源图片不存在，跳过`, true);
                        continue;
                    }

                    // 合并参数：使用 inst.params 覆盖默认配置
                    const params = { ...imageConfig, ...(inst.params || {}), prompt: inst.prompt || inst.params?.prompt };
                    if (!params.prompt) {
                        console.warn(`[ImageVariator] 变体 ${i + 1} 缺少 prompt，跳过`);
                        continue;
                    }

                    let resultBase64;
                    try {
                        resultBase64 = await this._callImageVariationAPI(imageConfig, sourceBlob, params);
                    } catch (err) {
                        console.error(`[ImageVariator] 变体 ${i + 1} 图像生成失败:`, err);
                        UI.updateProgress(`  ❌ 变体 ${i + 1} 生成失败: ${err.message}`, true);
                        continue;
                    }

                    const newId = await ImageStore.save(resultBase64, 'png');
                    generatedImages.push({
                        id: newId,
                        source_id: inst.sourceId,
                        prompt: inst.prompt || inst.params?.prompt
                    });

                    UI.updateProgress(`  ✅ 变体 ${i + 1} 生成，ID: ${newId}`);
                    if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();
                }

                const outputJson = JSON.stringify(generatedImages);
                WORKFLOW_STATE.outputs[agentKey] = outputJson;
                AgentStateManager.setState(agentKey, 'completed');

                if (!isParallel) {
                    WORKFLOW_STATE.lastSerialOutput = { agentKey, output: outputJson };
                }

                UI.updateProgress(`✅ 变化生图师完成，生成 ${generatedImages.length} 张图片`);

                if (agent.reflowConditions?.length > 0) {
                    const triggered = agent.reflowConditions.some(cond => responseText.includes(cond));
                    if (triggered) {
                        UI.updateProgress(`⚠️ 变化生图师 ${getAgentDisplayName(agentKey)} 触发回流`);
                        await this.handleReflow(agentKey, isReflow ? true : (isParallel ? false : true));
                    }
                }

            } catch (error) {
                console.error('[ImageVariator] 执行出错:', error);
                if (error.name === 'UserInterruptError') {
                    AgentStateManager.setState(agentKey, 'idle');
                    throw error;
                }
                if (error.name === 'AbortError') {
                    throw new UserInterruptError();
                }
                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress(`  ❌ 变化生图师出错，已保存最佳内容作为废章`, true);
                }
                throw error;
            } finally {

            }
        },

        // ==================== 音频师专用执行函数 ====================

        /**
         * 音乐生成师专用执行函数
         * 根据输入生成音乐音频，输出音频 ID
         */
        async _executeMusicGenerator(agentKey, isReflow = false, options = {}) {

            const { isParallel = false, parallelBeforeSnapshot = null } = options;

            if (WORKFLOW_STATE.discarded) throw new AbortChapterError();
            if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) return;

            // 获取音频配置
            let audioConfig = null;
            try {
                audioConfig = this._getAudioConfig('music-generation');
            } catch (e) {
                console.error('[MusicGenerator] 获取音频配置失败:', e);
                AgentStateManager.setState(agentKey, 'error');
                throw e;
            }

            // 周期执行判断
            if (!isReflow && agent.executeInterval > 0) {
                const interval = agent.executeInterval;
                const currentChapter = WORKFLOW_STATE.currentChapter;
                if ((currentChapter % interval) !== 0) {
                    AgentStateManager.setState(agentKey, 'idle');
                    WORKFLOW_STATE.outputs[agentKey] = '';
                    UI.updateProgress(`⏭️ ${getAgentDisplayName(agentKey)} 被跳过（周期执行）`);
                    return;
                }
            }

            WORKFLOW_STATE.currentStep = agentKey;
            AgentStateManager.setState(agentKey, 'running');
            UI.updateProgress(`→ 音乐生成师 (${getAgentDisplayName(agentKey)})`);

            // 记录 before 依赖
            let beforeTargetKey = null;
            if (isParallel && parallelBeforeSnapshot?.agentKey) beforeTargetKey = parallelBeforeSnapshot.agentKey;
            else if (!isParallel && WORKFLOW_STATE.lastSerialOutput?.agentKey) beforeTargetKey = WORKFLOW_STATE.lastSerialOutput.agentKey;
            if (!WORKFLOW_STATE.beforeDependencies) WORKFLOW_STATE.beforeDependencies = {};
            WORKFLOW_STATE.beforeDependencies[agentKey] = beforeTargetKey;

            try {
                // 收集输入
                const collected = await this._collectInputs(agentKey, isReflow, options);

                // 构建 Agent 提示词
                let prompt = agent.inputTemplate;
                let placeholderIdx = 0;
                prompt = prompt.replace(/【】/g, () => collected[placeholderIdx++] || '');
                // 附加音频配置信息，供 Agent 了解平台特性
                prompt += `\n\n【音频模型配置】\n${JSON.stringify(audioConfig, null, 2)}`;
                prompt += `\n\n请根据以上配置生成一个JSON数组，每个元素代表一个音乐任务，格式为：\n`;
                prompt += `[{\n  "name": "音乐标识",\n  "range": [1,2]（可选）,\n  "params": { 平台原生参数 }\n}]\n`;
                prompt += `如果只有一个任务，可输出单个对象，但系统会将其包装为数组。`;

                // 调用 Agent 生成指令
                const agentResponse = await this.callAgent(agentKey, prompt);


                // 解析输出为任务数组
                let tasks = [];
                try {
                    const parsed = JSON.parse(agentResponse);
                    tasks = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    console.warn('[MusicGenerator._executeMusicGenerator] Agent输出非JSON，降级处理:', e.message);
                    tasks = [{
                        name: '默认音乐',
                        params: { prompt: agentResponse }
                    }];
                }

                // 处理每个任务
                const processedTasks = [];
                for (const task of tasks) {
                    // 合并参数：任务params + 配置默认值
                    const params = { ...audioConfig, ...task.params };
                    // 确保有 prompt
                    if (!params.prompt) {
                        console.warn('[MusicGenerator] 任务缺少 prompt，跳过', task);
                        continue;
                    }
                    // 调用音频 API
                    const audioBlob = await this._callAudioAPI(audioConfig, params, AbortSignal.timeout(audioConfig.timeout || 3600000));
                    // 保存到 AudioStore
                    const audioId = await AudioStore.save(audioBlob);
                    // 保留 name 和 range，添加 id
                    processedTasks.push({
                        name: task.name || '音乐',
                        range: task.range,
                        id: audioId
                    });
                    UI.updateProgress(`  ✅ 已生成音乐: ${task.name || '未命名'} (ID: ${audioId})`);
                }

                WORKFLOW_STATE.outputs[agentKey] = processedTasks;
                AgentStateManager.setState(agentKey, 'completed');

                if (!isParallel) {
                    WORKFLOW_STATE.lastSerialOutput = { agentKey, output: JSON.stringify(processedTasks) };
                }

                UI.updateProgress(`✅ 音乐生成师完成，生成 ${processedTasks.length} 个音频`);

                // 检查回流条件
                if (agent.reflowConditions && agent.reflowConditions.some(cond => agentResponse.includes(cond))) {
                    UI.updateProgress(`⚠️ 音乐生成师触发回流`);
                    await this.handleReflow(agentKey, true);
                }

            } catch (error) {
                console.error('[MusicGenerator] 执行出错:', error);
                if (error.name === 'UserInterruptError') {
                    AgentStateManager.setState(agentKey, 'idle');
                    throw error;
                }
                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress(`  ❌ 音乐生成师出错，已保存最佳内容作为废章`, true);
                }
                throw error;
            } finally {

            }
        },

        // ==================== 语音师专用执行函数 ====================

        /**
         * 语音克隆师专用执行函数（新版）
         * 任务格式：{ "name": "...", "sample_id": "audio_xxx", "text": "...", "params": { ... } }
         */
        async _executeVoiceCloner(agentKey, isReflow = false, options = {}) {

            const { isParallel = false, parallelBeforeSnapshot = null } = options;

            if (WORKFLOW_STATE.discarded) throw new AbortChapterError();
            if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) return;

            // 获取音频配置
            let audioConfig = null;
            try {
                audioConfig = this._getAudioConfig('voice-cloning');
            } catch (e) {
                console.error('[VoiceCloner] 获取音频配置失败:', e);
                AgentStateManager.setState(agentKey, 'error');
                throw e;
            }

            // 周期执行判断
            if (!isReflow && agent.executeInterval > 0) {
                const interval = agent.executeInterval;
                const currentChapter = WORKFLOW_STATE.currentChapter;
                if ((currentChapter % interval) !== 0) {
                    AgentStateManager.setState(agentKey, 'idle');
                    WORKFLOW_STATE.outputs[agentKey] = '';
                    UI.updateProgress(`⏭️ ${getAgentDisplayName(agentKey)} 被跳过（周期执行）`);
                    return;
                }
            }

            WORKFLOW_STATE.currentStep = agentKey;
            AgentStateManager.setState(agentKey, 'running');
            UI.updateProgress(`→ 语音克隆师 (${getAgentDisplayName(agentKey)})`);

            let beforeTargetKey = null;
            if (isParallel && parallelBeforeSnapshot?.agentKey) beforeTargetKey = parallelBeforeSnapshot.agentKey;
            else if (!isParallel && WORKFLOW_STATE.lastSerialOutput?.agentKey) beforeTargetKey = WORKFLOW_STATE.lastSerialOutput.agentKey;
            if (!WORKFLOW_STATE.beforeDependencies) WORKFLOW_STATE.beforeDependencies = {};
            WORKFLOW_STATE.beforeDependencies[agentKey] = beforeTargetKey;

            try {
                // 收集输入
                const collected = await this._collectInputs(agentKey, isReflow, options);

                // 构建 Agent 提示词
                let prompt = agent.inputTemplate;
                let placeholderIdx = 0;
                prompt = prompt.replace(/【】/g, () => collected[placeholderIdx++] || '');
                prompt += `\n\n【音频模型配置】\n${JSON.stringify(audioConfig, null, 2)}`;
                prompt += `\n\n请输出一个JSON数组，每个元素代表一个语音合成任务，格式为：\n`;
                prompt += `[{\n  "name": "语音标识",\n  "sample_id": "音频样本ID",\n  "text": "待配音文本",\n  "params": { 平台原生参数 }\n}]\n`;
                prompt += `如果只有一个任务，可输出单个对象，但系统会将其包装为数组。`;

                // 调用 Agent 生成指令
                const agentResponse = await this.callAgent(agentKey, prompt);


                // 解析输出
                let tasks = [];
                try {
                    const parsed = JSON.parse(agentResponse);
                    tasks = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    throw new Error('语音克隆师输出必须是JSON数组');
                }

                // 处理每个任务
                const processedTasks = [];
                for (const task of tasks) {
                    if (!task.sample_id || !task.text) {
                        console.warn('[VoiceCloner] 任务缺少 sample_id 或 text，跳过', task);
                        continue;
                    }
                    // 从 AudioStore 获取样本 Blob
                    const sampleBlob = await AudioStore.get(task.sample_id);
                    if (!sampleBlob) {
                        console.warn(`[VoiceCloner] 样本 ID ${task.sample_id} 不存在，跳过`);
                        continue;
                    }
                    // 合并参数：任务 params + 配置默认值 + 样本 Blob 和文本
                    const params = { ...audioConfig, ...task.params, audioBlob: sampleBlob, text: task.text };
                    // 调用 API
                    const audioBlob = await this._callAudioAPI(audioConfig, params, AbortSignal.timeout(audioConfig.timeout || 3600000));
                    const audioId = await AudioStore.save(audioBlob);
                    processedTasks.push({
                        name: task.name || `语音-${task.sample_id}`,
                        range: task.range,
                        sample_id: task.sample_id,
                        text: task.text,
                        id: audioId
                    });
                    UI.updateProgress(`  ✅ 已生成基于样本 ${task.sample_id} 的语音 (ID: ${audioId})`);
                }

                WORKFLOW_STATE.outputs[agentKey] = processedTasks;
                AgentStateManager.setState(agentKey, 'completed');

                if (!isParallel) {
                    WORKFLOW_STATE.lastSerialOutput = { agentKey, output: JSON.stringify(processedTasks) };
                }

                UI.updateProgress(`✅ 语音克隆师完成，生成 ${processedTasks.length} 个语音`);

                if (agent.reflowConditions && agent.reflowConditions.some(cond => agentResponse.includes(cond))) {
                    UI.updateProgress(`⚠️ 语音克隆师触发回流`);
                    await this.handleReflow(agentKey, true);
                }

            } catch (error) {
                console.error('[VoiceCloner] 执行出错:', error);
                if (error.name === 'UserInterruptError') {
                    AgentStateManager.setState(agentKey, 'idle');
                    throw error;
                }
                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress(`  ❌ 语音克隆师出错，已保存最佳内容作为废章`, true);
                }
                throw error;
            }
        },

        // ==================== 变音师专用执行函数 ====================

        /**
         * 音频编辑师专用执行函数（新版）
         * 任务格式：{ "name": "...", "source_id": "audio_xxx", "params": { ... } }
         */
        async _executeAudioEditor(agentKey, isReflow = false, options = {}) {

            const { isParallel = false, parallelBeforeSnapshot = null } = options;

            if (WORKFLOW_STATE.discarded) throw new AbortChapterError();
            if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) return;

            // 获取音频配置
            let audioConfig = null;
            try {
                audioConfig = this._getAudioConfig('audio-editing');
            } catch (e) {
                console.error('[AudioEditor] 获取音频配置失败:', e);
                AgentStateManager.setState(agentKey, 'error');
                throw e;
            }

            // 周期执行判断
            if (!isReflow && agent.executeInterval > 0) {
                const interval = agent.executeInterval;
                const currentChapter = WORKFLOW_STATE.currentChapter;
                if ((currentChapter % interval) !== 0) {
                    AgentStateManager.setState(agentKey, 'idle');
                    WORKFLOW_STATE.outputs[agentKey] = '';
                    UI.updateProgress(`⏭️ ${getAgentDisplayName(agentKey)} 被跳过（周期执行）`);
                    return;
                }
            }

            WORKFLOW_STATE.currentStep = agentKey;
            AgentStateManager.setState(agentKey, 'running');
            UI.updateProgress(`→ 音频编辑师 (${getAgentDisplayName(agentKey)})`);

            let beforeTargetKey = null;
            if (isParallel && parallelBeforeSnapshot?.agentKey) beforeTargetKey = parallelBeforeSnapshot.agentKey;
            else if (!isParallel && WORKFLOW_STATE.lastSerialOutput?.agentKey) beforeTargetKey = WORKFLOW_STATE.lastSerialOutput.agentKey;
            if (!WORKFLOW_STATE.beforeDependencies) WORKFLOW_STATE.beforeDependencies = {};
            WORKFLOW_STATE.beforeDependencies[agentKey] = beforeTargetKey;

            try {
                // 收集输入：第一个是源音频 ID，第二个是编辑要求
                const collected = await this._collectInputs(agentKey, isReflow, options);
                const sourceAudioId = collected[0];
                const editInstruction = collected[1];

                if (!sourceAudioId) throw new Error('未提供源音频 ID');
                const sourceBlob = await AudioStore.get(sourceAudioId);
                if (!sourceBlob) throw new Error(`源音频 ${sourceAudioId} 不存在`);

                // 构建 Agent 提示词
                let prompt = agent.inputTemplate;
                let placeholderIdx = 0;
                prompt = prompt.replace(/【】/g, () => collected[placeholderIdx++] || '');
                prompt += `\n\n【音频模型配置】\n${JSON.stringify(audioConfig, null, 2)}`;
                prompt += `\n\n请输出一个JSON数组，每个元素代表一个编辑任务，格式为：\n`;
                prompt += `[{\n  "name": "编辑结果标识",\n  "source_id": "${sourceAudioId}",\n  "params": { 平台原生参数，例如 { "operation": "separate", "trackTypes": ["vocals"] } }\n}]\n`;
                prompt += `如果只有一个任务，可输出单个对象，但系统会将其包装为数组。`;

                const agentResponse = await this.callAgent(agentKey, prompt);


                // 解析输出
                let tasks = [];
                try {
                    const parsed = JSON.parse(agentResponse);
                    tasks = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    console.warn('[AudioEditor._executeAudioEditor] Agent输出非JSON，降级处理:', e.message);
                    tasks = [{
                        name: '编辑结果',
                        params: { prompt: agentResponse }
                    }];
                }

                // 处理每个任务
                const processedTasks = [];
                for (const task of tasks) {
                    // 合并参数
                    const params = { ...audioConfig, ...task.params, sourceAudioBlob: sourceBlob };
                    // 调用 API
                    const audioBlob = await this._callAudioAPI(audioConfig, params, AbortSignal.timeout(audioConfig.timeout || 3600000));
                    const audioId = await AudioStore.save(audioBlob);
                    processedTasks.push({
                        name: task.name || '编辑后音频',
                        range: task.range,
                        source_id: sourceAudioId,
                        id: audioId
                    });
                    UI.updateProgress(`  ✅ 已生成编辑结果 (ID: ${audioId})`);
                }

                WORKFLOW_STATE.outputs[agentKey] = processedTasks;
                AgentStateManager.setState(agentKey, 'completed');

                if (!isParallel) {
                    WORKFLOW_STATE.lastSerialOutput = { agentKey, output: JSON.stringify(processedTasks) };
                }

                UI.updateProgress(`✅ 音频编辑师完成，生成 ${processedTasks.length} 个编辑结果`);

                if (agent.reflowConditions && agent.reflowConditions.some(cond => agentResponse.includes(cond))) {
                    UI.updateProgress(`⚠️ 音频编辑师触发回流`);
                    await this.handleReflow(agentKey, true);
                }

            } catch (error) {
                console.error('[AudioEditor] 执行出错:', error);
                if (error.name === 'UserInterruptError') {
                    AgentStateManager.setState(agentKey, 'idle');
                    throw error;
                }
                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress(`  ❌ 音频编辑师出错，已保存最佳内容作为废章`, true);
                }
                throw error;
            }
        },

        // ==================== 音频管理员专用执行函数 ====================

        async _executeAudioLibrarian(agentKey, isReflow = false, options = {}) {


            const { isParallel = false, parallelBeforeSnapshot = null } = options;

            if (WORKFLOW_STATE.discarded) {
                console.warn('[AudioLibrarian] 本章已被标记为废章，终止执行');
                throw new AbortChapterError();
            }
            if (WORKFLOW_STATE.shouldStop) {
                console.warn('[AudioLibrarian] 收到停止信号，终止执行');
                throw new UserInterruptError();
            }

            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) {
                console.error(`[AudioLibrarian] 未找到 agentKey=${agentKey}`);
                return;
            }

            // 周期执行判断
            if (!isReflow && agent.executeInterval > 0) {
                const interval = agent.executeInterval;
                const currentChapter = WORKFLOW_STATE.currentChapter;
                const shouldExecute = (currentChapter % interval) === 0;

                if (!shouldExecute) {
                    AgentStateManager.setState(agentKey, 'idle');
                    WORKFLOW_STATE.outputs[agentKey] = '';
                    UI.updateProgress(`⏭️ ${getAgentDisplayName(agentKey)} 被跳过（周期执行）`);
                    return;
                }
            }

            WORKFLOW_STATE.currentStep = agentKey;
            AgentStateManager.setState(agentKey, 'running');
            UI.updateProgress(`→ 音频管理员 (${getAgentDisplayName(agentKey)})`);

            let beforeTargetKey = null;
            if (isParallel && parallelBeforeSnapshot?.agentKey) {
                beforeTargetKey = parallelBeforeSnapshot.agentKey;
            } else if (!isParallel && WORKFLOW_STATE.lastSerialOutput?.agentKey) {
                beforeTargetKey = WORKFLOW_STATE.lastSerialOutput.agentKey;
            }
            if (!WORKFLOW_STATE.beforeDependencies) WORKFLOW_STATE.beforeDependencies = {};
            WORKFLOW_STATE.beforeDependencies[agentKey] = beforeTargetKey;

            try {
                // 收集输入

                const collected = await this._collectInputs(agentKey, isReflow, options);

                // 解析输入
                const newAudioListJson = collected[0];      // 本章新生成的音频列表（JSON 数组）
                const chapterText = collected[1];           // 本章章节正文
                const storyOverview = collected[2];         // 故事概览
                const currentLibraryJson = collected[3];    // 当前音频库全量条目


                // 解析 JSON
                let newAudios = [];
                try {
                    newAudios = JSON.parse(newAudioListJson) || [];
                } catch (e) {
                    console.warn('[AudioLibrarian] 解析新音频列表失败，使用空数组', e);
                }

                let library = [];
                try {
                    library = JSON.parse(currentLibraryJson) || [];
                } catch (e) {
                    console.warn('[AudioLibrarian] 解析当前库条目失败，使用空数组', e);
                }

                // 构建提示词
                let prompt = agent.inputTemplate;
                let placeholderIdx = 0;
                prompt = prompt.replace(/【】/g, () => collected[placeholderIdx++] || '');


                // 添加回流反馈
                if (isReflow && WORKFLOW_STATE.reflowMap?.[agentKey]) {
                    const feedbackData = WORKFLOW_STATE.reflowMap[agentKey];
                    const feedbackParts = [];
                    for (const sourceKey of feedbackData.sources) {
                        const sourceOutput = feedbackData.outputs[sourceKey];
                        if (sourceOutput) {
                            const sourceName = getAgentDisplayName(sourceKey);
                            feedbackParts.push(`【来自 ${sourceName} 的反馈】\n${sourceOutput}`);
                        }
                    }
                    if (feedbackParts.length > 0) {
                        prompt += '\n\n' + feedbackParts.join('\n\n');
                    }
                }

                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                // 调用 Agent 生成指令

                const responseText = await this.callAgent(agentKey, prompt);


                // 保存原始输出
                if (!WORKFLOW_STATE.agentRawOutputs) WORKFLOW_STATE.agentRawOutputs = {};
                WORKFLOW_STATE.agentRawOutputs[agentKey] = responseText;

                // 解析指令
                const actions = this._parseAudioLibrarianOutput(responseText);


                // 执行更新
                if (actions.length > 0) {

                    await this._updateAudioLibraryFromLibrarianOutput(actions);

                }

                AgentStateManager.setState(agentKey, 'completed');
                WORKFLOW_STATE.outputs[agentKey] = responseText;

                if (!isParallel) {
                    WORKFLOW_STATE.lastSerialOutput = { agentKey, output: responseText };
                }

                UI.updateProgress(`✅ 音频管理员执行完成`);

                // 检查回流条件
                if (agent.reflowConditions && agent.reflowConditions.length > 0) {
                    const triggered = agent.reflowConditions.some(cond => responseText?.includes(cond) === true);
                    if (triggered) {
                        UI.updateProgress(`⚠️ 音频管理员 ${getAgentDisplayName(agentKey)} 触发回流`);

                        await this.handleReflow(agentKey, true);
                    }
                }

            } catch (error) {
                console.error('[AudioLibrarian] 执行出错:', error);
                if (error.name === 'UserInterruptError') {
                    AgentStateManager.setState(agentKey, 'idle');
                    throw error;
                }
                AgentStateManager.setState(agentKey, 'error');
                WORKFLOW_STATE.discarded = true;
                const bestContent = this._getBestOutputForSaving();
                if (bestContent) {
                    const titleMatch = bestContent.match(/^第\d+章\s+(.+)$/m);
                    const title = titleMatch ? titleMatch[0] : `第${WORKFLOW_STATE.currentChapter}章`;
                    WORKFLOW_STATE.discardedChapter = { title, content: bestContent };
                    UI.updateProgress(`  ❌ 音频管理员出错，已保存最佳内容作为废章`, true);
                }
                throw error;
            } finally {

            }
        },

        _parseAudioLibrarianOutput(output) {


            const actions = [];
            const lines = output.split('\n');
            let currentAction = null;
            let fieldLines = [];
            let lineNumber = 0;

            for (let i = 0; i < lines.length; i++) {
                const rawLine = lines[i];
                const trimmed = rawLine.trim();
                lineNumber++;

                // 跳过空行（可选，但保留空行不影响）
                if (trimmed === '') {
                    continue;
                }

                // 检测操作标识行
                const addMatch = trimmed.match(/^新增：\s*$/);
                const modifyMatch = trimmed.match(/^修改：\s*(\d+-\d+)$/);
                const deleteMatch = trimmed.match(/^删除：\s*(.+)$/);

                if (addMatch) {
                    // 保存上一个操作（如果有）
                    if (currentAction) {
                        currentAction.fields = this._parseAudioLibrarianFields(fieldLines);
                        actions.push(currentAction);

                    }
                    // 开始新的新增操作

                    currentAction = { type: 'add', uid: null, book: null };
                    fieldLines = [];
                } else if (modifyMatch) {
                    if (currentAction) {
                        currentAction.fields = this._parseAudioLibrarianFields(fieldLines);
                        actions.push(currentAction);

                    }
                    const uidStr = modifyMatch[1];
                    const [book, uid] = uidStr.split('-').map(Number);

                    currentAction = { type: 'modify', book, uid };
                    fieldLines = [];
                } else if (deleteMatch) {
                    if (currentAction) {
                        currentAction.fields = this._parseAudioLibrarianFields(fieldLines);
                        actions.push(currentAction);

                    }
                    const uidListStr = deleteMatch[1];
                    const uidPairs = uidListStr.split(/[，,]\s*/);
                    const toDelete = uidPairs.map(pair => {
                        const [b, u] = pair.split('-').map(Number);
                        return { book: b, uid: u };
                    }).filter(item => !isNaN(item.book) && !isNaN(item.uid));

                    actions.push({ type: 'delete', targets: toDelete });
                    // 删除操作没有后续字段行，直接重置 currentAction
                    currentAction = null;
                    fieldLines = [];
                } else {
                    // 不是操作标识行，属于当前操作的字段行
                    if (currentAction) {
                        fieldLines.push(rawLine);
                    } else {
                        console.warn(`[parseAudioLibrarianOutput] 行 ${lineNumber}: 发现不属于任何操作的文本行，忽略: "${trimmed}"`);
                    }
                }
            }

            // 处理最后一个操作块（如果有）
            if (currentAction) {
                currentAction.fields = this._parseAudioLibrarianFields(fieldLines);
                actions.push(currentAction);

            }


            return actions;
        },

        _parseAudioGeneratorOutput(output) {

            const params = {};

            // 尝试匹配 ===音频生成指令=== 块
            const headerMatch = output.match(/===\s*音频生成指令\s*===([\s\S]*)/);
            const content = headerMatch ? headerMatch[1].trim() : output;

            // 按行解析
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const colonIdx = trimmed.indexOf(':');
                if (colonIdx === -1) {
                    // 如果没有冒号，视为 prompt 的一部分
                    params.prompt = (params.prompt || '') + ' ' + trimmed;
                    continue;
                }
                const key = trimmed.substring(0, colonIdx).trim().toLowerCase();
                const value = trimmed.substring(colonIdx + 1).trim();
                if (key === '提示词') {
                    params.prompt = value;
                } else if (key === '时长') {
                    params.duration = parseInt(value) || 30;
                } else if (key === '速度' || key === 'tempo') {
                    params.tempo = parseInt(value) || 120;
                } else if (key === '风格') {
                    params.style = value;
                }
            }

            if (!params.prompt) {
                // 降级：直接使用整个输出作为提示词
                params.prompt = output;
            }

            return params;
        },

        _parseAudioLibrarianFields(fieldLines) {

            const fields = {};

            for (const line of fieldLines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const segments = trimmed.split('；');
                for (const seg of segments) {
                    const colonIdx = seg.search(/[：:]/);
                    if (colonIdx === -1) continue;
                    const key = seg.substring(0, colonIdx).trim();
                    let value = seg.substring(colonIdx + 1).trim();

                    const arrayFields = ['key', 'keysecondary', 'tags'];
                    if (arrayFields.includes(key)) {
                        fields[key] = value.split(/[，,]\s*/).filter(v => v);
                    } else {
                        if (value === 'true') fields[key] = true;
                        else if (value === 'false') fields[key] = false;
                        else if (!isNaN(value) && value !== '') fields[key] = Number(value);
                        else fields[key] = value;
                    }
                }
            }


            return fields;
        },

        async _updateAudioLibraryFromLibrarianOutput(actions) {

            const libraryBooks = await getAllAudioLibraryBooks();


            for (const action of actions) {


                if (action.type === 'add') {
                    const bookIndex = await this._findAvailableAudioBook();
                    if (bookIndex === null) {
                        console.error('[updateAudioLibrary] 没有可用的音频库书，无法新增条目');
                        UI.updateProgress(`⚠️ 无法新增音频条目：音频库书已满`, true);
                        continue;
                    }
                    const bookName = `状态书-音频库${bookIndex}`;


                    const book = await API.getWorldbook(bookName);
                    const entries = Array.isArray(book) ? book : (book.entries || []);
                    const maxUid = entries.reduce((max, e) => Math.max(max, e.uid || 0), 0);
                    const newUid = maxUid + 1;

                    const newEntry = { uid: newUid, enabled: true };

                    for (const [key, value] of Object.entries(action.fields)) {
                        setNestedValue(newEntry, key, value);
                    }

                    // 音频条目必须包含 audio_id 字段，指向 AudioStore 中的音频
                    if (!newEntry.audio_id) {
                        console.warn('[updateAudioLibrary] 新增条目缺少 audio_id 字段，跳过');
                        continue;
                    }

                    entries.push(newEntry);
                    await API.updateWorldbook(bookName, () => entries, { render: 'immediate' });
                    UI.updateProgress(`  ✅ 音频库新增条目: ${bookName} - uid=${newUid}`);


                } else if (action.type === 'modify') {
                    const { book, uid } = action;
                    const bookName = `状态书-音频库${book}`;


                    const bookObj = await API.getWorldbook(bookName);
                    const entries = Array.isArray(bookObj) ? bookObj : (bookObj.entries || []);
                    const entryIndex = entries.findIndex(e => e.uid === uid);
                    if (entryIndex === -1) {
                        console.warn(`[updateAudioLibrary] 未找到条目 ${book}-${uid}，跳过修改`);
                        continue;
                    }

                    const entry = entries[entryIndex];
                    for (const [key, value] of Object.entries(action.fields)) {
                        setNestedValue(entry, key, value);
                    }

                    entries[entryIndex] = entry;
                    await API.updateWorldbook(bookName, () => entries, { render: 'immediate' });
                    UI.updateProgress(`  ✅ 音频库修改条目: ${bookName} uid=${uid}`);

                } else if (action.type === 'delete') {
                    for (const target of action.targets) {
                        const { book, uid } = target;
                        const bookName = `状态书-音频库${book}`;


                        const bookObj = await API.getWorldbook(bookName);
                        const entries = Array.isArray(bookObj) ? bookObj : (bookObj.entries || []);
                        const newEntries = entries.filter(e => e.uid !== uid);
                        if (newEntries.length === entries.length) {
                            console.warn(`[updateAudioLibrary] 未找到条目 ${book}-${uid}，跳过删除`);
                        } else {
                            await API.updateWorldbook(bookName, () => newEntries, { render: 'immediate' });
                            UI.updateProgress(`  ✅ 音频库删除条目: ${bookName} uid=${uid}`);
                        }
                    }
                }
            }


        },

        async _findAvailableAudioBook() {

            const libraryBooks = await getAllAudioLibraryBooks();
            const maxBooks = CONFIG.MAX_STATE_BOOKS;
            const maxAudios = CONFIG.MAX_AUDIOS_PER_BOOK; // 使用新配置

            for (const bookName of libraryBooks) {
                const match = bookName.match(/状态书-音频库(\d+)/);
                if (!match) continue;
                const bookIndex = parseInt(match[1]);
                const book = await API.getWorldbook(bookName);
                const entries = Array.isArray(book) ? book : (book.entries || []);
                const count = entries.length;

                if (count < maxAudios) {

                    return bookIndex;
                }
            }

            const existingIndices = libraryBooks.map(bookName => {
                const match = bookName.match(/状态书-音频库(\d+)/);
                return match ? parseInt(match[1]) : 0;
            }).filter(idx => idx > 0).sort((a, b) => a - b);
            let nextIndex = 1;
            while (existingIndices.includes(nextIndex)) {
                nextIndex++;
            }
            if (nextIndex <= maxBooks) {

                const newBookName = `状态书-音频库${nextIndex}`;
                try {
                    if (typeof TavernHelper?.createWorldbook === 'function') {
                        await TavernHelper.createWorldbook(newBookName);
                    } else if (typeof window.createWorldbook === 'function') {
                        await window.createWorldbook(newBookName);
                    } else {
                        throw new Error('createWorldbook API 不可用');
                    }
                    await this._activateAudioLibraryBook(newBookName);
                    return nextIndex;
                } catch (e) {
                    console.error('[findAvailableAudioBook] 创建新书失败:', e);
                    return null;
                }
            }

            console.warn('[findAvailableAudioBook] 没有可用音频库书');
            return null;
        },

        /**
         * 激活音频库书
         */
        async _activateAudioLibraryBook(bookName) {

            let currentGlobalBooks = [];
            try {
                if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                    currentGlobalBooks = await TavernHelper.getGlobalWorldbookNames();
                } else if (typeof window.getGlobalWorldbookNames === 'function') {
                    currentGlobalBooks = await window.getGlobalWorldbookNames();
                }
            } catch (e) {
                console.warn('[activateAudioLibraryBook] 获取全局激活列表失败:', e);
                return;
            }
            if (!currentGlobalBooks.includes(bookName)) {
                const newGlobalBooks = [...currentGlobalBooks, bookName];
                try {
                    if (typeof TavernHelper?.rebindGlobalWorldbooks === 'function') {
                        await TavernHelper.rebindGlobalWorldbooks(newGlobalBooks);
                    } else if (typeof window.rebindGlobalWorldbooks === 'function') {
                        await window.rebindGlobalWorldbooks(newGlobalBooks);
                    }
                } catch (e) {
                    console.error('[activateAudioLibraryBook] 激活失败:', e);
                }
            }
        },

        /**
         * 调用图像变化 API（图生图/变体/编辑）
         * @param {Object} config - 图像API配置（来自 CONFIG.apiConfigs）
         * @param {Blob} sourceBlob - 源图片 Blob（已通过 ID 获取）
         * @param {Object} params - 合并后的参数（包含 prompt, denoising_strength 等）
         * @returns {Promise<string>} 生成图片的 Base64 数据（含 data URL 前缀）
         */
        async _callImageVariationAPI(config, sourceBlob, params) {


            const { source, apiUrl, key, timeout = 3600000 } = config;
            const url = apiUrl.replace(/\/+$/, '');

            // 构建组合信号
            const signals = [];
            if (WORKFLOW_STATE.abortController) {
                signals.push(WORKFLOW_STATE.abortController.signal);
            }
            signals.push(AbortSignal.timeout(timeout));
            const combinedSignal = AbortSignal.any(signals);

            // 将源图片转为 base64（data URL 格式），同时提取纯 base64
            const sourceDataUrl = await this._blobToBase64(sourceBlob);
            const sourceBase64 = sourceDataUrl.split(',')[1]; // 去掉 data:image/xxx;base64, 前缀

            const prompt = params.prompt || '';
            const mergedParams = { ...config, ...params };

            // ----- SD WebUI -----
            if (source === 'sdwebui') {
                const sdApiUrl = `${url}/sdapi/v1/img2img`;
                const payload = {
                    init_images: [sourceDataUrl],
                    prompt: prompt,
                    negative_prompt: mergedParams.negative_prompt || '',
                    steps: mergedParams.steps || 20,
                    cfg_scale: mergedParams.cfg_scale || 7,
                    width: mergedParams.width || 512,
                    height: mergedParams.height || 512,
                    denoising_strength: mergedParams.denoising_strength || 0.75,
                    sampler_name: mergedParams.sampler_name || 'DPM++ 2M Karras',
                    batch_size: 1,
                    n_iter: 1,
                    seed: mergedParams.seed || -1,
                    override_settings: {
                        sd_model_checkpoint: mergedParams.model || 'v1-5-pruned-emaonly.safetensors'
                    }
                };

                // 如果配置了 ControlNet，添加 alwayson_scripts
                if (mergedParams.controlnet) {
                    payload.alwayson_scripts = {
                        controlnet: {
                            args: [{
                                enabled: true,
                                module: mergedParams.controlnet.module || 'none',
                                model: mergedParams.controlnet.model || '',
                                weight: mergedParams.controlnet.weight || 1.0,
                                image: sourceDataUrl,
                                resize_mode: mergedParams.controlnet.resize_mode || 1,
                                lowvram: mergedParams.controlnet.lowvram || false,
                                processor_res: mergedParams.controlnet.processor_res || 512,
                                guidance_start: mergedParams.controlnet.guidance_start || 0.0,
                                guidance_end: mergedParams.controlnet.guidance_end || 1.0
                            }]
                        }
                    };
                }


                try {
                    const response = await fetch(sdApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: combinedSignal,
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`SD WebUI 错误 (${response.status}): ${errText}`);
                    }
                    const data = await response.json();
                    if (data.images && data.images[0]) {
                        return `data:image/png;base64,${data.images[0]}`;
                    }
                    throw new Error('SD WebUI 响应中没有图片数据');
                } catch (err) {
                    console.error('[Workflow._callImageVariationAPI] SD WebUI 调用失败:', err);
                    throw err;
                }
            }

            // ----- OpenAI (DALL-E 2) / 兼容平台 -----
            else if (source === 'openai' || source === 'flux' || source === 'siliconflow' || source === 'other') {
                const useEdit = prompt && prompt.trim() !== '';
                const endpoint = useEdit ? '/images/edits' : '/images/variations';
                const formData = new FormData();
                formData.append('image', sourceBlob, 'image.png');
                formData.append('n', String(mergedParams.n || 1));
                formData.append('size', mergedParams.size || '1024x1024');
                formData.append('model', mergedParams.model || config.model || 'dall-e-2');

                if (useEdit) {
                    formData.append('prompt', prompt);
                    if (mergedParams.mask) {
                        // 如果 mask 是 ID，则从 ImageStore 获取 Blob
                        if (mergedParams.mask.startsWith('img_')) {
                            const maskBlob = await ImageStore.get(mergedParams.mask).catch(() => null);
                            if (maskBlob) {
                                formData.append('mask', maskBlob, 'mask.png');
                            } else {
                                console.warn(`[Workflow._callImageVariationAPI] mask ID ${mergedParams.mask} 不存在，跳过`);
                            }
                        } else {
                            formData.append('mask', mergedParams.mask, 'mask.png');
                        }
                    }
                }


                try {
                    const response = await fetch(`${url}${endpoint}`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${key}` },
                        body: formData,
                        signal: combinedSignal,
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`${source} 错误 (${response.status}): ${errText}`);
                    }
                    const data = await response.json();
                    if (data.data && data.data[0]) {
                        if (data.data[0].b64_json) {
                            return `data:image/png;base64,${data.data[0].b64_json}`;
                        } else if (data.data[0].url) {
                            const imgRes = await fetch(data.data[0].url, { signal: combinedSignal });
                            if (!imgRes.ok) throw new Error(`图像下载失败 (${imgRes.status})`);
                            const blob = await imgRes.blob();
                            return await this._blobToBase64(blob);
                        }
                    }
                    throw new Error(`${source} 响应中没有图片数据`);
                } catch (err) {
                    console.error(`[Workflow._callImageVariationAPI] ${source} 调用失败:`, err);
                    throw err;
                }
            }

            // ----- Stability AI -----
            else if (source === 'stability') {
                const mode = mergedParams.mode || 'image-to-image';
                let endpoint = '';
                const formData = new FormData();
                formData.append('image', sourceBlob, 'image.png');

                if (mode === 'image-to-image') {
                    endpoint = '/v2beta/stable-image/generate/image-to-image';
                    formData.append('prompt', prompt);
                    formData.append('strength', String(mergedParams.strength || 0.75));
                    if (mergedParams.model) formData.append('model', mergedParams.model);
                } else if (mode === 'inpaint') {
                    endpoint = '/v2beta/stable-image/edit/inpaint';
                    formData.append('prompt', prompt);
                    if (mergedParams.mask) {
                        if (mergedParams.mask.startsWith('img_')) {
                            const maskBlob = await ImageStore.get(mergedParams.mask).catch(() => null);
                            if (maskBlob) {
                                formData.append('mask', maskBlob, 'mask.png');
                            }
                        } else {
                            formData.append('mask', mergedParams.mask, 'mask.png');
                        }
                    }
                } else if (mode === 'search-and-replace') {
                    endpoint = '/v2beta/stable-image/edit/search-and-replace';
                    formData.append('prompt', prompt);
                    formData.append('search_prompt', mergedParams.searchPrompt || '');
                } else if (mode === 'erase') {
                    endpoint = '/v2beta/stable-image/edit/erase';
                    if (mergedParams.mask) {
                        if (mergedParams.mask.startsWith('img_')) {
                            const maskBlob = await ImageStore.get(mergedParams.mask).catch(() => null);
                            if (maskBlob) {
                                formData.append('mask', maskBlob, 'mask.png');
                            }
                        } else {
                            formData.append('mask', mergedParams.mask, 'mask.png');
                        }
                    }
                } else {
                    throw new Error(`不支持的 Stability AI 模式: ${mode}`);
                }

                formData.append('output_format', mergedParams.output_format || 'png');
                if (mergedParams.seed !== undefined) formData.append('seed', String(mergedParams.seed));
                if (mergedParams.cfg_scale) formData.append('cfg_scale', String(mergedParams.cfg_scale));
                if (mergedParams.style_preset) formData.append('style_preset', mergedParams.style_preset);


                try {
                    const response = await fetch(`${url}${endpoint}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${key}`,
                            'Accept': 'image/*',
                        },
                        body: formData,
                        signal: combinedSignal,
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Stability AI 错误 (${response.status}): ${errText}`);
                    }
                    const blob = await response.blob();
                    return await this._blobToBase64(blob);
                } catch (err) {
                    console.error('[Workflow._callImageVariationAPI] Stability AI 调用失败:', err);
                    throw err;
                }
            }

            // ----- Midjourney -----
            else if (source === 'midjourney') {
                const formData = new FormData();
                formData.append('image', sourceBlob, 'image.png');
                formData.append('prompt', prompt);
                if (mergedParams.action) formData.append('action', mergedParams.action);
                if (mergedParams.index !== undefined) formData.append('index', String(mergedParams.index));

                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${key}` },
                        body: formData,
                        signal: combinedSignal,
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Midjourney 代理错误 (${response.status}): ${errText}`);
                    }
                    const contentType = response.headers.get('content-type');
                    if (contentType?.includes('application/json')) {
                        const data = await response.json();
                        if (data.image_url) {
                            const imgRes = await fetch(data.image_url, { signal: combinedSignal });
                            const blob = await imgRes.blob();
                            return await this._blobToBase64(blob);
                        } else if (data.image_data) {
                            return data.image_data;
                        }
                    } else {
                        const blob = await response.blob();
                        return await this._blobToBase64(blob);
                    }
                    throw new Error('无法解析 Midjourney 代理响应');
                } catch (err) {
                    console.error('[Workflow._callImageVariationAPI] Midjourney 代理调用失败:', err);
                    throw err;
                }
            }

            // ----- Picsart 图生图（编辑）-----
            else if (source === 'picsart') {
                const formData = new FormData();
                formData.append('image', sourceBlob, 'image.png');
                formData.append('prompt', prompt);
                formData.append('n', String(mergedParams.n || 1));
                formData.append('size', mergedParams.size || '1024x1024');

                if (mergedParams.mask) {
                    if (mergedParams.mask.startsWith('img_')) {
                        const maskBlob = await ImageStore.get(mergedParams.mask).catch(() => null);
                        if (maskBlob) {
                            formData.append('mask', maskBlob, 'mask.png');
                        }
                    } else {
                        formData.append('mask', mergedParams.mask, 'mask.png');
                    }
                }

                try {
                    const response = await fetch(`${url}/images/edits`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${key}` },
                        body: formData,
                        signal: combinedSignal,
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Picsart 错误 (${response.status}): ${errText}`);
                    }
                    const data = await response.json();
                    if (data.data && data.data[0] && data.data[0].b64_json) {
                        return `data:image/png;base64,${data.data[0].b64_json}`;
                    }
                    throw new Error('Picsart 响应中无图片数据');
                } catch (err) {
                    console.error('[Workflow._callImageVariationAPI] Picsart 调用失败:', err);
                    throw err;
                }
            }

            // ----- Sora 不支持图生图 -----
            else if (source === 'sora') {
                throw new Error('Sora 平台不支持图生图');
            }

            // ----- 不支持的平台 -----
            else {
                const errorMsg = `不支持的图像平台: ${source}`;
                console.error('[Workflow._callImageVariationAPI]', errorMsg);
                throw new Error(errorMsg);
            }
        },

        /**
         * 解析图片管理员的输出，提取操作指令（新版，无 --- 分隔符）
         * @param {string} output - 原始输出文本
         * @returns {Array<object>} 操作数组
         */
        _parseImageLibrarianOutput(output) {


            const actions = [];
            const lines = output.split('\n');
            let currentAction = null;
            let fieldLines = [];
            let lineNumber = 0;

            for (let i = 0; i < lines.length; i++) {
                const rawLine = lines[i];
                const trimmed = rawLine.trim();
                lineNumber++;

                // 跳过空行（可选，但保留空行不影响）
                if (trimmed === '') {
                    continue;
                }

                // 检测操作标识行
                const addMatch = trimmed.match(/^新增：\s*$/);
                const modifyMatch = trimmed.match(/^修改：\s*(\d+-\d+)$/);
                const deleteMatch = trimmed.match(/^删除：\s*(.+)$/);

                if (addMatch) {
                    // 保存上一个操作（如果有）
                    if (currentAction) {
                        currentAction.fields = this._parseImageLibrarianFields(fieldLines);
                        actions.push(currentAction);

                    }
                    // 开始新的新增操作

                    currentAction = { type: 'add', uid: null, book: null };
                    fieldLines = [];
                } else if (modifyMatch) {
                    if (currentAction) {
                        currentAction.fields = this._parseImageLibrarianFields(fieldLines);
                        actions.push(currentAction);

                    }
                    const uidStr = modifyMatch[1];
                    const [book, uid] = uidStr.split('-').map(Number);

                    currentAction = { type: 'modify', book, uid };
                    fieldLines = [];
                } else if (deleteMatch) {
                    if (currentAction) {
                        currentAction.fields = this._parseImageLibrarianFields(fieldLines);
                        actions.push(currentAction);

                    }
                    const uidListStr = deleteMatch[1];
                    const uidPairs = uidListStr.split(/[，,]\s*/);
                    const toDelete = uidPairs.map(pair => {
                        const [b, u] = pair.split('-').map(Number);
                        return { book: b, uid: u };
                    }).filter(item => !isNaN(item.book) && !isNaN(item.uid));

                    actions.push({ type: 'delete', targets: toDelete });
                    // 删除操作没有后续字段行，直接重置 currentAction
                    currentAction = null;
                    fieldLines = [];
                } else {
                    // 不是操作标识行，属于当前操作的字段行
                    if (currentAction) {
                        fieldLines.push(rawLine);
                    } else {
                        console.warn(`[parseImageLibrarianOutput] 行 ${lineNumber}: 发现不属于任何操作的文本行，忽略: "${trimmed}"`);
                    }
                }
            }

            // 处理最后一个操作块（如果有）
            if (currentAction) {
                currentAction.fields = this._parseImageLibrarianFields(fieldLines);
                actions.push(currentAction);

            }


            return actions;
        },

        /**
         * 解析图片管理员输出中的字段行（支持分号合并）
         * @param {Array<string>} fieldLines - 字段行数组
         * @returns {object} 字段键值对
         */
        _parseImageLibrarianFields(fieldLines) {

            const fields = {};

            for (const line of fieldLines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // 按中文分号分割
                const segments = trimmed.split('；');
                for (const seg of segments) {
                    const colonIdx = seg.search(/[：:]/);
                    if (colonIdx === -1) {
                        console.warn(`[parseImageLibrarianFields] 无法解析的字段行片段: "${seg}"，忽略`);
                        continue;
                    }
                    const key = seg.substring(0, colonIdx).trim();
                    let value = seg.substring(colonIdx + 1).trim();

                    // 处理数组字段
                    const arrayFields = ['key', 'keysecondary', 'tags'];
                    if (arrayFields.includes(key)) {
                        // 按中文逗号分割成数组
                        fields[key] = value.split(/[，,]\s*/).filter(v => v);
                    } else {
                        // 布尔值和数字转换
                        if (value === 'true') fields[key] = true;
                        else if (value === 'false') fields[key] = false;
                        else if (!isNaN(value) && value !== '') fields[key] = Number(value);
                        else fields[key] = value;
                    }
                }
            }


            return fields;
        },

        /**
         * 根据 JSON 格式的预处理步骤执行 ControlNet 检测
         * @param {Array} steps - 预处理步骤数组，每个元素包含 type, sourceId, saveAs
         * @returns {Promise<Object>} 控制图ID映射
         */
        async _executePreprocessingStepsFromJSON(steps) {


            steps.forEach((step, idx) => {

            });

            const imageConfig = this._getImageConfig();
            if (!imageConfig || imageConfig.source !== 'sdwebui') {
                console.error('[Preprocessing] 预处理需要 SD WebUI 图像配置（source: sdwebui）');
                throw new Error('预处理需要 SD WebUI 图像配置（source: sdwebui）');
            }
            const apiUrl = imageConfig.apiUrl.replace(/\/+$/, '');


            // 预处理器名称映射
            const controlNetModuleMap = {
                depth: 'depth_midas',
                openpose: 'openpose_full',
                canny: 'canny',
                softedge: 'softedge_hed',
                lineart: 'lineart_realistic'
            };

            const resultMap = {};
            for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
                const step = steps[stepIndex];


                if (!step.type || !step.sourceId || !step.saveAs) {
                    console.warn('[Preprocessing] 步骤缺少必要字段，跳过', step);
                    continue;
                }

                // 从 ImageStore 获取源图 blob

                const sourceBlob = await ImageStore.get(step.sourceId);
                if (!sourceBlob) {
                    console.error(`[Preprocessing] 源图 ${step.sourceId} 不存在`);
                    throw new Error(`源图 ${step.sourceId} 不存在`);
                }


                // 转换为 data URL

                const sourceBase64 = await this._blobToBase64(sourceBlob);


                // 提取纯 base64（去掉 data URL 前缀）
                const pureBase64 = sourceBase64.split(',')[1];
                if (!pureBase64) {
                    console.error(`[Preprocessing] 提取纯 base64 失败，sourceBase64: ${sourceBase64}`);
                    throw new Error('提取纯 base64 失败');
                }


                // 构建组合信号
                const signals = [];
                if (WORKFLOW_STATE.abortController) {
                    signals.push(WORKFLOW_STATE.abortController.signal);
                }
                signals.push(AbortSignal.timeout(imageConfig.timeout || 3600000));
                const combinedSignal = AbortSignal.any(signals);


                // 构建符合官方规范的 payload
                const payload = {
                    controlnet_module: controlNetModuleMap[step.type] || step.type,
                    controlnet_input_images: [pureBase64],  // 必须为数组
                    controlnet_processor_res: 512           // 可选，默认 -1
                };


                try {

                    const startTime = Date.now();
                    const response = await fetch(`${apiUrl}/controlnet/detect`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: combinedSignal,  // 使用组合信号
                    });
                    const elapsed = Date.now() - startTime;


                    if (!response.ok) {
                        const errText = await response.text();
                        console.error(`[Preprocessing] 响应错误: ${response.status} ${response.statusText}`, errText);
                        throw new Error(`预处理失败 (${step.type}): ${errText}`);
                    }

                    const data = await response.json();


                    // 兼容两种返回格式：旧版 { image: "base64..." } 或新版 { images: ["base64..."], info: "Success" }
                    let resultBase64;
                    if (data.image) {
                        resultBase64 = data.image;

                    } else if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                        resultBase64 = data.images[0];

                    } else {
                        console.warn('[Preprocessing] 响应中未找到图片数据，原始数据:', data);
                        throw new Error('响应中未包含图片数据');
                    }


                    if (!resultBase64) {
                        throw new Error('响应中未包含图片数据');
                    }

                    // 使用指定的 saveAs 作为 ID 保存（如果已存在会覆盖）

                    const savedId = await ImageStore.save(`data:image/png;base64,${resultBase64}`, 'png', step.saveAs);
                    resultMap[step.saveAs] = savedId;
                    UI.updateProgress(`  ✅ 生成控制图 ${step.saveAs}`);

                } catch (err) {
                    console.error('[Preprocessing] 请求或处理过程中发生异常:', err);
                    throw err;
                }
            }


            return resultMap;
        },

        /**
         * 根据图片管理员的输出操作数组，更新图库（状态书）
         * @param {Array<object>} actions - 操作数组，来自 _parseImageLibrarianOutput
         */
        async _updateImageLibraryFromLibrarianOutput(actions) {

            const libraryBooks = await getAllImageLibraryBooks();


            for (const action of actions) {


                if (action.type === 'add') {
                    const bookIndex = await this._findAvailableImageBook();
                    if (bookIndex === null) {
                        console.error('[updateImageLibrary] 没有可用的图库书，无法新增条目');
                        UI.updateProgress(`⚠️ 无法新增图片条目：图库书已满`, true);
                        continue;
                    }
                    const bookName = `状态书-图库${bookIndex}`;


                    const book = await API.getWorldbook(bookName);
                    const entries = Array.isArray(book) ? book : (book.entries || []);
                    const maxUid = entries.reduce((max, e) => Math.max(max, e.uid || 0), 0);
                    const newUid = maxUid + 1;

                    // 创建一个空的条目对象
                    const newEntry = { uid: newUid, enabled: true };

                    // 使用 setNestedValue 设置所有字段（支持点号路径）
                    for (const [key, value] of Object.entries(action.fields)) {
                        setNestedValue(newEntry, key, value);
                    }

                    // 确保 content 字段存在
                    if (!newEntry.content) {
                        console.warn('[updateImageLibrary] 新增条目缺少 content 字段，跳过');
                        continue;
                    }

                    entries.push(newEntry);
                    await API.updateWorldbook(bookName, () => entries, { render: 'immediate' });
                    UI.updateProgress(`  ✅ 图库新增条目: ${bookName} - uid=${newUid}`);


                } else if (action.type === 'modify') {
                    const { book, uid } = action;
                    const bookName = `状态书-图库${book}`;


                    const bookObj = await API.getWorldbook(bookName);
                    const entries = Array.isArray(bookObj) ? bookObj : (bookObj.entries || []);
                    const entryIndex = entries.findIndex(e => e.uid === uid);
                    if (entryIndex === -1) {
                        console.warn(`[updateImageLibrary] 未找到条目 ${book}-${uid}，跳过修改`);
                        continue;
                    }

                    const entry = entries[entryIndex];
                    // 对每个字段使用 setNestedValue 进行更新
                    for (const [key, value] of Object.entries(action.fields)) {
                        setNestedValue(entry, key, value);
                    }

                    entries[entryIndex] = entry;
                    await API.updateWorldbook(bookName, () => entries, { render: 'immediate' });
                    UI.updateProgress(`  ✅ 图库修改条目: ${bookName} uid=${uid}`);


                } else if (action.type === 'delete') {
                    // 删除操作不变
                    for (const target of action.targets) {
                        const { book, uid } = target;
                        const bookName = `状态书-图库${book}`;


                        const bookObj = await API.getWorldbook(bookName);
                        const entries = Array.isArray(bookObj) ? bookObj : (bookObj.entries || []);
                        const newEntries = entries.filter(e => e.uid !== uid);
                        if (newEntries.length === entries.length) {
                            console.warn(`[updateImageLibrary] 未找到条目 ${book}-${uid}，跳过删除`);
                        } else {
                            await API.updateWorldbook(bookName, () => newEntries, { render: 'immediate' });
                            UI.updateProgress(`  ✅ 图库删除条目: ${bookName} uid=${uid}`);

                        }
                    }
                }
            }


        },

        /**
         * 找到第一个可用的图库书号（条目数 < maxImagesPerBook 的书）
         * @returns {Promise<number|null>} 书号，若无可用则返回 null
         */
        async _findAvailableImageBook() {

            const libraryBooks = await getAllImageLibraryBooks();
            const maxBooks = CONFIG.MAX_STATE_BOOKS; // 最大状态书数量
            const maxImages = CONFIG.MAX_IMAGES_PER_BOOK;

            // 首先检查现有书是否有空位
            for (const bookName of libraryBooks) {
                const match = bookName.match(/状态书-图库(\d+)/);
                if (!match) continue;
                const bookIndex = parseInt(match[1]);
                const book = await API.getWorldbook(bookName);
                const entries = Array.isArray(book) ? book : (book.entries || []);
                const count = entries.length;

                if (count < maxImages) {

                    return bookIndex;
                }
            }

            // 如果没有现有书有空位，尝试创建新书
            const existingIndices = libraryBooks.map(bookName => {
                const match = bookName.match(/状态书-图库(\d+)/);
                return match ? parseInt(match[1]) : 0;
            }).filter(idx => idx > 0).sort((a, b) => a - b);
            let nextIndex = 1;
            while (existingIndices.includes(nextIndex)) {
                nextIndex++;
            }
            if (nextIndex <= maxBooks) {

                // 创建新图库书
                const newBookName = `状态书-图库${nextIndex}`;
                try {
                    if (typeof TavernHelper?.createWorldbook === 'function') {
                        await TavernHelper.createWorldbook(newBookName);
                    } else if (typeof window.createWorldbook === 'function') {
                        await window.createWorldbook(newBookName);
                    } else {
                        throw new Error('createWorldbook API 不可用');
                    }
                    // 激活新书
                    await this._activateImageLibraryBook(newBookName);
                    return nextIndex;
                } catch (e) {
                    console.error('[findAvailableImageBook] 创建新书失败:', e);
                    return null;
                }
            }

            console.warn('[findAvailableImageBook] 没有可用图库书');
            return null;
        },

        /**
         * 激活一本图库书（加入全局激活列表）
         * @param {string} bookName - 图库书名
         */
        async _activateImageLibraryBook(bookName) {

            let currentGlobalBooks = [];
            try {
                if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                    currentGlobalBooks = await TavernHelper.getGlobalWorldbookNames();
                } else if (typeof window.getGlobalWorldbookNames === 'function') {
                    currentGlobalBooks = await window.getGlobalWorldbookNames();
                }
            } catch (e) {
                console.warn('[activateImageLibraryBook] 获取全局激活列表失败:', e);
                return;
            }
            if (!currentGlobalBooks.includes(bookName)) {
                const newGlobalBooks = [...currentGlobalBooks, bookName];
                try {
                    if (typeof TavernHelper?.rebindGlobalWorldbooks === 'function') {
                        await TavernHelper.rebindGlobalWorldbooks(newGlobalBooks);
                    } else if (typeof window.rebindGlobalWorldbooks === 'function') {
                        await window.rebindGlobalWorldbooks(newGlobalBooks);
                    }
                } catch (e) {
                    console.error('[activateImageLibraryBook] 激活失败:', e);
                }
            }
        },

        /**
         * 调用 SD WebUI 图生图接口，使用单个 ControlNet 单元
         * @param {Blob} initBlob - 初始图片 Blob
         * @param {Blob} controlBlob - 控制图片 Blob
         * @param {string} prompt - 提示词
         * @param {string} controlType - 控制类型 (openpose/depth/canny/softedge/lineart)
         * @param {number} denoisingStrength - 重绘幅度
         * @returns {Promise<string>} 生成的图片 Base64
         */
        async _callSingleControlNetAPI(initBlob, controlBlob, params) {


            const config = this._getImageConfig(); // 获取全局图像配置
            if (!config || config.source !== 'sdwebui') {
                throw new Error('融合生图需要 SD WebUI 图像配置（source: sdwebui）');
            }
            const apiUrl = config.apiUrl.replace(/\/+$/, '');
            const sdApiUrl = `${apiUrl}/sdapi/v1/img2img`;

            // 合并参数：params 中的字段优先
            const mergedParams = { ...config, ...params };


            // 构建组合信号
            const signals = [];
            if (WORKFLOW_STATE.abortController) {
                signals.push(WORKFLOW_STATE.abortController.signal);
            }
            signals.push(AbortSignal.timeout(mergedParams.timeout || 3600000));
            const combinedSignal = AbortSignal.any(signals);


            const initBase64 = await this._blobToBase64(initBlob);
            const controlBase64 = await this._blobToBase64(controlBlob);

            // 构建 ControlNet 单元
            const controlNetUnit = {
                enabled: true,
                module: mergedParams.module || 'depth_midas', // 从 params 中获取，或根据 type 映射
                model: mergedParams.controlModel || 'control_v11f1p_sd15_depth',
                weight: mergedParams.weight || 1.0,
                image: controlBase64,
                resize_mode: mergedParams.resize_mode || 1,
                lowvram: mergedParams.lowvram !== undefined ? mergedParams.lowvram : true,
                processor_res: mergedParams.processor_res || 512,
                guidance_start: mergedParams.guidance_start || 0.0,
                guidance_end: mergedParams.guidance_end || 1.0,
            };

            const payload = {
                init_images: [initBase64],
                prompt: mergedParams.prompt,
                negative_prompt: mergedParams.negative_prompt || '',
                steps: mergedParams.steps || 30,
                cfg_scale: mergedParams.cfg_scale || 7,
                width: mergedParams.width || 512,
                height: mergedParams.height || 512,
                denoising_strength: mergedParams.denoising_strength || 0.75,
                sampler_name: mergedParams.sampler_name || 'DPM++ 2M Karras',
                batch_size: 1,
                n_iter: 1,
                seed: mergedParams.seed || -1,
                alwayson_scripts: {
                    controlnet: {
                        args: [controlNetUnit]
                    }
                }
            };


            try {
                const response = await fetch(sdApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: combinedSignal,
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`SD WebUI 错误 (${response.status}): ${errText}`);
                }

                const data = await response.json();


                if (data.images && data.images[0]) {
                    return data.images[0]; // 返回 base64
                } else {
                    throw new Error('响应中无图片数据');
                }
            } catch (err) {
                console.error('[Workflow._callSingleControlNetAPI] 调用失败:', err);
                throw err;
            } finally {

            }
        },

        /**
         * 简单融合：使用单 ControlNet 单元传入多张人物图（作为参考图数组）
         * @param {string} backgroundId
         * @param {Array<string>} characterIds
         * @param {string} sceneDescription
         * @returns {Promise<string>} 生成的图片 Base64
         */
        async _simpleFusion(backgroundId, characterIds, sceneDescription) {
            const bgBlob = await ImageStore.get(backgroundId);
            if (!bgBlob) throw new Error(`背景图 ${backgroundId} 不存在`);
            const bgBase64 = await this._blobToBase64(bgBlob);

            const controlImages = [];
            for (const charId of characterIds) {
                const charBlob = await ImageStore.get(charId);
                if (charBlob) {
                    const charBase64 = await this._blobToBase64(charBlob);
                    controlImages.push(charBase64);
                }
            }

            if (controlImages.length === 0) {
                throw new Error('没有可用的控制图（人物图）');
            }

            const imageConfig = this._getImageConfig();
            const apiUrl = imageConfig.apiUrl.replace(/\/+$/, '');
            const sdApiUrl = `${apiUrl}/sdapi/v1/img2img`;

            // 构建组合信号
            const signals = [];
            if (WORKFLOW_STATE.abortController) {
                signals.push(WORKFLOW_STATE.abortController.signal);
            }
            signals.push(AbortSignal.timeout(imageConfig.timeout || 3600000));
            const combinedSignal = AbortSignal.any(signals);


            const controlNetUnit = {
                enabled: true,
                module: 'reference_only',      // 使用 reference 模型
                model: 'control_v11p_sd15_reference [some_hash]', // 请替换为实际模型名
                image: controlImages,
                weight: 1.0,
                resize_mode: 1,
                lowvram: true,
                processor_res: 512,
                control_mode: 0,
            };

            const payload = {
                init_images: [bgBase64],
                prompt: sceneDescription,
                negative_prompt: imageConfig.negative_prompt || 'nsfw, low quality, blurry',
                steps: imageConfig.steps || 30,
                cfg_scale: imageConfig.cfg_scale || 7,
                width: imageConfig.width || 512,
                height: imageConfig.height || 512,
                denoising_strength: 0.4,
                sampler_name: imageConfig.sampler_name || 'DPM++ 2M Karras',
                batch_size: 1,
                n_iter: 1,
                seed: -1,
                alwayson_scripts: {
                    controlnet: { args: [controlNetUnit] }
                }
            };

            try {
                const response = await fetch(sdApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: combinedSignal,  // 使用组合信号
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`SD WebUI 错误 (${response.status}): ${errText}`);
                }

                const data = await response.json();
                return data.images[0];
            } catch (err) {
                console.error('[Workflow._simpleFusion] 调用失败:', err);
                throw err;
            }
        },

        /**
         * 将 Blob 转换为 Base64 字符串（data URL 格式）
         * @param {Blob} blob
         * @returns {Promise<string>}
         */
        async _blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    // 返回 data:image/png;base64, 格式
                    resolve(reader.result);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        },

        /**
         * 调用图像生成 API（文生图）
         * @param {Object} params - 图像生成参数，必须包含 prompt，其他字段根据平台而定
         * @returns {Promise<string>} 生成的图片 Base64 数据（含 data URL 前缀）
         */
        async _callImageAPI(params) {
            console.log(`[Workflow._callImageAPI] 开始调用，参数:`, {
                prompt: params.prompt ? params.prompt.substring(0, 50) + '...' : '无',
                source: params.source,
                model: params.model,
                size: params.size
            });

            const config = this._getImageConfig(); // 获取全局唯一图像配置

            // 合并参数：params 中的字段优先于 config
            const mergedParams = { ...config, ...params };
            const { source, apiUrl, key, model, timeout = 3600000 } = mergedParams;
            const url = apiUrl.replace(/\/+$/, '');

            // 构建组合信号
            const signals = [];
            if (WORKFLOW_STATE.abortController) {
                signals.push(WORKFLOW_STATE.abortController.signal);
            }
            signals.push(AbortSignal.timeout(timeout));
            const combinedSignal = AbortSignal.any(signals);

            try {
                // ----- OpenAI / 兼容平台 -----
                if (source === 'openai' || source === 'deepseek' || source === 'siliconflow' || source === 'qwen' || source === 'glm' || source === 'mistral' || source === 'groq' || source === 'inference' || source === 'openrouter' || source === '4sapi') {
                    const headers = {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`
                    };
                    const body = JSON.stringify({
                        model: mergedParams.model || model,
                        prompt: mergedParams.prompt,
                        n: mergedParams.n || 1,
                        size: mergedParams.size || '1024x1024',
                        quality: mergedParams.quality || 'standard',
                        response_format: 'b64_json'
                    });


                    const response = await fetch(`${url}/images/generations`, {
                        method: 'POST',
                        headers,
                        body,
                        signal: combinedSignal
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`${source} 错误 (${response.status}): ${errText}`);
                    }
                    const data = await response.json();
                    if (data.data && data.data[0] && data.data[0].b64_json) {
                        const base64 = `data:image/png;base64,${data.data[0].b64_json}`;

                        return base64;
                    }
                    throw new Error('响应中无图片数据');
                }

                // ----- SD WebUI -----
                else if (source === 'sdwebui') {
                    const sdApiUrl = `${url}/sdapi/v1/txt2img`;
                    const payload = {
                        prompt: mergedParams.prompt,
                        negative_prompt: mergedParams.negative_prompt || '',
                        steps: mergedParams.steps || 20,
                        cfg_scale: mergedParams.cfg_scale || 7,
                        width: mergedParams.width || 512,
                        height: mergedParams.height || 512,
                        seed: mergedParams.seed || -1,
                        sampler_name: mergedParams.sampler_name || 'DPM++ 2M Karras',
                        batch_size: mergedParams.batch_size || 1,
                        n_iter: 1,
                        restore_faces: mergedParams.restore_faces || false,
                        tiling: mergedParams.tiling || false,
                        override_settings: {
                            sd_model_checkpoint: mergedParams.model || 'v1-5-pruned-emaonly.safetensors'
                        },
                        override_settings_restore_afterwards: true,
                        send_images: true,
                        save_images: mergedParams.save_images || false
                    };


                    const response = await fetch(sdApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: combinedSignal
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`SD WebUI 错误 (${response.status}): ${errText}`);
                    }
                    const data = await response.json();
                    if (data.images && data.images[0]) {
                        const base64Image = data.images[0];
                        return `data:image/png;base64,${base64Image}`;
                    }
                    throw new Error('SD WebUI 响应中无图片数据');
                }

                // ----- Stability AI -----
                else if (source === 'stability') {
                    const headers = {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json',
                    };
                    const body = JSON.stringify({
                        text_prompts: [{ text: mergedParams.prompt, weight: 1 }],
                        cfg_scale: mergedParams.cfg_scale || 7,
                        height: mergedParams.height || 512,
                        width: mergedParams.width || 512,
                        samples: mergedParams.samples || 1,
                        steps: mergedParams.steps || 30,
                    });


                    const response = await fetch(`${url}/generation/${model}/text-to-image`, {
                        method: 'POST',
                        headers,
                        body,
                        signal: combinedSignal
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Stability AI 错误 (${response.status}): ${errText}`);
                    }
                    const data = await response.json();
                    if (data.artifacts && data.artifacts[0] && data.artifacts[0].base64) {
                        return `data:image/png;base64,${data.artifacts[0].base64}`;
                    }
                    throw new Error('Stability AI 响应中无图片数据');
                }

                // ----- Midjourney（异步轮询） -----
                else if (source === 'midjourney') {
                    const submitRes = await fetch(`${url}/mj/submit`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${key}`,
                        },
                        body: JSON.stringify({
                            prompt: mergedParams.prompt,
                            model: mergedParams.model || 'midjourney-v7'
                        }),
                        signal: combinedSignal
                    });
                    if (!submitRes.ok) {
                        const errText = await submitRes.text();
                        throw new Error(`Midjourney 提交失败: ${errText}`);
                    }
                    const { taskId } = await submitRes.json();


                    const maxAttempts = 30;
                    const pollInterval = 2000;
                    for (let i = 0; i < maxAttempts; i++) {
                        await this.sleep(pollInterval);
                        const resultRes = await fetch(`${url}/mj/task/${taskId}`, {
                            headers: { 'Authorization': `Bearer ${key}` },
                            signal: combinedSignal,
                        });
                        if (!resultRes.ok) continue;
                        const data = await resultRes.json();
                        if (data.status === 'success') {
                            const imageUrl = data.imageUrl;
                            const imgRes = await fetch(imageUrl, { signal: combinedSignal });
                            const blob = await imgRes.blob();
                            return await this._blobToBase64(blob);
                        } else if (data.status === 'failed') {
                            throw new Error(`Midjourney 生成失败: ${data.reason}`);
                        }
                    }
                    throw new Error('Midjourney 生成超时');
                }

                // ----- Flux（兼容 OpenAI） -----
                else if (source === 'flux') {
                    const headers = {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`,
                    };
                    const body = JSON.stringify({
                        model: mergedParams.model || model,
                        prompt: mergedParams.prompt,
                        n: 1,
                        response_format: 'b64_json',
                    });


                    const response = await fetch(`${url}/images/generations`, {
                        method: 'POST',
                        headers,
                        body,
                        signal: combinedSignal,
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Flux 错误 (${response.status}): ${errText}`);
                    }
                    const data = await response.json();
                    if (data.data && data.data[0] && data.data[0].b64_json) {
                        return `data:image/png;base64,${data.data[0].b64_json}`;
                    } else if (data.data && data.data[0] && data.data[0].url) {
                        console.warn(`[Workflow._callImageAPI] Flux 返回了 URL，将下载并转换`);
                        const imgRes = await fetch(data.data[0].url, { signal: combinedSignal });
                        const blob = await imgRes.blob();
                        return await this._blobToBase64(blob);
                    }
                    throw new Error('Flux 响应中无图片数据');
                }

                // ----- Picsart -----
                else if (source === 'picsart') {
                    const headers = {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json'
                    };
                    const body = JSON.stringify({
                        model: mergedParams.model || 'Picsart-AI',
                        prompt: mergedParams.prompt,
                        n: mergedParams.n || 1,
                        size: mergedParams.size || '1024x1024',
                        negative_prompt: mergedParams.negative_prompt || '',
                        response_format: 'b64_json'
                    });


                    const response = await fetch(`${url}/images/generations`, {
                        method: 'POST',
                        headers,
                        body,
                        signal: combinedSignal
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Picsart 错误 (${response.status}): ${errText}`);
                    }
                    const data = await response.json();
                    if (data.data && data.data[0] && data.data[0].b64_json) {
                        return `data:image/png;base64,${data.data[0].b64_json}`;
                    }
                    throw new Error('Picsart 响应中无图片数据');
                }

                // ----- Sora（视频生成，不支持图像）-----
                else if (source === 'sora') {
                    // Sora 只支持视频，尝试视频生成？但系统目前无视频存储，所以抛出错误
                    throw new Error('Sora 平台仅支持视频生成，不支持图像生成。如需视频功能，请使用其他服务。');
                }

                // ----- other / 自定义平台（兼容 OpenAI 格式）-----
                else if (source === 'other') {
                    const headers = {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`,
                    };
                    const body = JSON.stringify({
                        model: mergedParams.model || model,
                        prompt: mergedParams.prompt,
                        n: mergedParams.n || 1,
                        size: mergedParams.size || '1024x1024',
                        response_format: 'b64_json',
                    });


                    const response = await fetch(`${url}/images/generations`, {
                        method: 'POST',
                        headers,
                        body,
                        signal: combinedSignal,
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Other API 错误 (${response.status}): ${errText}`);
                    }
                    const data = await response.json();
                    if (data.data && data.data[0] && data.data[0].b64_json) {
                        return `data:image/png;base64,${data.data[0].b64_json}`;
                    } else if (data.data && data.data[0] && data.data[0].url) {
                        const imgRes = await fetch(data.data[0].url, { signal: combinedSignal });
                        const blob = await imgRes.blob();
                        return await this._blobToBase64(blob);
                    }
                    throw new Error('无法识别的响应格式');
                }

                else {
                    throw new Error(`不支持的图像平台: ${source}`);
                }
            } catch (err) {
                console.error(`[Workflow._callImageAPI] 调用失败:`, err);
                throw err;
            }
        },

        _getAgentKeyByRole(role) {
            for (const [key, agent] of Object.entries(CONFIG.AGENTS)) {
                if (agent.role === role) return key;
            }
            return null;
        },

        async waitForUserInput(mode, agentKey, inputIndex, shouldCache, src) {
            if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

            const isReflow = !shouldCache;

            // 非回流：检查常规缓存
            if (!isReflow) {
                let cachedValue;
                if (src === 'user') {
                    cachedValue = undefined; // 不缓存
                } else if (src.endsWith('.last')) {
                    const targetKey = src.slice(0, -5);
                    cachedValue = WORKFLOW_STATE.lastInputCache[targetKey];
                } else if (src !== 'before' && src !== 'auto' && !this._isStage(src)) {
                    cachedValue = WORKFLOW_STATE.agentInputCache[src];
                }
                if (cachedValue !== undefined) {

                    return cachedValue;
                }
            } else {
                // 回流：使用当前回流层的缓存 (currentReflowCache)
                if (WORKFLOW_STATE.currentReflowCache) {
                    const cacheEntry = WORKFLOW_STATE.currentReflowCache[src];
                    if (cacheEntry) {
                        if (cacheEntry.resolved) {

                            return cacheEntry.result;
                        } else {

                            return cacheEntry.promise;
                        }
                    }
                }
            }


            // 创建新的 Promise
            let resolveFn, rejectFn;
            const promise = new Promise((resolve, reject) => {
                resolveFn = resolve;
                rejectFn = reject;
            });

            // 根据是否回流存储到不同缓存
            if (isReflow) {
                if (!WORKFLOW_STATE.currentReflowCache) WORKFLOW_STATE.currentReflowCache = {};
                WORKFLOW_STATE.currentReflowCache[src] = {
                    promise,
                    resolve: resolveFn,
                    reject: rejectFn,
                    resolved: false,
                    result: null
                };

            } else {
                // 非回流：存入 pendingInputBySrc（原有逻辑）
                if (WORKFLOW_STATE.pendingInputBySrc[src]) {
                    console.warn(`[waitForUserInput] 非回流，但 pendingInputBySrc[${src}] 已存在，将复用？`);
                    // 为了安全，仍返回已存在的 promise
                    return WORKFLOW_STATE.pendingInputBySrc[src].promise;
                }
                WORKFLOW_STATE.pendingInputBySrc[src] = {
                    promise,
                    resolve: resolveFn,
                    reject: rejectFn,
                    resolved: false,
                    result: null
                };
            }

            // 将请求加入队列
            WORKFLOW_STATE.inputRequestQueue.push({
                mode,
                agentKey,
                inputIndex,
                src,
                isReflow
            });

            if (!WORKFLOW_STATE.isProcessingInput) {
                this._processInputQueueSequential();
            }

            return promise;
        },

        // 在 Workflow 对象内
        // 在 Workflow 对象内，替换原有的 _processInputQueueSequential 函数
        async _processInputQueueSequential() {


            if (WORKFLOW_STATE.isProcessingInput) {

                return;
            }
            WORKFLOW_STATE.isProcessingInput = true;

            try {
                while (WORKFLOW_STATE.inputRequestQueue.length > 0) {
                    if (WORKFLOW_STATE.shouldStop) {
                        console.warn('[processInputQueue] 检测到停止信号，拒绝当前等待并退出');
                        const currentRequest = WORKFLOW_STATE.inputRequestQueue[0];
                        if (currentRequest) {
                            const pending = currentRequest.isReflow ? WORKFLOW_STATE.currentReflowCache?.[currentRequest.src] : WORKFLOW_STATE.pendingInputBySrc[currentRequest.src];
                            if (pending && !pending.resolved) {
                                pending.reject(new UserInterruptError());
                            }
                        }
                        throw new UserInterruptError();
                    }

                    const request = WORKFLOW_STATE.inputRequestQueue.shift();
                    if (!request) continue;

                    const { mode, agentKey, inputIndex, src, isReflow } = request;


                    if (WORKFLOW_STATE.shouldStop) {
                        console.warn('[processInputQueue] 检测到停止信号，拒绝所有等待');
                        const pending = isReflow ? WORKFLOW_STATE.currentReflowCache?.[src] : WORKFLOW_STATE.pendingInputBySrc[src];
                        if (pending && !pending.resolved) {
                            pending.reject(new UserInterruptError());
                        }
                        throw new UserInterruptError();
                    }

                    const pending = isReflow ? WORKFLOW_STATE.currentReflowCache?.[src] : WORKFLOW_STATE.pendingInputBySrc[src];
                    if (!pending || pending.resolved) {

                        continue;
                    }

                    WORKFLOW_STATE.awaitingInput = true;
                    WORKFLOW_STATE.pendingInputMode = mode;
                    WORKFLOW_STATE.currentWaitingAgent = agentKey;
                    WORKFLOW_STATE.currentWaitingInputIndex = inputIndex;

                    AgentStateManager.setState(agentKey, 'waiting_input');
                    UI.updateWorkflowAgentStates();

                    const agent = CONFIG.AGENTS[agentKey];
                    const promptText = (agent && agent.inputPrompts && agent.inputPrompts[inputIndex])
                        ? `⏳ 等待用户输入：${agent.inputPrompts[inputIndex]}`
                        : `⏳ 等待用户输入 (${mode})...`;
                    UI.updateProgress(promptText);
                    UI.updateSubmitButtons(mode);

                    if (agent && agent.role === 'interactiveAgent' && mode === 'txt') {
                        // ========== interactiveAgent 特殊处理 ==========
                        let html = await this._collectInputs(agentKey, isReflow, { isParallel: false });
                        html = html[0];
                        const userChoice = await UI.renderAndWaitForInteraction(html);
                        pending.resolved = true;
                        pending.result = userChoice;
                        pending.resolve(userChoice);
                        WORKFLOW_STATE.awaitingInput = false;
                        WORKFLOW_STATE.pendingInputMode = null;
                        WORKFLOW_STATE.currentWaitingAgent = null;
                        WORKFLOW_STATE.currentWaitingInputIndex = null;
                        UI.updateSubmitButtons(null);
                        AgentStateManager.setState(agentKey, 'running');
                        UI.updateWorkflowAgentStates();
                        await API.sleep(50);
                        continue;
                    } else if (mode.startsWith('read_')) {

                        const fileType = mode.substring(5);
                        const agent = CONFIG.AGENTS[agentKey];
                        const apiConfigId = agent?.apiConfigId;
                        if (!apiConfigId || !CONFIG.apiConfigs[apiConfigId]) {
                            console.error(`[processInputQueue] Agent ${agentKey} 未配置 apiConfigId 或配置无效`);
                            throw new Error(`Agent ${agentKey} 未配置 apiConfigId 或配置无效，无法上传文件`);
                        }
                        const apiConfig = CONFIG.apiConfigs[apiConfigId];


                        let uploadResult;
                        try {
                            uploadResult = await new Promise((resolve, reject) => {
                                const overlay = document.createElement('div');
                                overlay.className = 'nc-modal-overlay nc-font';
                                overlay.style.zIndex = '100040';

                                const modal = document.createElement('div');
                                modal.className = 'nc-modal';
                                modal.style.maxWidth = '400px';
                                modal.innerHTML = `
                    <div class="nc-modal-header">
                        <h2 class="nc-modal-title--primary-c">选择 ${fileType === 'png' ? '图片' : fileType === 'audio' ? '音频' : '文本'} 文件</h2>
                    </div>
                    <div class="nc-modal-body nc-center--pad20">
                        <input type="file" id="nc-file-input" accept="${fileType === 'png' ? 'image/png' :
                                        fileType === 'txt' ? 'text/plain' :
                                            fileType === 'html' ? 'text/html' :
                                                fileType === 'js' ? 'application/javascript' :
                                                    fileType === 'audio' ? 'audio/*' : '*/*'
                                    }" class="nc-my10">
                    </div>
                    <div class="nc-modal-footer">
                        <button class="nc-modal-close-btn">取消</button>
                    </div>
                `;
                                overlay.appendChild(modal);
                                document.body.appendChild(overlay);
                                ModalStack.push(overlay);

                                const fileInput = modal.querySelector('#nc-file-input');
                                const closeBtn = modal.querySelector('.nc-modal-close-btn');

                                const handleFile = async () => {
                                    const file = fileInput.files[0];
                                    if (!file) {
                                        Notify.warning('请选择一个文件');
                                        return;
                                    }

                                    try {
                                        const result = await Workflow._uploadFile(apiConfig, file);

                                        ModalStack.closeTop();
                                        resolve(result);
                                    } catch (err) {
                                        console.error('[processInputQueue] 文件上传失败:', err);
                                        Notify.error('文件上传失败: ' + err.message);
                                    }
                                };

                                fileInput.addEventListener('change', handleFile);
                                closeBtn.addEventListener('click', () => {

                                    ModalStack.closeTop();
                                    reject(new UserInterruptError());
                                });

                                overlay.addEventListener('click', (e) => {
                                    if (e.target === overlay) {

                                        ModalStack.closeTop();
                                        reject(new UserInterruptError());
                                    }
                                });
                            });
                        } catch (err) {
                            console.error('[processInputQueue] 文件选择或上传过程中出错:', err);
                            pending.reject(err);
                            throw err;
                        }

                        const inputContent = `[file:${uploadResult.fileId}] ${uploadResult.fileName}`;


                        pending.resolved = true;
                        pending.result = inputContent;
                        pending.resolve(inputContent);

                        if (!isReflow) {
                            if (src.endsWith('.last')) {
                                const targetKey = src.slice(0, -5);
                                WORKFLOW_STATE.lastInputCache[targetKey] = inputContent;

                            } else if (src !== 'user' && src !== 'before' && src !== 'auto' && !this._isStage(src)) {
                                WORKFLOW_STATE.agentInputCache[src] = inputContent;

                            }
                            if (src === 'user') {
                                WORKFLOW_STATE.currentUserInput = inputContent;

                            }
                        }

                        WORKFLOW_STATE.awaitingInput = false;
                        WORKFLOW_STATE.pendingInputMode = null;
                        WORKFLOW_STATE.currentWaitingAgent = null;
                        WORKFLOW_STATE.currentWaitingInputIndex = null;
                        WORKFLOW_STATE.inputRejector = null;

                        UI.updateSubmitButtons(null);
                        UI.updateProgress(`✅ 文件上传成功，ID: ${uploadResult.fileId}`);
                        Notify.success('文件已上传', '', { timeOut: 2000 });

                        AgentStateManager.setState(agentKey, 'running');
                        UI.updateWorkflowAgentStates();

                        await API.sleep(50);
                        continue;
                    } else if (mode.startsWith('save_')) {
                        // ========== 保存文件模式，支持自定义ID、自动生成和冲突处理 ==========

                        const fileType = mode.substring(5);
                        let fileId;
                        try {
                            fileId = await new Promise((resolve, reject) => {
                                const overlay = document.createElement('div');
                                overlay.className = 'nc-modal-overlay nc-font';
                                overlay.style.zIndex = '100040';

                                const modal = document.createElement('div');
                                modal.className = 'nc-modal';
                                modal.style.maxWidth = '450px';

                                // 根据文件类型确定前缀
                                let expectedPrefix = '';
                                if (fileType === 'png') expectedPrefix = 'img_';
                                else if (fileType === 'audio') expectedPrefix = 'audio_';
                                else expectedPrefix = 'other_';

                                modal.innerHTML = `
                <div class="nc-modal-header">
                    <h2 class="nc-modal-title--primary-c">保存 ${fileType === 'png' ? '图片' : fileType === 'audio' ? '音频' : '文本'} 文件</h2>
                </div>
                <div class="nc-modal-body nc-body--pad20">
                    <div class="nc-mb15">
                        <label class="nc-field-label--base">自定义ID（可选）</label>
                        <input type="text" id="nc-custom-id" placeholder="${expectedPrefix}your_id" class="nc-modal-input--base">
                        <div class="nc-text--xs-muted-mt5">必须以 ${expectedPrefix} 开头，只能包含字母、数字、下划线</div>
                    </div>
                    <div>
                        <label class="nc-field-label--base">选择文件</label>
                        <input type="file" id="nc-file-input" accept="${fileType === 'png' ? 'image/png' :
                                        fileType === 'txt' ? 'text/plain' :
                                            fileType === 'html' ? 'text/html' :
                                                fileType === 'js' ? 'application/javascript' :
                                                    fileType === 'audio' ? 'audio/*' : '*/*'
                                    }" class="nc-modal-select--file">
                    </div>
                </div>
                <div class="nc-modal-footer nc-flex--footer-10-center">
                    <button id="nc-save-ok" class="nc-modal-copy-btn nc-btn--grad-purple">确定</button>
                    <button id="nc-save-auto" class="nc-modal-copy-btn nc-btn--grad-teal">自动生成</button>
                    <button class="nc-modal-close-btn nc-btn--grad-red">取消</button>
                </div>
            `;

                                overlay.appendChild(modal);
                                document.body.appendChild(overlay);
                                ModalStack.push(overlay);

                                const fileInput = modal.querySelector('#nc-file-input');
                                const customIdInput = modal.querySelector('#nc-custom-id');
                                const okBtn = modal.querySelector('#nc-save-ok');
                                const autoBtn = modal.querySelector('#nc-save-auto');
                                const closeBtn = modal.querySelector('.nc-modal-close-btn');

                                // 辅助函数：根据文件类型确定使用的存储
                                const getStore = () => {
                                    if (fileType === 'png') return ImageStore;
                                    else if (fileType === 'audio') return AudioStore;
                                    else return OtherFileStore;
                                };

                                const handleSave = async (useAuto) => {
                                    const file = fileInput.files[0];
                                    if (!file) {
                                        Notify.warning('请选择一个文件');
                                        return;
                                    }

                                    let customId = null;
                                    if (!useAuto) {
                                        customId = customIdInput.value.trim();


                                        // 如果输入了自定义ID，进行格式校验
                                        if (customId) {
                                            const idRegex = new RegExp(`^${expectedPrefix}[a-zA-Z0-9_]+$`);
                                            if (!idRegex.test(customId)) {
                                                Notify.error(`自定义ID必须以 ${expectedPrefix} 开头，且只能包含字母、数字、下划线`);
                                                return;
                                            }
                                        } else {
                                            // 确定模式下不允许为空
                                            Notify.error('请输入自定义ID或使用“自动生成”');
                                            return;
                                        }
                                    } else {

                                    }

                                    // 冲突检测（仅在提供自定义ID时）
                                    if (!useAuto && customId) {
                                        const store = getStore();
                                        let existing;
                                        try {
                                            if (fileType === 'png') existing = await ImageStore.get(customId);
                                            else if (fileType === 'audio') existing = await AudioStore.get(customId);
                                            else existing = await OtherFileStore.get(customId);
                                        } catch (e) {
                                            console.warn('[processInputQueue] 冲突检测出错', e);
                                            existing = null;
                                        }

                                        if (existing) {
                                            const action = await UI._showResourceConflictModal(customId, fileType === 'png' ? '图片' : fileType === 'audio' ? '音频' : '文本');

                                            if (action === 'cancel' || action === 'skip') {
                                                return; // 不关闭模态框，用户可以重新选择
                                            }
                                            // action === 'overwrite' 则继续
                                        }
                                    }

                                    // 执行保存
                                    try {
                                        let savedId;
                                        const store = getStore();
                                        if (fileType === 'png') {

                                            savedId = await ImageStore.save(file, null, useAuto ? undefined : customId);
                                        } else if (fileType === 'txt' || fileType === 'html' || fileType === 'js') {

                                            const text = await file.text();
                                            savedId = await OtherFileStore.save(text, fileType, useAuto ? undefined : customId);
                                        } else if (fileType === 'audio') {

                                            savedId = await AudioStore.save(file, useAuto ? undefined : customId);
                                        }

                                        ModalStack.closeTop();
                                        resolve(savedId);
                                    } catch (err) {
                                        console.error('[processInputQueue] 保存文件失败:', err);
                                        Notify.error(`文件保存失败: ${err}`.message);
                                        // 不关闭模态框，让用户重试
                                    }
                                };

                                okBtn.addEventListener('click', () => handleSave(false));
                                autoBtn.addEventListener('click', () => handleSave(true));
                                closeBtn.addEventListener('click', () => {

                                    ModalStack.closeTop();
                                    reject(new Error('用户取消文件选择'));
                                });

                                overlay.addEventListener('click', (e) => {
                                    if (e.target === overlay) {

                                        ModalStack.closeTop();
                                        reject(new Error('用户取消文件选择'));
                                    }
                                });

                                // 支持回车触发确定
                                customIdInput.addEventListener('keypress', (e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        okBtn.click();
                                    }
                                });
                            });
                        } catch (err) {
                            console.error('[processInputQueue] 文件选择或保存过程中出错:', err);
                            pending.reject(err);
                            throw err;
                        }

                        // 后续处理（缓存、状态更新等）保持不变
                        pending.resolved = true;
                        pending.result = fileId;
                        pending.resolve(fileId);

                        if (!isReflow) {
                            if (src.endsWith('.last')) {
                                const targetKey = src.slice(0, -5);
                                WORKFLOW_STATE.lastInputCache[targetKey] = fileId;

                            } else if (src !== 'user' && src !== 'before' && src !== 'auto' && !this._isStage(src)) {
                                WORKFLOW_STATE.agentInputCache[src] = fileId;

                            }
                            if (src === 'user') {
                                WORKFLOW_STATE.currentUserInput = fileId;

                            }
                        }

                        WORKFLOW_STATE.awaitingInput = false;
                        WORKFLOW_STATE.pendingInputMode = null;
                        WORKFLOW_STATE.currentWaitingAgent = null;
                        WORKFLOW_STATE.currentWaitingInputIndex = null;
                        WORKFLOW_STATE.inputRejector = null;

                        UI.updateSubmitButtons(null);
                        UI.updateProgress(`✅ 文件保存完成，ID: ${fileId}`);
                        Notify.success('文件已保存', '', { timeOut: 2000 });

                        const textarea = document.getElementById('nc-user-input');
                        if (textarea) {
                            textarea.value = '';
                            WORKFLOW_STATE.userInputCache = '';
                        }

                        AgentStateManager.setState(agentKey, 'running');
                        UI.updateWorkflowAgentStates();

                        await API.sleep(50);
                        continue;
                    } else {
                        // ========== 普通等待用户输入（文本框或章节选择）==========


                        const userInputPromise = new Promise((resolve, reject) => {
                            WORKFLOW_STATE.inputResolver = resolve;
                            WORKFLOW_STATE.inputRejector = reject;
                        });

                        if (mode === 'status' || mode === 'chapter' || mode === 'all') {
                            UI.updateSubmitButtons(mode);
                        } else {
                            UI.updateSubmitButtons('txt');
                        }

                        let userInput;
                        try {
                            userInput = await userInputPromise;
                        } catch (err) {
                            console.error('[processInputQueue] 用户输入被拒绝:', err);
                            pending.reject(err);
                            throw err;
                        }

                        pending.resolved = true;
                        pending.result = userInput;
                        pending.resolve(userInput);

                        UI.updateProgress(`✅ 用户输入已提交，内容长度: ${userInput.length} 字符`);
                        Notify.success('用户输入已接收', '', { timeOut: 2000 });

                        if (!isReflow) {
                            if (src.endsWith('.last')) {
                                const targetKey = src.slice(0, -5);
                                WORKFLOW_STATE.lastInputCache[targetKey] = userInput;
                            } else if (src !== 'user' && src !== 'before' && src !== 'auto' && !this._isStage(src)) {
                                WORKFLOW_STATE.agentInputCache[src] = userInput;
                            }
                            if (src === 'user') {
                                WORKFLOW_STATE.currentUserInput = userInput;
                            }
                        }

                        WORKFLOW_STATE.awaitingInput = false;
                        WORKFLOW_STATE.pendingInputMode = null;
                        WORKFLOW_STATE.currentWaitingAgent = null;
                        WORKFLOW_STATE.currentWaitingInputIndex = null;
                        WORKFLOW_STATE.inputResolver = null;
                        WORKFLOW_STATE.inputRejector = null;

                        UI.updateSubmitButtons(null);

                        const textarea = document.getElementById('nc-user-input');
                        if (textarea) {
                            textarea.value = '';
                            WORKFLOW_STATE.userInputCache = '';
                        }

                        AgentStateManager.setState(agentKey, 'running');
                        UI.updateWorkflowAgentStates();

                        await API.sleep(50);
                        continue;
                    }
                }
            } catch (err) {
                console.error('[Workflow._processInputQueueSequential] 处理队列时发生错误:', err);
                throw err;
            } finally {
                WORKFLOW_STATE.isProcessingInput = false;
                WORKFLOW_STATE.awaitingInput = false;
                WORKFLOW_STATE.inputResolver = null;
                WORKFLOW_STATE.inputRejector = null;
                UI.updateSubmitButtons(null);

            }
        },

        /**
         * 收集 Agent 的所有输入源内容（公共方法）
         * @param {string} agentKey - 当前执行的 Agent 键
         * @param {boolean} isReflow - 是否为回流
         * @param {Object} options - 选项，包含 isParallel, parallelBeforeSnapshot 等
         * @returns {Promise<Array<string>>} 收集到的内容数组，顺序与 agent.inputs 一致
         */
        async _collectInputs(agentKey, isReflow = false, options = {}) {
            const { isParallel = false, parallelBeforeSnapshot = null } = options;
            const agent = CONFIG.AGENTS[agentKey];
            if (!agent) throw new Error(`Agent ${agentKey} 不存在`);

            const collected = [];


            for (let idx = 0; idx < agent.inputs.length; idx++) {
                if (WORKFLOW_STATE.shouldStop) throw new UserInterruptError();

                const src = agent.inputs[idx];
                const mode = agent.inputMode[idx] || 'txt';


                // ---------- 处理 user 源 ----------
                if (src === 'user') {
                    const input = await this.waitForUserInput(mode, agentKey, idx, !isReflow, src);
                    collected.push(this._stripImagePlaceholders(input));
                    continue;
                }

                // ---------- 处理 before 源 ----------
                if (src === 'before') {
                    let content;
                    if (isParallel) {
                        content = parallelBeforeSnapshot?.output || '';
                    } else {
                        content = WORKFLOW_STATE.lastSerialOutput?.output || '';
                    }
                    content = this._stripImagePlaceholders(content);

                    if (content.trim() === '') {
                        content = await this.waitForUserInput('txt', agentKey, idx, !isReflow, src);
                        content = this._stripImagePlaceholders(content);
                    }
                    collected.push(content);
                    continue;
                }

                // ---------- 处理层 ID ----------
                if (this._isStage(src)) {
                    let content = this._collectStageOutput(src);

                    if (content.trim() === '') {
                        content = await this.waitForUserInput('txt', agentKey, idx, !isReflow, src);
                        content = this._stripImagePlaceholders(content);
                    }
                    collected.push(content);
                    continue;
                }

                // ---------- 处理 auto 源 ----------
                if (src === 'auto') {
                    const count = agent.autoConfig[idx];
                    let content = this._collectAutoOutput(count, mode);

                    if (content.trim() === '') {
                        content = await this.waitForUserInput(mode, agentKey, idx, !isReflow, src);
                        content = this._stripImagePlaceholders(content);
                    }
                    collected.push(content);
                    continue;
                }

                // ---------- 处理 read. 文件源 ----------
                if (src.startsWith('read.')) {
                    const fileType = src.substring(5); // 'png', 'txt', 'html', 'js'

                    const fileContent = await this.waitForUserInput('read_' + fileType, agentKey, idx, !isReflow, src);
                    collected.push(fileContent);
                    continue;
                }

                // ---------- 处理 save. 文件源 ----------
                if (src.startsWith('save.')) {
                    const fileType = src.substring(5);

                    const fileId = await this.waitForUserInput('save_' + fileType, agentKey, idx, !isReflow, src);
                    collected.push(fileId);
                    continue;
                }

                // ---------- 处理 id.xxx 源 ----------
                if (src.startsWith('id.')) {
                    const id = src.substring(3);


                    let content;
                    if (id.startsWith('other_')) {

                        const item = await OtherFileStore.get(id);
                        if (!item || !item.text) {
                            console.error(`[_collectInputs][${agentKey}] 其余文件 ${id} 不存在`);
                            throw new Error(`其余文件 ${id} 不存在`);
                        }
                        content = item.text;

                    } else if (id.startsWith('img_')) {

                        const blob = await ImageStore.get(id);
                        if (!blob) {
                            console.error(`[_collectInputs][${agentKey}] 图片 ${id} 不存在`);
                            throw new Error(`图片 ${id} 不存在`);
                        }
                        content = id; // 直接返回 ID 字符串

                    } else if (id.startsWith('audio_')) {

                        const blob = await AudioStore.get(id);
                        if (!blob) {
                            console.error(`[_collectInputs][${agentKey}] 音频 ${id} 不存在`);
                            throw new Error(`音频 ${id} 不存在`);
                        }
                        content = id;

                    } else {
                        // 默认尝试作为其余文件
                        console.warn(`[_collectInputs][${agentKey}] 未知 ID 前缀 ${id}，尝试作为其余文件处理`);
                        const item = await OtherFileStore.get(id);
                        if (!item || !item.text) {
                            console.error(`[_collectInputs][${agentKey}] 资源 ${id} 不存在`);
                            throw new Error(`资源 ${id} 不存在`);
                        }
                        content = item.text;
                    }

                    collected.push(content);
                    continue;
                }

                // ---------- 处理普通 Agent 键（可能带 .last 或 .raw）----------
                let targetKey = src;
                let useLast = false;
                let useRaw = false;

                // 处理 .raw 后缀
                if (targetKey.endsWith('.raw')) {
                    useRaw = true;
                    targetKey = targetKey.slice(0, -4);

                }

                // 处理 .last 后缀
                if (targetKey.endsWith('.last')) {
                    useLast = true;
                    targetKey = targetKey.slice(0, -5);
                }

                let content;

                // ===== 处理 .last 源 =====
                if (useLast) {
                    const isTargetEnabled = WORKFLOW_STATE.enabledAgents.includes(targetKey);
                    if (!isTargetEnabled) {
                        const hasCached = WORKFLOW_STATE.lastInputCache.hasOwnProperty(targetKey);
                        if (!isReflow && hasCached) {
                            content = WORKFLOW_STATE.lastInputCache[targetKey];
                        } else {
                            content = await this.waitForUserInput('txt', agentKey, idx, !isReflow, src);
                            if (!isReflow) {
                                WORKFLOW_STATE.lastInputCache[targetKey] = content;
                            }
                        }
                    } else {
                        const targetAgent = CONFIG.AGENTS[targetKey];
                        const targetRole = targetAgent ? targetAgent.role : null;
                        let memoryFound = false;
                        if (targetRole && targetRole.trim() !== '' && WORKFLOW_STATE.chapterMemory.hasOwnProperty(targetRole)) {
                            content = WORKFLOW_STATE.chapterMemory[targetRole];
                            memoryFound = true;
                        } else if (WORKFLOW_STATE.chapterMemory.hasOwnProperty(targetKey)) {
                            content = WORKFLOW_STATE.chapterMemory[targetKey];
                            memoryFound = true;
                        }
                        if (memoryFound) {
                            // 跨章记忆只存储处理后的输出，不支持原始输出
                            if (useRaw) {
                                console.warn(`[_collectInputs][${agentKey}] 跨章记忆不支持原始输出，使用处理后的输出`);
                                // 仍然使用 content（已处理）
                            } else {
                                content = this._stripImagePlaceholders(content);
                            }
                        } else {
                            const hasCached = WORKFLOW_STATE.lastInputCache.hasOwnProperty(targetKey);
                            if (!isReflow && hasCached) {
                                content = WORKFLOW_STATE.lastInputCache[targetKey];
                            } else {
                                content = await this.waitForUserInput('txt', agentKey, idx, !isReflow, src);
                                if (!isReflow) {
                                    WORKFLOW_STATE.lastInputCache[targetKey] = content;
                                }
                            }
                        }
                    }
                }
                // ===== 处理普通源 =====
                else {
                    const isTargetEnabled = WORKFLOW_STATE.enabledAgents.includes(targetKey);
                    if (!isTargetEnabled) {
                        const hasCached = WORKFLOW_STATE.agentInputCache.hasOwnProperty(targetKey);
                        if (!isReflow && hasCached) {
                            content = WORKFLOW_STATE.agentInputCache[targetKey];
                        } else {
                            content = await this.waitForUserInput('txt', agentKey, idx, !isReflow, src);
                            if (!isReflow) {
                                WORKFLOW_STATE.agentInputCache[targetKey] = content;
                            }
                        }
                    } else {
                        if (useRaw) {
                            content = WORKFLOW_STATE.agentRawOutputs?.[targetKey] || '';

                        } else {
                            content = WORKFLOW_STATE.outputs[targetKey] || '';
                            content = this._stripImagePlaceholders(content);

                        }
                    }
                }

                collected.push(content);
            }

            return collected;
        },

        /**
         * 上传文件到指定平台（仅支持代码中已定义且有明确上传能力的平台）
         * @param {Object} config - API配置对象（包含 source, apiUrl, key 等）
         * @param {Blob} fileBlob - 要上传的文件 Blob
         * @param {string} purpose - 上传目的（如 'assistants', 'file-extract', 'ocr' 等，部分平台忽略）
         * @param {Object} options - 可选参数（如 fileName, mimeType）
         * @param {AbortSignal} signal - 中断信号（可选）
         * @returns {Promise<{fileId: string, fileName?: string}>} 返回远程文件标识（ID 或 URI）
         */
        async _uploadFile(config, fileBlob, purpose = 'assistants', options = {}, signal = null) {
            const { source, apiUrl, key } = config;
            const url = apiUrl.replace(/\/+$/, '');
            const fileName = options.fileName || fileBlob.name || 'uploaded_file';
            const mimeType = options.mimeType || fileBlob.type || 'application/octet-stream';

            const timeout = config.timeout || 3600000;
            const timeoutSignal = AbortSignal.timeout(timeout);
            const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;


            // 定义 OpenAI 兼容平台列表（支持 /files 上传，返回 id）
            const openaiCompatible = [
                'openai', 'deepseek', 'siliconflow', 'qwen', 'glm', 'mistral',
                'groq', 'inference', 'openrouter', '4sapi', 'other'
            ];

            // ---------- 1. OpenAI 兼容平台 ----------
            if (openaiCompatible.includes(source)) {
                const uploadUrl = `${url}/files`;

                const formData = new FormData();
                formData.append('file', fileBlob, fileName);
                formData.append('purpose', purpose);
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}` },
                    body: formData,
                    signal: combinedSignal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`OpenAI 兼容平台文件上传失败 (${response.status}): ${errText}`);
                }
                const data = await response.json();
                if (!data.id) throw new Error('上传响应中无文件 ID');
                return { fileId: data.id, fileName };
            }

            // ---------- 2. Claude ----------
            else if (source === 'claude') {
                const uploadUrl = `${url}/files`;

                const formData = new FormData();
                formData.append('file', fileBlob, fileName);
                formData.append('purpose', purpose);
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'x-api-key': key },
                    body: formData,
                    signal: combinedSignal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Claude 文件上传失败 (${response.status}): ${errText}`);
                }
                const data = await response.json();
                if (!data.id) throw new Error('Claude 响应中无文件 ID');
                return { fileId: data.id, fileName };
            }

            // ---------- 3. Gemini ----------
            else if (source === 'gemini') {
                const uploadUrl = `${url}/upload/v1beta/files?key=${key}`;


                // 构造 multipart/related 请求体
                const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
                const headers = {
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                    'X-Goog-Upload-Protocol': 'multipart',
                };
                const metadata = JSON.stringify({ file: { displayName: fileName } });
                const fileBuffer = await fileBlob.arrayBuffer();
                const encoder = new TextEncoder();
                const crlf = '\r\n';
                const boundaryBytes = encoder.encode(`--${boundary}${crlf}`);
                const metadataPart = encoder.encode(
                    `Content-Type: application/json; charset=UTF-8${crlf}${crlf}${metadata}${crlf}`
                );
                const filePart = encoder.encode(
                    `--${boundary}${crlf}Content-Type: ${mimeType}${crlf}${crlf}`
                );
                const fileEnd = encoder.encode(`${crlf}--${boundary}--${crlf}`);
                const totalLength = boundaryBytes.length + metadataPart.length + filePart.length + fileBuffer.byteLength + fileEnd.length;
                const body = new Uint8Array(totalLength);
                let offset = 0;
                body.set(boundaryBytes, offset); offset += boundaryBytes.length;
                body.set(metadataPart, offset); offset += metadataPart.length;
                body.set(filePart, offset); offset += filePart.length;
                body.set(new Uint8Array(fileBuffer), offset); offset += fileBuffer.byteLength;
                body.set(fileEnd, offset);

                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: headers,
                    body: body,
                    signal: combinedSignal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Gemini 文件上传失败 (${response.status}): ${errText}`);
                }
                const data = await response.json();
                if (!data.file || !data.file.uri) throw new Error('Gemini 响应中无文件 URI');
                return { fileId: data.file.uri, fileName };
            }

            // ---------- 4. 豆包 (Doubao) ----------
            else if (source === 'doubao') {
                const uploadUrl = `${url}/v1/files`;

                const formData = new FormData();
                formData.append('file', fileBlob, fileName);
                if (purpose) formData.append('purpose', purpose);
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}` },
                    body: formData,
                    signal: combinedSignal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`豆包文件上传失败 (${response.status}): ${errText}`);
                }
                const data = await response.json();
                const fileId = data.id || data.file_id;
                if (!fileId) throw new Error('豆包响应中无文件 ID');
                return { fileId, fileName };
            }

            // ---------- 5. 其他平台（如 wenxin, huggingface 等）不支持文件上传 ----------
            else {
                throw new Error(`[Workflow._uploadFile] 平台 ${source} 不支持文件上传功能`);
            }
        },

        _getAudioConfig(mode) {
            const apiConfigs = CONFIG.apiConfigs || {};


            for (const [id, cfg] of Object.entries(apiConfigs)) {
                if (cfg.type === 'audio' && cfg.mode === mode) {

                    return cfg;
                }
            }

            for (const [id, cfg] of Object.entries(apiConfigs)) {
                if (cfg.type === 'audio') {
                    console.warn(`[Workflow._getAudioConfig] 未找到 mode=${mode} 的配置，使用默认音频配置: ${id}`);
                    return cfg;
                }
            }

            console.error(`[Workflow._getAudioConfig] 未找到任何 type 为 "audio" 的配置`);
            throw new Error(`未找到任何 type 为 "audio" 的配置，无法进行音频处理`);
        },

        /**
         * 调用音频 API（新版，接收完整 params 对象）
         * @param {Object} config - 音频 API 配置对象（包含 source, apiUrl, key, model 等）
         * @param {Object} params - 任务参数，包含 prompt 及其他平台特定字段
         * @param {AbortSignal} signal - 中断信号
         * @returns {Promise<Blob>} 生成的音频 Blob
         */
        async _callAudioAPI(config, params, signal) {
            const { mode, source, apiUrl, key } = config;
            const url = apiUrl.replace(/\/+$/, '');


            switch (mode) {
                case 'music-generation':
                    return await this._callMusicGeneration(source, url, key, params, signal);
                case 'voice-cloning':
                    return await this._callVoiceCloning(source, url, key, params, signal);
                case 'audio-editing':
                    return await this._callAudioEditing(source, url, key, params, signal);
                default:
                    throw new Error(`不支持的音频 mode: ${mode}`);
            }
        },

        /**
         * 音乐生成 API 调用
         */
        async _callMusicGeneration(source, url, key, params, signal) {


            if (source === 'elevenlabs') {
                const endpoint = `${url}/music-generations`;
                const body = {
                    text: params.prompt,
                    duration_seconds: params.duration || 30,
                    temperature: params.temperature || 0.8,
                    top_k: params.top_k || 40,
                    ...params
                };

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'xi-api-key': key,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                    signal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`ElevenLabs 音乐生成失败: ${errText}`);
                }
                return await response.blob();
            }

            else if (source === 'stableaudio') {
                const endpoint = `${url}/v2beta/audio/stable-audio-2/text-to-audio`;
                const formData = new FormData();
                formData.append('prompt', params.prompt);
                formData.append('duration', params.duration || 30);
                formData.append('output_format', params.output_format || 'mp3');

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}` },
                    body: formData,
                    signal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Stable Audio 生成失败: ${errText}`);
                }
                return await response.blob();
            }

            else if (source === 'huggingface') {
                const model = params.model || 'facebook/musicgen-small';
                const endpoint = `https://api-inference.huggingface.co/models/${model}`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inputs: params.prompt }),
                    signal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Hugging Face 错误: ${errText}`);
                }
                return await response.blob();
            }

            else if (source === 'minimax' || source === 'minimax-music') {
                // MiniMax 音乐生成
                const groupId = params.group_id || '';
                const headers = {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                };
                const requestBody = {
                    model: params.model || 'music-2.5+',
                    prompt: params.prompt || '',
                    lyrics: params.lyrics || '',
                    audio_setting: {
                        sample_rate: params.sample_rate || 44100,
                        bitrate: params.bitrate || 256000,
                        format: params.format || 'mp3'
                    }
                };

                // 如果有参考音频 ID
                if (params.reference_audio_id) {
                    const audioBlob = await AudioStore.get(params.reference_audio_id);
                    if (audioBlob) {
                        const base64Audio = await this._blobToBase64(audioBlob);
                        requestBody.reference_audio = base64Audio.split(',')[1];
                    }
                }

                const response = await fetch(`${url}/music_generation?GroupId=${groupId}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(requestBody),
                    signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`MiniMax 错误 (${response.status}): ${errText}`);
                }

                const data = await response.json();
                if (data.data && data.data.audio) {
                    const audioBuffer = Buffer.from(data.data.audio, 'hex');
                    return new Blob([audioBuffer], { type: 'audio/mpeg' });
                }
                throw new Error('MiniMax 响应中无音频数据');
            }

            else if (source === 'mureka') {
                const headers = {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                };
                const requestBody = {
                    prompt: params.prompt,
                    lyrics: params.lyrics,
                    model: params.model || 'mureka-v8',
                    duration: params.duration || 120,
                    genre: params.genre || 'pop',
                    mood: params.mood || 'upbeat',
                    vocal: params.vocal !== false,
                    stem_separation: params.stem_separation || false,
                    output_format: params.format || 'mp3'
                };

                if (params.reference_audio_id) {
                    const audioBlob = await AudioStore.get(params.reference_audio_id);
                    if (audioBlob) {
                        const base64Audio = await this._blobToBase64(audioBlob);
                        requestBody.reference_audio = base64Audio;
                    }
                }

                const response = await fetch(`${url}/mureka/music/generate`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(requestBody),
                    signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Mureka 错误 (${response.status}): ${errText}`);
                }

                const data = await response.json();
                if (data.audio_url) {
                    const audioRes = await fetch(data.audio_url, { signal });
                    return await audioRes.blob();
                }
                throw new Error('Mureka 响应中无音频数据');
            }

            else if (source === 'mubert') {
                const customerId = params.customer_id || '';
                const headers = {
                    'customer-id': customerId,
                    'access-token': key,
                    'Content-Type': 'application/json'
                };

                // 获取标签
                const tagsResponse = await fetch(`${url}/api/v3/public/tags`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ text: params.prompt, pat: key }),
                    signal
                });
                if (!tagsResponse.ok) throw new Error(`Mubert 标签获取失败: ${await tagsResponse.text()}`);
                const tagsData = await tagsResponse.json();
                const tags = tagsData.data?.tags?.map(t => t.value) || [];

                // 生成音乐
                const generateBody = {
                    playlist_index: params.playlist_index || '1.0.0',
                    duration: params.duration || 60,
                    bitrate: params.bitrate || 128,
                    format: params.format || 'mp3',
                    intensity: params.intensity || 'medium',
                    mode: params.mode || 'track',
                    tags: tags.slice(0, 3)
                };

                const response = await fetch(`${url}/api/v3/public/tracks`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(generateBody),
                    signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Mubert 生成错误 (${response.status}): ${errText}`);
                }

                const data = await response.json();
                if (data.data?.tasks?.[0]?.download_link) {
                    const audioRes = await fetch(data.data.tasks[0].download_link, { signal });
                    return await audioRes.blob();
                }
                throw new Error('Mubert 响应中无音频数据');
            }

            else if (source === 'aiva') {
                const headers = {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                };
                const requestBody = {
                    style_preset: params.style || 'cinematic',
                    mood: params.mood || 'epic',
                    tempo: params.tempo || 120,
                    key_signature: params.key || 'C',
                    duration: params.duration || 120,
                    instrumentation: params.instrumentation || ['piano', 'strings'],
                    output_format: params.format || 'mp3'
                };

                if (params.influence_audio_id) {
                    const audioBlob = await AudioStore.get(params.influence_audio_id);
                    if (audioBlob) {
                        const base64Audio = await this._blobToBase64(audioBlob);
                        requestBody.influence_track = base64Audio;
                    }
                }

                const response = await fetch(`${url}/compositions`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(requestBody),
                    signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`AIVA 错误 (${response.status}): ${errText}`);
                }

                const data = await response.json();
                if (data.audio_url) {
                    const audioRes = await fetch(data.audio_url, { signal });
                    return await audioRes.blob();
                }
                throw new Error('AIVA 响应中无音频数据');
            }

            else if (source === 'wondera') {
                const headers = {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                };
                const requestBody = {
                    text: params.prompt,
                    genre: params.genre || 'pop',
                    bpm: params.bpm || 120,
                    vocal_gender: params.vocal_gender || 'female',
                    mood: params.mood || 'upbeat',
                    duration: params.duration || 60,
                    format: params.format || 'mp3'
                };

                const response = await fetch(`${url}/generate`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(requestBody),
                    signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Wondera 错误 (${response.status}): ${errText}`);
                }

                const data = await response.json();
                if (data.id) {
                    // 轮询结果
                    const taskId = data.id;
                    const maxAttempts = 30;
                    for (let i = 0; i < maxAttempts; i++) {
                        await this.sleep(2000);
                        const statusRes = await fetch(`${url}/tasks/${taskId}`, {
                            headers: { 'Authorization': `Bearer ${key}` },
                            signal
                        });
                        if (statusRes.ok) {
                            const statusData = await statusRes.json();
                            if (statusData.status === 'completed' && statusData.audio_url) {
                                const audioRes = await fetch(statusData.audio_url, { signal });
                                return await audioRes.blob();
                            }
                        }
                    }
                    throw new Error('Wondera 生成超时');
                }
                throw new Error('Wondera 响应中无任务 ID');
            }

            else if (source === 'riffusion') {
                let endpoint = '/riff';
                let requestBody;

                if (params.topic && !params.prompts) {
                    endpoint = '/topic';
                    requestBody = { topic: params.topic };
                } else {
                    requestBody = {
                        prompts: params.prompts || [{ text: params.prompt || '' }],
                        lyrics: params.lyrics || '',
                        seed: params.seed,
                        variations: params.variations
                    };
                }

                const headers = {
                    'Api-Key': key,
                    'Content-Type': 'application/json'
                };

                const response = await fetch(`${url}${endpoint}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(requestBody),
                    signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Riffusion 错误 (${response.status}): ${errText}`);
                }

                const data = await response.json();
                if (data.audio_b64) {
                    const audioBuffer = Buffer.from(data.audio_b64, 'base64');
                    return new Blob([audioBuffer], { type: 'audio/wav' });
                }
                throw new Error('Riffusion 响应中无音频数据');
            }

            else if (source === 'audiocraft') {
                if (url.includes('replicate.com')) {
                    // Replicate API
                    const headers = {
                        'Authorization': `Token ${key}`,
                        'Content-Type': 'application/json'
                    };
                    const requestBody = {
                        version: "meta/musicgen:7a76a82589b232707230f000aef37f75b5deccf4b5b0e3b5e1e0f2e2e2e2e2e",
                        input: {
                            prompt: params.prompt,
                            model_version: params.model?.replace('facebook/', '') || 'musicgen-large',
                            duration: params.duration || 8,
                            temperature: params.temperature || 1.0,
                            top_k: params.top_k || 250,
                            top_p: params.top_p || 0.0,
                            cfg_coef: params.cfg_scale || 3.0
                        }
                    };

                    if (params.melody_audio_id) {
                        const audioBlob = await AudioStore.get(params.melody_audio_id);
                        if (audioBlob) {
                            const base64Audio = await this._blobToBase64(audioBlob);
                            requestBody.input.input_audio = base64Audio;
                            requestBody.input.continuation = true;
                        }
                    }

                    const response = await fetch(`${url}/predictions`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(requestBody),
                        signal
                    });

                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Replicate 错误 (${response.status}): ${errText}`);
                    }

                    const data = await response.json();
                    const maxAttempts = 60;
                    for (let i = 0; i < maxAttempts; i++) {
                        await this.sleep(2000);
                        const pollRes = await fetch(`${url}/predictions/${data.id}`, {
                            headers: { 'Authorization': `Token ${key}` },
                            signal
                        });
                        if (pollRes.ok) {
                            const pollData = await pollRes.json();
                            if (pollData.status === 'succeeded' && pollData.output) {
                                const audioRes = await fetch(pollData.output, { signal });
                                return await audioRes.blob();
                            } else if (pollData.status === 'failed') {
                                throw new Error('AudioCraft 生成失败');
                            }
                        }
                    }
                    throw new Error('AudioCraft 生成超时');
                } else {
                    // 本地部署
                    const response = await fetch(`${url}/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: params.prompt,
                            duration: params.duration || 10,
                            temperature: params.temperature || 1.0,
                            top_k: params.top_k || 250,
                            top_p: params.top_p || 0.0,
                            cfg_coef: params.cfg_scale || 3.0
                        }),
                        signal
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`本地 AudioCraft 错误: ${errText}`);
                    }
                    return await response.blob();
                }
            }

            else if (source === 'openai-tts') {
                throw new Error('OpenAI TTS 不支持音乐生成，请使用语音克隆模式');
            }

            else if (source === 'azure-tts' || source === 'google-tts') {
                throw new Error(`${source} 不支持音乐生成，请使用语音克隆模式`);
            }

            // 其他未实现平台
            else if (source === 'minimax-speech' || source === 'edge-tts' || source === 'lalal' || source === 'custom') {
                throw new Error(`音乐生成平台 ${source} 不支持音乐生成，请检查配置`);
            }

            else if (source === 'other') {
                // other 平台：用户自定义，直接转发请求，期望返回音频 blob

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(params),
                    signal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`自定义音乐 API 错误: ${errText}`);
                }
                return await response.blob();
            }

            else {
                throw new Error(`不支持的音频平台: ${source}`);
            }
        },

        /**
        * 语音克隆 API 调用
        */
        async _callVoiceCloning(source, url, key, params, signal) {


            if (source === 'elevenlabs') {
                // 步骤1：创建克隆语音（如果未提供 voiceId）
                let voiceId = params.voiceId;
                if (!voiceId && params.audioBlob) {
                    const formData = new FormData();
                    formData.append('name', `voice_${Date.now()}`);
                    formData.append('files', params.audioBlob, 'sample.mp3');
                    formData.append('description', params.description || 'Cloned voice');
                    const cloneRes = await fetch(`${url}/voices/add`, {
                        method: 'POST',
                        headers: { 'xi-api-key': key },
                        body: formData,
                        signal,
                    });
                    if (!cloneRes.ok) throw new Error(`语音克隆失败: ${await cloneRes.text()}`);
                    const cloneData = await cloneRes.json();
                    voiceId = cloneData.voice_id;
                }
                if (!voiceId) throw new Error('无法获取 voiceId');

                // 步骤2：合成语音
                const ttsBody = {
                    text: params.text,
                    model_id: params.model || 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: params.stability ?? 0.5,
                        similarity_boost: params.similarity_boost ?? 0.75,
                        style: params.style ?? 0.3,
                        use_speaker_boost: params.use_speaker_boost ?? true,
                    },
                };

                const ttsRes = await fetch(`${url}/text-to-speech/${voiceId}`, {
                    method: 'POST',
                    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
                    body: JSON.stringify(ttsBody),
                    signal,
                });
                if (!ttsRes.ok) throw new Error(`语音合成失败: ${await ttsRes.text()}`);
                return await ttsRes.blob();
            }

            else if (source === 'minimax' || source === 'minimax-speech') {
                // MiniMax 语音合成（支持克隆）
                const groupId = params.group_id || '';
                let voiceId = params.voice_id;

                // 如果有样本音频，先克隆
                if (params.voice_sample_id && !voiceId) {
                    const sampleBlob = await AudioStore.get(params.voice_sample_id);
                    if (sampleBlob) {
                        const formData = new FormData();
                        formData.append('file', sampleBlob, 'sample.mp3');
                        formData.append('voice_id', `voice_${Date.now()}`);

                        const cloneRes = await fetch(`${url}/voice_clone?GroupId=${groupId}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${key}` },
                            body: formData,
                            signal
                        });
                        if (cloneRes.ok) {
                            const cloneData = await cloneRes.json();
                            voiceId = cloneData.voice_id;
                        }
                    }
                }

                const headers = {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                };
                const requestBody = {
                    model: params.model || 'speech-2.8-hd',
                    text: params.text,
                    voice_id: voiceId || 'male-qn-qingse',
                    speed: params.speed || 1.0,
                    pitch: params.pitch || 0,
                    volume: params.volume || 1.0,
                    emotion: params.emotion || 'neutral',
                    language: params.language || 'zh-CN',
                    audio_format: params.format || 'mp3',
                    sample_rate: params.sample_rate || 32000
                };

                const response = await fetch(`${url}/t2a_v2?GroupId=${groupId}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(requestBody),
                    signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`MiniMax TTS 错误 (${response.status}): ${errText}`);
                }

                const data = await response.json();
                if (data.audio_url) {
                    const audioRes = await fetch(data.audio_url, { signal });
                    return await audioRes.blob();
                }
                throw new Error('MiniMax 响应中无音频数据');
            }

            else if (source === 'azure-tts') {
                if (!params.voiceId) throw new Error('Azure TTS 需要提供 voiceId');
                const region = params.region || 'eastus';
                const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
                const ssml = `<speak version='1.0' xml:lang='${params.lang || 'zh-CN'}'><voice name='${params.voiceId}'>${params.text}</voice></speak>`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Ocp-Apim-Subscription-Key': key,
                        'Content-Type': 'application/ssml+xml',
                        'X-Microsoft-OutputFormat': params.outputFormat || 'audio-16khz-128kbitrate-mono-mp3'
                    },
                    body: ssml,
                    signal
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Azure TTS 错误: ${errText}`);
                }
                return await response.blob();
            }

            else if (source === 'google-tts') {
                if (!params.voiceId) throw new Error('Google TTS 需要提供 voiceId');
                const endpoint = `${url}/text:synthesize?key=${key}`;
                const body = {
                    input: { text: params.text },
                    voice: { languageCode: params.languageCode || 'zh-CN', name: params.voiceId },
                    audioConfig: { audioEncoding: params.audioEncoding || 'MP3' }
                };

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Google TTS 错误: ${errText}`);
                }
                const data = await response.json();
                if (data.audioContent) {
                    const base64 = data.audioContent;
                    return this._base64ToBlob(base64, 'audio/mp3');
                }
                throw new Error('Google TTS 响应中无音频数据');
            }

            else if (source === 'huggingface') {
                const model = params.model || 'facebook/tts_transformer';
                const endpoint = `https://api-inference.huggingface.co/models/${model}`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inputs: params.text }),
                    signal
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Hugging Face 错误: ${errText}`);
                }
                return await response.blob();
            }

            else if (source === 'openai-tts') {
                const endpoint = `${url}/audio/speech`;
                const body = {
                    model: params.model || 'tts-1',
                    input: params.text,
                    voice: params.voiceId || 'alloy',
                    response_format: params.response_format || 'mp3'
                };

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`OpenAI TTS 错误: ${errText}`);
                }
                return await response.blob();
            }

            else if (source === 'edge-tts') {
                const proxyUrl = params.proxy_url || url;
                const voice = params.voiceId || 'zh-CN-XiaoxiaoNeural';
                const rate = params.rate || '+0%';
                const volume = params.volume || '+0%';
                const pitch = params.pitch || '+0Hz';

                const ssml = `
                    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
                        xmlns:mstts="https://www.w3.org/2001/mstts"
                        xml:lang="${voice.split('-')[0]}-${voice.split('-')[1]}">
                        <voice name="${voice}">
                            <prosody rate="${rate}" volume="${volume}" pitch="${pitch}">
                                ${params.text}
                            </prosody>
                        </voice>
                    </speak>
                `;

                const response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/ssml+xml' },
                    body: ssml,
                    signal
                });
                if (!response.ok) throw new Error(`Edge TTS 错误: ${await response.text()}`);
                return await response.blob();
            }

            else if (source === 'lalal' || source === 'riffusion' || source === 'audiocraft' || source === 'mureka' || source === 'mubert' || source === 'aiva' || source === 'wondera' || source === 'minimax-music' || source === 'stableaudio' || source === 'custom') {
                throw new Error(`语音克隆平台 ${source} 不支持语音克隆，请使用 elevenlabs、azure-tts、google-tts 等`);
            }

            else if (source === 'other') {

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(params),
                    signal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`自定义语音克隆 API 错误: ${errText}`);
                }
                return await response.blob();
            }

            else {
                throw new Error(`不支持的音频平台: ${source}`);
            }
        },

        /**
         * 音频编辑 API 调用
         */
        async _callAudioEditing(source, url, key, params, signal) {


            if (source === 'stableaudio') {
                const endpoint = `${url}/v2beta/audio/stable-audio-2/audio-to-audio`;
                const formData = new FormData();
                formData.append('audio_file', params.sourceAudioBlob, 'input.wav');
                formData.append('prompt', params.prompt || '');

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}` },
                    body: formData,
                    signal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Stable Audio 编辑失败: ${errText}`);
                }
                return await response.blob();
            }

            else if (source === 'lalal') {
                // LALAL.AI 音频分离
                if (!params.source_audio_id) throw new Error('LALAL.AI 需要源音频 ID');
                const audioBlob = await AudioStore.get(params.source_audio_id);
                if (!audioBlob) throw new Error(`音频 ${params.source_audio_id} 不存在`);

                const formData = new FormData();
                formData.append('file', audioBlob, 'audio.mp3');
                formData.append('stem', params.stem || 'vocals,drums,bass,other');
                formData.append('noise_reduction', String(params.noise_reduction || false));
                formData.append('enhanced', String(params.enhanced || true));

                const response = await fetch(`${url}/split`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}` },
                    body: formData,
                    signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`LALAL.AI 错误 (${response.status}): ${errText}`);
                }

                const data = await response.json();
                // 返回多个分轨，需要合并？此处简化：只返回第一个分轨
                if (data.result?.stems?.length > 0) {
                    const stemRes = await fetch(data.result.stems[0].url, { signal });
                    return await stemRes.blob();
                }
                throw new Error('LALAL.AI 响应中无音频数据');
            }

            else if (source === 'elevenlabs') {
                throw new Error('ElevenLabs 暂不支持音频编辑');
            }

            else if (source === 'huggingface') {
                throw new Error('Hugging Face 音频编辑请使用 specific 模型并通过 other 自定义');
            }

            else if (source === 'openai-tts' || source === 'azure-tts' || source === 'google-tts') {
                throw new Error(`${source} 不支持音频编辑`);
            }

            else if (source === 'minimax' || source === 'minimax-music' || source === 'minimax-speech' || source === 'mureka' || source === 'mubert' || source === 'aiva' || source === 'wondera' || source === 'edge-tts' || source === 'riffusion' || source === 'audiocraft' || source === 'custom') {
                throw new Error(`音频编辑平台 ${source} 尚未实现，请使用 other 自定义`);
            }

            else if (source === 'other') {

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(params),
                    signal,
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`自定义音频编辑 API 错误: ${errText}`);
                }
                return await response.blob();
            }

            else {
                throw new Error(`不支持的音频平台: ${source}`);
            }
        },

        /**
         * 将 Base64 字符串转换为 Blob
         * @param {string} base64 - Base64 字符串（可包含 data URL 前缀）
         * @param {string} mimeType - MIME 类型
         * @returns {Blob}
         */
        _base64ToBlob(base64, mimeType = 'audio/mpeg') {


            // 移除 data URL 前缀（如果存在）
            let base64Data = base64;
            if (base64.includes(',')) {
                base64Data = base64.split(',')[1];
            }

            try {
                const byteCharacters = atob(base64Data);
                const byteArrays = [];

                for (let offset = 0; offset < byteCharacters.length; offset += 512) {
                    const slice = byteCharacters.slice(offset, offset + 512);

                    const byteNumbers = new Array(slice.length);
                    for (let i = 0; i < slice.length; i++) {
                        byteNumbers[i] = slice.charCodeAt(i);
                    }

                    const byteArray = new Uint8Array(byteNumbers);
                    byteArrays.push(byteArray);
                }

                return new Blob(byteArrays, { type: mimeType });
            } catch (err) {
                console.error('[Workflow._base64ToBlob] 转换失败:', err);
                throw err;
            }
        },

        async stop() {
            if (WORKFLOW_STATE.isRunning && !WORKFLOW_STATE.shouldStop) {
                const confirmed = await UI.showConfirmModal('确定要中断当前创作流程吗？', '确认');
                if (!confirmed) return;
                WORKFLOW_STATE.shouldStop = true;
                // 通知 SillyTavern 停止当前生成
                try {
                    API.stopGeneration();
                } catch (e) {
                    console.error('[Workflow.stop] API.stopGeneration 调用失败:', e);
                }

                // 中止所有图像API请求
                if (WORKFLOW_STATE.abortController) {

                    WORKFLOW_STATE.abortController.abort();
                    WORKFLOW_STATE.abortController = null;
                }

                // 拒绝当前正在等待的输入
                if (WORKFLOW_STATE.inputRejector) {
                    const rejector = WORKFLOW_STATE.inputRejector;
                    WORKFLOW_STATE.inputRejector = null;
                    WORKFLOW_STATE.inputResolver = null;
                    try {
                        rejector(new UserInterruptError());
                    } catch (_) {
                        // rejector 已被调用或 Promise 已解决，忽略重复拒绝
                    }
                }

                // 清理队列中剩余的请求
                const remainingRequests = [...WORKFLOW_STATE.inputRequestQueue];
                WORKFLOW_STATE.inputRequestQueue = [];
                for (const req of remainingRequests) {
                    const pending = WORKFLOW_STATE.pendingInputBySrc[req.src];
                    if (pending && !pending.resolved) {
                        try {
                            pending.reject(new UserInterruptError());
                        } catch (_) {
                            // 已解决的 Promise 拒绝是 no-op，静默忽略
                        }
                    }
                    const reflowPending = WORKFLOW_STATE.currentReflowCache?.[req.src];
                    if (reflowPending && !reflowPending.resolved) {
                        try {
                            reflowPending.reject(new UserInterruptError());
                        } catch (_) {
                            // 已解决的回流 Promise，静默忽略
                        }
                    }
                }

                // 清零输入等待状态
                StateStore.reset('input');

                // 重置Agent状态
                for (const key of Object.keys(CONFIG.AGENTS)) {
                    const state = AgentStateManager.getState(key);
                    if (state === 'running' || state === 'waiting_input' || state === 'reflow_processing' || state === 'reflow_waiting') {
                        AgentStateManager.setState(key, 'error');
                    } else if (state !== 'completed') {
                        AgentStateManager.setState(key, 'idle');
                    }
                }
                UI.updateAllAgentStatusButtons();
                UI.updateSubmitButtons(null);
                UI.updateFloatButtonText();

                // 如果处于数据化模式，退出模式并刷新UI
                if (this.isDataficationMode) {
                    this.isDataficationMode = false;
                    UI.updateWorkflowViz();
                }
            }
        }
    };


    // ╔══════════════════════════════════════════════════════════════════╗
