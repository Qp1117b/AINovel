    // ║  模块 16：状态快照                                                ║
    // ║  Snapshot — 世界书快照的创建与恢复                                ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module Snapshot — 章节状态书快照：保存/恢复 */

    // ==================== 状态快照 ====================

    const Snapshot = {
        /**
         * 创建增强快照：保存所有状态书的全部条目（包括模板）
         */
        async create() {
            console.time('Snapshot.create');

            const books = await getAllStateBooks();

            const booksData = {};

            for (const bookName of books) {
                console.time(`读取 ${bookName}`);
                const book = await API.getWorldbook(bookName);
                const entries = Array.isArray(book) ? book : (book.entries || []);
                console.timeEnd(`读取 ${bookName}`);

                // 使用深拷贝，但记录条目数大小
                booksData[bookName] = entries.map(e => {
                    // 粗略估计 JSON 字符串长度
                    const size = JSON.stringify(e).length;

                    return JSON.parse(JSON.stringify(e));
                });
            }

            const snapshot = {
                timestamp: new Date().toISOString(),
                books: booksData
            };
            console.timeEnd('Snapshot.create');

            return snapshot;
        },

        /**
         * 彻底回滚：删除所有现有状态书，并按快照精确重建
         */
        async restore(snapshot) {
            if (!snapshot?.books) return false;
            UI.updateProgress(`开始彻底回滚状态书...`);

            // 获取当前所有状态书
            const currentBooks = await getAllStateBooks();
            const snapshotBookNames = Object.keys(snapshot.books);

            // 获取当前全局激活的世界书列表（用于后续恢复激活状态）
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

            // 1. 删除所有现有的状态书
            for (const bookName of currentBooks) {
                UI.updateProgress(`  删除状态书: ${bookName}...`);
                try {
                    if (typeof deleteWorldbook === 'function') {
                        await deleteWorldbook(bookName);
                    } else if (typeof TavernHelper?.deleteWorldbook === 'function') {
                        await TavernHelper.deleteWorldbook(bookName);
                    } else {
                        throw new Error('deleteWorldbook API 不可用');
                    }
                } catch (e) {
                    UI.updateProgress(`    ❌ 删除失败: ${e.message}`, true);
                }
            }

            // 2. 重建快照中的状态书
            for (const bookName of snapshotBookNames) {
                UI.updateProgress(`  重建 ${bookName} (${snapshot.books[bookName].length} 个条目)...`);
                try {
                    // 创建世界书（如果已存在则可能失败，但我们已经删除了，所以通常不存在）
                    if (typeof createWorldbook === 'function') {
                        await createWorldbook(bookName);
                    } else if (typeof TavernHelper?.createWorldbook === 'function') {
                        await TavernHelper.createWorldbook(bookName);
                    } else {
                        throw new Error('createWorldbook API 不可用');
                    }
                    // 写入条目（snapshot.books[bookName] 已是完整的嵌套结构）
                    await API.updateWorldbook(bookName, () => snapshot.books[bookName], { render: 'immediate' });
                } catch (e) {
                    UI.updateProgress(`    ❌ 重建失败: ${e.message}`, true);
                }
            }

            // 3. 重新设置全局激活世界书列表
            // 保留原有的非状态书（如设定书），并添加快照中的所有状态书
            const nonStateBooks = currentGlobalBooks.filter(name => !name.startsWith(CONFIG.STATE_BOOK_PREFIX));
            const newGlobalBooks = [...new Set([...nonStateBooks, ...snapshotBookNames])];
            try {
                if (typeof TavernHelper?.rebindGlobalWorldbooks === 'function') {
                    await TavernHelper.rebindGlobalWorldbooks(newGlobalBooks);
                } else if (typeof window.rebindGlobalWorldbooks === 'function') {
                    await window.rebindGlobalWorldbooks(newGlobalBooks);
                } else {
                    throw new Error('rebindGlobalWorldbooks API 不可用');
                }
            } catch (e) {
                UI.updateProgress(`  ⚠️ 重新激活世界书失败: ${e.message}`, true);
            }

            UI.updateProgress('✅ 状态书彻底回滚完成');
            return true;
        }
    };


    // ╔══════════════════════════════════════════════════════════════════╗