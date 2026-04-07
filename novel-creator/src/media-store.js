    // ║  模块 17：媒体文件存储                                           ║
    // ║  ImageStore / OtherFileStore / AudioStore — 独立 IndexedDB 存储  ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module MediaStorage — ImageStore / AudioStore / OtherFileStore — IndexedDB 媒体管理 */

    // ==================== 图片存储管理器 ====================

    const ImageStore = {
        DB_NAME: 'NovelCreatorImagesDB',
        DB_VERSION: 1,
        STORE_NAME: 'images',

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

        /**
         * 保存图片（接受 Blob/File 或 base64 字符串）（增强版）
         */
        async save(imageData, format, providedId) {


            let id = providedId;
            if (!id) {
                id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            } else {

            }
            let blob;
            if (typeof imageData === 'string' && imageData.startsWith('data:')) {
                try {
                    const response = await fetch(imageData);
                    if (!response.ok) throw new Error(`data URL 获取失败 (${response.status})`);
                    blob = await response.blob();

                } catch (err) {
                    console.error('[ImageStore.save] 从 data URL 转换失败', err);
                    throw err;
                }
            } else if (imageData instanceof Blob) {
                blob = imageData;

            } else {
                throw new Error('不支持的图片数据格式');
            }

            let db;
            try {
                db = await this._openDB();
            } catch (err) {
                console.error('[ImageStore.save] 打开数据库失败', err);
                throw err;
            }

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.put({ id, blob });
                request.onsuccess = () => {

                    resolve(id);
                };
                request.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[ImageStore.save] 保存失败', error);
                    console.error(`[ImageStore.save] 错误详情: ${error.name} - ${error.message}`);
                    if (error.stack) console.error(error.stack);
                    reject(error);
                };
                transaction.oncomplete = () => {
                    db.close();
                };
                transaction.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[ImageStore.save] 事务错误', error);
                    reject(error);
                };
            });
        },

        /**
         * 根据 ID 获取图片 Blob
         * @param {string} id
         * @returns {Promise<Blob|null>}
         */
        async get(id) {
            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result ? request.result.blob : null);
                request.onerror = () => reject(request.error);
                transaction.oncomplete = () => db.close();
            });
        },

        /**
         * 获取所有图片（用于导出）
         * @returns {Promise<Array<{id: string, blob: Blob}>>}
         */
        async getAll() {
            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
                transaction.oncomplete = () => db.close();
            });
        },

        /**
         * 删除指定 ID 的图片
         * @param {string} id
         * @returns {Promise<void>}
         */
        async delete(id) {

            let db;
            try {
                db = await this._openDB();
            } catch (err) {
                console.error('[ImageStore.delete] 打开数据库失败', err);
                throw err;
            }
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.delete(id);
                request.onsuccess = () => {

                    resolve();
                };
                request.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[ImageStore.delete] 删除失败', error);
                    console.error(`[ImageStore.delete] 错误详情: ${error.name} - ${error.message}`);
                    reject(error);
                };
                transaction.oncomplete = () => {
                    db.close();
                };
                transaction.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[ImageStore.delete] 事务错误', error);
                    reject(error);
                };
            });
        },

        /**
         * 清空所有图片
         * @returns {Promise<void>}
         */
        async clear() {

            let db;
            try {
                db = await this._openDB();
            } catch (err) {
                console.error('[ImageStore.clear] 打开数据库失败', err);
                throw err;
            }
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.clear();
                request.onsuccess = () => {

                    resolve();
                };
                request.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[ImageStore.clear] 清空失败', error);
                    console.error(`[ImageStore.clear] 错误详情: ${error.name} - ${error.message}`);
                    reject(error);
                };
                transaction.oncomplete = () => {
                    db.close();
                };
                transaction.onerror = (event) => {
                    const error = event.target.error;
                    console.error('[ImageStore.clear] 事务错误', error);
                    reject(error);
                };
            });
        }
    };

    // ==================== 其余文件存储管理器 ====================

    const OtherFileStore = {
        DB_NAME: 'NovelCreatorTextsDB',       // 保持原数据库名，避免数据丢失
        DB_VERSION: 1,
        STORE_NAME: 'texts',                   // 保持原存储名，避免数据丢失

        async _openDB() {

            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
                request.onerror = () => {
                    console.error('[OtherFileStore._openDB] 打开失败', request.error);
                    reject(request.error);
                };
                request.onsuccess = () => {

                    resolve(request.result);
                };
                request.onupgradeneeded = (event) => {

                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                    }
                };
            });
        },

        /**
         * 保存其余文件内容（如 HTML、JS、CSS、纯文本等）
         * @param {string} text - 文件内容
         * @param {string} format - 格式，如 'txt', 'html', 'js'
         * @param {string} [providedId] - 可选，指定ID
         * @returns {Promise<string>} 文件ID（格式：other_时间戳_随机数）
         */
        async save(text, format, providedId) {


            let id = providedId;
            if (!id) {
                id = `other_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            } else {

            }
            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const entry = { id, text, format, timestamp: Date.now() };

                const request = store.put(entry);
                request.onsuccess = () => {

                    resolve(id);
                };
                request.onerror = () => {
                    console.error('[OtherFileStore.save] 保存失败', request.error);
                    reject(request.error);
                };
                transaction.oncomplete = () => {

                    db.close();
                };
            });
        },

        /**
         * 根据ID获取其余文件内容
         * @param {string} id
         * @returns {Promise<{text: string, format: string}|null>}
         */
        async get(id) {

            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.get(id);
                request.onsuccess = () => {
                    const result = request.result;
                    if (result) {

                        resolve(result);
                    } else {
                        console.warn(`[OtherFileStore.get] 未找到id=${id}`);
                        resolve(null);
                    }
                };
                request.onerror = () => {
                    console.error('[OtherFileStore.get] 获取失败', request.error);
                    reject(request.error);
                };
                transaction.oncomplete = () => db.close();
            });
        },

        /**
         * 删除指定ID的其余文件
         * @param {string} id
         */
        async delete(id) {

            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.delete(id);
                request.onsuccess = () => {

                    resolve();
                };
                request.onerror = () => {
                    console.error('[OtherFileStore.delete] 删除失败', request.error);
                    reject(request.error);
                };
                transaction.oncomplete = () => db.close();
            });
        },

        /**
         * 清空所有其余文件
         */
        async clear() {

            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.clear();
                request.onsuccess = () => {

                    resolve();
                };
                request.onerror = () => {
                    console.error('[OtherFileStore.clear] 清空失败', request.error);
                    reject(request.error);
                };
                transaction.oncomplete = () => db.close();
            });
        },

        async getAll() {

            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => {

                    resolve(request.result);
                };
                request.onerror = () => {
                    console.error('[OtherFileStore.getAll] 获取失败', request.error);
                    reject(request.error);
                };
                transaction.oncomplete = () => db.close();
            });
        }
    };

    // ==================== 音频存储管理器 ====================

    const AudioStore = {
        DB_NAME: 'NovelCreatorAudiosDB',
        DB_VERSION: 1,
        STORE_NAME: 'audios',

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

        /**
         * 保存音频 Blob
         * @param {Blob} audioBlob - 音频 Blob
         * @param {string} [providedId] - 可选，指定 ID
         * @returns {Promise<string>} 音频 ID（格式：audio_时间戳_随机数）
         */
        async save(audioBlob, providedId) {


            let id = providedId;
            if (!id) {
                id = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.put({ id, blob: audioBlob, timestamp: Date.now() });
                request.onsuccess = () => {

                    resolve(id);
                };
                request.onerror = () => {
                    console.error('[AudioStore.save] 保存失败', request.error);
                    reject(request.error);
                };
                transaction.oncomplete = () => db.close();
            });
        },

        /**
         * 根据 ID 获取音频 Blob
         * @param {string} id
         * @returns {Promise<Blob|null>}
         */
        async get(id) {

            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.get(id);
                request.onsuccess = () => {
                    const result = request.result;
                    if (result) {

                        resolve(result.blob);
                    } else {
                        console.warn(`[AudioStore.get] 未找到 ID: ${id}`);
                        resolve(null);
                    }
                };
                request.onerror = () => {
                    console.error('[AudioStore.get] 获取失败', request.error);
                    reject(request.error);
                };
                transaction.oncomplete = () => db.close();
            });
        },

        /**
         * 获取所有音频（用于导出）
         * @returns {Promise<Array<{id: string, blob: Blob}>>}
         */
        async getAll() {

            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => {

                    resolve(request.result);
                };
                request.onerror = () => {
                    console.error('[AudioStore.getAll] 获取失败', request.error);
                    reject(request.error);
                };
                transaction.oncomplete = () => db.close();
            });
        },

        /**
         * 删除指定 ID 的音频
         * @param {string} id
         * @returns {Promise<void>}
         */
        async delete(id) {

            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.delete(id);
                request.onsuccess = () => {

                    resolve();
                };
                request.onerror = () => {
                    console.error('[AudioStore.delete] 删除失败', request.error);
                    reject(request.error);
                };
                transaction.oncomplete = () => db.close();
            });
        },

        /**
         * 清空所有音频
         * @returns {Promise<void>}
         */
        async clear() {

            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.clear();
                request.onsuccess = () => {

                    resolve();
                };
                request.onerror = () => {
                    console.error('[AudioStore.clear] 清空失败', request.error);
                    reject(request.error);
                };
                transaction.oncomplete = () => db.close();
            });
        }
    };


    // ╔══════════════════════════════════════════════════════════════════╗