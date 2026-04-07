    // ║  模块 06：数据库层 (IndexedDB)                                   ║
    // ║  DB 常量 / openDB / loadFromIndexedDB / saveToIndexedDB          ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module IndexedDB — openDB / loadFromIndexedDB / saveToIndexedDB */

    // ==================== IndexedDB 初始化与辅助函数 ====================

    const DB_NAME = 'NovelCreatorDB';
    const DB_VERSION = 2;
    const STORE_NAME = 'chapters';
    const DB_KEY = CONFIG.STORAGE_KEY;

    /**
     * 打开 IndexedDB 数据库（增强版）
     * @returns {Promise<IDBDatabase>}
     */
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => {
                const error = event.target.error;
                console.error('[Storage][IndexedDB] 打开失败', error);
                // 详细错误输出
                console.error(`[openDB] 错误详情: 名称=${error.name}, 消息=${error.message}, 堆栈=${error.stack}`);
                reject(error);
            };
            request.onsuccess = (event) => {
                const db = event.target.result;
                resolve(db);
            };
            request.onupgradeneeded = (event) => {

                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);

                }
                // 新增：创建 galProjects 存储
                if (!db.objectStoreNames.contains('galProjects')) {
                    db.createObjectStore('galProjects', { keyPath: 'id' });

                }
            };
        });
    }

    /**
     * 从 IndexedDB 加载数据（增强版）
     * @returns {Promise<Object>} 返回 { chapters: [] } 或默认空结构
     */
    async function loadFromIndexedDB() {

        let db;
        try {
            db = await openDB();
        } catch (err) {
            console.error('[loadFromIndexedDB] 打开数据库失败，返回默认空章节', err);
            return { chapters: [] };
        }
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(DB_KEY);
            request.onsuccess = () => {
                const result = request.result || { chapters: [] };

                resolve(result);
            };
            request.onerror = (event) => {
                const error = event.target.error;
                console.error('[Storage][IndexedDB] 加载失败', error);
                console.error(`[loadFromIndexedDB] 错误详情: ${error.name} - ${error.message}`, error);
                reject(error);
            };
            transaction.oncomplete = () => {
                db.close();
            };
            transaction.onerror = (event) => {
                const error = event.target.error;
                console.error('[loadFromIndexedDB] 事务错误', error);
                reject(error);
            };
        });
    }

    /**
     * 保存数据到 IndexedDB（异步，增强版）
     * @param {Object} data 包含 chapters 的对象
     */
    async function saveToIndexedDB(data) {

        let db;
        try {
            db = await openDB();
        } catch (err) {
            console.error('[saveToIndexedDB] 打开数据库失败', err);
            throw new Error(`无法打开数据库: ${err.message}`);
        }
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(data, DB_KEY);
            request.onsuccess = () => {

                resolve();
            };
            request.onerror = (event) => {
                const error = event.target.error;
                console.error('[Storage][IndexedDB] 保存失败', error);
                console.error(`[saveToIndexedDB] 错误详情: 名称=${error.name}, 消息=${error.message}, 堆栈=${error.stack}`);
                console.error(`[saveToIndexedDB] 失败时数据摘要: 章节数=${data?.chapters?.length ?? 0}`);
                reject(error);
            };
            transaction.oncomplete = () => {
                db.close();
            };
            transaction.onerror = (event) => {
                const error = event.target.error;
                console.error('[saveToIndexedDB] 事务错误', error);
                reject(error);
            };
        });
    }


    // ╔══════════════════════════════════════════════════════════════════╗