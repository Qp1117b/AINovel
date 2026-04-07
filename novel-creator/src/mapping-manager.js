    // ║  模块 08：互动映射管理器                                          ║
    // ║  MappingManager — 互动结果 <-> 章节号的持久化映射                 ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module MappingManager — 互动选项→章节号 双向映射，IndexedDB 持久化 */


    const MappingManager = {
        DB_NAME: 'NovelCreatorMappingsDB',
        DB_VERSION: 1,
        STORE_NAME: 'mappings',
        cache: new Map(), // 内存缓存，键为 "parentNum|interactionResult"，值为 targetChapterNum

        async _openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                    }
                };
            });
        },

        // 生成映射 ID
        _makeId(parentNum, interactionResult) {
            return `${parentNum}|${interactionResult}`;
        },

        // 加载所有映射到缓存
        async loadAll() {


            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => {
                    const mappings = request.result || [];
                    this.cache.clear();
                    mappings.forEach(m => {
                        const key = this._makeId(m.parentChapterNum, m.interactionResult);
                        this.cache.set(key, m.targetChapterNum);
                    });

                    resolve();
                };
                request.onerror = () => reject(request.error);
                transaction.oncomplete = () => db.close();
            });
        },

        // 查询映射
        getMapping(parentNum, interactionResult) {
            if (!parentNum || !interactionResult) return null;
            const key = this._makeId(parentNum, interactionResult);
            const target = this.cache.get(key);

            if (target) {
                return { targetChapterNum: target };
            }
            return null;
        },

        /**
         * 记录映射（增强版）
         */
        async recordMapping(parentNum, interactionResult, targetChapterNum) {

            if (!parentNum || !interactionResult || !targetChapterNum) {
                console.warn('[MappingManager.recordMapping] 参数不完整，跳过', {
                    parentNum,
                    interactionResult,
                    targetChapterNum
                });
                return;
            }
            const key = this._makeId(parentNum, interactionResult);
            if (this.cache.has(key)) {
                console.warn(`[MappingManager.recordMapping] 映射已存在 (parent=${parentNum}, result="${interactionResult}")，跳过`);
                return;
            }
            let db;
            try {
                db = await this._openDB();
            } catch (err) {
                console.error('[MappingManager.recordMapping] 打开数据库失败', err);
                throw err;
            }
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const entry = {
                    id: key,
                    parentChapterNum: parentNum,
                    interactionResult: interactionResult,
                    targetChapterNum: targetChapterNum,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                const request = store.put(entry);
                request.onsuccess = () => {
                    this.cache.set(key, targetChapterNum);

                    resolve();
                };
                request.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[MappingManager.recordMapping] 保存失败', error);
                    console.error(`[MappingManager.recordMapping] 错误详情: ${error.name} - ${error.message}`);
                    if (error.stack) console.error(error.stack);
                    reject(error);
                };
                transaction.oncomplete = () => {
                    db.close();
                };
                transaction.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[MappingManager.recordMapping] 事务错误', error);
                    reject(error);
                };
            });
        },

        /**
         * 删除与指定章节相关的映射（作为源或目标）（增强版）
         */
        async deleteMappingsByChapters(chapterNums) {

            const chapterSet = new Set(chapterNums);
            let db;
            try {
                db = await this._openDB();
            } catch (err) {
                console.error('[MappingManager.deleteMappingsByChapters] 打开数据库失败', err);
                throw err;
            }
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => {
                    const mappings = request.result || [];
                    const toDelete = mappings.filter(m =>
                        chapterSet.has(m.parentChapterNum) || chapterSet.has(m.targetChapterNum)
                    ).map(m => m.id);


                    let deleteCount = 0;
                    const deletePromises = toDelete.map(id => {
                        return new Promise((res, rej) => {
                            const delReq = store.delete(id);
                            delReq.onsuccess = () => {
                                this.cache.delete(id);
                                deleteCount++;

                                res();
                            };
                            delReq.onerror = (e) => {
                                console.error(`[MappingManager] 删除映射 ${id} 失败`, e.target.error);
                                rej(e.target.error);
                            };
                        });
                    });

                    Promise.allSettled(deletePromises).then(results => {
                        const failed = results.filter(r => r.status === 'rejected').length;
                        if (failed > 0) {
                            console.warn(`[MappingManager.deleteMappingsByChapters] 有 ${failed} 条映射删除失败`);
                        }

                        resolve();
                    }).catch(reject);
                };
                request.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[MappingManager.deleteMappingsByChapters] 获取映射失败', error);
                    reject(error);
                };
                transaction.oncomplete = () => {
                    db.close();
                };
                transaction.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[MappingManager.deleteMappingsByChapters] 事务错误', error);
                    reject(error);
                };
            });
        },

        // 导出所有映射（用于备份）
        async exportAll() {
            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
                transaction.oncomplete = () => db.close();
            });
        },

        /**
         * 批量导入映射（用于恢复）（增强版）
         */
        async importAll(mappings) {

            let db;
            try {
                db = await this._openDB();
            } catch (err) {
                console.error('[MappingManager.importAll] 打开数据库失败', err);
                throw err;
            }
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                let count = 0;
                const errors = [];
                mappings.forEach(m => {
                    const req = store.put(m);
                    req.onsuccess = () => {
                        const key = this._makeId(m.parentChapterNum, m.interactionResult);
                        this.cache.set(key, m.targetChapterNum);
                        count++;

                    };
                    req.onerror = (e) => {
                        const error = e.target.error;
                        console.error('[MappingManager.importAll] 导入失败', error);
                        errors.push({ mapping: m, error: error.message });
                    };
                });
                transaction.oncomplete = () => {

                    if (errors.length > 0) {
                        console.warn('[MappingManager.importAll] 失败详情:', errors);
                    }
                    db.close();
                    resolve();
                };
                transaction.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[MappingManager.importAll] 事务错误', error);
                    reject(error);
                };
            });
        }
    };


    // ╔══════════════════════════════════════════════════════════════════╗