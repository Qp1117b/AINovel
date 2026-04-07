    // ║  模块 09：世界书工具                                              ║
    // ║  状态书 / 图库 / 音频库 的读写、解析与更新                        ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module WorldBook — 状态书读写 / 图片音频条目管理 / 状态模板加载 */

    function getInitialStateContent() {
        const timestamp = new Date().toLocaleString('zh-CN');

        return `【状态已重置 - ${timestamp}】\n\n[初始状态：待更新]\n\n本条目由脚本自动维护，请勿手动修改。`;
    }

    /**
     * 获取所有图库书（状态书-图库N）的名称列表
     * @returns {Promise<Array<string>>} 图库书名称数组
     */
    async function getAllImageLibraryBooks() {

        const allBooks = await getAllStateBooks();

        const libraryBooks = allBooks.filter(bookName => bookName.includes('图库'));

        return libraryBooks;
    }

    /**
     * 获取所有图库书的条目合并列表
     * @returns {Promise<Array>} 条目数组，每个元素包含 book, uid, 以及所有元数据
     */
    async function getLibraryEntries() {

        const libraryBooks = await getAllImageLibraryBooks();
        const allEntries = [];

        for (const bookName of libraryBooks) {
            try {
                const book = await API.getWorldbook(bookName);
                const entries = Array.isArray(book) ? book : (book.entries || []);
                const bookIndex = parseInt(bookName.match(/状态书-图库(\d+)/)?.[1]) || 0;

                for (const entry of entries) {
                    // 过滤出图片条目（假设所有条目都是图片，或以特定前缀开头，这里暂不过滤）
                    allEntries.push({
                        book: bookIndex,
                        uid: entry.uid,
                        ...entry // 包含所有字段（key, keysecondary, content, selective, position, order 等）
                    });
                }

            } catch (e) {
                console.error(`[getLibraryEntries] 读取世界书 ${bookName} 失败:`, e);
            }
        }


        return allEntries;
    }

    /**
     * 获取所有音频库书（状态书-音频库N）的名称列表
     * @returns {Promise<Array<string>>}
     */
    async function getAllAudioLibraryBooks() {

        const allBooks = await getAllStateBooks();
        const libraryBooks = allBooks.filter(bookName => bookName.includes('音频库'));

        return libraryBooks;
    }

    /**
     * 获取所有音频库书的条目合并列表
     * @returns {Promise<Array>} 条目数组
     */
    async function getAudioLibraryEntries() {

        const libraryBooks = await getAllAudioLibraryBooks();
        const allEntries = [];

        for (const bookName of libraryBooks) {
            try {
                const book = await API.getWorldbook(bookName);
                const entries = Array.isArray(book) ? book : (book.entries || []);
                const bookIndex = parseInt(bookName.match(/状态书-音频库(\d+)/)?.[1]) || 0;

                for (const entry of entries) {
                    allEntries.push({
                        book: bookIndex,
                        uid: entry.uid,
                        ...entry
                    });
                }

            } catch (e) {
                console.error(`[getAudioLibraryEntries] 读取世界书 ${bookName} 失败:`, e);
            }
        }


        return allEntries;
    }

    // 获取所有存在的状态书名称（按序号递增）
    async function getAllStateBooks() {

        const books = [];

        // 【关键修复】使用 getGlobalWorldbookNames 获取当前激活的世界书
        let globalBooks = [];
        try {
            if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                globalBooks = await TavernHelper.getGlobalWorldbookNames();
            } else if (typeof window.getGlobalWorldbookNames === 'function') {
                globalBooks = await window.getGlobalWorldbookNames();
            }

        } catch (e) {
            console.warn('[DEBUG][getAllStateBooks] 获取全局世界书列表失败:', e);
        }

        // 从全局列表中筛选出状态书
        for (const bookName of globalBooks) {
            if (bookName.startsWith(CONFIG.STATE_BOOK_PREFIX)) {
                const match = bookName.match(/状态书-(\d+)$/);
                if (match) {
                    if (!books.includes(bookName)) {
                        books.push(bookName);
                    }
                }
            }
        }

        // 如果没有从全局列表找到，回退到旧的检测方式
        if (books.length === 0) {

            let index = 1;
            while (index <= CONFIG.MAX_STATE_BOOKS) {
                const bookName = `${CONFIG.STATE_BOOK_PREFIX}${index}`;
                try {
                    const book = await API.getWorldbook(bookName);
                    if (book && (Array.isArray(book) ? book.length : (book.entries && Object.keys(book.entries).length) > 0)) {
                        books.push(bookName);

                    } else {
                        break; // 遇到不存在的状态书即停止
                    }
                } catch (_) {
                    // 读取状态书失败即视为该序号不存在，停止枚举
                    break;
                }
                index++;
            }
        }

        // 按序号排序
        books.sort((a, b) => {
            const matchA = a.match(/状态书-(\d+)$/);
            const matchB = b.match(/状态书-(\d+)$/);
            const numA = matchA ? parseInt(matchA[1]) : 0;
            const numB = matchB ? parseInt(matchB[1]) : 0;
            return numA - numB;
        });


        return books;
    }

    // 加载所有状态书中的状态模板，返回数组 [{ bookIndex, templateContent, categoryMap }]
    async function loadAllStateTemplates() {

        const templates = [];
        let bookIndex = 1;
        while (bookIndex <= CONFIG.MAX_STATE_BOOKS) {
            const bookName = `${CONFIG.STATE_BOOK_PREFIX}${bookIndex}`;

            try {
                const book = await API.getWorldbook(bookName);
                const entries = Array.isArray(book) ? book : (book.entries || []);

                const templateEntry = entries.find(e => e.name === `${CONFIG.STATE_TEMPLATE_PREFIX}${bookIndex}`);
                if (templateEntry) {

                    const content = templateEntry.content;

                    const categoryRegex = /\*\*类别(\d+):([^*]+)\*\*\n([\s\S]*?)(?=\n\*\*类别\d+:|$)/g;
                    const categoryMap = {};
                    const seenCatIds = new Set();
                    let match;
                    while ((match = categoryRegex.exec(content)) !== null) {
                        const id = match[1];
                        const name = match[2].trim();
                        const definition = match[3].trim();
                        if (seenCatIds.has(id)) {
                            console.warn(`[DEBUG][loadAllStateTemplates] ⚠️ 在 ${bookName} 的模板中检测到重复的类别编号 ${id}，可能模板已损坏`);
                        }
                        seenCatIds.add(id);
                        categoryMap[id] = { name, definition };

                    }

                    templates.push({ bookIndex, templateContent: content, categoryMap });
                } else {

                    break;
                }
            } catch (_) {
                // 模板读取失败即视为末尾，停止枚举
                break;
            }
            bookIndex++;
        }

        return templates;
    }

    // 获取所有状态条目的属性配置，返回格式化文本
    async function getAllStateEntriesConfig() {

        const books = await getAllStateBooks();
        let configText = '';
        for (const bookName of books) {
            const book = await API.getWorldbook(bookName);
            const entries = Array.isArray(book) ? book : (book.entries || []);
            // 过滤出状态条目（名称以 STATE_ENTRY_PREFIX 开头）
            const stateEntries = entries.filter(e => e?.name?.startsWith(CONFIG.STATE_ENTRY_PREFIX));
            for (const entry of stateEntries) {
                // 提取关键属性：uid, order, group, selective, probability, position, depth, scanDepth 等
                configText += `【${bookName}】条目：${entry.name}\n`;
                configText += `uid: ${entry.uid}\n`;
                configText += `order: ${entry.order !== undefined ? entry.order : ''}\n`;
                configText += `group: ${entry.group || ''}\n`;
                configText += `selective: ${entry.selective}\n`;
                configText += `probability: ${entry.probability}\n`;
                configText += `position: ${entry.position}\n`;
                configText += `depth: ${entry.depth}\n`;
                configText += `scanDepth: ${entry.scanDepth}\n`;
                configText += `---\n`;
            }
        }
        return configText;
    }

    /**
     * 将扁平配置应用到嵌套格式的世界书条目
     */
    function applyFlatConfigToEntry(entry, flatConfig) {
        if (!flatConfig) return;

        // 字段映射表
        const fieldMappings = [
            { flat: 'enabled', path: 'enabled', transform: v => v === undefined ? entry.enabled : v },
            { flat: 'content', path: 'content', transform: v => v === undefined ? entry.content : v },

            // 触发策略
            {
                flat: 'key',
                path: 'strategy.keys',
                transform: v => typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(s => s) : v
            },
            {
                flat: 'keysecondary',
                path: 'strategy.keys_secondary.keys',
                transform: v => typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(s => s) : v
            },
            {
                flat: 'scanDepth',
                path: 'strategy.scan_depth',
                transform: v => v !== undefined ? v : entry.strategy.scan_depth
            },
            {
                flat: 'scan_depth',
                path: 'strategy.scan_depth',
                transform: v => v !== undefined ? v : entry.strategy.scan_depth
            },

            // 概率（0-100 -> 0-1）
            { flat: 'probability', path: 'probability', transform: v => v !== undefined ? v / 100 : entry.probability },

            // 位置
            {
                flat: 'position', path: 'position.type', transform: v => {
                    if (v === undefined) return entry.position.type;
                    const map = {
                        '0': 'before_character_definition',
                        '1': 'after_character_definition',
                        '2': 'before_example_messages',
                        '3': 'after_example_messages',
                        '4': 'before_author_note',
                        '5': 'after_author_note',
                        '6': 'at_depth',
                        '7': 'at_depth',
                        '8': 'at_depth'
                    };
                    return map[v] || entry.position.type;
                }
            },
            { flat: 'depth', path: 'position.depth', transform: v => v !== undefined ? v : entry.position.depth },
            { flat: 'order', path: 'position.order', transform: v => v !== undefined ? v : entry.position.order },

            // 递归控制
            {
                flat: 'excludeRecursion',
                path: 'recursion.prevent_incoming',
                transform: v => v !== undefined ? v : entry.recursion.prevent_incoming
            },
            {
                flat: 'preventRecursion',
                path: 'recursion.prevent_outgoing',
                transform: v => v !== undefined ? v : entry.recursion.prevent_outgoing
            },
            {
                flat: 'delayUntilRecursion',
                path: 'recursion.delay_until',
                transform: v => v === undefined ? entry.recursion.delay_until : (v === false ? null : v)
            },

            // 效果
            {
                flat: 'sticky',
                path: 'effect.sticky',
                transform: v => v === undefined ? entry.effect.sticky : (v === 0 ? null : v)
            },
            {
                flat: 'cooldown',
                path: 'effect.cooldown',
                transform: v => v === undefined ? entry.effect.cooldown : (v === 0 ? null : v)
            },
            {
                flat: 'delay',
                path: 'effect.delay',
                transform: v => v === undefined ? entry.effect.delay : (v === 0 ? null : v)
            },
        ];

        fieldMappings.forEach(mapping => {
            const value = flatConfig[mapping.flat];
            if (value !== undefined) {
                setNestedValue(entry, mapping.path, mapping.transform(value));
            }
        });

        // 处理 constant/selective/vectorized
        if (flatConfig.constant === true) {
            setNestedValue(entry, 'strategy.type', 'constant');
        } else if (flatConfig.selective === true) {
            setNestedValue(entry, 'strategy.type', 'selective');
        } else if (flatConfig.vectorized === true) {
            setNestedValue(entry, 'strategy.type', 'vectorized');
        }

        // 处理 logic 字符串
        if (flatConfig.logic) {
            const logicMap = {
                'and_any': 'and_any',
                'and_all': 'and_all',
                'not_all': 'not_all',
                'not_any': 'not_any'
            };
            const mappedLogic = logicMap[flatConfig.logic] || 'and_any';
            setNestedValue(entry, 'strategy.keys_secondary.logic', mappedLogic);
        } else if (flatConfig.selectiveLogic !== undefined) {
            const logicArray = ['and_any', 'and_all', 'not_all', 'not_any'];
            const idx = parseInt(flatConfig.selectiveLogic);
            if (idx >= 0 && idx < logicArray.length) {
                setNestedValue(entry, 'strategy.keys_secondary.logic', logicArray[idx]);
            }
        }

        // 根据 position.type 设置 role
        const positionType = getNestedValue(entry, 'position.type');
        if (positionType === 'at_depth') {
            const posFlat = flatConfig.position;
            if (posFlat) {
                const roleMap = { '6': 'system', '7': 'assistant', '8': 'user' };
                const role = roleMap[posFlat] || 'system';
                setNestedValue(entry, 'position.role', role);
            }
        }

        // 处理 characterFilter
        if (flatConfig.characterFilter && typeof flatConfig.characterFilter === 'object') {
            const currentFilter = getNestedValue(entry, 'characterFilter') || { isExclude: false, names: [], tags: [] };
            const newFilter = deepMerge(currentFilter, flatConfig.characterFilter);
            setNestedValue(entry, 'characterFilter', newFilter);
        }

        // 处理其他布尔字段
        const boolFields = [
            'matchPersonaDescription', 'matchCharacterDescription', 'matchCharacterPersonality',
            'matchCharacterDepthPrompt', 'matchScenario', 'matchCreatorNotes', 'ignoreBudget', 'addMemo'
        ];
        boolFields.forEach(field => {
            if (flatConfig[field] !== undefined) {
                setNestedValue(entry, field, flatConfig[field]);
            }
        });

        // 处理 automation_id
        if (flatConfig.automation_id !== undefined) {
            setNestedValue(entry, 'automation_id', flatConfig.automation_id);
        }
    }

    /**
     * 获取默认的嵌套格式世界书条目
     */
    function getDefaultWorldbookEntry(definition) {
        return {
            name: definition ? definition.slice(0, 20) : '新条目',
            content: definition,
            enabled: true,
            strategy: {
                type: 'selective',
                keys: [],
                keys_secondary: {
                    logic: 'and_any',
                    keys: []
                },
                scan_depth: 4
            },
            position: {
                type: 'after_character_definition',
                role: 'system',
                depth: 0,
                order: 0
            },
            probability: 1.0,
            recursion: {
                prevent_incoming: false,
                prevent_outgoing: false,
                delay_until: null
            },
            effect: {
                sticky: null,
                cooldown: null,
                delay: null
            },
            characterFilter: {
                isExclude: false,
                names: [],
                tags: []
            },
            matchPersonaDescription: false,
            matchCharacterDescription: false,
            matchCharacterPersonality: false,
            matchCharacterDepthPrompt: false,
            matchScenario: false,
            matchCreatorNotes: false,
            ignoreBudget: false,
            addMemo: true,
            automation_id: ''
        };
    }

    // ==================== parseOptimizerOutput ====================

    function parseOptimizerOutput(output) {

        const actions = [];
        const lines = output.split('\n');
        let currentAction = null;
        let contentLines = [];
        let configLines = [];

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const trimmedLine = rawLine.trim();

            if (trimmedLine.startsWith('---需调整的状态模板---')) {

                continue;
            }

            const startMatch = trimmedLine.match(/^(\d+)-(\d+)[：:]?(.*)$/);
            if (startMatch && startMatch[1] && startMatch[2]) {
                // 保存上一个动作
                if (currentAction) {
                    if (contentLines.join('\n').trim() === 'delete') {
                        currentAction.config = '';
                        currentAction.rawConfig = {};
                        currentAction.convertedConfig = {};

                    } else if (configLines.length > 0) {
                        currentAction.config = configLines.join('；');
                        currentAction.rawConfig = parseConfigLine(currentAction.config);
                        currentAction.convertedConfig = convertArrayValues(currentAction.rawConfig);

                    } else {
                        currentAction.config = '';
                        currentAction.rawConfig = {};
                        currentAction.convertedConfig = {};

                    }
                    currentAction.content = contentLines.join('\n');

                    actions.push(currentAction);
                }

                // 开始新动作
                const bookIndex = parseInt(startMatch[1]);
                const uid = parseInt(startMatch[2]);
                const contentStart = startMatch[3] ? startMatch[3].trim() : '';


                currentAction = {
                    bookIndex,
                    uid,
                    content: '',
                    config: '',
                    rawConfig: {},
                    convertedConfig: {}
                };
                contentLines = contentStart ? [contentStart] : [];
                configLines = [];

            } else if (currentAction) {
                // 如果当前动作内容已确定为 'delete'，则后续所有行都忽略
                const currentContent = contentLines.join('\n').trim();
                if (currentContent === 'delete') {
                    continue;
                }

                const isConfigLine = !trimmedLine.startsWith('-') &&
                    !trimmedLine.startsWith('*') &&
                    trimmedLine.length > 0 &&
                    (trimmedLine.includes(':') || trimmedLine.includes('：'));

                if (isConfigLine) {
                    const parsed = parseConfigLine(rawLine);
                    if (parsed && Object.keys(parsed).length > 0) {
                        configLines.push(rawLine);

                    } else {
                        contentLines.push(rawLine);

                    }
                } else {
                    contentLines.push(rawLine);
                }
            }
        }

        // 处理最后一个动作
        if (currentAction) {
            const finalContent = contentLines.join('\n').trim();
            if (finalContent === 'delete') {
                currentAction.config = '';
                currentAction.rawConfig = {};
                currentAction.convertedConfig = {};

            } else if (configLines.length > 0) {
                currentAction.config = configLines.join('；');
                currentAction.rawConfig = parseConfigLine(currentAction.config);
                currentAction.convertedConfig = convertArrayValues(currentAction.rawConfig);

            } else {
                currentAction.config = '';
                currentAction.rawConfig = {};
                currentAction.convertedConfig = {};

            }
            currentAction.content = contentLines.join('\n');

            actions.push(currentAction);
        }


        return actions;
    }

    async function updateStateBooksFromOptimizerOutput(actions) {

        // --- 获取当前状态书列表（用于创建缺失书）---
        let stateBooks = await getAllStateBooks();
        let currentBookCount = stateBooks.length;
        UI.updateProgress(`  当前状态书: ${stateBooks.join(', ') || '无'} (共 ${currentBookCount} 本)`);

        // 收集需要创建的状态书
        const booksToCreate = new Set();
        for (const action of actions) {
            const bookIndex = Number(action.bookIndex);
            if (bookIndex > currentBookCount && bookIndex <= CONFIG.MAX_STATE_BOOKS) {
                booksToCreate.add(bookIndex);
            }
        }

        // 创建缺失的状态书
        for (const bookIndex of booksToCreate) {
            const bookName = `${CONFIG.STATE_BOOK_PREFIX}${bookIndex}`;
            try {
                const result = await createAndActivateStateBook(bookName);
                if (result && result.success) {
                    UI.updateProgress(`  ✅ 状态书 ${bookName} 创建并激活成功`);
                } else {
                    UI.updateProgress(`  ⚠️ 状态书 ${bookName} 创建可能未成功`, true);
                }
            } catch (e) {
                UI.updateProgress(`  ❌ 处理 ${bookName} 时发生异常: ${e.message}`, true);
            }
        }

        // 重新获取状态书列表
        stateBooks = await getAllStateBooks();
        currentBookCount = stateBooks.length;
        UI.updateProgress(`  更新后状态书: ${stateBooks.join(', ') || '无'} (共 ${currentBookCount} 本)`);
        const availableBooksSet = new Set(stateBooks);

        // ==================== 第一步：将动作按书号分类 ====================
        const actionsByBook = {};
        for (const action of actions) {
            const bookIndex = action.bookIndex;
            const bookName = `${CONFIG.STATE_BOOK_PREFIX}${bookIndex}`;

            if (bookIndex > CONFIG.MAX_STATE_BOOKS) {
                UI.updateProgress(`⚠️ 动作指定的状态书序号 ${bookIndex} 超过最大限制，已跳过`, true);
                continue;
            }
            if (!availableBooksSet.has(bookName)) {
                UI.updateProgress(`⚠️ 状态书 ${bookName} 不存在，跳过该动作`, true);
                continue;
            }

            if (!actionsByBook[bookName]) {
                actionsByBook[bookName] = { create: [], update: [], delete: [] };
            }

            if (action.content.trim() === 'delete') {
                actionsByBook[bookName].delete.push(action);
            } else {
                // 判断是更新还是创建需要知道当前是否存在该 uid，但我们稍后会统一处理，先暂存
                actionsByBook[bookName][action.uid ? 'update' : 'create'].push(action);
            }
        }

        // ==================== 第二步：按书号依次处理 ====================
        for (const bookName in actionsByBook) {
            const bookActions = actionsByBook[bookName];


            // 读取当前世界书一次（获取最新数据）
            let book = await API.getWorldbook(bookName);
            let entries = Array.isArray(book) ? book : (book.entries || []);
            let modified = false; // 标记是否有修改

            // 先处理删除（从 entries 中移除）
            for (const action of bookActions.delete) {
                const index = entries.findIndex(e => e.uid === action.uid);
                if (index !== -1) {
                    entries.splice(index, 1);
                    modified = true;
                    UI.updateProgress(`  → 已从 ${bookName} 中删除 uid=${action.uid}`);
                } else {
                    UI.updateProgress(`  ⚠️ ${bookName} 中未找到 uid=${action.uid}，跳过删除`, true);
                }
            }

            // 合并更新和创建动作（统一处理）
            const upsertActions = [...bookActions.update, ...bookActions.create];
            for (const action of upsertActions) {
                const parsed = parseCategoryFromContent(action.content, action.uid);
                if (!parsed) {
                    UI.updateProgress(`  ⚠️ 无法解析类别定义，跳过动作: ${action.content.substring(0, 30)}...`, true);
                    continue;
                }

                const { catId, catName, definition } = parsed;
                let config = action.convertedConfig || {};
                delete config.uid;
                delete config.id;
                delete config.name;

                const entryName = `状态-${bookName.split('-')[1]}-${catId.padStart(2, '0')}-${catName}`;

                // ==================== 处理模板条目（累积更新）====================
                const bookIndex = parseInt(bookName.split('-')[1]);
                const templateEntryName = `${CONFIG.STATE_TEMPLATE_PREFIX}${bookIndex}`;
                let templateEntry = entries.find(e => e.name === templateEntryName);
                let templateContent = templateEntry ? templateEntry.content : '';

                // 解析现有模板（使用改进后的正则，确保匹配所有类别）
                const existingCategories = new Map();
                const categoryRegex = /(?:^|\n)\s*\*\*类别(\d+):([^*]+)\*\*\s*\r?\n([\s\S]*?)(?=\r?\n\s*\*\*类别\d+\s*:|$)/g;
                let match;
                while ((match = categoryRegex.exec(templateContent)) !== null) {
                    const existingCatId = match[1];
                    const fullDefinition = match[0].trim();
                    existingCategories.set(existingCatId, fullDefinition);
                }


                // 添加或替换当前类别
                existingCategories.set(catId, definition);

                // 重新构建模板内容（按编号排序）
                const newTemplateContent = buildTemplateContentFromCategories(existingCategories);

                if (newTemplateContent !== templateContent) {
                    if (templateEntry) {
                        templateEntry.content = newTemplateContent;
                    } else {
                        // 创建新模板条目
                        const defaultTemplateEntry = {
                            uid: 9999,
                            name: templateEntryName,
                            content: newTemplateContent,
                            enabled: true,
                            strategy: {
                                type: 'selective',
                                keys: [],
                                keys_secondary: { logic: 'and_any', keys: [] },
                                scan_depth: 0
                            },
                            position: { type: 'before_character_definition', role: 'system', depth: 0, order: 0 },
                            probability: 1.0,
                            recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
                            effect: { sticky: null, cooldown: null, delay: null },
                            characterFilter: { isExclude: false, names: [], tags: [] },
                            matchPersonaDescription: false,
                            matchCharacterDescription: false,
                            matchCharacterPersonality: false,
                            matchCharacterDepthPrompt: false,
                            matchScenario: false,
                            matchCreatorNotes: false,
                            ignoreBudget: false,
                            addMemo: true,
                            automation_id: ''
                        };
                        entries.push(defaultTemplateEntry);
                        templateEntry = defaultTemplateEntry;
                    }
                    modified = true;

                }

                // ==================== 处理状态条目 ====================
                const existingIndex = entries.findIndex(e => e.uid === action.uid);
                if (existingIndex !== -1) {
                    // 更新
                    let targetEntry = entries[existingIndex];
                    if (targetEntry.name !== entryName) {
                        targetEntry.name = entryName;
                    }
                    applyFlatConfigToEntry(targetEntry, config);
                    targetEntry.content = definition; // 状态条目的内容也用优化师提供的定义（字段占位符）
                    entries[existingIndex] = targetEntry;
                } else {
                    // 创建
                    let newEntry = getDefaultWorldbookEntry(definition);
                    newEntry.uid = action.uid;
                    newEntry.name = entryName;
                    applyFlatConfigToEntry(newEntry, config);
                    entries.push(newEntry);
                }
                modified = true;
            }

            // 如果这本书有任何修改，统一保存
            if (modified) {

                await API.updateWorldbook(bookName, () => entries, { render: 'immediate' });
                UI.updateProgress(`  ✅ ${bookName} 已更新`);
            } else {

            }
        }
    }

    async function updateWorldState(bookName, data) {

        const successIds = [];
        const errorIds = [];
        const bookIndex = parseInt(bookName.split('-')[1]); // 从 "状态书-1" 提取 1

        await API.updateWorldbook(bookName, (worldbook) => {
            const entries = Array.isArray(worldbook) ? [...worldbook] : [...(worldbook.entries || [])];

            for (const [catId, catData] of Object.entries(data)) {
                // 条目名称格式：状态-{书号}-{类别编号}-{类别名}
                const entryName = `状态-${bookIndex}-${catId.padStart(2, '0')}-${catData.name}`;
                const entryIndex = entries.findIndex(e => e?.name === entryName);

                // 直接使用协议中的字段内容，它已包含完整的字段列表（含缩进）
                const content = catData.content;

                if (content && content.trim().length > 0) {
                    if (entryIndex !== -1) {
                        entries[entryIndex].content = content;
                    } else {
                        entries.push({
                            uid: Date.now() + parseInt(catId) * 1000,
                            name: entryName,
                            content: content,
                            enabled: true
                        });
                    }
                    successIds.push(`类别${catId}`);
                } else {
                    errorIds.push(`类别${catId}`);
                }
            }

            return Array.isArray(worldbook) ? entries : { ...worldbook, entries, settings: worldbook.settings || {} };
        }, { render: 'immediate' });

        return { successIds, errorIds };
    }

    // ==================== 清空状态书 ====================

    async function resetWorldStateToInitial() {

        UI.updateProgress('开始按模板重置所有状态书...');
        const books = await getAllStateBooks();
        if (books.length === 0) {
            UI.updateProgress('没有状态书需要重置');
            return true;
        }

        for (const bookName of books) {
            const bookIndex = parseInt(bookName.split('-')[1]);
            const book = await API.getWorldbook(bookName);
            const entries = Array.isArray(book) ? book : (book.entries || []);

            // 获取该状态书中的模板条目
            const templateEntryName = `${CONFIG.STATE_TEMPLATE_PREFIX}${bookIndex}`;
            const templateEntry = entries.find(e => e.name === templateEntryName);
            let categoryMap = {};
            if (templateEntry) {
                // 解析模板内容，构建类别ID -> 定义的映射
                const content = templateEntry.content;
                const categoryRegex = /\*\*类别(\d+):([^*]+)\*\*\n([\s\S]*?)(?=\n\*\*类别\d+:|$)/g;
                let match;
                while ((match = categoryRegex.exec(content)) !== null) {
                    const catId = match[1];
                    categoryMap[catId] = match[3].trim();
                }
            }

            // 过滤出所有状态条目
            const stateEntries = entries.filter(e => e?.name?.startsWith(CONFIG.STATE_ENTRY_PREFIX));

            // 为每个状态条目重新生成内容
            for (const entry of stateEntries) {
                // 尝试从条目名称中提取类别ID（格式：状态-{bookIndex}-{catId}-{catName}）
                const nameMatch = entry.name.match(new RegExp(`^状态-${bookIndex}-(\\d+)-`));
                const catId = nameMatch ? nameMatch[1] : null;
                let newContent;

                if (catId && categoryMap[catId]) {
                    // 有模板定义，使用模板定义作为基础，但保留字段值为空（或可自定义）
                    // 这里简单使用模板定义，也可根据需要清空具体字段值
                    newContent = categoryMap[catId];
                } else {
                    // 无模板或类别ID无法提取，使用默认初始内容
                    newContent = getInitialStateContent();
                }

                entry.content = newContent;
            }

            // 保存更新后的世界书
            await API.updateWorldbook(bookName, () => entries, { render: 'immediate' });
            UI.updateProgress(`  ✅ 已重置 ${bookName} (${stateEntries.length} 个条目)`);
        }

        UI.updateProgress('✅ 所有状态书重置完成');
        return true;
    }

    // ==================== 创建并激活状态书的辅助函数 ====================

    async function createAndActivateStateBook(bookName) {

        UI.updateProgress(`  创建状态书: ${bookName}...`);

        // 1. 创建世界书
        try {
            if (typeof TavernHelper?.createWorldbook === 'function') {

                await TavernHelper.createWorldbook(bookName);
            } else if (typeof window.createWorldbook === 'function') {

                await window.createWorldbook(bookName);
            } else {
                throw new Error('createWorldbook API 不可用');
            }
            UI.updateProgress(`  ✅ 已创建 ${bookName}`);

        } catch (e) {
            console.error(`[DEBUG][createAndActivateStateBook] 创建世界书失败: ${e.message}`, e);
            throw new Error(`创建失败: ${e.message}`);
        }

        // 2. 等待确保创建完成

        await API.sleep(300);

        // 3. 获取当前已激活的全局世界书（创建前）
        let originalGlobalBooks = [];
        try {
            if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {

                originalGlobalBooks = await TavernHelper.getGlobalWorldbookNames();
            } else if (typeof window.getGlobalWorldbookNames === 'function') {

                originalGlobalBooks = await window.getGlobalWorldbookNames();
            }

        } catch (e) {
            UI.updateProgress(`  ⚠️ 获取当前全局世界书失败: ${e.message}`, true);
            console.warn(`[DEBUG][createAndActivateStateBook] 获取全局世界书列表失败: ${e.message}`);
        }

        // 4. 激活世界书 - 保留原有世界书并添加新书
        UI.updateProgress(`  正在激活 ${bookName}...`);
        try {
            // 将新书添加到原有列表中（如果不存在）
            const newGlobalBooks = [...new Set([...originalGlobalBooks, bookName])];


            if (typeof TavernHelper?.rebindGlobalWorldbooks === 'function') {

                await TavernHelper.rebindGlobalWorldbooks(newGlobalBooks);
            } else if (typeof window.rebindGlobalWorldbooks === 'function') {

                await window.rebindGlobalWorldbooks(newGlobalBooks);
            } else {
                throw new Error('rebindGlobalWorldbooks API 不可用');
            }

            // 等待后重新获取全局世界书列表，验证激活是否成功
            await API.sleep(500);
            let updatedGlobalBooks = [];
            try {
                if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                    updatedGlobalBooks = await TavernHelper.getGlobalWorldbookNames();
                } else if (typeof window.getGlobalWorldbookNames === 'function') {
                    updatedGlobalBooks = await window.getGlobalWorldbookNames();
                }
            } catch (e) {
                UI.updateProgress(`  ⚠️ 验证激活状态失败: ${e.message}`, true);
                console.warn(`[DEBUG][createAndActivateStateBook] 验证激活状态失败: ${e.message}`);
            }


            // 检查新书是否在激活列表中
            const isActivated = updatedGlobalBooks.includes(bookName);
            if (isActivated) {
                UI.updateProgress(`  ✅ 已激活 ${bookName}`);

            } else {
                UI.updateProgress(`  ⚠️ ${bookName} 可能未成功激活`, true);
                console.warn(`[DEBUG][createAndActivateStateBook] 状态书 ${bookName} 未出现在激活列表中`);
            }

            // 返回更新后的全局世界书列表，供上层函数使用
            return { success: true, globalBooks: updatedGlobalBooks };
        } catch (e) {
            UI.updateProgress(`  ❌ 激活失败: ${e.message}`, true);
            console.error(`[DEBUG][createAndActivateStateBook] 激活世界书失败: ${e.message}`, e);
            throw e;
        }
    }


    // ╔══════════════════════════════════════════════════════════════════╗