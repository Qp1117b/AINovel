    // ║  模块 22：历史记录 UI                                            ║
    // ║  HistoryUI — 章节历史、分支树、章节操作（含分支核心操作）         ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module HistoryUI — 历史章节树形浏览 / 回滚 / 分支 / 状态书查看 */

    // ==================== 历史记录UI ====================

    const HistoryUI = {

        show() {
            console.time('HistoryUI.show');

            UI.closeAll();

            const chapters = Storage.loadChapters();


            const { childrenMap, chapterMap } = buildTreeMaps(chapters);
            const roots = chapters.filter(ch => ch.parent === null).sort((a, b) => a.num - b.num);

            const expandedSet = new Set();
            const selectedSet = new Set();

            const ITEM_HEIGHT = 45;

            const flattenTree = (nodes, level) => {
                let flat = [];
                for (const node of nodes) {
                    flat.push({ ...node, level, hasChildren: childrenMap[node.num]?.length > 0 });
                    if (expandedSet.has(node.num) && childrenMap[node.num]) {
                        flat = flat.concat(flattenTree(childrenMap[node.num], level + 1));
                    }
                }
                return flat;
            };

            let flatList = flattenTree(roots, 0);

            const overlay = document.createElement('div');
            overlay.className = 'nc-overlay nc-font';
            overlay.style.zIndex = '100001';

            const panel = document.createElement('div');
            panel.className = 'nc-history-panel nc-scroll';

            // 在工具栏中添加“导入备份”按钮
            const toolbarHTML = `
        <div class="nc-mb15">
            <div class="nc-flex--btn-group-center">
                <button data-action="selectBranch" class="nc-btn nc-btn-sm nc-hist-toolbar-btn--purple">🌿 全选当前分支</button>
                <button data-action="deleteSelected" class="nc-btn nc-btn-sm nc-hist-toolbar-btn--red">🗑️ 删除选中</button>
                <button data-action="exportSelected" class="nc-btn nc-btn-sm nc-hist-toolbar-btn--teal">📤 导出选中</button>
                <button data-action="importBackup" class="nc-btn nc-btn-sm nc-hist-toolbar-btn--teal">📥 导入备份</button>
                <button data-action="refresh" class="nc-btn nc-btn-sm nc-hist-toolbar-btn--purple">🔄 刷新</button>
                <button data-action="close" class="nc-btn nc-btn-sm nc-hist-toolbar-btn--crimson">❌ 关闭</button>
            </div>
        </div>
    `;

            panel.innerHTML = `
        <div class="nc-center--mb20-c">
            <h2 class="nc-section-title--lg-c">📚 历史章节管理</h2>
        </div>
        ${toolbarHTML}
        <div id="nc-chapter-tree" class="nc-size--chapter-tree"></div>
    `;

            overlay.appendChild(panel);
            document.body.appendChild(overlay);
            UI._openModal(overlay);

            const treeContainer = panel.querySelector('#nc-chapter-tree');

            const renderVirtualList = () => {
                const scrollTop = treeContainer.scrollTop;
                const containerHeight = treeContainer.clientHeight;
                const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 2);
                const endIndex = Math.min(flatList.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + 2);

                treeContainer.innerHTML = '';

                const placeholder = document.createElement('div');
                placeholder.style.height = (flatList.length * ITEM_HEIGHT) + 'px';
                placeholder.style.pointerEvents = 'none';
                placeholder.style.position = 'absolute';
                placeholder.style.top = '0';
                placeholder.style.left = '0';
                placeholder.style.width = '1px';
                treeContainer.appendChild(placeholder);

                for (let i = startIndex; i < endIndex; i++) {
                    const item = flatList[i];
                    if (!item) continue;

                    const div = document.createElement('div');
                    div.className = 'chapter-item';
                    div.dataset.chapter = item.num;
                    div.style.position = 'absolute';
                    div.style.top = (i * ITEM_HEIGHT) + 'px';
                    div.style.left = '0';
                    div.style.right = '0';
                    div.style.height = ITEM_HEIGHT + 'px';
                    div.style.padding = '0 10px';
                    div.style.display = 'flex';
                    div.style.alignItems = 'center';
                    div.style.justifyContent = 'space-between';
                    div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    div.style.boxSizing = 'border-box';
                    div.style.backgroundColor = 'rgba(255,255,255,0.02)';
                    div.style.transition = 'background-color 0.2s';
                    div.onmouseenter = () => div.style.backgroundColor = 'rgba(255,255,255,0.06)';
                    div.onmouseleave = () => div.style.backgroundColor = 'rgba(255,255,255,0.02)';

                    const leftSpan = document.createElement('span');
                    leftSpan.style.display = 'flex';
                    leftSpan.style.alignItems = 'center';
                    leftSpan.style.gap = '6px';
                    leftSpan.style.paddingLeft = (item.level * 20) + 'px';
                    leftSpan.style.cursor = 'pointer';

                    const arrow = item.hasChildren ? (expandedSet.has(item.num) ? '▼' : '▶') : ' ';
                    const path = getBranchPath(item.num, chapterMap, childrenMap);

                    // ========== 修复标题重复问题 ==========
                    let displayTitle = item.title;
                    const chapterPrefix = new RegExp(`^第${item.num}\\s*章\\s*`);
                    if (!chapterPrefix.test(displayTitle)) {
                        displayTitle = `第${item.num}章 ${displayTitle}`;
                    }
                    // =====================================

                    leftSpan.innerHTML = `<span class="tree-arrow nc-tree-arrow">${arrow}</span> ${item.sourcePath || path} ${displayTitle}`;

                    // 新增：如果存在互动结果，添加标签
                    if (item.interactionResult) {
                        const resultSpan = document.createElement('span');
                        resultSpan.style.cssText = 'font-size:10px; color:#888; margin-left:10px; background:rgba(102,126,234,0.2); padding:2px 6px; border-radius:12px;';
                        resultSpan.textContent = `↘️ ${item.interactionResult.length > 20 ? item.interactionResult.substring(0, 20) + '…' : item.interactionResult}`;
                        leftSpan.appendChild(resultSpan);
                    }

                    leftSpan.querySelector('.tree-arrow')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (!item.hasChildren) return;
                        if (expandedSet.has(item.num)) {
                            expandedSet.delete(item.num);
                        } else {
                            expandedSet.add(item.num);
                        }
                        flatList = flattenTree(roots, 0);
                        renderVirtualList();
                    });

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'chapter-checkbox';
                    checkbox.value = item.num;
                    checkbox.checked = selectedSet.has(item.num);
                    checkbox.style.marginRight = '8px';
                    checkbox.style.accentColor = '#667eea';
                    checkbox.addEventListener('change', (e) => {
                        const num = parseInt(e.target.value);
                        if (e.target.checked) selectedSet.add(num);
                        else selectedSet.delete(num);
                    });

                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'chapter-actions';
                    actionsDiv.style.display = 'flex';
                    actionsDiv.style.gap = '6px';
                    actionsDiv.innerHTML = `
                <button data-action="view" data-chapter="${item.num}" class="nc-hist-btn--view">查看</button>
                <button data-action="viewStatus" data-chapter="${item.num}" class="nc-hist-btn--status">状态</button>
                <button data-action="rollback" data-chapter="${item.num}" class="nc-hist-btn--rollback">回滚</button>
                <button data-action="delete" data-chapter="${item.num}" class="nc-hist-btn--delete">删除</button>
                <button data-action="branch" data-chapter="${item.num}" class="nc-hist-btn--branch">从此分支</button>
            `;

                    div.appendChild(checkbox);
                    div.appendChild(leftSpan);
                    div.appendChild(actionsDiv);
                    treeContainer.appendChild(div);
                }
            };

            renderVirtualList();

            treeContainer.addEventListener('scroll', () => {
                requestAnimationFrame(renderVirtualList);
            });

            panel.addEventListener('click', async (e) => {
                const target = e.target;
                const actionBtn = target.closest('[data-action]');
                const chapterItem = target.closest('.chapter-item');
                const chapterNum = chapterItem ? parseInt(chapterItem.dataset.chapter) : null;

                if (actionBtn) {
                    const action = actionBtn.dataset.action;
                    const getSelected = () => {
                        const checkboxes = treeContainer.querySelectorAll('.chapter-checkbox:checked');
                        return Array.from(checkboxes).map(cb => parseInt(cb.value));
                    };

                    switch (action) {
                        case 'view':
                            if (chapterNum) await this.viewChapter(chapterNum, { mode: 'readonly', fromHistory: true });
                            break;
                        case 'viewStatus':
                            if (chapterNum) await this.viewChapterStatus(chapterNum, true);
                            break;
                        case 'rollback':
                            if (chapterNum) await this.rollbackToChapter(chapterNum);
                            break;
                        case 'delete':
                            if (chapterNum) await this.deleteChapter(chapterNum);
                            break;
                        case 'branch':
                            if (chapterNum) await this.startBranchFrom(chapterNum);
                            break;
                        case 'selectBranch':
                            this.selectCurrentBranch();
                            break;
                        case 'deleteSelected':
                            const selected = getSelected();
                            if (selected.length) await this.deleteSelectedChapters(selected);
                            else Notify.warning('请至少选择一个章节');
                            break;
                        case 'exportSelected':
                            const exportNums = getSelected();
                            if (exportNums.length) await this.exportArticles(exportNums);
                            else Notify.warning('请至少选择一个章节');
                            break;
                        case 'importBackup':

                            await this.importBackup();
                            break;
                        case 'refresh':
                            this.show();
                            break;
                        case 'close':
                            UI._closeModal(overlay);
                            break;
                        default:
                            console.warn('[HistoryUI.show] 未知动作:', action);
                    }
                }
            });


            console.timeEnd('HistoryUI.show');
        },

        close() {
            ModalStack.closeTop();
        },

        refresh() {
            this.show();
        },

        // 在 HistoryUI 对象内添加此方法
        async exportArticles(selectedNums) {
            UI.updateProgress('开始导出选中文章...');


            try {
                const chapters = Storage.loadChapters().filter(c => selectedNums.includes(c.num));
                if (chapters.length === 0) {
                    Notify.warning('没有可导出的章节', '', { timeOut: 2000 });
                    return;
                }


                // 准备章节备份数据
                const chapterBackup = {
                    version: CONFIG.VERSION,
                    exportTime: new Date().toISOString(),
                    totalChapters: chapters.length,
                    data: { chapters: chapters.map(ch => ({ ...ch })) }
                };

                // 收集所有图片ID、音频ID和其余文件ID
                const imageIds = new Set();
                const audioIds = new Set();
                const otherFileIds = new Set();
                const imageIdRegex = /src="id:(img_[^"]+)"/g;
                const audioIdRegex = /src="id:(audio_[^"]+)"/g;      // 原变量已定义
                const otherFileIdRegex = /src="id:(other_[^"]+)"/g;

                for (const ch of chapters) {
                    const content = ch.content || '';
                    let match;

                    // 重置正则 lastIndex
                    imageIdRegex.lastIndex = 0;
                    audioIdRegex.lastIndex = 0;
                    otherFileIdRegex.lastIndex = 0;

                    while ((match = imageIdRegex.exec(content)) !== null) {
                        imageIds.add(match[1]);

                    }
                    while ((match = audioIdRegex.exec(content)) !== null) {
                        audioIds.add(match[1]);

                    }
                    while ((match = otherFileIdRegex.exec(content)) !== null) {
                        otherFileIds.add(match[1]);

                    }
                }


                // 如果没有需要导出的文件，直接导出JSON
                if (imageIds.size === 0 && audioIds.size === 0 && otherFileIds.size === 0) {
                    const jsonStr = JSON.stringify(chapterBackup, null, 2);
                    const filename = `小说-选中${chapters.length}章.json`;
                    UI._downloadText(jsonStr, filename, 'application/json');
                    UI.updateProgress(`✅ 已导出 JSON 备份 (${chapters.length}章)`);
                    return;
                }

                // 创建ZIP
                const zip = new JSZip();
                zip.file('chapters.json', JSON.stringify(chapterBackup, null, 2));


                // 添加图片文件夹
                if (imageIds.size > 0) {
                    const imageFolder = zip.folder('images');
                    let imageCount = 0;
                    for (const id of imageIds) {
                        try {
                            const blob = await ImageStore.get(id);
                            if (blob) {
                                let ext = 'png';
                                if (blob.type.includes('jpeg') || blob.type.includes('jpg')) ext = 'jpg';
                                else if (blob.type.includes('gif')) ext = 'gif';
                                else if (blob.type.includes('webp')) ext = 'webp';
                                const fileName = `${id}.${ext}`;
                                imageFolder.file(fileName, blob, { binary: true });
                                imageCount++;

                            } else {
                                console.warn(`[HistoryUI.exportArticles] 图片 ${id} 不存在，跳过`);
                            }
                        } catch (err) {
                            console.error(`[HistoryUI.exportArticles] 获取图片 ${id} 失败:`, err);
                            UI.updateProgress(`  ⚠️ 图片 ${id} 获取失败`, true);
                        }
                    }

                }

                // 添加音频文件夹
                if (audioIds.size > 0) {
                    const audioFolder = zip.folder('audios');
                    let audioCount = 0;
                    for (const id of audioIds) {
                        try {
                            const blob = await AudioStore.get(id);
                            if (blob) {
                                let ext = 'mp3';
                                if (blob.type.includes('wav')) ext = 'wav';
                                else if (blob.type.includes('ogg')) ext = 'ogg';
                                else if (blob.type.includes('m4a')) ext = 'm4a';
                                else if (blob.type.includes('flac')) ext = 'flac';
                                const fileName = `${id}.${ext}`;
                                audioFolder.file(fileName, blob, { binary: true });
                                audioCount++;

                            } else {
                                console.warn(`[HistoryUI.exportArticles] 音频 ${id} 不存在，跳过`);
                            }
                        } catch (err) {
                            console.error(`[HistoryUI.exportArticles] 获取音频 ${id} 失败:`, err);
                            UI.updateProgress(`  ⚠️ 音频 ${id} 获取失败`, true);
                        }
                    }

                }

                // 添加其余文件文件夹
                if (otherFileIds.size > 0) {
                    const otherFolder = zip.folder('others');
                    let otherCount = 0;
                    for (const id of otherFileIds) {
                        try {
                            const item = await OtherFileStore.get(id);
                            if (item && item.text) {
                                const format = item.format || 'txt';
                                const ext = format === 'html' ? 'html' :
                                    format === 'js' ? 'js' : 'txt';
                                const fileName = `${id}.${ext}`;
                                otherFolder.file(fileName, item.text, { binary: false });
                                otherCount++;

                            } else {
                                console.warn(`[HistoryUI.exportArticles] 其余文件 ${id} 不存在，跳过`);
                            }
                        } catch (err) {
                            console.error(`[HistoryUI.exportArticles] 获取其余文件 ${id} 失败:`, err);
                            UI.updateProgress(`  ⚠️ 其余文件 ${id} 获取失败`, true);
                        }
                    }

                }

                // 生成ZIP并下载
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `小说-选中${chapters.length}章.zip`;
                a.click();
                URL.revokeObjectURL(url);

                UI.updateProgress(`✅ 已导出包含 ${imageIds.size} 张图片、${audioIds.size} 个音频、${otherFileIds.size} 个其余文件的 ZIP 备份 (${chapters.length}章)`);


            } catch (err) {
                console.error('[HistoryUI.exportArticles] 导出失败:', err);
                UI.updateProgress(`❌ 导出失败: ${err.message}`, true);
                Notify.error('导出失败: ' + err.message);
            }
        },

        /**
         * 获取快照中的状态条目数量（添加调试）
         * @param {Object} snapshot 状态快照对象
         * @returns {number} 状态条目数量
         */
        _getSnapshotEntryCount(snapshot) {
            if (!snapshot?.books) {

                return 0;
            }
            let count = 0;
            for (const bookName in snapshot.books) {
                const entries = snapshot.books[bookName];
                const stateEntries = entries.filter(e => e?.name?.startsWith(CONFIG.STATE_ENTRY_PREFIX));
                count += stateEntries.length;

            }

            return count;
        },

        // 在 HistoryUI 对象内添加
        async _loadStateTemplatesIfNeeded() {
            if (Object.keys(stateTemplatesByBook).length === 0) {
                try {
                    const templates = await loadAllStateTemplates();
                    stateTemplatesByBook = {};
                    templates.forEach(t => {
                        stateTemplatesByBook[t.bookIndex] = t.categoryMap;
                    });
                } catch (e) {
                    console.warn('[HistoryUI._openChapterModal] 加载状态模板失败', e);
                }
            }
        },

        _extractPureContent(chapter) {
            if (!chapter?.content) return '无内容';
            let content = chapter.content
                .replace(/^#\s+.*?(\n|$)/, '')
                .replace(/【创建时间】[^\n]+\n?/, '');
            const last = content.lastIndexOf('---');
            if (last !== -1) content = content.substring(0, last);
            return content.replace(/本章节由自动化系统生成并保存/, '').trim() || '无内容';
        },

        _parseStateDefinition(definition) {
            if (!definition) return [];
            const lines = definition.split('\n');
            const tree = [];
            const stack = [];

            lines.forEach(line => {
                if (!line.trim()) return;
                const indentMatch = line.match(/^(\s*)/);
                const indentStr = indentMatch ? indentMatch[1] : '';
                const indentLevel = Math.floor(indentStr.length / 2);

                // 支持多种列表标记格式：
                // 1. 标准格式: - 字段名: 或 * 字段名:
                // 2. 状态类型格式: - [字段名]：值 或 - [字段名]: 值
                // 3. 任务列表格式: - [ ] 字段名: 或 - [x] 字段名:

                let markerMatch = line.match(/^\s*([-*])\s+(.*)/);
                let checkboxMatch = line.match(/^\s*([-*])\s+\[([^\]]*)][：:]\s*(.*)/);
                let taskMatch = line.match(/^\s*([-*])\s+\[\s*([xX]?)\s*]\s+(.*)/);

                let marker, rest, isCheckboxFormat = false, isTaskFormat = false;

                if (checkboxMatch) {
                    // 匹配 - [XXX]：XXX 格式（状态类型字段）
                    marker = checkboxMatch[1];
                    const fieldName = checkboxMatch[2].trim();
                    const fieldValue = checkboxMatch[3].trim();
                    rest = `${fieldName}: ${fieldValue}`;
                    isCheckboxFormat = true;
                } else if (taskMatch) {
                    // 匹配 - [ ] XXX 或 - [x] XXX 格式（任务列表）
                    marker = taskMatch[1];
                    const checked = taskMatch[2].toLowerCase() === 'x';
                    const content = taskMatch[3].trim();
                    rest = `[${checked ? 'x' : ' '}] ${content}`;
                    isTaskFormat = true;
                } else if (markerMatch) {
                    // 标准格式
                    marker = markerMatch[1];
                    rest = markerMatch[2];
                } else {
                    return; // 无法识别的格式，跳过
                }

                const sepIndex = rest.indexOf(':');
                const sepIndexCn = rest.indexOf('：');
                const finalSepIndex = sepIndex !== -1 ? (sepIndexCn !== -1 ? Math.min(sepIndex, sepIndexCn) : sepIndex) : sepIndexCn;

                let name = rest;
                let valueFormat = '';
                if (finalSepIndex !== -1 && !isTaskFormat) {
                    name = rest.substring(0, finalSepIndex).trim();
                    valueFormat = rest.substring(finalSepIndex + 1).trim();
                }

                const node = {
                    name,
                    valueFormat,
                    marker,
                    indentLevel,
                    children: [],
                    isCheckboxFormat,  // 标记是否为复选框格式
                    isTaskFormat       // 标记是否为任务列表格式
                };

                if (indentLevel === 0) {
                    tree.push(node);
                    stack.length = 0;
                    stack.push(node);
                } else {
                    while (stack.length > indentLevel) stack.pop();
                    const parent = stack[stack.length - 1];
                    if (parent) parent.children.push(node);
                    stack.push(node);
                }
            });
            return tree;
        },

        _extractFieldValue(content, fieldName) {
            if (!content) return '';
            // 对字段名中的正则特殊字符进行转义
            const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedFieldName = escapeRegex(fieldName);

            const lines = content.split('\n');
            for (let line of lines) {
                // 尝试匹配标准格式: - 字段名: 值
                let match = line.match(new RegExp(`^\\s*[-*]\\s+${escapedFieldName}\\s*[：:]\\s*(.*)$`));
                if (match) return match[1].trim();

                // 尝试匹配状态类型格式: - [字段名]：值
                match = line.match(new RegExp(`^\\s*[-*]\\s+\\[${escapedFieldName}\\][：:]\\s*(.*)$`));
                if (match) return match[1].trim();
            }
            return '';
        },

        _getNodePath(node) {
            return node.name;
        },

        // 在 HistoryUI 对象内，替换 viewChapter 方法
        viewChapter: async function (num, options = {}) {
            const mode = options.mode || 'readonly';
            const fromHistory = options.fromHistory || false;


            if (num === 0) {
                this.editChapter(0);
                return;
            }
            const chapters = Storage.loadChapters();
            const chapter = chapters.find(c => c.num === num);
            if (!chapter) {
                Notify.info('未找到对应章节', '', { timeOut: 2000 });
                return;
            }

            // 标题清理
            let cleanTitle = chapter.title;
            let removed = false;
            while (/^第\d+章\s*/.test(cleanTitle)) {
                cleanTitle = cleanTitle.replace(/^第\d+章\s*/, '');
                removed = true;
            }
            if (removed && cleanTitle.trim() === '') cleanTitle = '';
            const displayTitle = cleanTitle ? `第${chapter.num}章 ${cleanTitle}` : `第${chapter.num}章`;

            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100200';

            const modal = document.createElement('div');
            modal.className = 'nc-modal nc-scroll';

            let bodyHTML = '';

            const isHtml = UI._detectHTML(chapter.content);


            if (mode === 'readonly') {
                // 元信息行
                let metaHtml = '';
                if (chapter.sourcePath || chapter.interactionResult) {
                    metaHtml = '<div class="nc-text--meta-center">';
                    if (chapter.sourcePath) metaHtml += `来源路径：${chapter.sourcePath}`;
                    if (chapter.interactionResult) metaHtml += ` | 互动结果：${chapter.interactionResult}`;
                    metaHtml += '</div>';
                }

                let viewToggleHtml = '';
                if (isHtml) {
                    viewToggleHtml = `
                <div class="nc-flex--chapter-view-btns">
                    <button id="nc-view-source" class="nc-btn nc-btn-sm nc-btn--grad-purple-shadow">📄 源码</button>
                    <button id="nc-view-preview" class="nc-btn nc-btn-sm nc-btn--grad-teal-shadow">🌐 预览</button>
                </div>
            `;
                }

                bodyHTML = `
            <div class="nc-modal-header">
                <h2 class="nc-modal-title--primary-lg-c">${displayTitle}</h2>
                <p class="nc-modal-subtitle--gray">${chapter.timestamp}</p>
                ${metaHtml}
                ${viewToggleHtml}
            </div>
            <div class="nc-modal-body nc-scroll markdown-body nc-body--chapter-view">
                <div id="nc-chapter-content-loading" class="nc-center--pad20-muted">加载内容中...</div>
                <div id="nc-source-container" class="nc-hidden"><pre id="nc-source-pre" class="nc-code-block--pre"></pre></div>
                <div id="nc-preview-container" class="nc-hidden"></div>
            </div>
        `;
            } else {
                // 编辑模式（保持不变，但增加预览按钮）
                bodyHTML = `
            <div class="nc-modal-header">
                <h2 class="nc-modal-title--primary-lg-c">编辑${displayTitle}</h2>
            </div>
            <div class="nc-modal-body nc-scroll nc-body--pad12">
                <div class="nc-mb12">
                    <label class="nc-field-label--sm-c">章节标题</label>
                    <input id="nc-edit-title" type="text" class="nc-modal-input--dark" value="${chapter.title}">
                </div>
                <div>
                    <label class="nc-field-label--sm-c">章节内容</label>
                    <textarea id="nc-edit-content" class="nc-modal-textarea--chapter">${this._extractPureContent(chapter)}</textarea>
                </div>
            </div>
        `;
            }

            // 底部按钮（根据模式调整）
            let footerButtons = '';
            if (mode === 'readonly') {
                footerButtons = fromHistory
                    ? `<button class="nc-modal-copy-btn">复制内容</button><button class="nc-modal-close-btn">关闭</button>`
                    : `<button class="nc-modal-copy-btn">复制内容</button><button id="nc-switch-mode" class="nc-btn nc-btn-primary">修改</button><button class="nc-modal-close-btn">关闭</button>`;
                if (isHtml) {
                    footerButtons += `<button id="nc-preview-refresh" class="nc-btn nc-btn-xs nc-hidden">刷新预览</button>`;
                }
            } else {
                footerButtons = `<button id="nc-edit-save" class="nc-modal-copy-btn">保存修改</button><button id="nc-copy-content" class="nc-modal-copy-btn">复制内容</button><button id="nc-switch-mode" class="nc-btn nc-btn-primary">查看</button><button class="nc-modal-close-btn">关闭</button>`;
                // 编辑模式增加预览按钮
                footerButtons += `<button id="nc-edit-preview" class="nc-btn nc-btn-primary">🌐 预览</button>`;
            }

            modal.innerHTML = bodyHTML + `<div class="nc-modal-footer">${footerButtons}</div>`;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            ModalStack.push(overlay);

            if (mode === 'readonly') {
                const contentDiv = modal.querySelector('.nc-modal-body');
                const loadingDiv = modal.querySelector('#nc-chapter-content-loading');
                const sourceContainer = modal.querySelector('#nc-source-container');
                const previewContainer = modal.querySelector('#nc-preview-container');
                const sourcePre = modal.querySelector('#nc-source-pre');
                const sourceBtn = modal.querySelector('#nc-view-source');
                const previewBtn = modal.querySelector('#nc-view-preview');
                const refreshBtn = modal.querySelector('#nc-preview-refresh');

                // 设置源码内容
                sourcePre.textContent = chapter.content;

                // 预览渲染函数
                const renderPreview = async () => {

                    const processed = await UI._replaceImagePlaceholders(chapter.content);
                    previewContainer.innerHTML = processed;
                    // 执行脚本
                    previewContainer.querySelectorAll('script').forEach(oldScript => {
                        const newScript = document.createElement('script');
                        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                        newScript.textContent = oldScript.textContent;
                        oldScript.parentNode.replaceChild(newScript, oldScript);
                    });
                };

                if (isHtml) {
                    // 默认显示预览（classList，配合 nc-hidden !important）
                    sourceContainer.classList.add('nc-hidden');
                    previewContainer.classList.remove('nc-hidden');
                    loadingDiv.classList.add('nc-hidden');
                    await renderPreview();

                    // 初始高亮预览按钮（因为默认显示预览）
                    previewBtn.style.opacity = '1';
                    previewBtn.style.boxShadow = '0 4px 12px rgba(78, 205, 196, 0.6)';
                    sourceBtn.style.opacity = '0.7';
                    sourceBtn.style.boxShadow = 'none';

                    sourceBtn.addEventListener('click', () => {

                        sourceContainer.classList.remove('nc-hidden');
                        previewContainer.classList.add('nc-hidden');
                        // 高亮源码按钮
                        sourceBtn.style.opacity = '1';
                        sourceBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.6)';
                        previewBtn.style.opacity = '0.7';
                        previewBtn.style.boxShadow = 'none';
                        if (refreshBtn) refreshBtn.classList.add('nc-hidden');
                    });
                    previewBtn.addEventListener('click', async () => {

                        sourceContainer.classList.add('nc-hidden');
                        previewContainer.classList.remove('nc-hidden');
                        // 高亮预览按钮
                        previewBtn.style.opacity = '1';
                        previewBtn.style.boxShadow = '0 4px 12px rgba(78, 205, 196, 0.6)';
                        sourceBtn.style.opacity = '0.7';
                        sourceBtn.style.boxShadow = 'none';
                        if (refreshBtn) refreshBtn.classList.add('nc-hidden');
                        // 重新渲染（保证最新）
                        await renderPreview();
                    });
                } else {
                    // 纯文本：直接显示预览（即渲染后的markdown）
                    loadingDiv.classList.add('nc-hidden');
                    previewContainer.classList.remove('nc-hidden');
                    await renderPreview();
                }

                // 复制按钮事件（原有逻辑）
                const copyBtn = modal.querySelector('.nc-modal-copy-btn');
                copyBtn.addEventListener('click', async () => {

                    await copyToClipboard(chapter.content, '内容已复制到剪贴板');
                });

                // 关闭按钮
                const closeBtn = modal.querySelector('.nc-modal-close-btn');
                closeBtn.addEventListener('click', () => UI._closeModal(overlay));

                // 切换模式按钮
                const switchBtn = modal.querySelector('#nc-switch-mode');
                if (switchBtn) {
                    switchBtn.addEventListener('click', () => {

                        UI._closeModal(overlay);
                        const newMode = mode === 'readonly' ? 'edit' : 'readonly';
                        this.viewChapter(num, { mode: newMode, fromHistory });
                    });
                }

                // 遮罩点击关闭
                overlay.addEventListener('click', e => {
                    if (e.target === overlay) {
                        UI._closeModal(overlay);
                    }
                });

            } else {
                // 编辑模式
                const editTitle = modal.querySelector('#nc-edit-title');
                const editContent = modal.querySelector('#nc-edit-content');
                const saveBtn = modal.querySelector('#nc-edit-save');
                const copyBtn = modal.querySelector('#nc-copy-content');
                const switchBtn = modal.querySelector('#nc-switch-mode');
                const closeBtn = modal.querySelector('.nc-modal-close-btn');
                const previewBtn = modal.querySelector('#nc-edit-preview');

                // 预览按钮
                previewBtn.addEventListener('click', async () => {

                    const title = editTitle.value.trim() || `第${chapter.num}章`;
                    const content = editContent.value;
                    UI.showPreviewModal(content, `预览: ${title}`);
                });

                // 保存按钮（原有逻辑）
                saveBtn.addEventListener('click', async () => {

                    const newTitle = editTitle.value.trim();
                    const newContent = editContent.value;
                    if (!newTitle) {
                        Notify.warning('请输入章节标题', '', { timeOut: 2000 });
                        return;
                    }

                    const chapters = Storage.loadChapters();
                    const idx = chapters.findIndex(c => c.num === chapter.num);
                    if (idx === -1) {
                        Notify.error('章节不存在');
                        return;
                    }

                    // 获取旧内容中的图片ID等（原有逻辑）
                    const oldContent = chapters[idx].content;
                    const oldImageIds = [];
                    const oldImageRegex = /!\[.*?\]\(id:(img_[^)]+)\)|src="id:(img_[^"]+)"/g;
                    let oldMatch;
                    while ((oldMatch = oldImageRegex.exec(oldContent)) !== null) {
                        const id = oldMatch[1] || oldMatch[2];
                        if (id) oldImageIds.push(id);
                    }

                    const snapshot = chapters[idx].snapshot;
                    const timestamp = new Date().toLocaleString('zh-CN');
                    const content = `# ${newTitle}\n\n【创建时间】${timestamp}\n\n${newContent}\n\n---\n本章节由自动化系统生成并保存`;

                    chapters[idx] = {
                        num: chapter.num,
                        title: newTitle,
                        content: content,
                        timestamp: timestamp,
                        size: content.length,
                        snapshot: snapshot
                    };
                    chapters.sort((a, b) => a.num - b.num);

                    if (Storage.save({ chapters })) {
                        // 收集新内容中的图片ID
                        const newImageIds = [];
                        const newImageRegex = /!\[.*?\]\(id:(img_[^)]+)\)|src="id:(img_[^"]+)"/g;
                        let newMatch;
                        while ((newMatch = newImageRegex.exec(content)) !== null) {
                            const id = newMatch[1] || newMatch[2];
                            if (id) newImageIds.push(id);
                        }
                        const toDeleteImages = oldImageIds.filter(id => !newImageIds.includes(id));
                        for (const id of toDeleteImages) {
                            try {
                                await ImageStore.delete(id);

                            } catch (e) {
                                console.warn(`[编辑保存] 删除图片 ${id} 失败:`, e);
                            }
                        }

                        Notify.success(`第${chapter.num}章已更新`, '', { timeOut: 2000 });
                        if (document.getElementById(CONFIG.UI.panelId)) {
                            UI.createPanel();
                        }
                        if (document.querySelector('.nc-history-panel')) {
                            HistoryUI.show();
                        }
                        UI._closeModal(overlay);
                    } else {
                        Notify.error('保存失败');
                    }
                });

                // 复制按钮
                copyBtn.addEventListener('click', async () => {

                    const textToCopy = `# ${editTitle.value}\n\n${editContent.value}`;
                    await copyToClipboard(textToCopy, '内容已复制到剪贴板');
                });

                // 切换模式
                switchBtn.addEventListener('click', () => {

                    UI._closeModal(overlay);
                    this.viewChapter(num, { mode: 'readonly', fromHistory });
                });

                // 关闭
                closeBtn.addEventListener('click', () => UI._closeModal(overlay));

                overlay.addEventListener('click', e => {
                    if (e.target === overlay) UI._closeModal(overlay);
                });
            }
        },

        editChapter(num) {
            const chapters = Storage.loadChapters();
            let chapter;
            let isNew = false;
            if (num === 0) {
                isNew = true;
                const nextNum = chapters.length > 0 ? Math.max(...chapters.map(c => c.num)) + 1 : 1;
                chapter = {
                    num: nextNum,
                    title: `第${nextNum}章`,
                    content: '',
                    timestamp: new Date().toLocaleString('zh-CN'),
                    size: 0,
                    snapshot: null
                };
            } else {
                chapter = chapters.find(c => c.num === num);
                if (!chapter) {
                    Notify.error(`未找到第${num}章`);
                    return;
                }
            }

            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100020';

            const modal = document.createElement('div');
            modal.className = 'nc-modal nc-scroll';
            modal.style.maxWidth = '700px';
            modal.style.width = '100%';

            modal.innerHTML = `
        <div class="nc-modal-header">
            <h2 class="nc-modal-title--primary-lg-c">${isNew ? '新建第一章' : `编辑第${chapter.num}章`}</h2>
        </div>
        <div class="nc-modal-body nc-scroll nc-body--pad12">
            <div class="nc-mb12">
                <label class="nc-field-label--sm-c">章节标题</label>
                <input id="nc-edit-title" type="text" class="nc-modal-input--dark" value="${chapter.title}">
            </div>
            <div>
                <label class="nc-field-label--sm-c">章节内容</label>
                <textarea id="nc-edit-content" class="nc-modal-textarea--chapter">${this._extractPureContent(chapter)}</textarea>
            </div>
        </div>
        <div class="nc-modal-footer">
            <button id="nc-edit-save" class="nc-modal-copy-btn">保存</button>
            <button id="nc-edit-preview" class="nc-btn nc-btn-primary">🌐 预览</button>
            <button id="nc-edit-cancel" class="nc-modal-close-btn">取消</button>
        </div>
    `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            ModalStack.push(overlay);

            const closeModal = () => {
                ModalStack.remove(overlay);
                overlay.remove();
            };
            overlay.addEventListener('click', e => {
                if (e.target === overlay) closeModal();
            });

            const titleInput = modal.querySelector('#nc-edit-title');
            const contentInput = modal.querySelector('#nc-edit-content');
            const saveBtn = modal.querySelector('#nc-edit-save');
            const previewBtn = modal.querySelector('#nc-edit-preview');
            const cancelBtn = modal.querySelector('#nc-edit-cancel');

            // 预览按钮
            previewBtn.addEventListener('click', async () => {

                const title = titleInput.value.trim() || (isNew ? '新建章节' : `第${chapter.num}章`);
                const content = contentInput.value;
                UI.showPreviewModal(content, `预览: ${title}`);
            });

            // 保存按钮（原有逻辑）
            saveBtn.addEventListener('click', async () => {

                const newTitle = titleInput.value.trim();
                const newContent = contentInput.value;
                if (!newTitle) {
                    Notify.warning('请输入章节标题', '', { timeOut: 2000 });
                    return;
                }

                if (isNew) {
                    UI.updateProgress('正在检查状态书...');
                    const books = await getAllStateBooks();
                    let snapshot = null;
                    if (books.length === 0) {
                        UI.updateProgress('⚠️ 未找到状态书，将不会创建状态快照', true);
                    } else {
                        UI.updateProgress('正在创建状态快照...');
                        snapshot = await Snapshot.create();
                        if (!snapshot) {
                            UI.updateProgress('⚠️ 状态快照创建失败，但章节将继续保存（无快照）', true);
                        } else {
                            UI.updateProgress('快照创建成功，正在保存章节...');
                        }
                    }

                    const timestamp = new Date().toLocaleString('zh-CN');
                    const content = `# ${newTitle}\n\n【创建时间】${timestamp}\n\n${newContent}\n\n---\n本章节由自动化系统生成并保存`;
                    const newChapter = {
                        num: chapter.num,
                        title: newTitle,
                        content: content,
                        timestamp: timestamp,
                        size: content.length,
                        snapshot: snapshot
                    };
                    const success = Storage.saveChapter(newChapter, newChapter.num, snapshot);
                    if (success) {
                        Notify.success(`第${newChapter.num}章已保存，并附带状态快照`, '', { timeOut: 2000 });
                        if (document.getElementById(CONFIG.UI.panelId)) {
                            UI.createPanel();
                        }
                        if (document.querySelector('.nc-history-panel')) {
                            HistoryUI.show();
                        }
                        closeModal();
                    } else {
                        Notify.error('保存失败');
                    }
                } else {
                    const chapters = Storage.loadChapters();
                    const idx = chapters.findIndex(c => c.num === chapter.num);
                    if (idx === -1) {
                        Notify.error('章节不存在');
                        return;
                    }
                    const snapshot = chapters[idx].snapshot;
                    const timestamp = new Date().toLocaleString('zh-CN');
                    const content = `# ${newTitle}\n\n【创建时间】${timestamp}\n\n${newContent}\n\n---\n本章节由自动化系统生成并保存`;
                    chapters[idx] = {
                        num: chapter.num,
                        title: newTitle,
                        content: content,
                        timestamp: timestamp,
                        size: content.length,
                        snapshot: snapshot
                    };
                    chapters.sort((a, b) => a.num - b.num);
                    if (Storage.save({ chapters })) {
                        Notify.success(`第${chapter.num}章已更新`, '', { timeOut: 2000 });
                        if (document.getElementById(CONFIG.UI.panelId)) {
                            UI.createPanel();
                        }
                        if (document.querySelector('.nc-history-panel')) {
                            HistoryUI.show();
                        }
                        closeModal();
                    } else {
                        Notify.error('保存失败');
                    }
                }
            });

            // 取消按钮
            cancelBtn.addEventListener('click', closeModal);
        },

        viewChapterStatus: async function (num, readonly = false) {

            if (num === 0) {

                await this.showCurrentWorldState();

                return;
            }
            const chapters = Storage.loadChapters();

            const chapter = chapters.find(c => c.num === num);
            if (!chapter) {

                Notify.info('未找到对应章节', '', { timeOut: 2000 });
                return;
            }

            const snapshotCount = this._getSnapshotEntryCount(chapter.snapshot);

            if (!chapter.snapshot || snapshotCount === 0) {

                Notify.info('该章节没有状态快照', '', { timeOut: 2000 });
                return;
            }

            await this.openStateEditor(num, null, true, readonly);

        },

        async rollbackChapter(num) {

            const chapters = Storage.loadChapters();
            const chapter = chapters.find(c => c.num === num);
            if (!chapter || !chapter.snapshot) {
                console.warn('[HistoryUI.rollbackChapter] 章节无快照');
                Notify.warning('该章节无快照');
                return false;
            }

            const descendants = collectDescendants(num, chapters, false); // 不包含自身
            const entryCount = this._getSnapshotEntryCount(chapter.snapshot);
            const msg = `⚠️ 即将回滚到第${num}章结束时的状态\n\n` +
                `• 恢复 ${entryCount} 个状态条目（可能包含多本状态书）\n` +
                `• 删除 ${descendants.length} 个后续章节\n• 第${num}章本身将保留\n• 此操作不可撤销！\n\n确定继续吗？`;


            const confirmed = await UI.showConfirmModal(msg, '确认');
            if (!confirmed) {

                return false;
            }

            await this.deleteChaptersAndImages(descendants, chapters);


            const restored = await Snapshot.restore(chapter.snapshot);
            if (restored) {
                WORKFLOW_STATE.activeChapterNum = num;
                WORKFLOW_STATE.currentBranchStart = num;
                WORKFLOW_STATE.currentBranchLatest = num;

                Notify.success(`已回滚到第${num}章`);
                this.refresh();
                return true;
            }
            console.warn('[HistoryUI.rollbackChapter] 快照恢复失败');
            return false;
        },

        async archiveAll() {
            const confirmed = await UI.showConfirmModal('确定要清空所有历史章节，并将状态书清空吗？此操作不可撤销！', '确认');
            if (!confirmed) return;
            if (!await resetWorldStateToInitial()) {
                Notify.error('状态书清空失败，清空操作取消');
                return;
            }
            if (Storage.clear()) {
                await ImageStore.clear();
                await OtherFileStore.clear();
                await AudioStore.clear();

                Notify.success('历史章节已清空，状态书已清空', '', { timeOut: 2000 });
                if (document.getElementById(CONFIG.UI.panelId)) {
                    UI.createPanel();
                }
                this.show();
            }
        },

        async importBackup() {


            await ImageStore.clear();
            await OtherFileStore.clear();
            await AudioStore.clear();


            const fileInput = Object.assign(document.createElement('input'), {
                type: 'file', accept: '.json,.zip,application/json,application/zip', style: 'display:none'
            });
            document.body.appendChild(fileInput);

            return new Promise((resolve, reject) => {
                fileInput.addEventListener('change', async e => {
                    const file = e.target.files[0];
                    if (!file) {

                        fileInput.remove();
                        resolve();
                        return;
                    }


                    try {
                        // 判断文件类型
                        const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';


                        if (isZip) {
                            // ========== ZIP 导入 ==========

                            UI.updateProgress('正在处理 ZIP 备份...');
                            const arrayBuffer = await file.arrayBuffer();

                            const zip = await JSZip.loadAsync(arrayBuffer);


                            // 恢复图片
                            const imageFolder = zip.folder('images');
                            if (imageFolder) {
                                const imageFiles = Object.keys(imageFolder.files).filter(name => name.startsWith('images/') && !name.endsWith('/'));

                                UI.updateProgress(`  恢复图片...`);
                                for (const fileName of imageFiles) {
                                    try {
                                        const blob = await zip.file(fileName).async('blob');
                                        const id = fileName.replace('images/', '').replace(/\.[^/.]+$/, '');

                                        await ImageStore.save(blob, null, id);

                                    } catch (err) {
                                        console.error(`[HistoryUI.importBackup] 恢复图片 ${fileName} 失败:`, err);
                                        UI.updateProgress(`    ⚠️ 图片 ${fileName} 恢复失败`, true);
                                    }
                                }
                                UI.updateProgress(`  ✅ 图片恢复完成`);
                            } else {

                            }

                            // 恢复音频
                            const audioFolder = zip.folder('audios');
                            if (audioFolder) {
                                const audioFiles = Object.keys(audioFolder.files).filter(name => name.startsWith('audios/') && !name.endsWith('/'));

                                UI.updateProgress(`  恢复音频...`);
                                for (const fileName of audioFiles) {
                                    try {
                                        const blob = await zip.file(fileName).async('blob');
                                        const id = fileName.replace('audios/', '').replace(/\.[^/.]+$/, '');

                                        await AudioStore.save(blob, null, id);

                                    } catch (err) {
                                        console.error(`[HistoryUI.importBackup] 恢复音频 ${fileName} 失败:`, err);
                                        UI.updateProgress(`    ⚠️ 音频 ${fileName} 恢复失败`, true);
                                    }
                                }
                                UI.updateProgress(`  ✅ 音频恢复完成`);
                            } else {

                            }

                            // 恢复其余文件
                            const otherFolder = zip.folder('others');
                            if (otherFolder) {
                                const otherFiles = Object.keys(otherFolder.files).filter(name => name.startsWith('others/') && !name.endsWith('/'));

                                UI.updateProgress(`  恢复其余文件...`);
                                for (const fileName of otherFiles) {
                                    try {
                                        const content = await zip.file(fileName).async('string');
                                        const id = fileName.replace('others/', '').replace(/\.[^/.]+$/, '');
                                        const ext = fileName.split('.').pop();
                                        const format = ext === 'html' ? 'html' : ext === 'js' ? 'js' : 'txt';

                                        await OtherFileStore.save(content, format, id);

                                    } catch (err) {
                                        console.error(`[HistoryUI.importBackup] 恢复其余文件 ${fileName} 失败:`, err);
                                        UI.updateProgress(`    ⚠️ 其余文件 ${fileName} 恢复失败`, true);
                                    }
                                }
                                UI.updateProgress(`  ✅ 其余文件恢复完成`);
                            } else {

                            }

                            // ========== 恢复映射表 ==========
                            const mappingsFile = zip.file('mappings.json');
                            if (mappingsFile) {

                                UI.updateProgress('  正在恢复映射表...');
                                try {
                                    const mappingsJson = await mappingsFile.async('string');
                                    const mappings = JSON.parse(mappingsJson);

                                    await MappingManager.importAll(mappings);
                                    UI.updateProgress(`  ✅ 已恢复 ${mappings.length} 条映射`);
                                } catch (e) {
                                    console.error('[HistoryUI.importBackup] 恢复映射表失败:', e);
                                    UI.updateProgress(`  ⚠️ 映射表恢复失败: ${e.message}`, true);
                                }
                            } else {

                                UI.updateProgress('  未找到映射表文件，尝试从章节数据重建...');
                                try {
                                    const chapters = Storage.loadChapters();
                                    const mappings = [];
                                    chapters.forEach(ch => {
                                        if (ch.parent && ch.interactionResult) {
                                            mappings.push({
                                                id: `${ch.parent}|${ch.interactionResult}`,
                                                parentChapterNum: ch.parent,
                                                interactionResult: ch.interactionResult,
                                                targetChapterNum: ch.num,
                                                createdAt: Date.now(),
                                                updatedAt: Date.now()
                                            });
                                        }
                                    });
                                    // 去重（以最新章节为准）
                                    const uniqueMap = new Map();
                                    mappings.forEach(m => {
                                        const key = m.id;
                                        if (!uniqueMap.has(key) || m.createdAt > uniqueMap.get(key).createdAt) {
                                            uniqueMap.set(key, m);
                                        }
                                    });
                                    const uniqueMappings = Array.from(uniqueMap.values());

                                    await MappingManager.importAll(uniqueMappings);
                                    UI.updateProgress(`  ✅ 从章节数据重建了 ${uniqueMappings.length} 条映射`);
                                } catch (e) {
                                    console.error('[HistoryUI.importBackup] 重建映射失败:', e);
                                    UI.updateProgress(`  ⚠️ 重建映射失败: ${e.message}`, true);
                                }
                            }

                            // 2. 恢复章节
                            const chaptersFile = zip.file('chapters.json');
                            if (chaptersFile) {

                                const chaptersJson = await chaptersFile.async('string');
                                const chaptersData = JSON.parse(chaptersJson);

                                if (chaptersData.data && Array.isArray(chaptersData.data.chapters)) {

                                    // 直接覆盖存储
                                    if (Storage.save(chaptersData.data)) {
                                        UI.updateProgress(`  ✅ 已恢复 ${chaptersData.data.chapters.length} 章`);
                                    } else {
                                        UI.updateProgress(`  ⚠️ 章节恢复失败`, true);
                                    }
                                } else {
                                    console.warn('[HistoryUI.importBackup] chapters.json 格式不符');
                                    UI.updateProgress(`  ⚠️ chapters.json 格式错误，跳过`, true);
                                }
                            } else {

                            }

                            // 3. 恢复世界书
                            // 修改过滤条件，排除 mappings.json
                            const worldbookFiles = Object.keys(zip.files).filter(name =>
                                name.endsWith('.json') &&
                                name !== 'chapters.json' &&
                                name !== 'workflow_outputs.json' &&
                                name !== 'mappings.json' &&  // 排除 mappings.json
                                !name.startsWith('images/') &&
                                !name.startsWith('audios/') &&
                                !name.startsWith('others/')
                            );


                            // 收集所有恢复的世界书名称
                            const restoredBooks = new Set();

                            for (const fileName of worldbookFiles) {
                                try {
                                    const content = await zip.file(fileName).async('string');
                                    const bookData = JSON.parse(content);
                                    const bookName = bookData.name || fileName.replace('.json', '');

                                    restoredBooks.add(bookName);

                                    // 检查是否存在
                                    let exists = false;
                                    try {
                                        await API.getWorldbook(bookName);
                                        exists = true;
                                    } catch (_) {
                                        // 读取失败 = 世界书不存在，exists 保持 false
                                    }
                                    if (!exists) {
                                        if (typeof TavernHelper?.createWorldbook === 'function') {
                                            await TavernHelper.createWorldbook(bookName);

                                        } else {
                                            console.warn('[HistoryUI.importBackup] 无法创建世界书，跳过');
                                            continue;
                                        }
                                    }
                                    await API.updateWorldbook(bookName, () => bookData.entries, { render: 'immediate' });

                                    UI.updateProgress(`  ✅ 已恢复世界书 ${bookName}`);
                                } catch (err) {
                                    console.error(`[HistoryUI.importBackup] 恢复世界书 ${fileName} 失败:`, err);
                                    UI.updateProgress(`  ❌ 恢复世界书 ${fileName} 失败: ${err.message}`, true);
                                }
                            }

                            if (restoredBooks.size > 0) {

                                UI.updateProgress('  正在激活恢复的世界书...');
                                try {
                                    // 获取当前全局激活列表
                                    let currentGlobalBooks = [];
                                    if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                                        currentGlobalBooks = await TavernHelper.getGlobalWorldbookNames();

                                    } else {
                                        console.warn('[HistoryUI.importBackup] 无法获取全局激活列表，跳过激活');
                                    }

                                    // 合并去重
                                    const newGlobalBooks = [...new Set([...currentGlobalBooks, ...restoredBooks])];


                                    if (typeof TavernHelper?.rebindGlobalWorldbooks === 'function') {
                                        await TavernHelper.rebindGlobalWorldbooks(newGlobalBooks);

                                        UI.updateProgress(`  ✅ 已激活 ${restoredBooks.size} 本世界书`);
                                    } else {
                                        console.warn('[HistoryUI.importBackup] rebindGlobalWorldbooks 不可用，跳过激活');
                                    }
                                } catch (e) {
                                    console.error('[HistoryUI.importBackup] 激活世界书时出错:', e);
                                    UI.updateProgress(`  ⚠️ 激活世界书失败: ${e.message}`, true);
                                }
                            } else {

                            }

                            // 4. 工作流输出（可选，仅恢复内存？这里只记录）
                            const workflowFile = zip.file('workflow_outputs.json');
                            if (workflowFile) {

                                const workflowJson = await workflowFile.async('string');
                                const workflowData = JSON.parse(workflowJson);

                                UI.updateProgress('  ⚠️ 工作流输出数据已解析，未自动恢复', true);
                            }

                            UI.updateProgress('✅ ZIP 导入完成！');
                            Notify.success('完整备份导入成功', '', { timeOut: 2000 });

                        } else {
                            // ========== 旧版 JSON 导入（仅章节） ==========

                            UI.updateProgress('正在处理 JSON 备份...');
                            const json = JSON.parse(await file.text());

                            let dataToImport;
                            if (json.data && Array.isArray(json.data.chapters)) dataToImport = json.data;
                            else if (Array.isArray(json.chapters)) dataToImport = json;
                            else throw new Error('无效的备份文件格式：缺少 chapters 数组');


                            const confirmed = await UI.showConfirmModal('导入将覆盖当前所有历史章节，确定继续吗？', '确认');
                            if (!confirmed) {

                                fileInput.remove();
                                resolve();
                                return;
                            }
                            dataToImport.chapters?.sort((a, b) => a.num - b.num);
                            if (!Storage.save(dataToImport)) throw new Error('保存到 localStorage 失败，可能是存储空间不足');

                            const imported = dataToImport.chapters || [];
                            if (imported.length) {
                                const last = imported[imported.length - 1];
                                if (last.snapshot) {
                                    UI.updateProgress(`正在恢复状态书到第${last.num}章结束时的状态...`);

                                    const ok = await Snapshot.restore(last.snapshot);
                                    UI.updateProgress(ok ? '✅ 状态书状态已恢复' : '❌ 状态书状态恢复失败', !ok);
                                    if (!ok) Notify.warning('状态书状态恢复失败，但章节数据已导入', '', { timeOut: 2000 });
                                } else {
                                    UI.updateProgress('导入章节无快照，清空状态书...');

                                    await resetWorldStateToInitial();
                                }
                            } else {
                                UI.updateProgress('导入章节为空，清空状态书...');

                                await resetWorldStateToInitial();
                            }

                            Notify.success('备份导入成功', '', { timeOut: 2000 });
                        }

                        // 刷新界面

                        this.show();
                        resolve();
                    } catch (err) {
                        console.error('[HistoryUI.importBackup] 导入备份失败:', err);
                        Notify.error('导入失败: ' + err.message);
                        reject(err);
                    } finally {
                        fileInput.remove();

                    }
                });
                fileInput.click();

            });
        },

        getStateTextFromChapter(chapter) {
            if (!chapter.snapshot?.books) return '';
            const texts = [];
            for (const bookName in chapter.snapshot.books) {
                const entries = chapter.snapshot.books[bookName];
                // 只取状态条目，忽略模板
                const stateEntries = entries.filter(e => e?.name?.startsWith(CONFIG.STATE_ENTRY_PREFIX));
                for (const entry of stateEntries) {
                    texts.push(`【${entry.name}】\n${entry.content || ''}`);
                }
            }
            return texts.join('\n\n');
        },

        /**
         * 显示章节选择模态框（供自动提取等使用）
         * @param {Function} callback 回调函数，接收选中章节数组
         */
        showChapterSelectionModal(callback) {


            const existingModals = document.querySelectorAll('.nc-modal-overlay');
            existingModals.forEach(modal => {
                if (modal.querySelector('#nc-select-submit')) {
                    ModalStack.remove(modal);
                    modal.remove();

                }
            });

            const chapters = Storage.loadChapters();


            if (chapters.length === 0) {
                Notify.info('暂无历史章节', '', { timeOut: 2000 });
                console.warn('[HistorySelection] 无章节，退出');
                return;
            }

            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100200';

            const modal = document.createElement('div');
            modal.className = 'nc-modal nc-scroll';
            modal.style.maxWidth = '700px';
            modal.style.width = '100%';

            // 生成章节列表 HTML，修复标题重复问题
            const chaptersHTML = chapters.map(ch => {
                const hasSnap = this._getSnapshotEntryCount(ch.snapshot) > 0;
                // ========== 修复标题重复 ==========
                let displayTitle = ch.title;
                const chapterPrefix = new RegExp(`^第${ch.num}\\s*章\\s*`);
                if (!chapterPrefix.test(displayTitle)) {
                    displayTitle = `第${ch.num}章 ${displayTitle}`;
                }
                // ================================
                return `
            <div class="nc-chapter-item nc-flex--chapter-row" data-num="${ch.num}">
                <input type="checkbox" class="chapter-select-checkbox nc-checkbox--base" value="${ch.num}" data-has-snapshot="${hasSnap}">
                <div class="nc-flex-item--grow">
                    <div class="nc-text--bold">${displayTitle}</div>
                    <div class="nc-text--xs-faded-c">
                        ${ch.timestamp} · ${(ch.size / 1024).toFixed(2)} KB · ${hasSnap ? '📸' : '⚠️'}
                    </div>
                </div>
            </div>
        `;
            }).join('');

            modal.innerHTML = `
        <div class="nc-modal-header">
            <h2 class="nc-modal-title--primary-c">选择章节</h2>
        </div>
        <div class="nc-modal-body nc-scroll nc-size--max50vh">
            ${chaptersHTML}
        </div>
        <div class="nc-modal-footer nc-flex--footer-8-wrap">
            <button id="nc-select-all" class="nc-btn nc-btn-sm nc-hist-toolbar-btn--purple">✅ 全选</button>
            <button id="nc-select-invert" class="nc-btn nc-btn-sm nc-hist-toolbar-btn--teal">🔄 反选</button>
            <button id="nc-select-submit" class="nc-btn nc-btn-sm nc-btn-primary nc-hist-toolbar-btn--purple">提交</button>
            <button id="nc-select-cancel" class="nc-btn nc-btn-sm nc-btn-ghost nc-hist-toolbar-btn--crimson">取消</button>
        </div>
    `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            ModalStack.push(overlay);

            const checkboxes = modal.querySelectorAll('.chapter-select-checkbox');
            const chapterItems = modal.querySelectorAll('.nc-chapter-item');


            chapterItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.classList.contains('chapter-select-checkbox')) {

                        return;
                    }
                    const num = parseInt(item.dataset.num);
                    const checkbox = item.querySelector('.chapter-select-checkbox');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;

                        const changeEvent = new Event('change', { bubbles: true });
                        checkbox.dispatchEvent(changeEvent);
                    }
                });

                item.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    const num = parseInt(item.dataset.num);

                    checkboxes.forEach(cb => cb.checked = false);
                    const checkbox = item.querySelector('.chapter-select-checkbox');
                    if (checkbox) checkbox.checked = true;

                    const selectedChapter = chapters.find(ch => ch.num === num);
                    if (selectedChapter) {
                        ModalStack.closeTop();

                        callback([selectedChapter]);
                    } else {
                        console.error('[HistorySelection] 未找到章节', num);
                    }
                });
            });

            modal.querySelector('#nc-select-all').addEventListener('click', () => {

                checkboxes.forEach(cb => cb.checked = true);
            });

            modal.querySelector('#nc-select-invert').addEventListener('click', () => {

                checkboxes.forEach(cb => cb.checked = !cb.checked);
            });

            modal.querySelector('#nc-select-cancel').addEventListener('click', () => {

                ModalStack.closeTop();
            });

            modal.querySelector('#nc-select-submit').addEventListener('click', () => {
                const selectedNums = [];
                checkboxes.forEach(cb => {
                    if (cb.checked) selectedNums.push(parseInt(cb.value));
                });

                const selectedChapters = chapters.filter(ch => selectedNums.includes(ch.num));
                ModalStack.closeTop();
                callback(selectedChapters);
            });

            overlay.addEventListener('click', e => {
                if (e.target === overlay) {

                    ModalStack.closeTop();
                }
            });
        },

        async showCurrentWorldState() {

            const books = await getAllStateBooks();

            if (books.length === 0) {

                Notify.info('没有状态书', '', { timeOut: 2000 });
                return;
            }

            await this._loadStateTemplatesIfNeeded();

            // 直接打开可编辑模式，保持打开状态，不关联任何章节
            await this.openStateEditor(null, books[0], true, false);

        },

        async openStateEditor(chapterNum, initialBookName = null, stayOpenAfterSave = false, readonly = false) {
            const books = await getAllStateBooks();
            if (books.length === 0) {
                Notify.info('没有状态书', '', { timeOut: 2000 });
                return;
            }
            // 确保模板已加载
            await this._loadStateTemplatesIfNeeded();
            const targetBook = initialBookName || books[0];
            this._openStateEditorModal(targetBook, chapterNum, stayOpenAfterSave, readonly);
        },

        /**
         * 打开状态编辑模态框（内部实现）
         * @param {string} initialBookName 初始状态书名称
         * @param {number|null} chapterNum 关联的章节号（用于保存时更新章节快照），可为 null
         * @param {boolean} stayOpen 保存后是否保持打开状态（用于查修状态）
         * @param {boolean} readonly 是否为只读模式
         */
        _openStateEditorModal: async function (initialBookName, chapterNum, stayOpen, readonly = false) {

            // 如果指定了章节号，从章节快照中获取状态书数据
            let snapshotData = null;
            if (chapterNum) {
                const chapters = Storage.loadChapters();
                const chapter = chapters.find(c => c.num === chapterNum);
                if (chapter && chapter.snapshot && chapter.snapshot.books) {
                    snapshotData = chapter.snapshot.books;
                    // 打印快照中每本书的条目数量
                    for (const bookName in snapshotData) {
                    }
                } else {
                    console.warn(`[HistoryUI._openStateEditorModal] 章节 ${chapterNum} 无有效快照，将加载实时状态书`);
                }
            }

            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100010';

            const modal = document.createElement('div');
            modal.className = 'nc-modal nc-scroll';
            modal.style.maxWidth = '900px';
            modal.style.width = '100%';

            // ========== 关键修改：根据 snapshotData 确定书籍列表 ==========
            let books;
            if (snapshotData) {
                // 快照模式：只使用快照中包含的状态书
                books = Object.keys(snapshotData);
                // 确保 initialBookName 存在于快照中，否则取第一个
                if (initialBookName && !books.includes(initialBookName)) {
                    console.warn(`[HistoryUI._openStateEditorModal] initialBookName "${initialBookName}" 不在快照中，使用第一个`);
                    initialBookName = books.length > 0 ? books[0] : null;
                } else if (!initialBookName && books.length > 0) {
                    initialBookName = books[0];
                }
            } else {
                // 实时模式：获取所有存在的状态书
                books = await getAllStateBooks();
            }

            // 如果没有书籍，则关闭模态框并提示
            if (!books || books.length === 0) {
                console.warn('[HistoryUI._openStateEditorModal] 没有可用的状态书，关闭编辑器');
                Notify.info('没有可用的状态书', '', { timeOut: 2000 });
                return;
            }

            let selectHTML = '<select id="nc-edit-book-select" class="nc-modal-select--book">';
            books.forEach(book => {
                const selected = (book === initialBookName) ? 'selected' : '';
                selectHTML += `<option value="${book}" ${selected}>${book}</option>`;
            });
            selectHTML += '</select>';

            // 根据 readonly 和 stayOpen 决定底部按钮
            let footerHTML;
            if (readonly) {
                footerHTML = `
    <div class="nc-modal-footer">
        <button id="nc-edit-copy-btn" class="nc-modal-copy-btn">复制</button>
        <button id="nc-edit-close-btn" class="nc-modal-close-btn">关闭</button>
    </div>
`;
            } else if (stayOpen) {
                footerHTML = `
    <div class="nc-modal-footer">
        <button id="nc-edit-save-btn" class="nc-modal-copy-btn">保存修改</button>
        <button id="nc-edit-copy-btn" class="nc-modal-copy-btn">复制</button>
        <button id="nc-edit-close-btn" class="nc-modal-close-btn">关闭</button>
    </div>
`;
            } else {
                footerHTML = `
    <div class="nc-modal-footer">
        <button id="nc-edit-save-btn" class="nc-modal-copy-btn">保存修改</button>
        <button id="nc-edit-cancel-btn" class="nc-modal-close-btn">取消</button>
    </div>
`;
            }

            modal.innerHTML = `
    <div class="nc-modal-header nc-flex--modal-header">
        <h2 class="nc-modal-title--primary-lg">${readonly ? '查看' : '编辑'}状态书 ${chapterNum ? '- 第' + chapterNum + '章' : ''}</h2>
        ${selectHTML}
    </div>
    <div id="nc-edit-state-body" class="nc-modal-body nc-scroll nc-size--max55vh"></div>
    ${footerHTML}
`;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            ModalStack.push(overlay);

            const body = modal.querySelector('#nc-edit-state-body');
            const select = modal.querySelector('#nc-edit-book-select');
            const saveBtn = modal.querySelector('#nc-edit-save-btn');
            const cancelBtn = modal.querySelector('#nc-edit-cancel-btn');
            const closeBtn = modal.querySelector('#nc-edit-close-btn');
            const copyBtn = modal.querySelector('#nc-edit-copy-btn');

            let currentBook = initialBookName;
            let currentFieldInputs = [];
            let currentFallbackInputs = [];

            // --- 辅助函数：从条目数组中提取模板条目并构建类别映射 ---
            const buildTemplateMapFromEntries = (entries, bookIndex) => {
                const templateEntry = entries.find(e => e.name === `${CONFIG.STATE_TEMPLATE_PREFIX}${bookIndex}`);
                const map = {};
                if (templateEntry) {
                    const content = templateEntry.content;
                    // 改进的正则：支持行首或换行后开始，允许前导空白，兼容 \r\n 和 \n
                    const categoryRegex = /(?:^|\n)\s*\*\*类别(\d+):([^*]+)\*\*\s*\r?\n([\s\S]*?)(?=\r?\n\s*\*\*类别\d+\s*:|$)/g;
                    let match;
                    let count = 0;
                    while ((match = categoryRegex.exec(content)) !== null) {
                        const catId = match[1];
                        const catName = match[2].trim();
                        const definition = match[3].trim();
                        map[catId] = { name: catName, definition };
                        count++;
                    }
                    // 输出最终映射的键，便于确认
                } else {
                    console.warn(`[HistoryUI._openStateEditorModal] 在条目中未找到模板条目 ${CONFIG.STATE_TEMPLATE_PREFIX}${bookIndex}`);
                }
                return map;
            };
            // --- 结束辅助函数 ---

            const loadBookForEdit = async (bookName) => {
                body.innerHTML = '<div class="nc-center--pad20-c">加载中...</div>';
                const fieldInputs = [];
                const fallbackInputs = [];

                try {
                    let entries;
                    let usingSnapshot = false;
                    if (snapshotData && snapshotData[bookName]) {
                        // 使用快照数据
                        entries = snapshotData[bookName];
                        usingSnapshot = true;
                        // 打印快照中所有条目的名称，便于调试
                    } else {
                        // 使用实时世界书数据
                        const book = await API.getWorldbook(bookName);
                        entries = Array.isArray(book) ? book : (book.entries || []);
                    }

                    const states = entries.filter(e => e?.name?.startsWith(CONFIG.STATE_ENTRY_PREFIX));

                    if (states.length === 0) {
                        body.innerHTML = '<div class="nc-center--pad20-muted-c">该状态书没有状态条目</div>';
                        return;
                    }

                    const bookIndex = parseInt(bookName.split('-')[1]);

                    // ===== 关键修改：根据数据来源构建模板映射 =====
                    let templateMap;
                    if (usingSnapshot) {
                        // 使用快照中的条目构建模板映射
                        templateMap = buildTemplateMapFromEntries(entries, bookIndex);
                    } else {
                        // 使用实时加载的全局模板
                        templateMap = stateTemplatesByBook[bookIndex] || {};
                    }

                    body.innerHTML = '';

                    states.forEach(state => {
                        const match = state.name.match(new RegExp(`^状态-${bookIndex}-(\\d+)-(.+)$`));
                        let catId = null;
                        if (match) catId = match[1];

                        const categoryItem = document.createElement('div');
                        categoryItem.className = 'nc-state-item';

                        const header = document.createElement('div');
                        header.className = 'nc-state-header';
                        header.innerHTML = `<span>${state.name}</span><span class="nc-state-arrow">▼</span>`;

                        const contentDiv = document.createElement('div');
                        contentDiv.className = 'nc-state-content';
                        contentDiv.style.display = 'none';
                        contentDiv.style.padding = '8px';

                        const templateDef = catId ? templateMap[catId]?.definition : null;
                        if (!templateDef) {
                            const textarea = document.createElement('textarea');
                            textarea.style.width = '100%';
                            textarea.style.minHeight = '150px';
                            textarea.style.padding = '8px';
                            textarea.style.background = 'rgba(0,0,0,0.4)';
                            textarea.style.color = '#eaeaea';
                            textarea.style.border = '1px solid #667eea';
                            textarea.style.borderRadius = '5px';
                            textarea.style.fontFamily = 'Consolas,monospace';
                            textarea.style.fontSize = '12px';
                            textarea.style.lineHeight = '1.5';
                            textarea.value = state.content || '';
                            if (readonly) {
                                textarea.readOnly = true;
                            }
                            contentDiv.appendChild(textarea);
                            fallbackInputs.push({
                                type: 'fallback',
                                name: state.name,
                                textarea,
                                catId,
                                stateName: state.name,
                                bookName
                            });
                        } else {
                            const fieldTree = this._parseStateDefinition(templateDef);
                            if (!fieldTree.length) {
                                console.warn(`[HistoryUI._openStateEditorModal] 模板定义解析失败，降级为纯文本`);
                                const textarea = document.createElement('textarea');
                                textarea.style.width = '100%';
                                textarea.style.minHeight = '150px';
                                textarea.style.padding = '8px';
                                textarea.style.background = 'rgba(0,0,0,0.4)';
                                textarea.style.color = '#eaeaea';
                                textarea.style.border = '1px solid #667eea';
                                textarea.style.borderRadius = '5px';
                                textarea.style.fontFamily = 'Consolas,monospace';
                                textarea.style.fontSize = '12px';
                                textarea.style.lineHeight = '1.5';
                                textarea.value = state.content || '';
                                if (readonly) {
                                    textarea.readOnly = true;
                                }
                                contentDiv.appendChild(textarea);
                                fallbackInputs.push({
                                    type: 'fallback',
                                    name: state.name,
                                    textarea,
                                    catId,
                                    stateName: state.name,
                                    bookName
                                });
                            } else {
                                const buildNodeElement = (node) => {
                                    const nodeDiv = document.createElement('div');
                                    nodeDiv.className = 'nc-field-node';
                                    nodeDiv.style.marginBottom = '6px';

                                    const rowDiv = document.createElement('div');
                                    rowDiv.style.display = 'flex';
                                    rowDiv.style.alignItems = 'center';
                                    rowDiv.style.paddingLeft = (node.indentLevel * 16) + 'px';
                                    rowDiv.style.gap = '6px';

                                    const label = document.createElement('label');
                                    label.style.fontWeight = '600';
                                    label.style.color = '#888';
                                    label.style.minWidth = '120px';
                                    label.style.fontSize = '12px';
                                    label.textContent = node.name;
                                    rowDiv.appendChild(label);

                                    if (node.children && node.children.length > 0) {
                                        const arrow = document.createElement('span');
                                        arrow.className = 'nc-field-arrow';
                                        arrow.innerHTML = '▼';
                                        arrow.style.cursor = 'pointer';
                                        arrow.style.fontSize = '10px';
                                        arrow.style.transition = 'transform 0.2s';
                                        rowDiv.appendChild(arrow);

                                        const childrenContainer = document.createElement('div');
                                        childrenContainer.className = 'nc-field-children';
                                        childrenContainer.style.display = 'none';
                                        childrenContainer.style.marginTop = '3px';
                                        node.children.forEach(childNode => {
                                            childrenContainer.appendChild(buildNodeElement(childNode));
                                        });

                                        arrow.addEventListener('click', (e) => {
                                            e.stopPropagation();
                                            const isHidden = childrenContainer.style.display === 'none';
                                            childrenContainer.style.display = isHidden ? 'block' : 'none';
                                            arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
                                        });

                                        nodeDiv.appendChild(rowDiv);
                                        nodeDiv.appendChild(childrenContainer);
                                    } else {
                                        const input = document.createElement('input');
                                        input.type = 'text';
                                        input.style.flex = '1';
                                        input.style.padding = '6px';
                                        input.style.background = 'rgba(0,0,0,0.4)';
                                        input.style.color = '#eaeaea';
                                        input.style.border = '1px solid #667eea';
                                        input.style.borderRadius = '4px';
                                        input.style.fontFamily = 'Consolas,monospace';
                                        input.style.fontSize = '12px';

                                        const existingValue = this._extractFieldValue(state.content, node.name);
                                        input.value = existingValue || node.valueFormat || '';

                                        if (readonly) {
                                            input.readOnly = true;
                                        }

                                        fieldInputs.push({
                                            type: 'field',
                                            catId,
                                            stateName: state.name,
                                            nodePath: this._getNodePath(node),
                                            input,
                                            node,
                                            bookName
                                        });

                                        rowDiv.appendChild(input);
                                        nodeDiv.appendChild(rowDiv);
                                    }

                                    return nodeDiv;
                                };

                                fieldTree.forEach(node => {
                                    contentDiv.appendChild(buildNodeElement(node));
                                });
                            }
                        }

                        header.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const open = contentDiv.style.display === 'block';
                            if (!open) {
                                contentDiv.style.display = 'block';
                                header.classList.add('nc-state-open');
                                const arrows = contentDiv.querySelectorAll('.nc-field-arrow');
                                arrows.forEach(arrow => {
                                    const childrenContainer = arrow.closest('.nc-field-node').querySelector('.nc-field-children');
                                    if (childrenContainer) {
                                        childrenContainer.style.display = 'block';
                                        arrow.style.transform = 'rotate(90deg)';
                                    }
                                });
                            } else {
                                contentDiv.style.display = 'none';
                                header.classList.remove('nc-state-open');
                            }
                        });

                        categoryItem.appendChild(header);
                        categoryItem.appendChild(contentDiv);
                        body.appendChild(categoryItem);
                    });

                    currentFieldInputs = fieldInputs;
                    currentFallbackInputs = fallbackInputs;

                } catch (e) {
                    body.innerHTML = `<div class="nc-color--error-padded2">加载失败: ${e.message}</div>`;
                    console.error(`[HistoryUI._openStateEditorModal] 加载状态书失败:`, e);
                }
            };

            if (initialBookName) {
                await loadBookForEdit(initialBookName);
            } else {
                console.warn('[HistoryUI._openStateEditorModal] initialBookName 无效，无法加载');
                body.innerHTML = '<div class="nc-center--pad20-muted-c">无可用的状态书</div>';
            }

            select.addEventListener('change', async (e) => {
                const newBook = e.target.value;
                if (newBook === currentBook) return;
                if ((currentFieldInputs.length > 0 || currentFallbackInputs.length > 0)) {
                    const confirmed = await UI.showConfirmModal('切换状态书将丢失当前未保存的修改，确定继续？', '确认');
                    if (!confirmed) {
                        select.value = currentBook;
                        return;
                    }
                }
                currentBook = newBook;
                await loadBookForEdit(newBook);
            });

            // 保存按钮逻辑
            if (saveBtn) {
                saveBtn.addEventListener('click', async () => {
                    const updatesByBook = {};

                    currentFieldInputs.forEach(item => {
                        const bookName = item.bookName || currentBook;
                        if (!updatesByBook[bookName]) updatesByBook[bookName] = {};
                        if (!updatesByBook[bookName][item.stateName]) {
                            updatesByBook[bookName][item.stateName] = { type: 'structured', fields: [] };
                        }
                        updatesByBook[bookName][item.stateName].fields.push({
                            node: item.node,
                            value: item.input.value
                        });
                    });

                    currentFallbackInputs.forEach(item => {
                        const bookName = item.bookName || currentBook;
                        if (!updatesByBook[bookName]) updatesByBook[bookName] = {};
                        updatesByBook[bookName][item.stateName] = { type: 'fallback', content: item.textarea.value };
                    });

                    for (const [bookName, stateUpdates] of Object.entries(updatesByBook)) {
                        const bookIndex = parseInt(bookName.split('-')[1]);
                        // 当保存时，我们需要使用最新的模板（实时模板），因为用户可能是在实时模式下编辑，但这里我们统一使用实时模板
                        // 或者如果是在查看历史章节状态下保存，应该更新历史章节的快照，但当前逻辑是更新实时世界书和历史章节快照
                        // 这部分逻辑保持不变，因为我们只修改了模板来源，不修改保存行为
                        const templateMap = stateTemplatesByBook[bookIndex] || {};

                        // 读取实时世界书（始终更新实时状态）
                        const book = await API.getWorldbook(bookName);
                        const entries = Array.isArray(book) ? book : (book.entries || []);

                        for (const [stateName, update] of Object.entries(stateUpdates)) {
                            if (update.type === 'fallback') {
                                const entry = entries.find(e => e.name === stateName);
                                if (entry) entry.content = update.content;
                            } else {
                                const catId = update.fields[0]?.catId;
                                const templateDef = catId ? templateMap[catId]?.definition : null;
                                if (!templateDef) {
                                    Notify.warning(`无法重组 ${stateName}：缺少模板定义`, '', { timeOut: 2000 });
                                    continue;
                                }
                                const tree = this._parseStateDefinition(templateDef);
                                const valueMap = new Map();
                                update.fields.forEach(f => valueMap.set(f.node.name, f.value));

                                const lines = [];
                                const buildLines = (nodes, indentLevel) => {
                                    nodes.forEach(node => {
                                        const indent = '  '.repeat(indentLevel);
                                        const marker = node.marker || (indentLevel === 0 ? '-' : '*');
                                        if (node.children && node.children.length > 0) {
                                            lines.push(`${indent}${marker} ${node.name}:`);
                                            buildLines(node.children, indentLevel + 1);
                                        } else {
                                            const value = valueMap.get(node.name) || node.valueFormat || '';
                                            lines.push(`${indent}${marker} ${node.name}: ${value}`);
                                        }
                                    });
                                };
                                buildLines(tree, 0);
                                const newContent = lines.join('\n');
                                const entry = entries.find(e => e.name === stateName);
                                if (entry) entry.content = newContent;
                            }
                        }

                        // 保存到实时世界书
                        await API.updateWorldbook(bookName, () => entries, { render: 'immediate' });
                        UI.updateProgress(`✅ 已更新 ${bookName}`);
                    }

                    // 如果是历史章节，更新该章节的快照
                    if (chapterNum) {
                        const chapters = Storage.loadChapters();
                        const chapter = chapters.find(c => c.num === chapterNum);
                        if (chapter) {
                            chapter.snapshot = await Snapshot.create();
                            Storage.save({ chapters });
                            UI.updateProgress(`✅ 已更新第${chapterNum}章的快照`);
                        }
                    }

                    Notify.success('状态修改已保存', '', { timeOut: 2000 });

                    if (stayOpen) {
                        // 重新加载当前书
                        snapshotData = null; // 清除快照数据，强制使用实时书
                        await loadBookForEdit(currentBook);
                    } else {
                        UI._closeModal(overlay);
                    }
                });
            }

            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => UI._closeModal(overlay));
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', () => UI._closeModal(overlay));
            }

            if (copyBtn) {
                copyBtn.addEventListener('click', async () => {
                    // 复制功能保持不变，但应基于当前显示的内容（可能是快照或实时）
                    try {
                        const stateGroups = {};
                        currentFieldInputs.forEach(item => {
                            if (!stateGroups[item.stateName]) {
                                stateGroups[item.stateName] = { fields: [], fallback: null };
                            }
                            stateGroups[item.stateName].fields.push(item);
                        });
                        currentFallbackInputs.forEach(item => {
                            if (!stateGroups[item.stateName]) {
                                stateGroups[item.stateName] = { fields: [], fallback: item };
                            } else {
                                stateGroups[item.stateName].fallback = item;
                            }
                        });

                        const texts = [];

                        for (const [stateName, group] of Object.entries(stateGroups)) {
                            if (group.fallback) {
                                texts.push(`【${stateName}】\n${group.fallback.textarea.value}`);
                            } else if (group.fields.length > 0) {
                                const sampleField = group.fields[0];
                                const bookIndex = parseInt(sampleField.bookName.split('-')[1]);
                                const templateMap = stateTemplatesByBook[bookIndex] || {};
                                const catId = sampleField.catId;
                                const templateDef = templateMap[catId]?.definition;

                                if (!templateDef) {
                                    const lines = group.fields.map(f => `${f.node.name}: ${f.input.value}`).join('\n');
                                    texts.push(`【${stateName}】\n${lines}`);
                                    continue;
                                }

                                const tree = this._parseStateDefinition(templateDef);
                                const valueMap = new Map();
                                group.fields.forEach(f => valueMap.set(f.node.name, f.input.value));

                                const lines = [];
                                const buildLines = (nodes, indentLevel) => {
                                    nodes.forEach(node => {
                                        const indent = '  '.repeat(indentLevel);
                                        const marker = node.marker || (indentLevel === 0 ? '-' : '*');
                                        if (node.children && node.children.length > 0) {
                                            lines.push(`${indent}${marker} ${node.name}:`);
                                            buildLines(node.children, indentLevel + 1);
                                        } else {
                                            const value = valueMap.get(node.name) || node.valueFormat || '';
                                            lines.push(`${indent}${marker} ${node.name}: ${value}`);
                                        }
                                    });
                                };
                                buildLines(tree, 0);
                                texts.push(`【${stateName}】\n${lines.join('\n')}`);
                            }
                        }

                        const fullText = texts.join('\n\n');
                        await navigator.clipboard.writeText(fullText);
                        Notify.success('状态内容已复制到剪贴板', '', { timeOut: 2000 });
                    } catch (err) {
                        Notify.error('复制失败: ' + err.message);
                    }
                });
            }

            overlay.addEventListener('click', e => {
                if (e.target === overlay) UI._closeModal(overlay);
            });
        },

        // ==================== 分支核心操作 ====================

        async deleteChaptersAndImages(toDeleteNums, allChapters) {

            const remainingChapters = allChapters.filter(c => !toDeleteNums.includes(c.num));

            // 收集剩余章节使用的图片、音频、文本 ID
            const usedImageIds = new Set();
            const usedAudioIds = new Set();
            const usedTextIds = new Set();
            remainingChapters.forEach(ch => {
                extractImageIds(ch.content).forEach(id => usedImageIds.add(id));
                extractAudioIds(ch.content).forEach(id => usedAudioIds.add(id));
                extractOtherFileIds(ch.content).forEach(id => usedTextIds.add(id));
            });

            // 遍历要删除的章节，删除不再被引用的图片、音频、文本
            for (const num of toDeleteNums) {
                const ch = allChapters.find(c => c.num === num);
                if (!ch || !ch.content) continue;

                const imgIds = extractImageIds(ch.content);
                for (const id of imgIds) {
                    if (!usedImageIds.has(id)) {
                        await ImageStore.delete(id).catch(e => console.warn(`删除图片 ${id} 失败`, e));
                    }
                }

                const audioIds = extractAudioIds(ch.content);
                for (const id of audioIds) {
                    if (!usedAudioIds.has(id)) {
                        await AudioStore.delete(id).catch(e => console.warn(`删除音频 ${id} 失败`, e));
                    }
                }

                const otherFileIds = extractOtherFileIds(ch.content);
                for (const id of otherFileIds) {
                    if (!usedTextIds.has(id)) {
                        await OtherFileStore.delete(id).catch(e => console.warn(`删除文本 ${id} 失败`, e));
                    }
                }
            }

            await MappingManager.deleteMappingsByChapters(toDeleteNums);

            // 保存剩余章节
            Storage.save({ chapters: remainingChapters });

        },

        /**
         * 回滚到指定章节（恢复快照，并删除其所有后代）
         * @param {number} chapterNum - 目标章节号
         */
        async rollbackToChapter(chapterNum) {

            const chapters = Storage.loadChapters();
            const chapter = chapters.find(c => c.num === chapterNum);
            if (!chapter || !chapter.snapshot) {
                Notify.warning('该章节无快照');
                console.warn('[rollbackToChapter] 无快照');
                return false;
            }

            const descendants = collectDescendants(chapterNum, chapters, false); // 不包含自身
            if (descendants.length > 0) {
                const ok = await UI.showConfirmModal(`回滚将删除本分支后续 ${descendants.length} 章，其他分支不受影响。确定吗？`, '确认');
                if (!ok) return false;
            }

            // 删除后代章节及图片
            await this.deleteChaptersAndImages(descendants, chapters);

            // 恢复快照
            const restored = await Snapshot.restore(chapter.snapshot);
            if (restored) {
                WORKFLOW_STATE.activeChapterNum = chapterNum;
                WORKFLOW_STATE.currentBranchStart = chapterNum;
                WORKFLOW_STATE.currentBranchLatest = chapterNum;
                Notify.success(`已回滚到第${chapterNum}章`);

                this.refresh();
                return true;
            }
            console.warn('[rollbackToChapter] 快照恢复失败');
            return false;
        },

        /**
         * 从此分支开始新分支（仅恢复快照，不删除后代）
         * @param {number} chapterNum - 目标章节号
         */
        async startBranchFrom(chapterNum) {

            const chapters = Storage.loadChapters();
            const chapter = chapters.find(c => c.num === chapterNum);
            if (!chapter || !chapter.snapshot) {
                Notify.warning('该章节无快照');
                return;
            }
            const restored = await Snapshot.restore(chapter.snapshot);
            if (restored) {
                WORKFLOW_STATE.activeChapterNum = chapterNum;
                WORKFLOW_STATE.currentBranchStart = chapterNum;
                WORKFLOW_STATE.currentBranchLatest = chapterNum;
                Notify.success(`已切换到第${chapterNum}章开始新分支`);

                this.refresh();
            }
        },

        /**
         * 递归删除指定章节及其所有后代
         * @param {number} chapterNum - 起始章节号
         */
        async deleteChapter(chapterNum) {

            const chapters = Storage.loadChapters();
            const toDelete = collectDescendants(chapterNum, chapters, true); // 包含自身
            const msg = `确定删除该章节及其所有子分支（共 ${toDelete.length} 章）吗？`;
            const confirmed = await UI.showConfirmModal(msg, '确认');
            if (!confirmed) return;

            await this.deleteChaptersAndImages(toDelete, chapters);

            // 重置相关状态
            if (toDelete.includes(WORKFLOW_STATE.activeChapterNum)) WORKFLOW_STATE.activeChapterNum = undefined;
            if (toDelete.includes(WORKFLOW_STATE.currentBranchStart)) {
                WORKFLOW_STATE.currentBranchStart = undefined;
                WORKFLOW_STATE.currentBranchLatest = undefined;
            }

            this.refresh();
        },

        /**
         * 批量删除选中章节及其后代
         * @param {Array<number>} selectedNums - 用户勾选的章节号数组
         */
        async deleteSelectedChapters(selectedNums) {

            const chapters = Storage.loadChapters();
            const toDeleteSet = new Set();
            selectedNums.forEach(num => {
                collectDescendants(num, chapters, true).forEach(n => toDeleteSet.add(n));
            });
            const toDelete = Array.from(toDeleteSet);
            const confirmed = await UI.showConfirmModal(`删除将影响 ${toDelete.length} 章，确定吗？`, '确认');
            if (!confirmed) return;
            await this.deleteChaptersAndImages(toDelete, chapters);

            // 重置状态
            if (toDelete.includes(WORKFLOW_STATE.activeChapterNum)) WORKFLOW_STATE.activeChapterNum = undefined;
            if (toDelete.includes(WORKFLOW_STATE.currentBranchStart)) {
                WORKFLOW_STATE.currentBranchStart = undefined;
                WORKFLOW_STATE.currentBranchLatest = undefined;
            }

            this.refresh();
        },

        /**
         * 全选当前分支（当前活跃节点及其所有后代）
         */
        selectCurrentBranch() {

            const activeNum = WORKFLOW_STATE.activeChapterNum;
            if (!activeNum) {
                Notify.warning('请先点击一个章节');
                return;
            }
            const chapters = Storage.loadChapters();
            const branchNums = collectDescendants(activeNum, chapters, true); // 包含自身


            const panel = document.querySelector('.nc-history-panel');
            if (panel) {
                panel.querySelectorAll('.chapter-checkbox').forEach(cb => {
                    const num = parseInt(cb.value);
                    cb.checked = branchNums.includes(num);
                });
            }

        }
    };


    // ╔══════════════════════════════════════════════════════════════════╗