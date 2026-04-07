    // ║  模块 13：前置检测                                               ║
    // ║  PreCheck — 运行前环境验证（状态书 / 配置 / API 连通性）          ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module PreCheck — 启动前系统检测：角色卡/世界书/API 可用性 */

    // ==================== 前置检测 ====================

    const PreCheck = {
        checkAll: async function () {
            const configLoaded = Object.keys(CONFIG.AGENTS).length > 0;
            const results = {
                configLoaded,
                stateBook: await this.checkStateBook(),
                settingBook: await this.checkSettingBook(),
                agents: null,
                apiStatus: null,
            };

            if (configLoaded) {
                results.agents = await this.checkAgents();
                results.apiStatus = await this.checkAPIConnections();
            } else {
                results.agents = {
                    allExist: false,
                    configNotLoaded: true,
                    error: '请先加载配置文件'
                };
            }

            // 只要存在任何一个API配置不可用，allPassed 即为 false
            let apiAllOk = true;
            if (results.apiStatus) {
                for (const [id, status] of Object.entries(results.apiStatus)) {
                    if (!status.ok) {
                        apiAllOk = false;
                        console.warn(`[PreCheck.checkAll] API ${id} 不可用:`, status.error);
                    }
                }
            }

            results.allPassed = configLoaded && results.agents?.allExist === true && apiAllOk;
            return results;
        },

        checkAPIConnections: async function () {
            const apiConfigs = CONFIG.apiConfigs || {};
            const allConfigIds = Object.keys(apiConfigs);

            const status = {};
            for (const id of allConfigIds) {
                const config = apiConfigs[id];
                const result = await testAPIConnection(config);
                status[id] = {
                    ok: result.ok,
                    error: result.error,
                    lastTest: Date.now(),
                };
            }
            return status;
        },

        async checkStateBook() {
            try {
                const books = await getAllStateBooks(); // 获取所有存在的状态书
                let totalStateEntries = 0;
                let hasAnyStates = false;
                let hasAnyTemplate = false;

                for (const bookName of books) {
                    const book = await API.getWorldbook(bookName);
                    const entries = Array.isArray(book) ? book : (book.entries || []);
                    const stateEntries = entries.filter(e => e?.name?.startsWith(CONFIG.STATE_ENTRY_PREFIX));
                    if (stateEntries.length > 0) {
                        hasAnyStates = true;
                        totalStateEntries += stateEntries.length;
                    }
                    // 检查该状态书是否有对应的模板条目
                    const bookIndex = parseInt(bookName.split('-')[1]);
                    const templateEntry = entries.find(e => e.name === `${CONFIG.STATE_TEMPLATE_PREFIX}${bookIndex}`);
                    if (templateEntry) hasAnyTemplate = true;
                }

                return {
                    exists: books.length > 0,
                    hasStates: hasAnyStates,
                    hasTemplate: hasAnyTemplate,
                    stateCount: totalStateEntries,
                    error: books.length === 0 ? '未找到任何状态书（如 状态书-1、状态书-2 等）' :
                        !hasAnyStates ? '状态书存在但没有状态条目' :
                            !hasAnyTemplate ? '所有状态书均缺少模板条目（状态模板-N）' : null
                };
            } catch (e) {
                return { exists: false, error: `读取状态书失败: ${e.message}` };
            }
        },

        async checkSettingBook() {
            try {
                // 获取当前激活的全局世界书列表
                let globalBooks = [];
                try {
                    if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                        globalBooks = await TavernHelper.getGlobalWorldbookNames();
                    } else if (typeof window.getGlobalWorldbookNames === 'function') {
                        globalBooks = await window.getGlobalWorldbookNames();
                    }
                } catch (e) {
                    console.warn('[PreCheck.checkSettingBook] 获取全局激活列表失败:', e);
                }

                // 检查设定书是否在激活列表中
                if (!globalBooks.includes(CONFIG.SETTING_BOOK_NAME)) {
                    return { exists: false, error: '设定书未激活' };
                }

                // 如果激活，再读取内容
                const book = await API.getWorldbook(CONFIG.SETTING_BOOK_NAME);
                const entries = Array.isArray(book) ? book : (book.entries || []);

                return {
                    exists: entries.length > 0,
                    entryCount: entries.length,
                    error: entries.length === 0 ? '设定书为空' : null
                };
            } catch (e) {
                return { exists: false, error: `读取设定书失败: ${e.message}` };
            }
        },

        async checkAgents() {
            const context = API.getContext();
            const characters = context.characters || [];
            const characterNames = characters.map(c => c?.name || c?.data?.name || '');

            const missingAgents = [];
            const foundAgents = [];

            // 遍历动态加载的 CONFIG.AGENTS
            for (const [, agent] of Object.entries(CONFIG.AGENTS)) {
                const found = characterNames.some(name => name === agent.name);
                if (found) {
                    foundAgents.push(agent.name);
                } else {
                    missingAgents.push(agent.name);
                }
            }

            return {
                allExist: missingAgents.length === 0,
                foundCount: foundAgents.length,
                totalCount: Object.keys(CONFIG.AGENTS).length,
                foundAgents,
                missingAgents,
                error: missingAgents.length > 0 ? `缺少以下Agent角色卡:\n${missingAgents.join('\n')}` : null
            };
        },

        formatErrorMessage: function (results) {
            const errors = [];

            // 状态书
            if (!results.stateBook.exists) {
                errors.push(`📚 状态书: ⚠️ 未找到，系统将在需要时自动创建`);
            } else if (!results.stateBook.hasStates) {
                errors.push(`📚 状态书: ⚠️ 存在但没有状态条目，系统将在需要时自动创建`);
            } else {
                errors.push(`📚 状态书: ✓ 已找到 (${results.stateBook.stateCount}个状态条目)`);
            }

            // 设定书
            if (!results.settingBook.exists) {
                errors.push(`📖 设定书: ⚠️ 未找到（可选）`);
            } else {
                errors.push(`📖 设定书: ✓ 已找到 (${results.settingBook.entryCount}个条目)`);
            }

            // Agent 部分
            if (results.agents) {
                if (results.agents.configNotLoaded) {
                    errors.push(`🤖 Agent配置: 未加载`);
                } else {
                    // 统计每个角色卡名称的出现次数和缺失情况
                    const nameCount = {};
                    const nameMissing = {};
                    const foundSet = new Set(results.agents.foundAgents || []);

                    for (const [key, agent] of Object.entries(CONFIG.AGENTS)) {
                        const name = agent.name;
                        nameCount[name] = (nameCount[name] || 0) + 1;
                        if (!foundSet.has(name)) {
                            nameMissing[name] = (nameMissing[name] || 0) + 1;
                        }
                    }

                    let agentLines = ['🤖 Agent角色卡:'];
                    const uniqueNames = [...new Set(Object.values(CONFIG.AGENTS).map(a => a.name))];
                    for (const name of uniqueNames) {
                        const total = nameCount[name];
                        const missing = nameMissing[name] || 0;
                        const present = total - missing;
                        const status = missing === 0 ? '✓' : '✗';
                        let line = `  ${status} ${name}`;
                        if (total > 1) {
                            line += ` (${present}/${total}个Agent可用)`;
                        }
                        agentLines.push(line);
                    }
                    errors.push(agentLines.join('\n'));
                }
            } else {
                errors.push(`🤖 Agent信息: 无法获取`);
            }

            // API 状态
            if (results.apiStatus) {
                const failedApis = [];
                for (const [id, status] of Object.entries(results.apiStatus)) {
                    if (!status.ok) {
                        const errorMsg = (status.error || '未知错误').replace(/\n/g, ' ');
                        failedApis.push(`  ❌ ${id}: ${errorMsg}`);
                    }
                }
                if (failedApis.length > 0) {
                    errors.push(`🔌 API连通性测试失败：\n${failedApis.join('\n')}`);
                }
            }

            // 最终判断：只要有任何失败，就返回错误信息
            if (results.configLoaded && results.agents?.allExist === true && (!results.apiStatus || Object.values(results.apiStatus).every(s => s.ok))) {
                return null;
            }

            return errors.join('\n');
        }
    };


    // ╔══════════════════════════════════════════════════════════════════╗