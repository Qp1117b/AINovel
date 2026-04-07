    // ║  模块 07：存储层                                                 ║
    // ║  Storage — 内存缓存 + IndexedDB 写入队列                         ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module Storage — 章节/设置/选择状态的 localStorage 持久化 */

    // ==================== 存储管理 ====================

    const Storage = {
        _writeQueue: Promise.resolve(),

        /**
         * 初始化：从 IndexedDB 加载数据到内存缓存 HISTORY_CACHE
         * 必须在任何读写操作前调用，并等待完成
         */
        async init() {

            try {
                const data = await loadFromIndexedDB();
                HISTORY_CACHE = {
                    chapters: data.chapters || [],
                    lastUpdate: Date.now()
                };

            } catch (e) {
                console.error('[Storage] 初始化失败，使用空缓存', e);
                HISTORY_CACHE = { chapters: [], lastUpdate: Date.now() };
            }
        },

        /**
         * 同步保存数据（更新内存缓存并通过队列异步写入 IndexedDB）（增强版）
         */
        save(data) {

            if (!data || !Array.isArray(data.chapters)) {
                console.warn('[Storage.save] 收到无效数据，保存失败', data);
                return false;
            }
            // 更新内存缓存
            HISTORY_CACHE.chapters = data.chapters.sort((a, b) => a.num - b.num);
            HISTORY_CACHE.lastUpdate = Date.now();


            // 将写入操作加入队列（async/await 风格）
            this._writeQueue = this._writeQueue.then(async () => {
                try {
                    await saveToIndexedDB({ chapters: HISTORY_CACHE.chapters });
                } catch (err) {
                    console.error('[Storage.save] 异步写入 IndexedDB 失败:', err);
                    Notify.error('章节数据保存失败，请检查浏览器存储权限。若持续失败，请导出备份后刷新页面。');
                }
            }).catch(err => {
                console.error('[Storage.save] 写入队列处理出错:', err);
            });

            return true;
        },

        /**
         * 加载章节列表（同步返回内存缓存）
         */
        loadChapters() {

            return [...(HISTORY_CACHE.chapters || [])].sort((a, b) => a.num - b.num);
        },

        /**
         * 构建章节的紧凑路径（供 sourcePath 存储使用）
         * @param {number} num - 章节号
         * @param {Array} chapters - 所有章节数组
         * @returns {string|null} 路径字符串，如 "3" 或 "1#1#2"
         */
        _buildChapterPath(num, chapters) {


            const chapter = chapters.find(c => c.num === num);
            if (!chapter) {
                console.warn(`[Storage._buildChapterPath] 章节 ${num} 不存在，返回 null`);
                return null;
            }

            // 构建章节映射和子节点映射
            const chapterMap = {};
            const childrenMap = {};
            chapters.forEach(ch => {
                chapterMap[ch.num] = ch;
                const p = ch.parent;
                if (p !== null && p !== undefined) {
                    if (!childrenMap[p]) childrenMap[p] = [];
                    childrenMap[p].push(ch);
                }
            });

            // 对每个父节点的子节点按章节号排序（确保顺序稳定）
            for (const p in childrenMap) {
                childrenMap[p].sort((a, b) => a.num - b.num);

            }

            // 向上回溯，收集每一步的选择序号（从目标节点到根的方向）
            const segments = [];
            let currentNum = num;
            let current = chapter;


            while (current.parent !== null && current.parent !== undefined) {
                const parentNum = current.parent;
                const parent = chapterMap[parentNum];
                if (!parent) {
                    console.warn(`[Storage._buildChapterPath] 父节点 ${parentNum} 不存在，终止回溯`);
                    break;
                }

                const siblings = childrenMap[parentNum] || [];
                if (!siblings.length) {
                    console.warn(`[Storage._buildChapterPath] 父节点 ${parentNum} 的子节点列表为空，终止回溯`);
                    break;
                }

                const index = siblings.findIndex(c => c.num === currentNum) + 1;
                if (index === 0) {
                    console.warn(`[Storage._buildChapterPath] 在父节点 ${parentNum} 的子节点中未找到当前节点 ${currentNum}`);
                    break;
                }


                segments.push(index);

                currentNum = parentNum;
                current = parent;

            }

            const rootNum = currentNum;


            // 反转得到从根到目标的顺序
            const pathSegments = segments.reverse();


            // 构建路径
            let path = String(rootNum);
            for (const idx of pathSegments) {
                path += '#'.repeat(idx) + idx;
            }


            return path;
        },

        /**
         * 保存单章（更新内存缓存并通过队列异步写入 IndexedDB）（增强版）
         */
        saveChapter(chapterData, chapterNum, snapshot, parentNum, interactionResult) {

            const chapters = [...(HISTORY_CACHE.chapters || [])];
            const timestamp = new Date().toLocaleString('zh-CN');

            // 直接使用传入的 content，不自动添加标题行
            const content = chapterData.content || '无';

            let sourcePath = null;
            if (parentNum) {
                sourcePath = this._buildChapterPath(parentNum, chapters);
            } else {
                // 无父章节，默认为 "1"（第一章的路径）
                sourcePath = "1";
            }


            const entry = {
                num: chapterNum,
                parent: parentNum || null,
                sourcePath: sourcePath,                // 新增：来源路径
                interactionResult: interactionResult || null, // 新增：互动结果
                title: chapterData.title || `第${chapterNum}章`,
                content,
                snapshot,
                timestamp,
                size: content.length
            };

            // 合并其他自定义属性（如 interactive 标志等）
            for (const key in chapterData) {
                if (!['title', 'content'].includes(key)) {
                    entry[key] = chapterData[key];
                }
            }

            const idx = chapters.findIndex(c => c.num === chapterNum);
            if (idx !== -1) chapters[idx] = entry;
            else chapters.push(entry);
            chapters.sort((a, b) => a.num - b.num);

            HISTORY_CACHE.chapters = chapters;
            HISTORY_CACHE.lastUpdate = Date.now();


            if (WORKFLOW_STATE.enforceUniqueBranches && parentNum && interactionResult) {
                this._writeQueue = this._writeQueue.then(async () => {
                    try {
                        await MappingManager.recordMapping(parentNum, interactionResult, chapterNum);
                    } catch (e) {
                        console.error('[Storage.saveChapter] 记录映射失败', e);
                        Notify.error(`分支映射保存失败: ${e.message}，但章节已保存，请稍后手动处理。`);
                    }
                });
            }

            this._writeQueue = this._writeQueue.then(async () => {
                try {
                    await saveToIndexedDB({ chapters: HISTORY_CACHE.chapters });
                } catch (err) {
                    console.error('[Storage.saveChapter] 异步写入 IndexedDB 失败:', err);
                    Notify.error('章节数据保存失败，请检查浏览器存储权限');
                }
            }).catch(err => {
                console.error('[Storage.saveChapter] 写入队列处理出错:', err);
            });

            return true;
        },

        /**
         * 清空所有章节（增强版）
         */
        clear() {

            HISTORY_CACHE.chapters = [];
            HISTORY_CACHE.lastUpdate = Date.now();


            this._writeQueue = this._writeQueue.then(async () => {
                try {
                    await saveToIndexedDB({ chapters: [] });
                } catch (err) {
                    console.error('[Storage.clear] 写入 IndexedDB 失败:', err);
                    Notify.error('清空章节失败');
                }
            }).catch(err => {
                console.error('[Storage.clear] 写入队列处理出错:', err);
            });
            return true;
        },

        // 以下方法保持不变，仅作示意
        loadSettings() {
            try {
                return JSON.parse(localStorage.getItem(CONFIG.SETTINGS_KEY) || '{"profile":"standard"}');
            } catch (_) {
                return { profile: 'standard' };
            }
        },

        saveSettings(settings) {
            try {
                localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(settings));
                return true;
            } catch (_) {
                return false;
            }
        },

        saveCustomAgents(agents) {
            const settings = this.loadSettings();
            settings.customAgents = agents;
            return this.saveSettings(settings);
        },

        loadCustomAgents() {
            const settings = this.loadSettings();
            return settings.customAgents || [];
        },

        saveSelectionState(state) {
            const settings = this.loadSettings();
            settings.selectionState = state;
            return this.saveSettings(settings);
        },

        loadSelectionState() {
            const settings = this.loadSettings();
            const saved = settings.selectionState || {};
            if (CONFIG.categories) {
                const filtered = {};
                Object.keys(CONFIG.categories).forEach(cat => {
                    filtered[cat] = saved[cat] || null;
                });
                return filtered;
            }
            return saved;
        },

        saveTokenStats(stats) {
            try {
                localStorage.setItem(CONFIG.TOKEN_STATS_KEY, JSON.stringify(stats));
            } catch (_) {
                // localStorage 不可用（隐私模式/配额满）时静默忽略，token 统计不影响主流程
            }
        },

        loadAutoMode() {
            const settings = this.loadSettings();
            return settings.autoMode || false;
        },

        async listGalgameProjects() {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction('galProjects', 'readonly');
                const store = transaction.objectStore('galProjects');
                const request = store.getAll();
                request.onsuccess = () => {
                    const projects = request.result.map(item => ({
                        id: item.id,
                        name: item.data.name,
                        thumbnail: item.data.thumbnail,
                        updatedAt: item.data.updatedAt
                    }));
                    resolve(projects);
                };
                request.onerror = () => reject(request.error);
                transaction.oncomplete = () => db.close();
            });
        },

        async loadGalgameProject(id) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction('galProjects', 'readonly');
                const store = transaction.objectStore('galProjects');
                const request = store.get(id);
                request.onsuccess = () => {
                    if (request.result) resolve(request.result.data);
                    else resolve(null);
                };
                request.onerror = () => reject(request.error);
                transaction.oncomplete = () => db.close();
            });
        },

        async saveGalgameProject(id, data) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction('galProjects', 'readwrite');
                const store = transaction.objectStore('galProjects');
                const request = store.put({ id, data });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                transaction.oncomplete = () => db.close();
            });
        },

        async deleteGalgameProject(id) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction('galProjects', 'readwrite');
                const store = transaction.objectStore('galProjects');
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                transaction.oncomplete = () => db.close();
            });
        }
    };


    // ╔══════════════════════════════════════════════════════════════════╗