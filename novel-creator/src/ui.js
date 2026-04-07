    // ║  模块 19：UI 主界面                                              ║
    // ║  UI 对象 — 面板 / 事件绑定 / 工作流预览 / 文件管理 / 配置复制     ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module UI — 主面板 / 工作流可视化 / 文件管理 / 配置复制 / 响应式选项卡 */

    // ==================== UI - 主界面 ====================

    const UI = {

        customStyleElement: null,
        // apiCheckInterval: null,
        _showAgentStatusDetailTimeout: null,
        _lastAgentKey: null,

        /**
         * 加载自定义配色样式CSS文件
         * 弹出文件选择器，读取CSS内容并创建 <style> 标签覆盖默认样式
         */
        loadCustomCSS() {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.css,text/css';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);

            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    fileInput.remove();
                    return;
                }

                try {
                    const cssText = await file.text();

                    // 移除已存在的自定义样式标签
                    if (this.customStyleElement && this.customStyleElement.parentNode) {
                        this.customStyleElement.remove();
                    }

                    // 创建新的样式标签
                    const style = document.createElement('style');
                    style.id = 'nc-custom-styles';
                    style.textContent = cssText;
                    document.head.appendChild(style);

                    this.customStyleElement = style;
                    Notify.success(`配色样式已加载: ${file.name}`, '', { timeOut: 2000 });
                } catch (err) {
                    Notify.error(`读取CSS文件失败: ${err.message}`);
                } finally {
                    fileInput.remove();
                }
            });

            fileInput.click();
        },

        _renderAPIStatus(panel) {
            const container = panel.querySelector('#nc-api-status-container');
            if (!container) return;

            const apiStatus = WORKFLOW_STATE.apiStatus || {};
            const apiConfigs = CONFIG.apiConfigs || {};

            const allConfigIds = Object.keys(apiConfigs);

            if (allConfigIds.length === 0) {
                container.innerHTML = '<div class="nc-text--xs-center-muted">未配置自定义API</div>';
                return;
            }

            let html = '<div class="nc-text--section-hd">🔌 API状态</div>';
            for (const id of allConfigIds) {
                const status = apiStatus[id];
                const config = apiConfigs[id];
                let statusHtml;
                if (status) {
                    if (status.ok) {
                        statusHtml = `<span class="nc-text--success">✅ 可用</span>`;
                    } else {
                        statusHtml = `<span class="nc-text--danger" title="${escapeHtml(status.error || '')}">❌ 不可用</span>`;
                    }
                } else {
                    statusHtml = `<span class="nc-text--warn-yellow">⏳ 未测试</span>`;
                }
                html += `<div class="nc-flex--row-api-item">
            <span class="nc-color--muted">${id} (${config ? config.model : '?'}):</span>
            <span>${statusHtml} <button class="nc-api-retest-btn nc-icon-btn--retest" data-config-id="${id}">↻</button></span>
        </div>`;
            }

            container.innerHTML = html;

            // 绑定重新测试按钮
            container.querySelectorAll('.nc-api-retest-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const configId = e.target.dataset.configId;
                    const config = apiConfigs[configId];
                    if (!config) return;
                    e.target.disabled = true;
                    e.target.textContent = '测试中...';
                    const result = await testAPIConnection(config);
                    WORKFLOW_STATE.apiStatus[configId] = {
                        ok: result.ok,
                        error: result.error,
                        lastTest: Date.now(),
                    };
                    this._renderAPIStatus(panel);
                });
            });
        },

        _downloadText(content, filename, mimeType = 'text/plain;charset=utf-8') {
            const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
            Object.assign(document.createElement('a'), { href: url, download: filename }).click();
            URL.revokeObjectURL(url);
        },

        _openModal(overlayEl) {
            document.body.appendChild(overlayEl);
            ModalStack.push(overlayEl);
            overlayEl.addEventListener('click', e => {
                if (e.target === overlayEl) {
                    ModalStack.closeTop();
                }
            });
        },

        _closeModal(overlayEl) {

            overlayEl.style.opacity = '0';
            overlayEl.style.transition = 'opacity 0.2s';
            setTimeout(() => {
                ModalStack.remove(overlayEl);
                overlayEl.remove();


                if (ModalStack._stack.length === 0 && !document.getElementById(CONFIG.UI.panelId)) {

                    UI.createPanel();
                }
            }, 200);
        },

        updateSubmitButtons(mode) {
            let submitBtn = document.getElementById('nc-submit-input');
            let chapterBtn = document.getElementById('nc-submit-chapter-status');
            let viewReqBtn = document.getElementById('nc-view-requirement');

            if (!submitBtn || !chapterBtn || !viewReqBtn) {
                console.warn('[UI.updateSubmitButtons] 部分元素未找到，50ms后重试');
                setTimeout(() => {
                    this.updateSubmitButtons(mode);
                }, 50);
                return;
            }

            if (mode == null) {
                submitBtn.disabled = true;
                chapterBtn.disabled = true;
                viewReqBtn.classList.add('nc-hidden');
                return;
            }

            if (mode === 'txt') {
                submitBtn.disabled = false;
                chapterBtn.disabled = true;
                chapterBtn.textContent = '📚 章节状态';
                viewReqBtn.classList.remove('nc-hidden');
            } else if (mode === 'status' || mode === 'chapter' || mode === 'all') {
                submitBtn.disabled = true;
                chapterBtn.disabled = false;
                chapterBtn.textContent = '📚 章节状态';
                viewReqBtn.classList.remove('nc-hidden');
            }
            else if (mode.startsWith('read_')) {
                submitBtn.disabled = true;
                chapterBtn.disabled = false;
                const fileType = mode.substring(5);
                let btnText = '📖 读取文件';
                if (fileType === 'png') btnText = '🖼️ 读取图片';
                else if (fileType === 'txt') btnText = '📄 读取文本';
                else if (fileType === 'html') btnText = '🌐 读取 HTML';
                else if (fileType === 'js') btnText = '📜 读取 JS';
                chapterBtn.textContent = btnText;
                viewReqBtn.classList.remove('nc-hidden');
            } else if (mode.startsWith('save_')) {
                submitBtn.disabled = true;
                chapterBtn.disabled = false;
                const fileType = mode.substring(5);
                let btnText = '💾 保存文件';
                if (fileType === 'png') btnText = '🖼️ 保存图片';
                else if (fileType === 'txt') btnText = '📄 保存文本';
                else if (fileType === 'html') btnText = '🌐 保存 HTML';
                else if (fileType === 'js') btnText = '📜 保存 JS';
                chapterBtn.textContent = btnText;
                viewReqBtn.classList.remove('nc-hidden');
            }
            else {
                submitBtn.disabled = true;
                chapterBtn.disabled = true;
                viewReqBtn.classList.add('nc-hidden');
            }
        },

        showMarkdownModal(title, content, options = {}) {
            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100060';

            const modal = document.createElement('div');
            modal.className = 'nc-modal nc-scroll';
            if (options.fontFamily) modal.style.fontFamily = options.fontFamily;
            if (options.lineHeight) modal.style.lineHeight = options.lineHeight;
            if (options.maxWidth) modal.style.maxWidth = options.maxWidth;

            modal.innerHTML = `
        <div class="nc-modal-header">
            <h2 style="margin:0;color:${options.accentColor || '#667eea'};font-size:${options.titleSize || '20px'};">
                ${escapeHtml(title)}
            </h2>
            ${options.subtitle ? `<p class="nc-modal-subtitle--gray">${escapeHtml(options.subtitle)}</p>` : ''}
        </div>
        <div class="nc-modal-body nc-scroll markdown-body">${this._renderMarkdown(content)}</div>
        <div class="nc-modal-footer">
            <button class="nc-modal-copy-btn">复制内容</button>
            <button class="nc-modal-close-btn">关闭</button>
        </div>
    `;

            overlay.appendChild(modal);
            this._openModal(overlay);

            modal.querySelector('.nc-modal-close-btn').addEventListener('click', () => this._closeModal(overlay));

            modal.querySelector('.nc-modal-copy-btn').addEventListener('click', async () => {
                const textToCopy = content;
                await copyToClipboard(textToCopy, '内容已复制到剪贴板');
            });

            return overlay;
        },

        showErrorPanel(errorMessage) {


            this.closeAll();

            // 构造配置文件行
            let configLine;
            if (WORKFLOW_STATE.currentConfigFile) {
                configLine = `📄 配置文件: ✓ ${WORKFLOW_STATE.currentConfigFile.name} (${(WORKFLOW_STATE.currentConfigFile.size / 1024).toFixed(2)} KB)`;
            } else if (Object.keys(CONFIG.AGENTS).length > 0) {
                configLine = `📄 配置文件: ✓ 已加载 (文件名未知)`;
            } else {
                configLine = `📄 配置文件: ❌ 未加载`;
            }

            // 如果传入的错误信息已经包含配置文件行，则替换第一行，否则直接拼接
            let fullError;
            if (errorMessage && errorMessage.startsWith('📄 配置文件:')) {
                const lines = errorMessage.split('\n');
                lines[0] = configLine;
                fullError = lines.join('\n');
            } else {
                fullError = configLine + (errorMessage ? `\n${errorMessage}` : '');
            }

            // 保存失败信息到全局状态
            WORKFLOW_STATE.lastCheckFailed = true;
            WORKFLOW_STATE.lastCheckErrorMessage = fullError;


            const escapedError = escapeHtml(fullError);
            const coloredError = escapedError
                .replace(/✓/g, '<span class="nc-text--success-bold">✓</span>')
                .replace(/✗/g, '<span class="nc-text--danger-bold">✗</span>')
                .replace(/❌/g, '<span class="nc-text--danger-bold">❌</span>');

            const loadButtonText = WORKFLOW_STATE.currentConfigFile ? '🔄 重新加载配置文件' : '📂 加载配置文件';

            const overlay = document.createElement('div');
            overlay.id = CONFIG.UI.overlayId;
            overlay.className = 'nc-overlay nc-font';

            const panel = document.createElement('div');
            panel.id = CONFIG.UI.panelId;
            panel.className = 'nc-panel nc-scroll nc-error-panel';

            panel.innerHTML = `
        <div class="nc-error-title">
            <div class="nc-icon--warn-xl">⚠️</div>
            <h2 class="nc-modal-title--error">系统检测未通过</h2>
        </div>
        <div class="nc-error-list">${coloredError}</div>
        <div class="nc-error-buttons">
            <button id="nc-retry-btn" class="nc-btn nc-btn-primary nc-btn-sm">🔄 重新检测</button>
            <button id="nc-load-config-btn" class="nc-btn nc-btn-secondary nc-btn-sm">${loadButtonText}</button>
            <button id="nc-close-btn" class="nc-btn nc-btn-ghost nc-btn-sm">❌ 关闭</button>
        </div>
    `;

            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            // 绑定事件
            panel.querySelector('#nc-retry-btn').addEventListener('click', async () => {

                // 先清除失败标志，确保重新检测时不会因为旧的缓存而跳过
                WORKFLOW_STATE.lastCheckFailed = false;
                WORKFLOW_STATE.lastCheckErrorMessage = '';
                this.closeAll();
                await openPanelWithCheck(true);
            });
            panel.querySelector('#nc-close-btn').addEventListener('click', () => {

                this.closeAll();
            });
            panel.querySelector('#nc-load-config-btn').addEventListener('click', () => {

                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json,application/json';
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    try {
                        const text = await file.text();
                        const json = JSON.parse(text);

                        const success = loadConfigFromJson(json, file.name, file.size);
                        if (!success) {
                            console.error('[错误面板] loadConfigFromJson 返回失败');
                            return;
                        }
                        Notify.success('配置文件加载成功...', '', { timeOut: 2000 });
                        this.closeAll();

                        await openPanelWithCheck();
                    } catch (err) {
                        console.error('[错误面板] 加载配置文件失败:', err);
                        Notify.error(`加载配置文件失败: ${err}`);
                    }
                };
                fileInput.click();
            });
        },

        closeAll() {
            const existing = document.querySelectorAll('.nc-overlay');
            existing.forEach(el => el.remove());
            ModalStack._stack = [];  // 直接清空栈


        },

        createFloatButton() {
            if (document.getElementById(CONFIG.UI.buttonId)) return;
            const btn = document.createElement('div');
            btn.id = CONFIG.UI.buttonId;
            btn.className = 'nc-font';
            btn.textContent = '📚 创作';

            // 初始位置：水平居中，距离底部1/5高度
            btn.style.position = 'fixed';
            btn.style.left = '50%';
            btn.style.transform = 'translateX(-50%)';
            btn.style.bottom = Math.round(window.innerHeight * 0.15) + 'px';
            btn.style.right = 'auto';

            let dragging = false, startX, startY, origLeft, origBottom;

            btn.addEventListener('mousedown', e => {
                dragging = false;
                startX = e.clientX;
                startY = e.clientY;
                const rect = btn.getBoundingClientRect();
                origLeft = rect.left;
                origBottom = window.innerHeight - rect.bottom;

                btn.style.left = origLeft + 'px';
                btn.style.transform = 'none';
                btn.style.right = 'auto';

                const onMove = mv => {
                    const dx = mv.clientX - startX;
                    const dy = mv.clientY - startY;
                    if (!dragging && Math.hypot(dx, dy) > 5) {
                        dragging = true;
                        btn.classList.add('nc-dragging');
                    }
                    if (dragging) {
                        const newLeft = Math.max(0, Math.min(window.innerWidth - btn.offsetWidth, origLeft + dx));
                        const newBottom = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight, origBottom - dy));
                        btn.style.left = newLeft + 'px';
                        btn.style.bottom = newBottom + 'px';
                    }
                };
                const onUp = () => {
                    btn.classList.remove('nc-dragging');
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });

            btn.addEventListener('click', () => {
                if (!dragging) openPanelWithCheck();
            });
            document.body.appendChild(btn);
        },

        // ==================== 根据选择计算Agent列表 ====================

        calculateAgentsFromSelection() {


            // 自定义模式：直接返回用户保存的自定义 Agent 列表
            if (WORKFLOW_STATE.currentProfile === 'custom') {
                return Storage.loadCustomAgents();
            }

            // 预选模式：从分类选择状态计算
            const state = WORKFLOW_STATE.selectionState;
            let agents = new Set();

            // 必需Agent
            const requiredAgents = Object.entries(CONFIG.AGENTS)
                .filter(([_, agent]) => agent.required)
                .map(([key]) => key);
            requiredAgents.forEach(a => agents.add(a));


            // 遍历所有分类，收集选中选项的 agents
            if (CONFIG.categories) {
                for (const [catKey, category] of Object.entries(CONFIG.categories)) {
                    const selected = state[catKey];
                    if (!selected) continue;

                    const selectedKeys = Array.isArray(selected) ? selected : [selected];
                    for (const optKey of selectedKeys) {
                        const option = category.options?.[optKey];
                        if (option && option.agents) {

                            option.agents.forEach(a => agents.add(a));
                        }
                    }
                }
            }

            return Array.from(agents).sort((a, b) => {
                const orderA = CONFIG.AGENTS[a]?.order || 999;
                const orderB = CONFIG.AGENTS[b]?.order || 999;
                return orderA - orderB;
            });
        },

        async createPanel() {
            this.closeAll();

            const overlay = document.createElement('div');
            overlay.id = CONFIG.UI.overlayId;
            overlay.className = 'nc-overlay nc-font';

            const panel = document.createElement('div');
            panel.id = CONFIG.UI.panelId;
            panel.className = 'nc-panel';

            const chapters = Storage.loadChapters();
            const latestNum = chapters.length > 0 ? Math.max(...chapters.map(c => c.num)) : 0;
            const settings = Storage.loadSettings();
            WORKFLOW_STATE.currentProfile = settings.profile || 'standard';
            if (settings.enforceUniqueBranches !== undefined) {
                WORKFLOW_STATE.enforceUniqueBranches = settings.enforceUniqueBranches;
            }

            // 加载保存的预选状态
            const savedSelection = Storage.loadSelectionState();
            WORKFLOW_STATE.selectionState = { ...WORKFLOW_STATE.selectionState, ...savedSelection };

            // 不再直接调用 init() 重置所有状态，而是确保所有配置中的 Agent 都有状态
            for (const key of Object.keys(CONFIG.AGENTS)) {
                if (AgentStateManager.states[key] === undefined) {
                    AgentStateManager.states[key] = 'idle';
                }
            }
            panel.innerHTML = this._getPanelHTML(latestNum);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            this._bindPanelEvents(panel);
            this._updateModeLabel(panel);
            this.updateTokenDisplay();
            this.updateWorkflowViz();
            this.setLoading(WORKFLOW_STATE.isRunning);
            this._renderProgressLog();

            const isMobile = window.innerWidth <= 1024;
            if (!isMobile) {
                // 桌面端默认展开所有树形菜单
                panel.querySelectorAll('.nc-tree-header').forEach(header => {
                    header.classList.add('expanded');
                    const children = header.nextElementSibling;
                    if (children) children.classList.add('expanded');
                });
            }
            // ── 响应式选项卡导航（平板/手机端）──────────────────────────
            UI._initTabBar(panel);
            window.addEventListener('resize', () => UI._initTabBar(panel), { passive: true });


            // 使用 requestAnimationFrame 确保在下一帧刷新状态，避免渲染延迟
            requestAnimationFrame(() => {
                this.updateWorkflowAgentStates();
                this._renderProgressLog(); // 再次渲染进度，确保内容正确
                // 确保启动层初始显示正确
                this._updateLaunchLayer(panel);
                // 渲染API状态
                this._renderAPIStatus(panel);
            });

            // 渲染完成后，检查是否处于等待输入状态，并更新按钮
            if (WORKFLOW_STATE.awaitingInput) {
                const mode = WORKFLOW_STATE.pendingInputMode || 'txt';
                UI.updateSubmitButtons(mode);
            } else {
                UI.updateSubmitButtons(null);
            }

            WORKFLOW_STATE.lastCheckFailed = false;
            WORKFLOW_STATE.lastCheckErrorMessage = '';

        },

        // ==================== 生成启动层HTML ====================

        _getLaunchLayerHTML(enabledAgents) {
            // 参数保护：如果 enabledAgents 不是数组，则返回空字符串
            if (!Array.isArray(enabledAgents)) {
                console.error('[ERROR] _getLaunchLayerHTML: enabledAgents is not an array', enabledAgents);
                return '';
            }
            const sortedAgents = enabledAgents.sort((a, b) =>
                (CONFIG.AGENTS[a]?.order || 999) - (CONFIG.AGENTS[b]?.order || 999)
            );


            return sortedAgents.map(agentKey => {
                const agent = CONFIG.AGENTS[agentKey];
                const isRequired = agent?.required || false;
                const hoverText = getAgentHoverText(agentKey);
                const titleAttr = hoverText ? ` title="${escapeHtml(hoverText)}"` : '';
                const displayName = getAgentDisplayName(agentKey).replace('Agent ', '');
                return `
            <label class="nc-agent-checkbox ${isRequired ? 'required' : ''}" data-agent="${agentKey}"${titleAttr}>
                <input type="checkbox" value="${agentKey}" checked ${isRequired ? 'disabled' : ''}>
                <span>${displayName}</span>
                ${isRequired ? '<span class="nc-required-badge">必选</span>' : ''}
            </label>
        `;
            }).join('') || '<span class="nc-text--sm-muted2">暂无启用Agent</span>';
        },

        // ==================== 生成面板HTML ====================

        _getPanelHTML(latestNum) {
            // 生成层次树形菜单
            const treeMenuHTML = this._getTreeMenuHTML();

            // 生成Agent自定义区域（所有复选框 + 内部启动层）
            const agentCustomHTML = this._getAgentCustomHTML();

            const stateLabels = {
                running: '运行中',
                waiting_input: '等待输入',
                reflow_processing: '回流处理中',
                reflow_waiting: '回流等待',
                completed: '完成',
                error: '异常'
            };

            let statusIndicatorHTML = '';
            for (const [state, label] of Object.entries(stateLabels)) {
                const colors = CONFIG.AGENT_STATUS_COLORS[state] || { border: '#888', text: '#888' };
                let color;
                if (state === 'idle' || state === 'reflow_waiting') {
                    color = colors.text;
                } else {
                    color = colors.border;
                }
                statusIndicatorHTML += `<span><span style="color:${color};">●</span> ${label}</span>`;
            }

            return `
        <!-- 面板头部 -->
        <div class="nc-panel-header">
            <div class="nc-panel-title">
                <span class="nc-panel-title-icon">📚</span>
                <div>
                    <div class="nc-panel-title-text">${CONFIG.NAME}</div>
                    <div class="nc-panel-title-sub">v${CONFIG.VERSION} · 分层分类型预选 · ${Object.keys(CONFIG.AGENTS).length}个Agent协作</div>                        </div>
            </div>
            <div class="nc-token-display">
                <div class="nc-token-main">
                    <span class="nc-token-value" id="nc-token-total">0</span>
                    <span class="nc-token-label">tokens</span>
                </div>
                <span class="nc-token-last" id="nc-token-last">本次: -</span>
                <button id="nc-token-reset" class="nc-btn nc-btn-xs nc-btn-ghost nc-btn--token-reset">重置</button>
            </div>
        </div>

        <!-- 面板主体 - 四栏布局，占2/3高度 -->
        <div class="nc-panel-body nc-flex-item--grow2">
            <!-- 左侧：层次树形预选菜单 -->
            <div class="nc-card nc-card--accent">
                <div class="nc-card-title">🎯 预选配置</div>
                <div class="nc-card-content nc-scroll">
                    ${treeMenuHTML}
                </div>
            </div>

            <!-- 左中：Agent自定义（所有复选框 + 内部启动层） -->
            <div class="nc-card">
                <div class="nc-card-title">⚙️ Agent配置</div>
                <div class="nc-card-content nc-scroll nc-size--full-h">
                    ${agentCustomHTML}
                </div>
            </div>

            <!-- 右中：工作流预览监控 -->
            <div class="nc-card">
                <div class="nc-card-title">📊 工作流预览监控</div>
                <div class="nc-card-content nc-flex--col-10-full">
                    <!-- 状态颜色指示器 -->
                    <div class="nc-flex--info-hint-row">
                        ${statusIndicatorHTML}
                    </div>
                    <!-- 工作流预览容器（包含Agent按钮和废章层） -->
                    <div id="nc-workflow-viz" class="nc-scroll nc-flex-item--workflow-viz">
                        <!-- 内容由 updateWorkflowViz 动态生成 -->
                    </div>
                </div>
            </div>

            <!-- 右侧：输入与进度 -->
            <div class="nc-card nc-card--dark">
                <div class="nc-card-title">📝 输入框</div>
                <div class="nc-card-content nc-flex--col-grow-overflow">
                    <div class="nc-flex--input-toolbar">
                        <div class="nc-chapter-info">
                            <span>当前: 第<span class="nc-chapter-num" id="nc-current-chapter-num">${latestNum}</span>章</span>
                        </div>
                        <div class="nc-toolbar">
                            <button class="nc-toolbar-btn" id="nc-view-chapter-content">查修文章</button>
                            <button class="nc-toolbar-btn" id="nc-view-chapter-status">查修状态</button>
                            <button class="nc-toolbar-btn nc-toolbar-btn--clear" id="nc-clear-input">清空</button>
                        </div>
                    </div>
                    <textarea id="nc-user-input" placeholder="请输入，例如：&#10;• 发现新的线索，推进主线剧情发展&#10;• 人物关系发生重大转折或变化&#10" class="nc-flex-item--no-shrink">${WORKFLOW_STATE.userInputCache || ''}</textarea>
                    <div class="nc-flex--action-bar">
                        <button id="nc-submit-input" class="nc-btn nc-btn-primary nc-btn-sm" disabled>✍️ 提交输入</button>
                        <button id="nc-submit-chapter-status" class="nc-btn nc-btn-primary nc-btn-sm" disabled>📚 章节状态</button>
                        <button id="nc-view-requirement" class="nc-btn nc-btn-primary nc-btn-sm nc-hidden">📋 要求</button>
                    </div>

                    <!-- 进度区域 -->
                    <div class="nc-mt12--progress-section">
                        <div class="nc-card-title nc-text--card-title">🚀 执行进度</div>
                        <div id="nc-progress-content" class="nc-scroll nc-flex-item--progress">准备启动...</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="nc-panel-footer nc-flex--row-10-middle">
            <div class="nc-flex-item--footer-left">
                <button id="nc-reload-config-btn" class="nc-btn nc-btn-secondary nc-btn-sm">📂 加载配置文件</button>
                <button id="nc-load-css-btn" class="nc-btn nc-btn-secondary nc-btn-sm">🎨 加载配色样式</button>
                <button id="nc-config-gui-btn" class="nc-btn nc-btn-secondary nc-btn-sm">⚙️ 配置GUI</button>
            </div>
            <div class="nc-flex-item--footer-center">
                <button id="nc-clean-pure-btn" class="nc-btn nc-btn-danger nc-btn-sm">🧹 一键纯净</button>
                <button id="nc-history-btn" class="nc-btn nc-btn-secondary nc-btn-sm">📚 历史章节</button>
                <button id="nc-file-manager-btn" class="nc-btn nc-btn-secondary nc-btn-sm">📁 文件管理</button>
                <button id="nc-export-data-btn" class="nc-btn nc-btn-secondary nc-btn-sm">📊 数据导出</button>
                <button id="nc-novel-data-btn" class="nc-btn nc-btn-secondary nc-btn-sm">📊 小说数据化</button>
            </div>
            <div class="nc-flex-item--footer-right">
                <div class="nc-flex--row-5-middle">
                    <input type="checkbox" id="nc-auto-mode" ${WORKFLOW_STATE.autoMode ? 'checked' : ''}>
                    <label for="nc-auto-mode" class="nc-text--sm-clickable">自动</label>
                </div>
                <!-- ===== 新增：唯一分支开关 ===== -->
                <div class="nc-flex--row-5-middle">
                    <input type="checkbox" id="nc-enforce-unique" ${WORKFLOW_STATE.enforceUniqueBranches ? 'checked' : ''}>
                    <label for="nc-enforce-unique" class="nc-text--sm-clickable" title="开启后，同一选项只能生成一个目标章节">🔒 分支</label>
                </div>
                <!-- ===== 结束新增 ===== -->
                <button id="nc-stop-btn" class="nc-btn nc-btn-danger nc-btn-sm nc-hidden">⏸️ 中断</button>
                <button id="nc-start-btn" class="nc-btn nc-btn-primary nc-btn-sm">▶️ 启动</button>
                <button id="nc-close-btn" class="nc-btn nc-btn-ghost nc-btn-sm">❌ 关闭</button>
            </div>
        </div>
    `;
        },

        // ==================== 生成树形菜单HTML ====================

        _getTreeMenuHTML() {
            const state = WORKFLOW_STATE.selectionState;
            let treeHTML = '';

            if (!CONFIG.categories) return '<div>无分类配置</div>';

            for (const [catKey, category] of Object.entries(CONFIG.categories)) {
                const optionsHTML = Object.entries(category.options || {}).map(([optKey, opt]) => {
                    const isSelected = state[catKey] === optKey;
                    return `
                        <div class="nc-tree-child-item ${isSelected ? 'selected' : ''}"
                            data-category="${catKey}" data-option="${optKey}">
                            <span class="nc-tree-child-icon">${opt.icon || ''}</span>
                            <div class="nc-tree-child-content">
                                <div class="nc-tree-child-title">${opt.name}</div>
                                <div class="nc-tree-child-desc">${opt.description || ''}</div>
                            </div>
                        </div>
                    `;
                }).join('');

                treeHTML += `
                    <div class="nc-tree-item">
                        <div class="nc-tree-header" data-tree="${catKey}">  <!-- 移除 expanded 类 -->
                            <span class="nc-tree-arrow">▶</span>
                            <span class="nc-tree-icon">📋</span>
                            <div class="nc-tree-content">
                                <div class="nc-tree-title">${category.name}</div>
                                <div class="nc-tree-desc">${category.description || ''}</div>
                            </div>
                        </div>
                        <div class="nc-tree-children">  <!-- 移除 expanded 类 -->
                            ${optionsHTML}
                        </div>
                    </div>
                `;
            }

            return treeHTML;
        },

        // ==================== 生成Agent自定义HTML ====================

        _getAgentCustomHTML() {
            const enabledAgents = this.calculateAgentsFromSelection();
            const launchLayerHTML = this._getLaunchLayerHTML(enabledAgents);

            // 获取所有 Agent 并按 order 排序
            const sortedAgents = Object.entries(CONFIG.AGENTS)
                .sort((a, b) => (a[1].order || 999) - (b[1].order || 999));

            let agentCheckboxes = '';
            for (const [agentKey, agent] of sortedAgents) {
                const isRequired = agent.required;
                const isChecked = enabledAgents.includes(agentKey);
                const hoverText = getAgentHoverText(agentKey);
                const titleAttr = hoverText ? ` title="${escapeHtml(hoverText)}"` : '';
                const displayName = getAgentDisplayName(agentKey).replace('Agent ', '');
                agentCheckboxes += `
            <label class="nc-agent-checkbox ${isRequired ? 'required' : ''}" data-agent="${agentKey}"${titleAttr}>
                <input type="checkbox" value="${agentKey}" ${isChecked ? 'checked' : ''} ${isRequired ? 'disabled' : ''}>
                <span>${displayName}</span>
                ${isRequired ? '<span class="nc-required-badge">必选</span>' : ''}
            </label>
        `;
            }

            if (agentCheckboxes === '') {
                agentCheckboxes = '<div class="nc-text--sm-muted2">暂无可用Agent</div>';
            }

            return `
        <div class="nc-flex--col-full">
            <div class="nc-flex-item--no-shrink-mb4">
                <div class="nc-agent-group-title nc-color--primary">🚀 当前启用</div>
            </div>
            <div class="nc-flex-item--agent-enabled">
                <div id="nc-current-agents-inside" class="nc-grid-2 nc-gap--6">
                    ${launchLayerHTML}
                </div>
            </div>
            <div class="nc-flex-item--no-shrink-my4">
                <div class="nc-text--xs-muted-c">
                    <span class="nc-text--success">绿色标记</span>为必选Agent
                </div>
            </div>
            <div class="nc-flex-item--scroll-panel">
                <div class="nc-grid-2">
                    ${agentCheckboxes}
                </div>
            </div>
            <!-- API配置状态区域 -->
            <div id="nc-api-status-container" class="nc-flex-item--api-footer"></div>
        </div>
    `;
        },

        // ==================== 生成工作流预览HTML ====================

        _getWorkflowHTML() {
            const enabledAgents = this.calculateAgentsFromSelection();

            // 数据化模式标识
            const dataficationBanner = Workflow.isDataficationMode ?
                `<div class="nc-banner--info">
            📊 当前处于数据化模式
         </div>` : '';

            // 互动小说模式标识
            const interactiveModeBanner = WORKFLOW_STATE.configMode === 'interactive' ?
                `<div class="nc-banner--warning-red">
        🎮 当前处于互动小说创作模式
     </div>` : '';

            const stagesHTML = CONFIG.WORKFLOW_STAGES.map(stage => {
                const stageAgents = stage.agents.filter(a => enabledAgents.includes(a));
                if (stageAgents.length === 0) return '';

                const agentsButtons = stageAgents.map(agentKey => {
                    const displayName = getAgentDisplayName(agentKey).replace('Agent ', '');
                    const hoverText = getAgentHoverText(agentKey);
                    const titleAttr = hoverText ? ` title="${escapeHtml(hoverText)}"` : '';
                    return `<button class="nc-workflow-agent-btn" data-agent="${agentKey}" data-state="idle"${titleAttr}>${displayName}</button>`;
                }).join('');

                return `
            <div class="nc-workflow-stage">
                <div class="nc-workflow-stage-header">
                    <span class="nc-workflow-stage-name">${stage.name}</span>
                    <span class="nc-workflow-stage-mode">${stage.mode === 'parallel' ? '并行' : '串行'}</span>
                </div>
                <div class="nc-workflow-agents">
                    ${agentsButtons}
                </div>
            </div>
        `;
            }).join('');

            const discardButton = `<button class="nc-workflow-agent-btn nc-discard-btn" data-agent="DISCARD" title="查看废章内容">废章</button>`;
            const discardStageHTML = `
        <div class="nc-workflow-stage">
            <div class="nc-workflow-stage-header">
                <span class="nc-workflow-stage-name">废章层</span>
                <span class="nc-workflow-stage-mode">独立</span>
            </div>
            <div class="nc-workflow-agents">
                ${discardButton}
            </div>
        </div>
    `;

            // 将两个横幅都放进去（如果同时存在，会叠加显示）
            return dataficationBanner + interactiveModeBanner + stagesHTML + discardStageHTML;
        },

        // ==================== 绑定面板事件 ====================

        _bindPanelEvents(panel) {
            // 基本按钮事件
            panel.querySelector('#nc-start-btn').addEventListener('click', () => {
                console.time('start-btn-click');
                Workflow.start();
                console.timeEnd('start-btn-click');
            });
            panel.querySelector('#nc-history-btn').addEventListener('click', () => HistoryUI.show());
            panel.querySelector('#nc-file-manager-btn').addEventListener('click', () => {
                UI.showFileManager();
            });
            panel.querySelector('#nc-stop-btn').addEventListener('click', () => Workflow.stop());
            panel.querySelector('#nc-close-btn').addEventListener('click', () => this.closeAll());
            panel.querySelector('#nc-token-reset').addEventListener('click', () => this.resetTokenStats());
            panel.querySelector('#nc-export-data-btn').addEventListener('click', () => {
                UI.exportData();
            });
            // 新增配置GUI按钮事件
            panel.querySelector('#nc-config-gui-btn').addEventListener('click', () => {

                UI.openConfigGUI();
            });

            // 在 _bindPanelEvents 方法内，绑定 #nc-reload-config-btn 的点击事件
            panel.querySelector('#nc-reload-config-btn').addEventListener('click', () => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json,application/json';
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    try {
                        const text = await file.text();
                        const json = JSON.parse(text);
                        loadConfigFromJson(json, file.name, file.size);
                        Notify.success('配置文件加载成功，重新打开面板...', '', { timeOut: 2000 });
                        UI.closeAll();
                        await openPanelWithCheck();
                    } catch (err) {
                        Notify.error(`加载配置文件失败: ${err}`);
                    }
                };
                fileInput.click();
            });

            // 在 _bindPanelEvents 方法内，与其他按钮事件并列添加
            panel.querySelector('#nc-novel-data-btn').addEventListener('click', () => {
                UI.novelDatafication();
            });

            // 一键纯净按钮
            panel.querySelector('#nc-clean-pure-btn').addEventListener('click', async () => {
                if (WORKFLOW_STATE.isRunning) {
                    Notify.warning('请先停止当前工作流', '', { timeOut: 2000 });
                    return;
                }
                const confirmed = await UI.showConfirmModal('⚠️ 一键纯净将删除所有历史章节、所有状态书、取消激活所有世界书，并重置内存缓存。此操作不可撤销！\n\n确定继续吗？', '确认');
                if (!confirmed) return;

                UI.updateProgress('开始一键纯净...');
                UI.setLoading(true);

                try {
                    // 1. 删除所有历史章节
                    UI.updateProgress('  清空历史章节...');
                    Storage.clear();
                    await API.sleep(200);

                    // 2. 删除所有状态书
                    UI.updateProgress('  删除所有状态书...');
                    const allBooks = await getAllStateBooks();
                    for (const bookName of allBooks) {
                        try {
                            if (typeof TavernHelper?.deleteWorldbook === 'function') {
                                await TavernHelper.deleteWorldbook(bookName);
                                UI.updateProgress(`    ✅ 已删除 ${bookName}`);
                            } else if (typeof window.deleteWorldbook === 'function') {
                                await window.deleteWorldbook(bookName);
                            } else {
                                throw new Error('deleteWorldbook API 不可用');
                            }
                            await API.sleep(50);
                        } catch (e) {
                            UI.updateProgress(`    ❌ 删除 ${bookName} 失败: ${e.message}`, true);
                        }
                    }

                    // 3. 取消激活所有世界书
                    UI.updateProgress('  取消激活所有世界书...');
                    try {
                        if (typeof TavernHelper?.rebindGlobalWorldbooks === 'function') {
                            await TavernHelper.rebindGlobalWorldbooks([]);
                            UI.updateProgress('    ✅ 已清空全局激活列表');
                        } else {
                            UI.updateProgress('    ⚠️ rebindGlobalWorldbooks 不可用，请手动取消激活', true);
                        }
                    } catch (e) {
                        UI.updateProgress(`    ❌ 取消激活失败: ${e.message}`, true);
                    }

                    // 清空图片库
                    UI.updateProgress('  清空图片库...');
                    await ImageStore.clear();
                    await OtherFileStore.clear();
                    await AudioStore.clear();

                    // 4. 重置内存缓存和工作流状态，但保留配置文件相关标志及 configMode
                    UI.updateProgress('  重置内存缓存...');
                    const oldConfigFile = WORKFLOW_STATE.currentConfigFile;
                    const oldSelectionState = WORKFLOW_STATE.selectionState;
                    const oldConfigMode = WORKFLOW_STATE.configMode;  // <-- 新增：保存原有的配置模式

                    // 全量清零，再恢复需要保留的三个字段
                    StateStore.reset();
                    StateStore.set('currentConfigFile', oldConfigFile);    // 保留配置文件信息
                    StateStore.set('selectionState', oldSelectionState); // 保留预选状态
                    StateStore.set('configMode', oldConfigMode);     // 保留配置模式

                    AgentStateManager.reset();
                    stateTemplatesByBook = {};

                    UI.updateCurrentChapterNum();
                    UI.clearProgress();
                    UI.updateProgress('✅ 一键纯净完成');
                    Notify.success('系统已恢复纯净状态', '', { timeOut: 2000 });

                    // 刷新面板
                    UI.closeAll();
                    await openPanelWithCheck();
                } catch (e) {
                    UI.updateProgress(`❌ 一键纯净失败: ${e.message}`, true);
                    Notify.error('一键纯净过程中发生错误');
                } finally {
                    UI.setLoading(false);
                }
            });

            // 新增：加载配色样式CSS按钮事件
            panel.querySelector('#nc-load-css-btn').addEventListener('click', () => this.loadCustomCSS());

            const submitBtn = panel.querySelector('#nc-submit-input');
            const inputEl = panel.querySelector('#nc-user-input');

            const autoCheckbox = panel.querySelector('#nc-auto-mode');
            if (autoCheckbox) {
                autoCheckbox.addEventListener('change', (e) => {
                    WORKFLOW_STATE.autoMode = e.target.checked;

                });
            }

            panel.querySelector('#nc-submit-input').addEventListener('click', () => {
                if (WORKFLOW_STATE.awaitingInput && WORKFLOW_STATE.inputResolver) {
                    const userInput = inputEl.value.trim();
                    if (!userInput) {
                        Notify.warning('请输入内容后再提交', '', { timeOut: 2000 });
                        return;
                    }
                    submitBtn.disabled = true;
                    WORKFLOW_STATE.userInputCache = userInput;
                    WORKFLOW_STATE.inputResolver(userInput);
                    WORKFLOW_STATE.inputResolver = null;
                    WORKFLOW_STATE.awaitingInput = false;
                }
            });
            panel.querySelector('#nc-submit-chapter-status').addEventListener('click', () => {
                if (!WORKFLOW_STATE.awaitingInput || !WORKFLOW_STATE.inputResolver) return;
                const mode = WORKFLOW_STATE.pendingInputMode;
                if (!mode || mode === 'txt') return;

                if (mode.startsWith('read_') || mode.startsWith('save_')) {
                    const isRead = mode.startsWith('read_');
                    const fileType = mode.substring(isRead ? 5 : 5); // 'read_' 或 'save_' 都是 5 个字符
                    // 创建文件输入元素
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept =
                        fileType === 'png' ? 'image/png' :
                            fileType === 'txt' ? 'text/plain' :
                                fileType === 'html' ? 'text/html' :
                                    fileType === 'js' ? 'application/javascript' : '*/*';
                    fileInput.style.display = 'none';
                    document.body.appendChild(fileInput);

                    fileInput.addEventListener('change', async (e) => {
                        const file = e.target.files[0];
                        if (!file) {
                            fileInput.remove();
                            return;
                        }

                        if (isRead) {
                            // 读取模式：返回文件内容
                            try {
                                if (fileType === 'png') {
                                    // 对于图片，返回 data URL
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                        const dataUrl = ev.target.result;
                                        WORKFLOW_STATE.inputResolver(dataUrl);
                                        WORKFLOW_STATE.inputResolver = null;
                                        WORKFLOW_STATE.awaitingInput = false;
                                        WORKFLOW_STATE.pendingInputMode = null;
                                        UI.updateSubmitButtons(null);
                                        fileInput.remove();
                                    };
                                    reader.readAsDataURL(file);
                                } else {
                                    const text = await file.text();
                                    WORKFLOW_STATE.inputResolver(text);
                                    WORKFLOW_STATE.inputResolver = null;
                                    WORKFLOW_STATE.awaitingInput = false;
                                    WORKFLOW_STATE.pendingInputMode = null;
                                    UI.updateSubmitButtons(null);
                                    fileInput.remove();
                                }
                            } catch (err) {
                                console.error('[文件读取] 失败:', err);
                                Notify.error(`文件读取失败: ${err}`.message);
                                fileInput.remove();
                            }
                        } else {
                            // 保存模式：保存到 ImageStore 并返回 ID
                            try {
                                const id = await ImageStore.save(file);
                                WORKFLOW_STATE.inputResolver(id);
                                WORKFLOW_STATE.inputResolver = null;
                                WORKFLOW_STATE.awaitingInput = false;
                                WORKFLOW_STATE.pendingInputMode = null;
                                UI.updateSubmitButtons(null);
                                fileInput.remove();
                            } catch (err) {
                                console.error('[文件保存] 失败:', err);
                                Notify.error(`文件保存失败: ${err}`.message);
                                fileInput.remove();
                            }
                        }
                    });

                    fileInput.click();
                    return;
                }

                HistoryUI.showChapterSelectionModal((selectedChapters) => {
                    if (!selectedChapters || selectedChapters.length === 0) {
                        Notify.warning('请至少选择一个章节', '', { timeOut: 2000 });
                        return;
                    }

                    let inputText = '';
                    for (const chapter of selectedChapters) {
                        const chapterNum = chapter.num;
                        const chapterContent = HistoryUI._extractPureContent(chapter);
                        let entry = '';

                        if (mode === 'chapter') {
                            entry = `第${chapterNum}章：\n${chapterContent}\n\n`;
                        } else if (mode === 'status') {
                            const stateText = HistoryUI.getStateTextFromChapter(chapter);
                            if (stateText) {
                                entry = `第${chapterNum}章：\n${stateText}\n\n`;
                            }
                        } else if (mode === 'all') {
                            const stateText = HistoryUI.getStateTextFromChapter(chapter) || '';
                            entry = `第${chapterNum}章：\n章节：${chapterContent}\n状态：${stateText}\n\n`;
                        }
                        inputText += entry;
                    }

                    if (!inputText) {
                        Notify.warning('没有可用的章节内容', '', { timeOut: 2000 });
                        return;
                    }

                    WORKFLOW_STATE.inputResolver(inputText);
                    WORKFLOW_STATE.inputResolver = null;
                    WORKFLOW_STATE.awaitingInput = false;
                    WORKFLOW_STATE.pendingInputMode = null;
                    UI.updateSubmitButtons(null);
                });
            });
            inputEl.addEventListener('input', e => {
                WORKFLOW_STATE.userInputCache = e.target.value;
            });
            panel.querySelector('#nc-clear-input').addEventListener('click', () => {
                inputEl.value = '';
                WORKFLOW_STATE.userInputCache = '';
            });

            // 修正：查修文章按钮 - 每次点击都获取最新章节号
            panel.querySelector('#nc-view-chapter-content').addEventListener('click', () => {
                const chapters = Storage.loadChapters();
                const latest = chapters.length > 0 ? Math.max(...chapters.map(c => c.num)) : 0;
                HistoryUI.viewChapter(latest, { mode: 'edit' }); // 修改此处
            });

            panel.querySelector('#nc-view-chapter-status').addEventListener('click', () => {
                const chapters = Storage.loadChapters();
                const latest = chapters.length > 0 ? Math.max(...chapters.map(c => c.num)) : 0;
                HistoryUI.viewChapterStatus(latest);
            });

            // 修正：查看要求按钮 - 使用正确的 inputIndex 变量
            panel.querySelector('#nc-view-requirement')?.addEventListener('click', () => {
                const agentKey = WORKFLOW_STATE.currentWaitingAgent;
                const inputIndex = WORKFLOW_STATE.currentWaitingInputIndex;
                if (!agentKey || inputIndex === null || inputIndex === undefined) {
                    Notify.info('没有正在等待输入的Agent', '', { timeOut: 2000 });
                    return;
                }
                const agent = CONFIG.AGENTS[agentKey];
                if (!agent) return;

                const src = agent.inputs[inputIndex];
                const mode = agent.inputMode[inputIndex] || 'txt';
                const prompt = (agent.inputPrompts && agent.inputPrompts[inputIndex]) || '无具体提示词';

                let content = `## 当前等待输入 (Agent: ${agent.name})\n\n`;
                content += `### 📝 需要您提供的内容:\n\n`;
                content += `**提示词**: ${prompt}\n\n`;
                content += `**输入方式**: ${mode === 'txt' ? '文本框直接输入' : '从历史章节选择 (' + mode + ')'}\n\n`;
                content += `**输入源**: ${src}\n\n`;

                if (src === 'user') {
                    content += `请在下方文本框中输入内容后点击“提交输入”按钮。\n\n`;
                } else if (src === 'auto') {
                    content += `请点击“章节状态”按钮，选择章节后系统将自动提取对应内容。\n\n`;
                } else if (src.endsWith('.last')) {
                    content += `需要您提供上一章的相关信息。若上一章无此信息，请直接提供您认为合适的内容。\n\n`;
                } else {
                    content += `需要您提供相关信息。请根据提示输入。\n\n`;
                }

                UI.showMarkdownModal('当前等待要求', content);
            });

            // 树形菜单事件绑定
            this._bindTreeMenuEvents(panel);

            // 初始化预选条目选中状态
            if (WORKFLOW_STATE.currentProfile !== 'custom') {
                const state = WORKFLOW_STATE.selectionState;
                for (const [catKey, optKey] of Object.entries(state)) {
                    if (optKey) {
                        const selector = `[data-category="${catKey}"][data-option="${optKey}"]`;
                        panel.querySelector(selector)?.classList.add('selected');
                    }
                }
            }

            // Agent复选框事件
            this._bindAgentCheckboxEvents(panel);

            // 绑定启动层 Agent 按钮点击事件（新区域）
            const launchInside = panel.querySelector('#nc-current-agents-inside');
            if (launchInside) {
                launchInside.addEventListener('click', (e) => {
                    const agentBtn = e.target.closest('[data-agent]');
                    if (!agentBtn) return;
                    const agentKey = agentBtn.dataset.agent;


                    // 查找该 Agent 对应的下面层复选框（不在启动层内）
                    const allInputs = panel.querySelectorAll(`input[value="${agentKey}"]`);
                    let targetCheckbox = null;
                    for (let input of allInputs) {
                        if (!input.closest('#nc-current-agents-inside')) {
                            targetCheckbox = input;
                            break;
                        }
                    }

                    if (!targetCheckbox) {
                        console.warn(`[DEBUG] 启动层点击事件：未找到下面层复选框 for agent ${agentKey}。所有匹配的 input 数量: ${allInputs.length}`);
                        // 可选：尝试直接通过 data-agent 属性查找
                        const lowerLabel = panel.querySelector(`.nc-agent-checkbox:not(#nc-current-agents-inside .nc-agent-checkbox)[data-agent="${agentKey}"]`);
                        if (lowerLabel) {
                            const input = lowerLabel.querySelector('input');
                            if (input) {

                                targetCheckbox = input;
                            }
                        }
                        if (!targetCheckbox) {
                            Notify.info(`${getAgentDisplayName(agentKey)} 在当前配置中不可用`, '', { timeOut: 2000 });
                            return;
                        }
                    }

                    if (targetCheckbox.disabled) {
                        Notify.info(`${getAgentDisplayName(agentKey)} 为必选Agent，不可取消`, '', { timeOut: 2000 });
                        return;
                    }

                    // 切换下面层复选框的选中状态
                    targetCheckbox.checked = !targetCheckbox.checked;


                    const changeEvent = new Event('change', { bubbles: true });
                    targetCheckbox.dispatchEvent(changeEvent);
                });
            }

            // 在 _bindPanelEvents 中，与 autoMode 绑定类似的位置添加
            const uniqueCheckbox = panel.querySelector('#nc-enforce-unique');
            if (uniqueCheckbox) {
                uniqueCheckbox.addEventListener('change', (e) => {
                    WORKFLOW_STATE.enforceUniqueBranches = e.target.checked;

                    const settings = Storage.loadSettings();
                    settings.enforceUniqueBranches = WORKFLOW_STATE.enforceUniqueBranches;
                    Storage.saveSettings(settings);
                });
            }

            const galBtn = document.createElement('button');
            galBtn.id = 'nc-gal-editor-btn';
            galBtn.className = 'nc-btn nc-btn-secondary nc-btn-sm';
            galBtn.textContent = '🎮 Gal制作器';
            galBtn.addEventListener('click', () => {
                UI.closeAll();
                UI.showGalgameEditor();
            });
            // 找到放置的位置，例如在 `#nc-interactive-player-btn` 旁边
            const toolbarCenter = panel.querySelector('.nc-panel-footer > div:nth-child(2)'); // 中间按钮组
            if (toolbarCenter) {
                toolbarCenter.appendChild(galBtn);
            } else {
                // 降级：直接添加到尾部
                panel.querySelector('.nc-panel-footer').appendChild(galBtn);
            }
        },

        _clearPreSelection(panel) {
            // 清除所有预选条目的选中类
            panel.querySelectorAll('[data-category]').forEach(el => {
                el.classList.remove('selected');
            });
            // 清空 selectionState 中的所有分类
            const newState = {};
            if (CONFIG.categories) {
                Object.keys(CONFIG.categories).forEach(cat => {
                    newState[cat] = null;
                });
            }
            WORKFLOW_STATE.selectionState = newState;
            Storage.saveSelectionState(WORKFLOW_STATE.selectionState);
        },

        _updateModeLabel(panel) {
            if (!panel) panel = document.getElementById(CONFIG.UI.panelId);
            if (!panel) return;
            const titleEl = panel.querySelector('.nc-card-title');
            if (!titleEl) return;
            // 找到“⚙️ Agent配置”卡片标题
            const agentTitle = Array.from(panel.querySelectorAll('.nc-card-title')).find(el => el.textContent.includes('⚙️ Agent配置'));
            if (!agentTitle) return;

            // 移除旧的标签
            const oldLabel = agentTitle.querySelector('.nc-mode-label');
            if (oldLabel) oldLabel.remove();

            // 创建新标签
            const label = document.createElement('span');
            label.className = 'nc-mode-label';
            label.style.cssText = 'margin-left:8px;font-size:10px;background:rgba(102,126,234,.2);padding:2px 6px;border-radius:10px;color:#667eea;';
            label.textContent = WORKFLOW_STATE.currentProfile === 'custom' ? '自定义模式' : '预选模式';
            agentTitle.appendChild(label);
        },

        // ==================== 绑定树形菜单事件 ====================

        _bindTreeMenuEvents(panel) {
            // 树形头部展开/折叠
            panel.querySelectorAll('.nc-tree-header').forEach(header => {
                header.addEventListener('click', (e) => {
                    e.stopPropagation(); // 防止事件冒泡触发其他监听器
                    const children = header.nextElementSibling; // .nc-tree-children
                    const isExpanded = header.classList.contains('expanded');

                    if (isExpanded) {
                        header.classList.remove('expanded');
                        children?.classList.remove('expanded');
                    } else {
                        header.classList.add('expanded');
                        children?.classList.add('expanded');
                    }
                });
            });

            // 为所有分类选项绑定点击事件
            panel.querySelectorAll('[data-category][data-option]').forEach(item => {
                item.addEventListener('click', () => {
                    const catKey = item.dataset.category;
                    const optKey = item.dataset.option;
                    const category = CONFIG.categories?.[catKey];
                    if (!category) return;

                    // 切换到预选模式（如果使用预设模式，可先切换）
                    WORKFLOW_STATE.currentProfile = 'standard';
                    const settings = Storage.loadSettings();
                    settings.profile = 'standard';
                    Storage.saveSettings(settings);

                    const currentValue = WORKFLOW_STATE.selectionState[catKey];
                    const isSingle = category.selectionMode === 'single';

                    if (isSingle) {
                        // 单选逻辑：如果点击已选中项则取消，否则选中
                        if (currentValue === optKey) {
                            WORKFLOW_STATE.selectionState[catKey] = null;
                            item.classList.remove('selected');
                        } else {
                            WORKFLOW_STATE.selectionState[catKey] = optKey;
                            // 清除同分类其他选项的选中样式
                            panel.querySelectorAll(`[data-category="${catKey}"]`).forEach(el => {
                                el.classList.remove('selected');
                            });
                            item.classList.add('selected');
                        }
                    } else {
                        // 多选逻辑：切换选中状态（假设存储为数组）
                        let arr = Array.isArray(currentValue) ? currentValue : [];
                        if (arr.includes(optKey)) {
                            arr = arr.filter(k => k !== optKey);
                            item.classList.remove('selected');
                        } else {
                            arr.push(optKey);
                            item.classList.add('selected');
                        }
                        WORKFLOW_STATE.selectionState[catKey] = arr;
                    }

                    // 处理互斥组：如果当前分类属于某个互斥组，则清除组内其他分类的所有选中项
                    if (CONFIG.categoryGroups) {
                        for (const group of CONFIG.categoryGroups) {
                            if (group.categories.includes(catKey)) {
                                group.categories.forEach(otherCat => {
                                    if (otherCat !== catKey) {
                                        WORKFLOW_STATE.selectionState[otherCat] = null;
                                        panel.querySelectorAll(`[data-category="${otherCat}"]`).forEach(el => {
                                            el.classList.remove('selected');
                                        });
                                    }
                                });
                                break;
                            }
                        }
                    }

                    Storage.saveSelectionState(WORKFLOW_STATE.selectionState);
                    this.updateWorkflowViz();
                    this.updateAllAgentStatusButtons();
                    this._updateModeLabel(panel);
                    this._updateAgentCheckboxes(panel);

                    // 新增
                    this._updateLaunchLayer(panel);
                });
            });
        },

        // ==================== 绑定Agent复选框事件 ====================

        _bindAgentCheckboxEvents(panel) {
            panel.addEventListener('change', (e) => {
                const target = e.target;
                if (!target.matches('.nc-agent-checkbox input')) return;

                if (UI._updatingCheckboxes) return;

                const agentKey = target.value;
                const agent = CONFIG.AGENTS[agentKey];
                if (!agent) return;


                // 如果当前是预选模式，需要先切换到自定义模式，并清除预选
                if (WORKFLOW_STATE.currentProfile !== 'custom') {

                    WORKFLOW_STATE.currentProfile = 'custom';
                    const settings = Storage.loadSettings();
                    settings.profile = 'custom';
                    Storage.saveSettings(settings);
                    UI._clearPreSelection(panel);
                }

                // 获取当前所有选中（包括本次变化），但排除启动层内的复选框（id=nc-current-agents-inside）
                const allCheckboxes = panel.querySelectorAll('.nc-agent-checkbox input:checked');
                const selectedAgents = [];
                allCheckboxes.forEach(cb => {
                    // 排除位于启动层容器内部的复选框
                    if (!cb.closest('#nc-current-agents-inside')) {
                        selectedAgents.push(cb.value);
                    } else {

                    }
                });


                // 去重
                const uniqueAgents = [...new Set(selectedAgents)];
                if (uniqueAgents.length !== selectedAgents.length) {
                    console.warn('[DEBUG] Duplicates found and removed. Original length: ' + selectedAgents.length + ', unique: ' + uniqueAgents.length);
                }

                // 保存自定义Agent列表
                Storage.saveCustomAgents(uniqueAgents);


                // 更新工作流预览
                this.updateWorkflowViz();

                // 更新启动层
                this._updateLaunchLayer(panel);
            });
        },

        // ==================== 更新启动层 ====================

        _updateLaunchLayer(panel) {
            if (!panel) panel = document.getElementById(CONFIG.UI.panelId);
            if (!panel) return;

            const launchContainer = panel.querySelector('#nc-current-agents-inside');
            if (!launchContainer) {
                console.warn('[DEBUG] _updateLaunchLayer: #nc-current-agents-inside not found');
                return;
            }

            const enabledAgents = this.calculateAgentsFromSelection();


            // **【新增】验证每个 agentKey 是否存在于 CONFIG.AGENTS 中，不存在则过滤并警告**
            const validAgents = enabledAgents.filter(agentKey => {
                if (!CONFIG.AGENTS[agentKey]) {
                    console.warn(`[DEBUG] _updateLaunchLayer: Agent ${agentKey} 不存在于 CONFIG.AGENTS 中，已过滤`);
                    return false;
                }
                return true;
            });

            const sortedAgents = validAgents.sort((a, b) =>
                (CONFIG.AGENTS[a]?.order || 999) - (CONFIG.AGENTS[b]?.order || 999)
            );


            launchContainer.innerHTML = sortedAgents.map(agentKey => {
                const agent = CONFIG.AGENTS[agentKey];
                const isRequired = agent?.required || false;
                const hoverText = getAgentHoverText(agentKey);
                const titleAttr = hoverText ? ` title="${escapeHtml(hoverText)}"` : '';
                const displayName = getAgentDisplayName(agentKey).replace('Agent ', '');
                return `
            <label class="nc-agent-checkbox ${isRequired ? 'required' : ''}" data-agent="${agentKey}"${titleAttr}>
                <input type="checkbox" value="${agentKey}" checked ${isRequired ? 'disabled' : ''}>
                <span>${displayName}</span>
                ${isRequired ? '<span class="nc-required-badge">必选</span>' : ''}
            </label>
        `;
            }).join('') || '<span class="nc-text--sm-muted2">暂无启用Agent</span>';

            // **【新增】额外检查：渲染完成后，对比启动层中的 data-agent 与下面层复选框是否存在**
            const allLowerCheckboxes = panel.querySelectorAll('.nc-agent-checkbox input:not(#nc-current-agents-inside input)');
            const lowerAgentSet = new Set(Array.from(allLowerCheckboxes).map(cb => cb.value));


            const launchLabels = launchContainer.querySelectorAll('[data-agent]');
            launchLabels.forEach(label => {
                const agentKey = label.dataset.agent;
                if (!lowerAgentSet.has(agentKey)) {
                    console.warn(`[DEBUG] _updateLaunchLayer: 启动层 Agent ${agentKey} 在下面层中不存在！`);
                }
            });
        },

        // ==================== 更新工作流预览 ====================

        updateWorkflowViz() {
            const container = document.getElementById('nc-workflow-viz');
            if (!container) return;

            // 生成新的HTML
            container.innerHTML = this._getWorkflowHTML();

            // 在阶段列表上方添加错误统计
            const errorAgents = Object.keys(AgentStateManager.states).filter(k => AgentStateManager.states[k] === 'error');
            if (errorAgents.length > 0) {
                const errorBanner = document.createElement('div');
                errorBanner.style.cssText = 'background: rgba(220,53,69,0.2); border:1px solid #dc3545; border-radius:6px; padding:6px; margin-bottom:10px; font-size:12px; color:#ff6b6b; display:flex; align-items:center; gap:6px;';
                errorBanner.innerHTML = `⚠️ 有 ${errorAgents.length} 个 Agent 执行出错，<a href="#" id="nc-show-errors" class="nc-color--primary-link">点击查看详情</a>`;
                container.prepend(errorBanner);
                container.querySelector('#nc-show-errors').addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showErrorSummary();
                });
            }

            // 绑定所有Agent按钮的点击事件
            container.querySelectorAll('[data-agent]').forEach(btn => {
                const agentKey = btn.dataset.agent;
                btn.addEventListener('click', () => {
                    if (agentKey === 'DISCARD') {
                        this.showDiscardedChapter();
                    } else {
                        this.showAgentStatusDetail(agentKey);
                    }
                });
            });

            // 更新所有按钮的状态
            this.updateWorkflowAgentStates();
        },

        // 修改后的 UI.novelDatafication 函数
        novelDatafication() {

            // 改为通过文件名判断是否为数据化配置
            if (WORKFLOW_STATE.configMode !== 'datafication') {
                Notify.error('请先加载数据化专用配置文件（mode 字段需为 "datafication"）');
                return;
            }
            this.closeAll(); // 关闭所有模态框

            // 如果存在数据化缓存，则恢复状态
            let parsedChapters = [];
            let selectedChapters = new Set();
            let currentPage = 1;
            let selectedFile = null;
            const pageSize = 10;

            if (WORKFLOW_STATE.dataficationCache) {

                parsedChapters = WORKFLOW_STATE.dataficationCache.parsedChapters || [];
                selectedChapters = new Set(WORKFLOW_STATE.dataficationCache.selectedChapters || []);
                currentPage = WORKFLOW_STATE.dataficationCache.currentPage || 1;
                selectedFile = WORKFLOW_STATE.dataficationCache.selectedFile ? {
                    name: WORKFLOW_STATE.dataficationCache.selectedFile.name,
                    size: WORKFLOW_STATE.dataficationCache.selectedFile.size
                } : null;
            }

            const overlay = document.createElement('div');
            overlay.className = 'nc-overlay nc-font';
            overlay.style.zIndex = '100002';

            const panel = document.createElement('div');
            panel.className = 'nc-history-panel nc-scroll';
            panel.style.maxWidth = '700px';
            panel.style.width = '100%';

            // 渲染列表函数
            const renderList = () => {
                const listContainer = panel.querySelector('#nc-chapter-list');
                if (!listContainer) return;
                const totalPages = Math.ceil(parsedChapters.length / pageSize) || 1;
                const start = (currentPage - 1) * pageSize;
                const end = start + pageSize;
                const pageChapters = parsedChapters.slice(start, end);


                let html = '';
                pageChapters.forEach(ch => {
                    const checked = selectedChapters.has(ch.num) ? 'checked' : '';
                    html += `
<div class="nc-chapter-item nc-flex--chapter-row" data-chapter-num="${ch.num}">
    <input type="checkbox" class="chapter-checkbox" value="${ch.num}" ${checked} class="nc-checkbox--base" onclick="event.stopPropagation();">
    <div class="nc-flex-item--grow">
        <div class="nc-text--bold">第${ch.num}章 ${ch.title}</div>
        <div class="nc-text--xs-faded">内容长度: ${ch.content.length} 字符</div>
    </div>
</div>
`;
                });
                if (parsedChapters.length === 0) {
                    html = '<div class="nc-center--pad20-muted">暂无章节，请先导入小说文件</div>';
                }
                listContainer.innerHTML = html;

                // 更新分页控件
                const pageInput = panel.querySelector('#nc-page-input');
                const totalSpan = panel.querySelector('#nc-total-pages');
                const prevBtn = panel.querySelector('#nc-prev-page');
                const nextBtn = panel.querySelector('#nc-next-page');
                if (pageInput && totalSpan) {
                    pageInput.value = currentPage;
                    pageInput.max = totalPages;
                    totalSpan.textContent = totalPages;
                }
                // 动态设置按钮禁用状态
                if (prevBtn) prevBtn.disabled = currentPage === 1;
                if (nextBtn) nextBtn.disabled = currentPage === totalPages;
            };

            const totalPages = Math.ceil(parsedChapters.length / pageSize) || 1;

            panel.innerHTML = `
<div class="nc-center--mb20">
    <h2 class="nc-section-title--lg">📊 小说数据化</h2>
    <p class="nc-modal-subtitle">导入 TXT 小说文件，自动提取结构化数据</p>
</div>
<div class="nc-mb15--file-selector">
    <input type="file" id="nc-novel-file-input" accept=".txt,text/plain" class="nc-hidden">
    <button id="nc-import-novel-btn" class="nc-btn nc-btn-primary nc-btn-sm">📂 导入小说</button>
    <span class="nc-flex-item--file-info" id="nc-file-info">${selectedFile ? selectedFile.name + ' (' + (selectedFile.size / 1024).toFixed(2) + ' KB)' : '未选择文件'}</span>
</div>
<div class="nc-mb10--btn-row-right">
    <button id="nc-select-all" class="nc-btn nc-btn-xs nc-btn--purple-solid">✅ 全选</button>
    <button id="nc-invert-select" class="nc-btn nc-btn-xs nc-btn--purple-solid">🔄 反选</button>
</div>
<div id="nc-chapter-list" class="nc-size--chapter-list"></div>
<div class="nc-flex--row-between-mt10">
    <div class="nc-flex--row-8-center">
        <button id="nc-prev-page" class="nc-btn nc-btn-xs nc-btn--purple-solid">◀ 上一页</button>
        <span class="nc-flex--row-5-middle">
            第 <input type="number" id="nc-page-input" min="1" max="${totalPages}" value="${currentPage}" class="nc-modal-input--page"> / <span id="nc-total-pages">${totalPages}</span> 页
        </span>
        <button id="nc-next-page" class="nc-btn nc-btn-xs nc-btn--purple-solid">下一页 ▶</button>
    </div>
    <div>
        <button id="nc-start-datafication" class="nc-btn nc-btn-primary nc-btn-sm nc-text--mr8">🚀 开始数据化</button>
        <button id="nc-close-btn" class="nc-btn nc-btn-ghost nc-btn-sm">❌ 关闭</button>
    </div>
</div>
`;

            overlay.appendChild(panel);
            document.body.appendChild(overlay);
            this._openModal(overlay);

            // 获取 DOM 元素
            const fileInput = panel.querySelector('#nc-novel-file-input');
            const importBtn = panel.querySelector('#nc-import-novel-btn');
            const fileInfo = panel.querySelector('#nc-file-info');
            const listContainer = panel.querySelector('#nc-chapter-list');
            const selectAllBtn = panel.querySelector('#nc-select-all');
            const invertBtn = panel.querySelector('#nc-invert-select');
            const prevBtn = panel.querySelector('#nc-prev-page');
            const nextBtn = panel.querySelector('#nc-next-page');
            const pageInput = panel.querySelector('#nc-page-input');
            panel.querySelector('#nc-total-pages');
            const startBtn = panel.querySelector('#nc-start-datafication');
            const closeBtn = panel.querySelector('#nc-close-btn');

            // 保存缓存函数
            const saveCache = () => {
                WORKFLOW_STATE.dataficationCache = {
                    parsedChapters: parsedChapters,
                    selectedChapters: Array.from(selectedChapters),
                    currentPage: currentPage,
                    selectedFile: selectedFile ? { name: selectedFile.name, size: selectedFile.size } : null
                };

            };

            // 如果有缓存，先渲染列表
            if (WORKFLOW_STATE.dataficationCache && parsedChapters.length > 0) {
                renderList();
            }

            // ==================== 自动提取逻辑 ====================
            async function performExtract() {
                if (!selectedFile) {
                    console.warn('[performExtract] 没有选中文件');
                    return;
                }

                try {
                    const text = await selectedFile.text();


                    // 解析章节
                    const parsed = parseChapters(text);

                    parsedChapters = parsed;
                    currentPage = 1;
                    selectedChapters.clear();
                    renderList();
                    saveCache();
                    Notify.success(`成功提取 ${parsed.length} 章`, '', { timeOut: 2000 });
                } catch (err) {
                    console.error('[performExtract] 提取失败', err);
                    Notify.error('提取失败：' + err.message);
                }
            }

            // 解析章节的内部函数
            function parseChapters(text) {
                const results = [];
                const chapterRegex = /第(\d+)章\s*(.*?)\r?\n([\s\S]*?)(?=第\d+章|\n*$)/g;
                let match;
                while ((match = chapterRegex.exec(text)) !== null) {
                    const num = parseInt(match[1], 10);
                    const title = match[2].trim();
                    let content = match[3].trim();
                    results.push({ num, title, content });
                }
                return results;
            }

            // ==================== 自动补全函数 ====================
            function autoCompleteSelection() {
                let selected = Array.from(selectedChapters).sort((a, b) => a - b);

                if (selected.length > 1) {
                    const min = Math.min(...selected);
                    const max = Math.max(...selected);

                    const allExisting = parsedChapters.map(ch => ch.num).filter(num => num >= min && num <= max);

                    if (allExisting.length !== selected.length || allExisting.some((num, idx) => num !== selected[idx])) {

                        selectedChapters.clear();
                        allExisting.forEach(num => selectedChapters.add(num));
                        const minPage = Math.ceil(min / pageSize);
                        if (currentPage !== minPage) {
                            currentPage = minPage;
                        }
                        renderList();
                        saveCache();
                        Notify.info(`已自动补全为连续章节：${allExisting.join(', ')}`, '', { timeOut: 2000 });
                    } else {

                    }
                } else {

                }
            }

            // ==================== 事件绑定 ====================

            importBtn.addEventListener('click', () => {
                fileInput.click();
            });

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) {
                    // 用户取消选择，不做任何操作，保留原有数据
                    return;
                }
                selectedFile = file;
                fileInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(2)} KB)`;

                performExtract(); // 自动提取
            });

            selectAllBtn.addEventListener('click', () => {

                parsedChapters.forEach(ch => selectedChapters.add(ch.num));
                renderList();
                saveCache();

            });

            invertBtn.addEventListener('click', () => {

                const allNums = new Set(parsedChapters.map(ch => ch.num));
                for (let num of allNums) {
                    if (selectedChapters.has(num)) selectedChapters.delete(num);
                    else selectedChapters.add(num);
                }
                renderList();
                saveCache();
                autoCompleteSelection();
            });

            // 上一页
            prevBtn.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderList();
                    saveCache();
                }
            });

            // 下一页
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(parsedChapters.length / pageSize) || 1;
                if (currentPage < totalPages) {
                    currentPage++;
                    renderList();
                    saveCache();
                }
            });

            // 页码输入框回车跳转
            if (pageInput) {
                pageInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const targetPage = parseInt(pageInput.value, 10);
                        const totalPages = Math.ceil(parsedChapters.length / pageSize) || 1;
                        if (isNaN(targetPage) || targetPage < 1 || targetPage > totalPages) {
                            Notify.warning(`请输入1~${totalPages}之间的页码`, '', { timeOut: 2000 });
                            pageInput.value = currentPage;
                            return;
                        }
                        if (targetPage !== currentPage) {
                            currentPage = targetPage;
                            renderList();
                            saveCache();
                        }
                    }
                });
                // 限制输入范围
                pageInput.addEventListener('change', () => {
                    const totalPages = Math.ceil(parsedChapters.length / pageSize) || 1;
                    let val = parseInt(pageInput.value, 10);
                    if (isNaN(val)) val = 1;
                    if (val < 1) val = 1;
                    if (val > totalPages) val = totalPages;
                    pageInput.value = val;
                });
            }

            // 复选框变化
            listContainer.addEventListener('change', (e) => {
                if (e.target.matches('.chapter-checkbox')) {
                    const chapterNum = parseInt(e.target.value, 10);
                    if (e.target.checked) {
                        selectedChapters.add(chapterNum);

                    } else {
                        selectedChapters.delete(chapterNum);

                    }

                    renderList();
                    saveCache();
                    autoCompleteSelection();
                }
            });

            // 点击章节条目预览文章（排除复选框点击）
            listContainer.addEventListener('click', (e) => {
                const chapterItem = e.target.closest('.nc-chapter-item');
                if (!chapterItem) return;
                // 如果点击的是复选框，不触发预览
                if (e.target.matches('.chapter-checkbox')) return;

                const chapterNum = parseInt(chapterItem.dataset.chapterNum, 10);
                const chapter = parsedChapters.find(ch => ch.num === chapterNum);
                if (chapter) {
                    // 弹出模态框显示文章
                    UI.showMarkdownModal(`第${chapter.num}章 ${chapter.title}`, chapter.content, {
                        maxWidth: '700px',
                        fontFamily: 'Songti SC,SimSun,serif',
                        lineHeight: '1.8',
                        accentColor: '#667eea',
                        titleSize: '18px'
                    });
                }
            });

            // 在 UI.novelDatafication 函数内，找到 startBtn 的点击事件，添加日志
            startBtn.addEventListener('click', async () => {
                const selected = Array.from(selectedChapters).sort((a, b) => a - b);
                if (selected.length === 0) {
                    Notify.warning('请至少选择一个章节', '', { timeOut: 2000 });
                    return;
                }
                const chaptersToProcess = parsedChapters.filter(ch => selectedChapters.has(ch.num));
                if (chaptersToProcess.length === 0) {
                    console.warn('[数据化] 没有待处理的章节对象，返回');
                    return;
                }
                const confirmMsg = '数据化将重置内存中的工作流状态，不会删除已有的状态书和历史章节。\n\n是否继续？';
                const confirmed = await UI.showConfirmModal(confirmMsg, '确认');
                if (!confirmed) return;
                UI._closeModal(overlay);
                await UI.createPanel(); // 重新打开主界面
                Workflow.startDatafication(chaptersToProcess);
            });

            // ========== 关键修改：关闭按钮和遮罩层点击事件，关闭后重新打开主面板 ==========
            closeBtn.addEventListener('click', () => {

                ModalStack.closeTop();  // 统一关闭顶层
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {

                    UI._closeModal(overlay);

                    UI.createPanel(); // 重新打开主界面
                }
            });
        },

        // 在 UI 对象中添加
        _showResourceConflictModal: function (resourceId, resourceType) {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'nc-modal-overlay nc-font';
                overlay.style.zIndex = '100200';

                const modal = document.createElement('div');
                modal.className = 'nc-modal';
                modal.style.maxWidth = '400px';

                modal.innerHTML = `
            <div class="nc-modal-header">
                <h2 class="nc-modal-title--primary-c">资源冲突</h2>
            </div>
            <div class="nc-modal-body nc-center--pad20">
                <p>${resourceType} ID <strong>${escapeHtml(resourceId)}</strong> 已存在。</p>
                <p>请选择操作：</p>
            </div>
            <div class="nc-modal-footer nc-flex--footer-10-center">
                <button id="nc-conflict-overwrite" class="nc-btn nc-btn-primary">覆盖</button>
                <button id="nc-conflict-skip" class="nc-btn nc-btn-primary">跳过</button>
                <button id="nc-conflict-cancel" class="nc-btn nc-btn-ghost">取消导入</button>
            </div>
        `;

                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                this._openModal(overlay);

                const overwriteBtn = modal.querySelector('#nc-conflict-overwrite');
                const skipBtn = modal.querySelector('#nc-conflict-skip');
                const cancelBtn = modal.querySelector('#nc-conflict-cancel');

                const close = (result) => {
                    this._closeModal(overlay);
                    resolve(result);
                };

                overwriteBtn.addEventListener('click', () => close('overwrite'));
                skipBtn.addEventListener('click', () => close('skip'));
                cancelBtn.addEventListener('click', () => close('cancel'));

                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) close('cancel');
                });
            });
        },

        /**
         * 替换 HTML 字符串中所有 src="id:xxx" 和 href="id:xxx" 的占位符，从对应的 Store 中加载资源并生成可访问的 URL。
         * 支持资源类型：
         *   - 图片 (id 以 "img_" 开头) 从 ImageStore 加载。
         *   - 文本 (id 以 "other_" 开头) 从 OtherFileStore 加载，并根据 format 决定 MIME 类型（如 js/css/html/txt）。
         *   - 音频 (id 以 "audio_" 开头) 从 AudioStore 加载。
         * 其他前缀的资源将保留原占位符（或可自定义扩展）。
         * @param {string} html - 原始 HTML 字符串
         * @returns {Promise<string>} 替换后的 HTML 字符串
         */
        _replaceImagePlaceholders: async function (html) {
            console.time('_replaceImagePlaceholders');


            // 匹配 src="id:xxx" 和 href="id:xxx" （支持双引号，实际 HTML 中可能混用单引号，这里简化处理，若需完整支持可扩展）
            const placeholderRegex = /(src|href)="id:([^"]+)"/g;
            const matches = [...html.matchAll(placeholderRegex)];


            if (matches.length === 0) {
                console.timeEnd('_replaceImagePlaceholders');
                return html;
            }

            let result = html;
            for (const match of matches) {
                const fullAttr = match[0];          // 完整属性，如 src="id:img_123"
                const attrName = match[1];           // 属性名：src 或 href
                const id = match[2];                 // 资源ID


                let replacement = fullAttr; // 默认不替换，若出错则保留原样（但会标记丢失）

                if (id.startsWith('img_')) {
                    // 图片资源
                    const blob = await ImageStore.get(id);
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        replacement = `${attrName}="${url}"`;

                    } else {
                        console.warn(`[replaceImagePlaceholders] 图片 ${id} 不存在，替换为 #`);
                        replacement = `${attrName}="#" alt="图片丢失"`;
                    }
                    // 原代码片段（约第1689行附近）
                } else if (id.startsWith('other_')) {   // 修改此处

                    const fileObj = await OtherFileStore.get(id);
                    if (fileObj && fileObj.text) {
                        const mime = fileObj.format === 'html' ? 'text/html' :
                            fileObj.format === 'js' ? 'application/javascript' :
                                fileObj.format === 'css' ? 'text/css' :
                                    'text/plain';
                        const blob = new Blob([fileObj.text], { type: mime });
                        const url = URL.createObjectURL(blob);
                        replacement = `${attrName}="${url}"`;

                    } else {
                        console.warn(`[replaceImagePlaceholders] 其余文件 ${id} 不存在，替换为 #`);
                        replacement = `${attrName}="#" alt="文件丢失"`;
                    }
                } else if (id.startsWith('audio_')) {
                    // 音频资源
                    const blob = await AudioStore.get(id);
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        replacement = `${attrName}="${url}"`;

                    } else {
                        console.warn(`[replaceImagePlaceholders] 音频 ${id} 不存在，替换为 #`);
                        replacement = `${attrName}="#" alt="音频丢失"`;
                    }
                } else {
                    // 未知资源类型，保留原占位符（或可根据需要扩展）
                    console.warn(`[replaceImagePlaceholders] 未知ID前缀 ${id}，保留原占位符`);
                    // 可在此添加对其他类型（如 video_、font_ 等）的支持
                }

                // 替换当前匹配项
                result = result.replace(fullAttr, replacement);
            }

            console.timeEnd('_replaceImagePlaceholders');
            return result;
        },

        updateWorkflowAgentStates() {
            const container = document.getElementById('nc-workflow-viz');
            if (container) {
                container.querySelectorAll('[data-agent]').forEach(btn => {
                    const agentKey = btn.dataset.agent;
                    if (agentKey === 'DISCARD') {
                        if (WORKFLOW_STATE.discardedChapter) {
                            btn.classList.add('has-discard');
                        } else {
                            btn.classList.remove('has-discard');
                        }
                    } else {
                        btn.dataset.state = AgentStateManager.getState(agentKey);
                    }
                });
            }

            const launchLayer = document.getElementById('nc-launch-layer');
            if (launchLayer) {
                launchLayer.querySelectorAll('[data-agent]').forEach(btn => {
                    const agentKey = btn.dataset.agent;
                    btn.dataset.state = AgentStateManager.getState(agentKey);
                });
            }
        },

        showAgentStatusDetail: function (agentKey) {


            const output = WORKFLOW_STATE.outputs[agentKey];
            const agentName = getAgentDisplayName(agentKey);
            const agent = CONFIG.AGENTS[agentKey];
            const state = AgentStateManager.getState(agentKey);

            // 检查是否为生图师、融图师或变图师
            if (agent && (agent.role === 'imageGenerator' || agent.role === 'fusionGenerator' || agent.role === 'imageVariator') && output) {
                try {
                    let images = [];
                    if (agent.role === 'imageGenerator') {
                        images = JSON.parse(output);
                        if (!Array.isArray(images)) images = [images];

                    } else if (agent.role === 'fusionGenerator') {
                        const fusionData = JSON.parse(output);
                        if (fusionData && fusionData.fusion_image_id) {
                            images = [{ id: fusionData.fusion_image_id }];

                        }
                    } else if (agent.role === 'imageVariator') {
                        images = JSON.parse(output);
                        if (!Array.isArray(images)) images = [images];

                    }
                    if (images.length > 0) {
                        const rawOutput = WORKFLOW_STATE.agentRawOutputs?.[agentKey] || output;

                        this._showImageGeneratorModal(agentKey, images, rawOutput);
                        return;
                    }
                } catch (e) {
                    console.warn(`[showAgentStatusDetail] 解析图片数据失败，降级为文本显示:`, e);
                    // 降级处理
                }
            }

            // 错误状态 - 显示详细错误信息
            if (state === 'error' && WORKFLOW_STATE.lastAgentError && WORKFLOW_STATE.lastAgentError[agentKey]) {
                const error = WORKFLOW_STATE.lastAgentError[agentKey];
                let errorDetail = `错误信息：${error.message}\n`;
                errorDetail += `时间：${new Date(error.timestamp).toLocaleString()}\n`;
                if (error.apiConfig) {
                    errorDetail += `\nAPI配置：\n`;
                    errorDetail += `  平台：${error.apiConfig.source}\n`;
                    errorDetail += `  模型：${error.apiConfig.model}\n`;
                    errorDetail += `  超时：${error.apiConfig.timeout || 3600000}ms\n`;
                }
                if (error.prompt) {
                    errorDetail += `\n提示词（前500字符）：\n${error.prompt}`;
                }

                this.showMarkdownModal(`${agentName} 执行错误`, `**错误详情**\n\n\`\`\`\n${errorDetail}\n\`\`\``, {
                    maxWidth: '700px',
                    fontFamily: 'Consolas,monospace',
                    lineHeight: '1.6',
                    accentColor: '#dc3545',
                    titleSize: '18px'
                });
                return;
            }

            // 普通输出（非生图师/融图师/变图师或无图片）
            if (!output) {

                Notify.info(`暂无 ${agentName} 的输出`, '', { timeOut: 2000 });
                return;
            }

            // 检测是否包含 HTML/JS
            const hasHTML = this._detectHTML(output);


            if (hasHTML) {

                this._showHtmlPreviewModal(agentName, output, agentKey);
            } else {

                this.showMarkdownModal(agentName, output, {
                    maxWidth: '700px',
                    fontFamily: 'Consolas,monospace',
                    lineHeight: '1.6',
                    accentColor: '#667eea',
                    titleSize: '18px'
                });
            }
        },

        /**
         * 显示生图师专用模态框（包含三个按钮），支持多图网格排列
         * @param {string} agentKey - Agent 键
         * @param {Array} images - 图片数组，每个元素包含 url 属性（Base64 或 Object URL）
         * @param {string} rawOutput - 原始输出（JSON 字符串）
         */
        _showImageGeneratorModal(agentKey, images, rawOutput) {

            const agentName = getAgentDisplayName(agentKey);
            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100020';

            const modal = document.createElement('div');
            modal.className = 'nc-modal nc-scroll';
            modal.style.maxWidth = '900px';
            modal.style.width = 'auto';
            modal.style.background = 'var(--nc-color-panel)';

            // 用于存储生成的图片 URL 及其对应的对象，以便关闭时释放
            const imageUrls = [];

            // 当前视图模式：'image' 或 'text'
            let currentView = 'image';

            // 渲染内容函数（初始视图为图片）
            const renderContent = () => {
                if (currentView === 'image') {
                    // 多图网格布局，但此时还不知道 URL，先显示 loading 或占位符
                    // 我们将在点击查看图片时动态获取，所以初始时显示一个提示
                    return `
                        <div class="nc-modal-body nc-body--loading">
                            正在加载图片...
                        </div>
                    `;
                } else {
                    return `
                        <div class="nc-modal-body nc-scroll markdown-body nc-size--max60vh">
                            ${this._renderMarkdown(rawOutput)}
                        </div>
                    `;
                }
            };

            modal.innerHTML = `
                <div class="nc-modal-header">
                    <h2 class="nc-modal-title--primary-lg">${agentName}</h2>
                </div>
                ${renderContent()}
                <div class="nc-modal-footer nc-flex--footer-10-wrap-sp">
                    <button id="nc-img-view-image" class="nc-btn nc-btn-primary" style="${currentView === 'image' ? 'opacity:1;' : 'opacity:0.6;'}">🖼️ 查看图片</button>
                    <button id="nc-img-view-output" class="nc-btn nc-btn-primary" style="${currentView === 'text' ? 'opacity:1;' : 'opacity:0.6;'}">📄 查看输出</button>
                    <button id="nc-img-copy" class="nc-btn nc-btn-secondary">📋 复制</button>
                    <button id="nc-img-close" class="nc-btn nc-btn-ghost">❌ 关闭</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            this._openModal(overlay);

            // 获取按钮
            const viewImageBtn = modal.querySelector('#nc-img-view-image');
            const viewOutputBtn = modal.querySelector('#nc-img-view-output');
            const copyBtn = modal.querySelector('#nc-img-copy');
            const closeBtn = modal.querySelector('#nc-img-close');
            const bodyContainer = modal.querySelector('.nc-modal-body');

            // 辅助函数：释放所有已生成的图片 URL
            const revokeImageUrls = () => {

                imageUrls.forEach(url => URL.revokeObjectURL(url));
                imageUrls.length = 0;
            };

            // 切换视图到图片
            const switchToImage = async () => {

                currentView = 'image';
                viewImageBtn.style.opacity = '1';
                viewOutputBtn.style.opacity = '0.6';

                // 释放旧的 URL
                revokeImageUrls();

                // 显示加载中
                bodyContainer.innerHTML = '<div class="nc-body--empty">加载图片中...</div>';

                // 为每个图片生成 HTML
                const imageElements = [];
                for (let i = 0; i < images.length; i++) {
                    const imgData = images[i];

                    if (!imgData.id) {
                        console.warn(`[DEBUG][_showImageGeneratorModal] 图片 ${i} 缺少 id 字段`);
                        imageElements.push(`<div class="nc-error-img-item">图片数据无效（缺少 id）</div>`);
                        continue;
                    }
                    try {
                        const blob = await ImageStore.get(imgData.id);

                        if (blob) {
                            const url = URL.createObjectURL(blob);
                            imageUrls.push(url);

                            imageElements.push(`
                                <div class="nc-flex-item--image-card">
                                    <img src="${url}" class="nc-img--full-card" alt="Generated Image" onload="console.log('图片加载成功: ${url}')" onerror="console.error('图片加载失败: ${url}')">
                                </div>
                            `);
                        } else {
                            console.warn(`[DEBUG][_showImageGeneratorModal] 图片 id=${imgData.id} 未找到`);
                            imageElements.push(`<div class="nc-error-img-item">图片 id=${imgData.id} 未找到</div>`);
                        }
                    } catch (err) {
                        console.error(`[DEBUG][_showImageGeneratorModal] 获取图片 id=${imgData.id} 时出错:`, err);
                        imageElements.push(`<div class="nc-error-img-item">图片加载错误: ${err.message}</div>`);
                    }
                }

                const imagesHtml = imageElements.join('');
                bodyContainer.innerHTML = `
                    <div class="nc-body--pad20-scroll">
                        <div class="nc-flex--wrap-center">
                            ${imagesHtml}
                        </div>
                    </div>
                `;

            };

            // 切换视图到文本
            const switchToText = () => {

                currentView = 'text';
                viewImageBtn.style.opacity = '0.6';
                viewOutputBtn.style.opacity = '1';
                bodyContainer.innerHTML = `<div class="nc-scroll markdown-body nc-size--max60vh">${this._renderMarkdown(rawOutput)}</div>`;
                // 释放图片 URL，因为文本视图不需要它们
                revokeImageUrls();
            };

            // 绑定视图切换事件
            viewImageBtn.addEventListener('click', switchToImage);
            viewOutputBtn.addEventListener('click', switchToText);

            // 复制按钮
            copyBtn.addEventListener('click', async () => {

                let textToCopy = '';
                if (currentView === 'image') {
                    // 复制所有图片的 ID 和可能的描述
                    textToCopy = images.map(img => `图片ID: ${img.id}`).join('\n');
                } else {
                    textToCopy = rawOutput;
                }
                await copyToClipboard(textToCopy);
            });

            // 关闭按钮
            closeBtn.addEventListener('click', () => {

                revokeImageUrls();
                this._closeModal(overlay);
            });

            // 遮罩层点击关闭
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {

                    revokeImageUrls();
                    this._closeModal(overlay);
                }
            });

            // 初始加载图片视图（因为 currentView 默认为 image）
            // 由于 renderContent 初始返回加载中，我们需要在打开后立即加载图片
            setTimeout(() => switchToImage(), 0);
        },

        // 修改后的 UI.showDiscardedChapter 函数
        showDiscardedChapter() {
            const d = WORKFLOW_STATE.discardedChapter;
            if (!d) {
                Notify.info('暂无废章内容', '', { timeOut: 2000 });
                return;
            }
            let title = d.title || '';
            // 修复：检查标题是否已经以“第X章”开头（支持可能存在的空格）
            const chapterPrefixRegex = /^第\d+\s*章\s*/;
            if (!chapterPrefixRegex.test(title)) {
                title = `第${WORKFLOW_STATE.currentChapter}章 ${title}`.trim();
            }
            title = `废章 - ${title}`;

            const content = d.content || '无内容';
            const isHtml = this._detectHTML(content);

            if (isHtml) {
                // 使用 HTML 预览模态框，传入 agentName 为 "废章"
                this._showHtmlPreviewModal('废章', content, 'DISCARD');
            } else {
                this.showMarkdownModal(title, content, {
                    maxWidth: '700px',
                    fontFamily: 'Songti SC,SimSun,serif',
                    lineHeight: '1.8',
                    accentColor: '#dc3545',
                    titleSize: '20px',
                    subtitle: new Date().toLocaleString('zh-CN')
                });
            }
        },

        updateAgentStatusButton(agentKey) {
            const wfBtn = document.querySelector(`#nc-workflow-viz [data-agent="${agentKey}"]`);
            if (!wfBtn) return;

            if (agentKey === 'DISCARD') {
                const hasDiscard = !!WORKFLOW_STATE.discardedChapter;
                if (wfBtn.classList.contains('has-discard') !== hasDiscard) {
                    wfBtn.classList.toggle('has-discard', hasDiscard);
                }
                return;
            }

            const newState = AgentStateManager.getState(agentKey);
            const oldState = wfBtn.dataset.state;
            if (oldState !== newState) {
                wfBtn.dataset.state = newState;
                // 强制重绘（避免某些浏览器渲染延迟）
                wfBtn.style.transform = 'scale(1)';
            }
        },

        updateAllAgentStatusButtons() {
            this.updateWorkflowAgentStates();
        },

        updateCurrentChapterNum() {
            const span = document.getElementById('nc-current-chapter-num');
            if (!span) {
                console.warn('[DEBUG][updateCurrentChapterNum] 找不到 #nc-current-chapter-num 元素');
                return;
            }
            const chapters = Storage.loadChapters();
            span.textContent = chapters.length > 0 ? Math.max(...chapters.map(c => c.num)) : 0;

        },

        _renderProgressLog() {
            const content = document.getElementById('nc-progress-content');
            if (!content) return;
            content.innerHTML = '';
            WORKFLOW_STATE.progressLog.forEach(item => {
                const line = document.createElement('div');
                line.style.cssText = `margin-bottom:3px;${item.isError ? 'color:#ff6b6b;' : ''}word-wrap:break-word;`;
                line.textContent = `[${item.time}] ${item.text}`;
                content.appendChild(line);
            });
            // 使用 requestAnimationFrame 延迟滚动，避免强制重排
            requestAnimationFrame(() => {
                content.scrollTop = content.scrollHeight;
            });
        },

        _updateAgentCheckboxes(panel) {
            if (!panel) panel = document.getElementById(CONFIG.UI.panelId);
            if (!panel) return;
            const checkboxes = panel.querySelectorAll('.nc-agent-checkbox input');
            const enabledAgents = this.calculateAgentsFromSelection();
            checkboxes.forEach(cb => {
                cb.checked = enabledAgents.includes(cb.value);
            });
        },

        updateProgress(text, isError = false) {
            const content = document.getElementById('nc-progress-content');
            if (!content) return;

            const line = document.createElement('div');
            line.style.cssText = `margin-bottom:3px;${isError ? 'color:#ff6b6b;' : ''}`;
            const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            line.textContent = `[${time}] ${text}`;

            content.appendChild(line);
            content.scrollTop = content.scrollHeight;

            WORKFLOW_STATE.progressLog.push({ text, isError, time });
            if (WORKFLOW_STATE.progressLog.length > CONFIG.MAX_PROGRESS_LINES) {
                WORKFLOW_STATE.progressLog.shift();
            }
        },

        clearProgress() {
            const content = document.getElementById('nc-progress-content');
            if (content) content.innerHTML = '';
            WORKFLOW_STATE.progressLog = [];
        },

        updateTokenDisplay() {
            const totalEl = document.getElementById('nc-token-total');
            const lastEl = document.getElementById('nc-token-last');
            if (totalEl) totalEl.textContent = WORKFLOW_STATE.tokenStats.totalInput + WORKFLOW_STATE.tokenStats.totalOutput;
            if (lastEl) {
                const { lastInput, lastOutput } = WORKFLOW_STATE.tokenStats;
                lastEl.textContent = lastInput || lastOutput ? `本次: +${lastInput + lastOutput}` : '本次: -';
            }
        },

        resetTokenStats() {
            WORKFLOW_STATE.tokenStats = { totalInput: 0, totalOutput: 0, lastInput: 0, lastOutput: 0 };
            Storage.saveTokenStats(WORKFLOW_STATE.tokenStats);
            this.updateTokenDisplay();
            Notify.success('Token统计已重置', '', { timeOut: 2000 });
        },

        setLoading(isLoading) {
            const btn = document.getElementById('nc-start-btn');
            const stopBtn = document.getElementById('nc-stop-btn');

            if (btn) {
                btn.disabled = isLoading;
                btn.classList.toggle('nc-btn--loading', isLoading);
            }
            if (stopBtn) {
                stopBtn.classList.toggle('nc-hidden', !isLoading); // classList，绕开 !important
            }

            // 禁用/启用左侧树形菜单和Agent复选框
            const panel = document.getElementById(CONFIG.UI.panelId);
            if (panel) {
                const treeHeaders = panel.querySelectorAll('.nc-tree-header');
                const treeItems = panel.querySelectorAll('[data-category][data-option]');
                const checkboxes = panel.querySelectorAll('.nc-agent-checkbox input');
                if (isLoading) {
                    treeHeaders.forEach(el => el.style.pointerEvents = 'none');
                    treeItems.forEach(el => el.style.pointerEvents = 'none');
                    checkboxes.forEach(el => el.disabled = true);
                } else {
                    treeHeaders.forEach(el => el.style.pointerEvents = '');
                    treeItems.forEach(el => el.style.pointerEvents = '');
                    checkboxes.forEach(el => {
                        const agentKey = el.value;
                        const isRequired = CONFIG.AGENTS[agentKey]?.required;
                        el.disabled = !!isRequired;
                    });
                }
            }
        },

        updateFloatButtonText() {
            const btn = document.getElementById(CONFIG.UI.buttonId);
            if (!btn) return;
            if (WORKFLOW_STATE.isRunning) {
                btn.textContent = '✍️ 创作中...';
            } else {
                btn.textContent = '📚 创作';
            }
        },

        /**
         * 响应式选项卡导航初始化
         * ≤1023px 时在面板主体上方插入选项卡栏，每个卡片对应一个标签页
         * >1023px 时移除选项卡栏，恢复 grid 布局
         */
        _initTabBar(panel) {
            const BREAKPOINT = 1023;
            const body = panel.querySelector('.nc-panel-body');
            if (!body) return;

            const isMobile = window.innerWidth <= BREAKPOINT;

            // 清理旧状态
            const oldBar = panel.querySelector('.nc-tab-bar');
            if (oldBar) oldBar.remove();
            body.querySelectorAll('.nc-card').forEach(c => {
                c.classList.remove('nc-tab-active');
                c.removeAttribute('data-tab');
            });

            if (!isMobile) {
                // 桌面端：恢复所有卡片可见
                body.querySelectorAll('.nc-card').forEach(c => { c.style.display = ''; });
                return;
            }

            // 平板/手机端：构建选项卡
            const TABS = [
                { label: '🎯 预选', icon: '🎯', hint: 'Agent预选' },
                { label: '🔄 流程', icon: '🔄', hint: '工作流' },
                { label: '✏️ 输入', icon: '✏️', hint: '输入/进度' },
                { label: '⚙️ 设置', icon: '⚙️', hint: 'Agent配置' },
            ];

            const cards = [...body.querySelectorAll(':scope > .nc-card')];
            cards.forEach((card, idx) => {
                card.setAttribute('data-tab', Math.min(idx, TABS.length - 1));
            });

            const bar = document.createElement('div');
            bar.className = 'nc-tab-bar';
            TABS.forEach((tab, idx) => {
                const btn = document.createElement('button');
                btn.className = 'nc-tab-btn';
                btn.setAttribute('data-tab-idx', idx);
                btn.innerHTML = tab.label;
                btn.title = tab.hint;
                btn.addEventListener('click', () => UI._switchTab(panel, idx));
                bar.appendChild(btn);
            });
            body.insertAdjacentElement('beforebegin', bar);

            const savedTab = parseInt(sessionStorage.getItem('nc-active-tab') || '0', 10);
            UI._switchTab(panel, isNaN(savedTab) ? 0 : savedTab);
        },

        /**
         * 切换选项卡
         */
        _switchTab(panel, tabIdx) {
            const body = panel.querySelector('.nc-panel-body');
            const bar = panel.querySelector('.nc-tab-bar');
            if (!body || !bar) return;
            body.querySelectorAll(':scope > .nc-card').forEach(card => {
                const active = parseInt(card.getAttribute('data-tab') ?? '0', 10) === tabIdx;
                card.classList.toggle('nc-tab-active', active);
            });
            bar.querySelectorAll('.nc-tab-btn').forEach(btn => {
                btn.classList.toggle('nc-tab-active', parseInt(btn.getAttribute('data-tab-idx'), 10) === tabIdx);
            });
            try { sessionStorage.setItem('nc-active-tab', tabIdx); } catch (_) { }
        },


        /**
         * 导出数据（章节、世界书、工作流输出等）为 ZIP 压缩包
         * 修改：chapters.json 的格式改为与历史面板“备份JSON”一致的对象结构
         */
        exportData: async function () {
            UI.updateProgress('开始导出数据...');


            try {
                const zip = new JSZip();
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

                // ========== 1. 章节备份 ==========
                const chapters = Storage.loadChapters();
                const chapterBackup = {
                    version: CONFIG.VERSION,
                    exportTime: new Date().toISOString(),
                    totalChapters: chapters.length,
                    data: { chapters }
                };
                zip.file('chapters.json', JSON.stringify(chapterBackup, null, 2));
                UI.updateProgress(`  ✅ 章节数据已打包 (共 ${chapters.length} 章)`);

                // ========== 2.5 导出映射表 ==========
                UI.updateProgress('  正在导出映射表...');
                try {
                    const mappings = await MappingManager.exportAll();
                    zip.file('mappings.json', JSON.stringify(mappings, null, 2));
                    UI.updateProgress(`  ✅ 已导出映射表 (${mappings.length} 条)`);
                } catch (e) {
                    console.error('[导出] 导出映射表时出错:', e);
                    UI.updateProgress(`  ⚠️ 映射表导出失败: ${e.message}`, true);
                }

                // ========== 2. 导出所有世界书 ==========
                UI.updateProgress('  正在获取所有世界书列表...');
                let allBooks = [];

                // 尝试多种方法获取世界书列表
                if (typeof TavernHelper?.getAllWorldbookNames === 'function') {
                    try {
                        allBooks = await TavernHelper.getAllWorldbookNames();

                        UI.updateProgress(`✅ 通过 getAllWorldbookNames 获取到 ${allBooks.length} 本世界书`);
                    } catch (e) {
                        console.warn('[导出] 调用 TavernHelper.getAllWorldbookNames 失败:', e);
                    }
                }

                if (allBooks.length === 0) {
                    try {
                        const context = API.getContext();
                        if (context.worldInfo && Array.isArray(context.worldInfo)) {
                            allBooks = context.worldInfo.map(w => w.name).filter(Boolean);

                            UI.updateProgress(`    ⚠️ 通过 context.worldInfo 获取到 ${allBooks.length} 本世界书（可能不完整）`);
                        }
                    } catch (e) {
                        console.warn('[导出] 尝试获取 context.worldInfo 失败:', e);
                    }
                }

                if (allBooks.length === 0) {
                    console.warn('[导出] 无法获取所有世界书列表，将尝试从激活列表中获取（可能不完整）');
                    try {
                        if (typeof TavernHelper?.getGlobalWorldbookNames === 'function') {
                            allBooks = await TavernHelper.getGlobalWorldbookNames();

                            UI.updateProgress(`    ⚠️ 通过 getGlobalWorldbookNames 获取到 ${allBooks.length} 本世界书（仅激活的）`);
                        } else if (typeof window.getGlobalWorldbookNames === 'function') {
                            allBooks = await window.getGlobalWorldbookNames();

                        }
                    } catch (e) {
                        console.warn('[导出] 获取激活列表失败:', e);
                    }
                }

                // ===== 关键增强：获取所有存在的状态书（包括未激活的）并合并 =====
                const stateBooks = await getAllStateBooks(); // 这会尝试读取直到第一个不存在的书号

                // 合并并去重
                allBooks = [...new Set([...allBooks, ...stateBooks])];

                UI.updateProgress(`  发现 ${allBooks.length} 本世界书`);

                if (allBooks.length > 0) {
                    for (let i = 0; i < allBooks.length; i++) {
                        const bookName = allBooks[i];
                        try {
                            const book = await API.getWorldbook(bookName);
                            const entries = Array.isArray(book) ? book : (book.entries || []);
                            const settings = book.settings || {};

                            let fileName;
                            if (bookName === CONFIG.SETTING_BOOK_NAME) {
                                fileName = '设定书.json';
                            } else if (bookName.startsWith(CONFIG.STATE_BOOK_PREFIX)) {
                                fileName = `${bookName}.json`;
                            } else {
                                fileName = `${bookName}.json`;
                            }

                            zip.file(fileName, JSON.stringify({
                                name: bookName,
                                entries: entries,
                                settings: settings,
                                exportTime: new Date().toISOString()
                            }, null, 2));
                            UI.updateProgress(`  ✅ ${bookName} 已导出 (${entries.length} 个条目)`);

                        } catch (e) {
                            console.error(`[导出] 导出 ${bookName} 失败:`, e);
                            UI.updateProgress(`  ⚠️ ${bookName} 导出失败: ${e.message}`, true);
                        }
                    }
                } else {
                    console.warn('[导出] 未找到任何世界书');
                    UI.updateProgress('  ⚠️ 未找到任何世界书', true);
                }

                // ========== 3. 导出工作流输出记录 ==========
                UI.updateProgress('  正在收集工作流输出记录...');
                const workflowExport = {
                    exportTime: new Date().toISOString(),
                    currentChapter: WORKFLOW_STATE.currentChapter,
                    isRunning: WORKFLOW_STATE.isRunning,
                    agentOutputs: WORKFLOW_STATE.outputs || {},
                    lastSerialOutput: WORKFLOW_STATE.lastSerialOutput || null,
                    chapterMemory: WORKFLOW_STATE.chapterMemory || {},
                };
                zip.file('workflow_outputs.json', JSON.stringify(workflowExport, null, 2));
                UI.updateProgress('  ✅ 工作流输出记录已打包');


                // ========== 4. 导出所有图片 ==========
                UI.updateProgress('  正在导出图片...');
                try {
                    const allImages = await ImageStore.getAll();
                    if (allImages.length > 0) {
                        const imageFolder = zip.folder('images');
                        for (let i = 0; i < allImages.length; i++) {
                            const img = allImages[i];
                            const { id, blob } = img;
                            let ext = 'png';
                            if (blob.type.includes('jpeg') || blob.type.includes('jpg')) ext = 'jpg';
                            else if (blob.type.includes('gif')) ext = 'gif';
                            else if (blob.type.includes('webp')) ext = 'webp';
                            const fileName = `${id}.${ext}`;
                            imageFolder.file(fileName, blob, { binary: true });
                        }
                        UI.updateProgress(`  ✅ 已导出 ${allImages.length} 张图片`);
                    } else {
                        UI.updateProgress('  ✅ 无图片需要导出');
                    }
                } catch (e) {
                    console.error('[导出] 导出图片时出错:', e);
                    UI.updateProgress(`  ⚠️ 图片导出失败: ${e.message}`, true);
                }

                // ========== 5. 导出所有文本 ==========
                UI.updateProgress('  正在导出文本文件...');
                try {
                    const allTexts = await OtherFileStore.getAll();
                    if (allTexts.length > 0) {
                        const textFolder = zip.folder('texts');
                        for (const item of allTexts) {
                            const { id, text, format } = item;
                            let ext;
                            if (format === 'html') ext = 'html';
                            else if (format === 'js') ext = 'js';
                            else ext = 'txt'; // 默认 txt
                            const fileName = `${id}.${ext}`;
                            textFolder.file(fileName, text, { binary: false });
                        }
                        UI.updateProgress(`  ✅ 已导出 ${allTexts.length} 个文本文件`);
                    } else {
                        UI.updateProgress('  ✅ 无文本文件需要导出');
                    }
                } catch (e) {
                    console.error('[导出] 导出文本时出错:', e);
                    UI.updateProgress(`  ⚠️ 文本导出失败: ${e.message}`, true);
                }

                // ========== 导出所有音频 ==========
                UI.updateProgress('  正在导出音频...');
                try {
                    const allAudios = await AudioStore.getAll();
                    if (allAudios.length > 0) {
                        const audioFolder = zip.folder('audios');
                        for (const audio of allAudios) {
                            const { id, blob } = audio;
                            let ext = 'mp3';
                            if (blob.type.includes('wav')) ext = 'wav';
                            else if (blob.type.includes('ogg')) ext = 'ogg';
                            else if (blob.type.includes('m4a')) ext = 'm4a';
                            else if (blob.type.includes('flac')) ext = 'flac';
                            const fileName = `${id}.${ext}`;
                            audioFolder.file(fileName, blob, { binary: true });
                        }
                        UI.updateProgress(`  ✅ 已导出 ${allAudios.length} 个音频文件`);
                    } else {
                        UI.updateProgress('  ✅ 无音频需要导出');
                    }
                } catch (e) {
                    console.error('[导出] 导出音频时出错:', e);
                    UI.updateProgress(`  ⚠️ 音频导出失败: ${e.message}`, true);
                }

                // ========== 生成并下载 ZIP ==========
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `novel-creator-export-${timestamp}.zip`;
                a.click();
                URL.revokeObjectURL(url);

                UI.updateProgress(`✅ 数据导出完成：${a.download}`);

            } catch (e) {
                console.error('[导出] 导出过程中发生错误:', e);
                UI.updateProgress(`❌ 导出失败：${e.message}`, true);
                Notify.error('导出失败：' + e.message);
            }
        },

        async renderAndWaitForInteraction(html) {


            // 去除外层 ```html 代码块标记
            const trimmed = html.trim();
            const codeBlockRegex = /^```(?:html)?\n([\s\S]*?)\n```$/;
            const match = trimmed.match(codeBlockRegex);
            if (match) {
                html = match[1];

            } else {

            }

            // 替换图片占位符

            html = await this._replaceImagePlaceholders(html);


            return new Promise((resolve, reject) => {


                // 创建遮罩层
                const overlay = document.createElement('div');
                overlay.className = 'nc-modal-overlay nc-font';
                overlay.style.zIndex = '100030';
                overlay.style.backdropFilter = 'blur(8px)';

                // 创建模态框
                const modal = document.createElement('div');
                modal.className = 'nc-modal';
                modal.style.display = 'flex';
                modal.style.flexDirection = 'column';
                modal.style.overflow = 'hidden';

                // 模态框结构
                modal.innerHTML = `
            <div class="nc-modal-header">
                <h2 class="nc-modal-title--primary-c">互动场景</h2>
            </div>
            <div class="nc-modal-body markdown-body nc-flex-item--interaction" id="nc-interaction-content">
                ${html}
            </div>
            <div class="nc-modal-footer nc-flex-item--modal-footer">
                <button class="nc-modal-copy-btn nc-btn--grad-purple-action">复制内容</button>
                <button class="nc-modal-skip-btn nc-btn--grad-purple-action">跳过</button>
            </div>
        `;

                overlay.appendChild(modal);
                document.body.appendChild(overlay);


                // ========== 执行 HTML 中的所有脚本 ==========
                const contentDiv = modal.querySelector('#nc-interaction-content');
                const scripts = contentDiv.querySelectorAll('script');

                scripts.forEach(oldScript => {
                    const newScript = document.createElement('script');
                    Array.from(oldScript.attributes).forEach(attr => {
                        newScript.setAttribute(attr.name, attr.value);
                    });
                    if (oldScript.innerHTML) {
                        newScript.innerHTML = oldScript.innerHTML;
                    }
                    oldScript.parentNode.replaceChild(newScript, oldScript);

                });

                // 禁用蒙版点击关闭
                overlay.onclick = null;
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {

                        e.stopPropagation();
                    }
                });

                // 绑定复制按钮
                const copyBtn = modal.querySelector('.nc-modal-copy-btn');
                copyBtn.addEventListener('click', async () => {

                    const content = modal.querySelector('#nc-interaction-content');
                    const textToCopy = content.innerText || content.textContent;
                    await copyToClipboard(textToCopy, '内容已复制到剪贴板');
                });

                // 绑定跳过按钮
                const skipBtn = modal.querySelector('.nc-modal-skip-btn');
                skipBtn.addEventListener('click', () => {

                    handleUserInteraction('[SKIP]');
                });

                // ========== 状态管理 ==========
                let resolved = false;
                let timeoutId = null; // 超时保护定时器
                let closeTimer = null; // 5秒延迟关闭定时器

                // 用户交互后的统一处理函数
                const handleUserInteraction = (result) => {
                    if (resolved) {

                        return;
                    }

                    resolved = true;

                    // 声明倒计时消息元素变量（提升作用域）
                    let countdownMsg;

                    // 清除超时保护
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;

                    }

                    // 禁用所有交互按钮
                    const allButtons = modal.querySelectorAll('button');
                    allButtons.forEach(btn => {
                        btn.disabled = true;
                        btn.style.opacity = '0.5';
                        btn.style.cursor = 'not-allowed';
                    });


                    // 添加倒计时提示
                    const footer = modal.querySelector('.nc-modal-footer');
                    if (!footer) {
                        console.error('[UI.renderAndWaitForInteraction] 未找到 .nc-modal-footer 元素，无法显示倒计时');
                    } else {
                        // 检查是否已有倒计时消息，避免重复
                        countdownMsg = footer.querySelector('#nc-countdown-msg');
                        if (!countdownMsg) {
                            countdownMsg = document.createElement('div');
                            countdownMsg.id = 'nc-countdown-msg';
                            countdownMsg.style.textAlign = 'center';
                            countdownMsg.style.marginTop = '10px';
                            countdownMsg.style.color = '#aaa';
                            countdownMsg.style.fontSize = '12px';
                            footer.appendChild(countdownMsg);

                        } else {

                        }

                        let countdown = 5;
                        countdownMsg.textContent = `${countdown}秒后自动关闭...`;


                        const updateCountdown = () => {
                            countdown--;
                            if (countdownMsg) {
                                countdownMsg.textContent = `${countdown}秒后自动关闭...`;

                            }
                            if (countdown <= 0) {
                                clearInterval(interval);

                            }
                        };
                        const interval = setInterval(updateCountdown, 1000);

                    }

                    // 启动5秒延迟关闭
                    closeTimer = setTimeout(() => {

                        if (countdownMsg) countdownMsg.remove();  // 现在可以正确访问
                        if (overlay && overlay.parentNode) {
                            overlay.remove();

                        } else {
                            console.warn('[UI.renderAndWaitForInteraction] 模态框已不存在');
                        }
                        delete window.__interactionResolver;

                        resolve(result);

                    }, 5000);

                };

                // 提供给排版师脚本的回调
                window.__interactionResolver = (result) => {

                    handleUserInteraction(result);
                };


                // 超时保护
                timeoutId = setTimeout(() => {
                    if (!resolved) {
                        console.warn('[UI.renderAndWaitForInteraction] 交互超时，自动关闭');
                        if (overlay && overlay.parentNode) {
                            overlay.remove();
                        }
                        delete window.__interactionResolver;
                        resolve('[TIMEOUT]');

                    } else {

                    }
                }, 3600000);

            });
        },

        _detectHTML(text) {
            if (!text || typeof text !== 'string') return false;
            const htmlTagRegex = /<[a-z][\s\S]*?>/i;
            const docTypeRegex = /<!DOCTYPE\s+html/i;
            const htmlRootRegex = /<html[\s\S]*?>/i;
            const bodyRegex = /<body[\s\S]*?>/i;
            return htmlTagRegex.test(text) || docTypeRegex.test(text) || htmlRootRegex.test(text) || bodyRegex.test(text);
        },

        /**
         * 显示 HTML 预览模态框（源码/预览双视图）
         * 预览视图采用交互框的渲染方式（直接插入 HTML 并执行脚本）
         * @param {string} agentName - Agent 显示名称
         * @param {string} content - 原始 HTML 内容
         * @param {string} agentKey - Agent 键（用于调试）
         */
        _showHtmlPreviewModal: function (agentName, content, agentKey) {


            // 去除外层代码块
            const trimmed = content.trim();
            const codeBlockRegex = /^```(?:html)?\n([\s\S]*?)\n```$/;
            const match = trimmed.match(codeBlockRegex);
            if (match) {
                content = match[1];

            } else {

            }

            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100020';

            const modal = document.createElement('div');
            modal.className = 'nc-modal nc-scroll'; // 由 CSS 控制宽度

            // 使用 Flex 列布局，确保内容区域可滚动
            modal.innerHTML = `
        <div class="nc-modal-header">
            <h2 class="nc-modal-title--primary-lg">${agentName}</h2>
        </div>
        <div class="nc-modal-body nc-flex--col-modal-60vh">
            <!-- 源码容器：flex:1 占据剩余空间，overflow:auto 实现滚动 -->
            <div id="nc-source-container" class="nc-source-pane">
                <pre id="nc-source-pre" class="nc-code-pre--main"></pre>
            </div>
            <!-- 预览容器：同样 flex:1，但初始隐藏 -->
            <div id="nc-preview-container" class="markdown-body nc-hidden--preview-pane"></div>
        </div>
        <div class="nc-modal-footer nc-flex--footer-10-wrap-sp">
            <button id="nc-html-source" class="nc-btn nc-btn-primary">📄 查看源码</button>
            <button id="nc-html-preview" class="nc-btn nc-btn-primary">🌐 预览</button>
            <button id="nc-html-copy" class="nc-btn nc-btn-secondary">📋 复制</button>
            <button id="nc-html-close" class="nc-btn nc-btn-ghost">❌ 关闭</button>
        </div>
    `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);


            this._openModal(overlay);


            // 初始化源码内容
            const sourcePre = modal.querySelector('#nc-source-pre');
            sourcePre.textContent = content;


            // 获取视图切换元素
            const sourceContainer = modal.querySelector('#nc-source-container');
            const previewContainer = modal.querySelector('#nc-preview-container');
            const sourceBtn = modal.querySelector('#nc-html-source');
            const previewBtn = modal.querySelector('#nc-html-preview');
            const copyBtn = modal.querySelector('#nc-html-copy');
            const closeBtn = modal.querySelector('#nc-html-close');


            // 辅助函数：检查并输出容器的滚动状态
            const logScrollState = (container, label) => {
                if (!container) return;
                const scrollHeight = container.scrollHeight;
                const clientHeight = container.clientHeight;
                const scrollWidth = container.scrollWidth;
                const clientWidth = container.clientWidth;
                const computedStyle = window.getComputedStyle(container);


                // 同时检查内部的 <pre>
                const pre = container.querySelector('pre');
                if (pre) {
                    const preSH = pre.scrollHeight;
                    const preCH = pre.clientHeight;
                    const preSW = pre.scrollWidth;
                    const preCW = pre.clientWidth;


                }
                if (scrollHeight > clientHeight) {

                } else {

                }
            };

            // 立即检查一次（可能布局未完全更新）
            setTimeout(() => {

                logScrollState(sourceContainer, '源码容器(延迟)');
            }, 100);

            // 源码视图按钮
            sourceBtn.addEventListener('click', () => {

                sourceContainer.style.display = 'block';
                previewContainer.style.display = 'none';
                sourceBtn.style.opacity = '1';
                previewBtn.style.opacity = '0.6';
                // 检查滚动条状态
                logScrollState(sourceContainer, '源码容器(点击后立即)');
                // 延迟再检查一次
                setTimeout(() => {
                    logScrollState(sourceContainer, '源码容器(点击后延迟)');
                }, 100);
            });

            // 预览视图按钮
            previewBtn.addEventListener('click', async () => {

                sourceContainer.style.display = 'none';
                previewContainer.style.display = 'block';
                sourceBtn.style.opacity = '0.6';
                previewBtn.style.opacity = '1';

                if (previewContainer.children.length === 0) {

                    previewContainer.innerHTML = '<div class="nc-center--pad20-muted">加载预览中...</div>';
                    try {

                        const processedHtml = await this._replaceImagePlaceholders(content);

                        previewContainer.innerHTML = processedHtml;
                        const scripts = previewContainer.querySelectorAll('script');

                        scripts.forEach(oldScript => {
                            const newScript = document.createElement('script');
                            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                            if (oldScript.innerHTML) newScript.innerHTML = oldScript.innerHTML;
                            oldScript.parentNode.replaceChild(newScript, oldScript);
                        });


                        // 预览加载完成后，检查预览容器的滚动状态
                        logScrollState(previewContainer, '预览容器(加载后)');
                    } catch (err) {
                        console.error('[UI._showHtmlPreviewModal] 预览渲染失败:', err);
                        previewContainer.innerHTML = `<div class="nc-color--error-padded">预览渲染失败: ${err.message}</div>`;
                    }
                } else {

                    logScrollState(previewContainer, '预览容器(显示)');
                }
            });

            // 复制按钮
            copyBtn.addEventListener('click', async () => {

                await copyToClipboard(content);
            });

            // 关闭按钮
            closeBtn.addEventListener('click', () => {

                this._closeModal(overlay);
            });

            // 遮罩层点击关闭
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {

                    this._closeModal(overlay);
                }
            });

            // 默认显示源码视图，检查滚动条
            sourceContainer.style.display = 'block';
            previewContainer.style.display = 'none';
            sourceBtn.style.opacity = '1';
            previewBtn.style.opacity = '0.6';

            logScrollState(sourceContainer, '源码容器(初始)');
            // 延迟再检查一次
            setTimeout(() => {
                logScrollState(sourceContainer, '源码容器(初始延迟)');
            }, 100);
        },

        // ==================== 文件管理器 ====================

        showFileManager: async function () {

            console.time('FileManagerOpen');
            this.closeAll();

            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100050';

            const modal = document.createElement('div');
            modal.className = 'nc-modal nc-scroll';
            modal.style.maxWidth = '900px';
            modal.style.width = '100%';
            modal.style.height = '80vh';

            modal.innerHTML = `
        <div class="nc-modal-header">
            <h2 class="nc-modal-title--primary">📁 文件管理器</h2>
        </div>
        <div class="nc-flex--tab-bar">
            <button id="nc-file-tab-images" class="nc-btn nc-btn-primary nc-flex-item--grow">🖼️ 图片库</button>
            <button id="nc-file-tab-audios" class="nc-btn nc-btn-secondary nc-flex-item--grow">🎵 音频库</button>
            <button id="nc-file-tab-other" class="nc-btn nc-btn-secondary nc-flex-item--grow">📄 其余文件库</button>  <!-- 原为 nc-file-tab-texts，现改为 other -->
            <button id="nc-file-tab-library" class="nc-btn nc-btn-secondary nc-flex-item--grow">📚 图片书</button>
            <button id="nc-file-tab-audiobook" class="nc-btn nc-btn-secondary nc-flex-item--grow">📚 音频书</button>
            <button id="nc-file-tab-galgames" class="nc-btn nc-btn-secondary nc-flex-item--grow">🎮 Galgame项目</button>
            <button id="nc-file-upload" class="nc-btn nc-btn-success nc-flex-item--upload-btn">📤 上传文件</button>
        </div>
        <div id="nc-file-content" class="nc-modal-body nc-size--file-content"></div>
        <div class="nc-modal-footer">
            <button class="nc-modal-close-btn">关闭</button>
        </div>
    `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            this._openModal(overlay);

            const contentDiv = modal.querySelector('#nc-file-content');
            const imagesTab = modal.querySelector('#nc-file-tab-images');
            const libraryTab = modal.querySelector('#nc-file-tab-library');
            const audiosTab = modal.querySelector('#nc-file-tab-audios');
            const otherFilesTab = modal.querySelector('#nc-file-tab-other');   // 使用正确的选择器
            const audiobookTab = modal.querySelector('#nc-file-tab-audiobook');
            const galgamesTab = modal.querySelector('#nc-file-tab-galgames');
            const uploadBtn = modal.querySelector('#nc-file-upload');
            const closeBtn = modal.querySelector('.nc-modal-close-btn');

            // 调试：检查各个按钮元素是否存在
            console.log('[FileManager] 按钮元素存在性检查:', {
                imagesTab: !!imagesTab,
                libraryTab: !!libraryTab,
                audiosTab: !!audiosTab,
                otherFilesTab: !!otherFilesTab,
                audiobookTab: !!audiobookTab,
                galgamesTab: !!galgamesTab,
                uploadBtn: !!uploadBtn,
                closeBtn: !!closeBtn
            });

            let currentTab = 'images';

            const setActiveTab = (tabId) => {

                const tabs = [
                    { btn: imagesTab, id: 'images' },
                    { btn: libraryTab, id: 'library' },
                    { btn: audiosTab, id: 'audios' },
                    { btn: otherFilesTab, id: 'other' },
                    { btn: audiobookTab, id: 'audiobook' },
                    { btn: galgamesTab, id: 'galgames' }
                ];
                tabs.forEach(item => {
                    if (item.btn) {
                        if (item.id === tabId) {
                            item.btn.className = 'nc-btn nc-btn-primary';
                            item.btn.style.opacity = '1';
                            item.btn.style.boxShadow = '0 2px 8px rgba(102,126,234,0.5)';
                        } else {
                            item.btn.className = 'nc-btn nc-btn-secondary';
                            item.btn.style.opacity = '0.7';
                            item.btn.style.boxShadow = 'none';
                        }
                    } else {
                        console.warn(`[FileManager] 按钮 ${item.id} 不存在，无法切换样式`);
                    }
                });
            };

            // --- 辅助函数：从世界书条目中获取图片ID ---
            const extractImageIdFromEntry = (entry) => {
                if (entry.image_id) return entry.image_id;
                if (entry.content) {
                    const match = entry.content.match(/id:([a-zA-Z0-9_]+)/);
                    if (match) return match[1];
                }
                return null;
            };

            // ===== 加载图片库 =====
            const loadImages = async () => {

                currentTab = 'images';
                setActiveTab('images');
                contentDiv.innerHTML = '<div class="nc-center--pad20">加载图片库...</div>';

                try {
                    const allImages = await ImageStore.getAll();

                    if (allImages.length === 0) {
                        contentDiv.innerHTML = '<div class="nc-center--pad20-muted">图片库为空</div>';
                        return;
                    }

                    let html = '<div class="nc-flex--gallery">';
                    for (const img of allImages) {
                        const { id, blob } = img;
                        const url = URL.createObjectURL(blob);
                        html += `
                    <div class="nc-card--image-thumb">
                        <img src="${url}" class="nc-img--thumb-100" alt="${id}">
                        <div class="nc-text--xs-break">${id}</div>
                        <div class="nc-flex--row-5-center-sp">
                            <button class="nc-btn nc-btn-xs nc-btn-primary download-btn" data-id="${id}" data-type="img">下载</button>
                            <button class="nc-btn nc-btn-xs nc-btn-danger delete-btn" data-id="${id}" data-type="img">删除</button>
                        </div>
                    </div>
                `;
                    }
                    html += '</div>';
                    contentDiv.innerHTML = html;

                    // 下载按钮（无需确认）
                    contentDiv.querySelectorAll('.download-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;

                            const blob = await ImageStore.get(id);
                            if (blob) {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = id + (blob.type.includes('jpeg') ? '.jpg' : '.png');
                                a.click();
                                URL.revokeObjectURL(url);
                            }
                        });
                    });

                    // 删除按钮
                    contentDiv.querySelectorAll('.delete-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;

                            const confirmed = await UI.showConfirmModal(`确定要删除图片 ${id} 吗？`, '确认');
                            if (!confirmed) {

                                return;
                            }

                            await ImageStore.delete(id);
                            Notify.success(`图片 ${id} 已删除`);
                            loadImages();
                        });
                    });

                } catch (err) {
                    console.error('[FileManager] 加载图片失败:', err);
                    contentDiv.innerHTML = `<div class="nc-color--error-padded">加载失败: ${err.message}</div>`;
                }
            };

            // ===== 加载图库书图片 =====
            const loadLibraryImages = async () => {

                currentTab = 'library';
                setActiveTab('library');
                contentDiv.innerHTML = '<div class="nc-center--pad20">加载图库书...</div>';

                try {
                    const entries = await getLibraryEntries();

                    if (entries.length === 0) {
                        contentDiv.innerHTML = '<div class="nc-center--pad20-muted">图库书为空</div>';
                        return;
                    }

                    const items = [];
                    for (const entry of entries) {
                        const imageId = extractImageIdFromEntry(entry);
                        if (!imageId) continue;
                        const blob = await ImageStore.get(imageId);
                        if (!blob) continue;
                        items.push({ entry, imageId, blob });
                    }


                    if (items.length === 0) {
                        contentDiv.innerHTML = '<div class="nc-center--pad20-muted">图库书中无可显示的图片</div>';
                        return;
                    }

                    let html = '<div class="nc-flex--gallery">';
                    for (const item of items) {
                        const { entry, imageId, blob } = item;
                        const url = URL.createObjectURL(blob);
                        const bookIndex = entry.book;
                        html += `
                    <div class="nc-card--image-thumb">
                        <img src="${url}" class="nc-img--thumb-100" alt="${imageId}">
                        <div class="nc-text--xs-break">
                            图库${bookIndex}-${entry.uid}<br>${imageId}
                        </div>
                        <div class="nc-flex--row-5-center-sp">
                            <button class="nc-btn nc-btn-xs nc-btn-primary download-library-btn" data-book="${bookIndex}" data-uid="${entry.uid}" data-id="${imageId}">下载</button>
                            <button class="nc-btn nc-btn-xs nc-btn-danger delete-library-btn" data-book="${bookIndex}" data-uid="${entry.uid}" data-id="${imageId}">删除</button>
                        </div>
                    </div>
                `;
                    }
                    html += '</div>';
                    contentDiv.innerHTML = html;

                    // 下载按钮
                    contentDiv.querySelectorAll('.download-library-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;

                            const blob = await ImageStore.get(id);
                            if (blob) {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = id + (blob.type.includes('jpeg') ? '.jpg' : '.png');
                                a.click();
                                URL.revokeObjectURL(url);
                            }
                        });
                    });

                    // 删除按钮
                    contentDiv.querySelectorAll('.delete-library-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const bookIndex = parseInt(e.target.dataset.book);
                            const uid = parseInt(e.target.dataset.uid);
                            const imageId = e.target.dataset.id;

                            const confirmed = await UI.showConfirmModal(
                                `确定要删除图库${bookIndex}的条目(uid=${uid})及其对应图片 ${imageId} 吗？`,
                                '确认'
                            );
                            if (!confirmed) {

                                return;
                            }

                            try {
                                await ImageStore.delete(imageId);
                                const bookName = `状态书-图库${bookIndex}`;
                                const book = await API.getWorldbook(bookName);
                                let entries = Array.isArray(book) ? book : (book.entries || []);
                                const newEntries = entries.filter(e => e.uid !== uid);
                                if (newEntries.length !== entries.length) {
                                    await API.updateWorldbook(bookName, () => newEntries, { render: 'immediate' });
                                }
                                Notify.success(`图库条目已删除`);
                                loadLibraryImages();
                            } catch (err) {
                                console.error('[FileManager] 删除失败:', err);
                                Notify.error('删除失败: ' + err.message);
                            }
                        });
                    });

                } catch (err) {
                    console.error('[FileManager] 加载图库书失败:', err);
                    contentDiv.innerHTML = `<div class="nc-color--error-padded">加载失败: ${err.message}</div>`;
                }
            };

            // ===== 加载音频库 =====
            const loadAudios = async () => {

                currentTab = 'audios';
                setActiveTab('audios');
                contentDiv.innerHTML = '<div class="nc-center--pad20">加载音频库...</div>';

                try {
                    const allAudios = await AudioStore.getAll();

                    if (allAudios.length === 0) {
                        contentDiv.innerHTML = '<div class="nc-center--pad20-muted">音频库为空</div>';
                        return;
                    }

                    let html = '<div class="nc-flex--col-10-sp">';
                    for (const audio of allAudios) {
                        const { id, blob } = audio;
                        const url = URL.createObjectURL(blob);
                        html += `
                    <div class="nc-card--dark-md">
                        <div class="nc-flex--row-between-mb5-sp">
                            <span class="nc-text--bold-primary">${id}</span>
                            <span class="nc-text--xs-muted">${blob.type || 'audio'}</span>
                        </div>
                        <audio controls class="nc-audio--compact">
                            <source src="${url}" type="${blob.type}">
                            您的浏览器不支持音频播放。
                        </audio>
                        <div class="nc-flex--row-5-mt5-sp">
                            <button class="nc-btn nc-btn-xs nc-btn-primary download-audio-btn" data-id="${id}">下载</button>
                            <button class="nc-btn nc-btn-xs nc-btn-danger delete-audio-btn" data-id="${id}">删除</button>
                        </div>
                    </div>
                `;
                    }
                    html += '</div>';
                    contentDiv.innerHTML = html;

                    contentDiv.querySelectorAll('.download-audio-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;

                            const blob = await AudioStore.get(id);
                            if (blob) {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = id + (blob.type.includes('mp3') ? '.mp3' : '.wav');
                                a.click();
                                URL.revokeObjectURL(url);
                            }
                        });
                    });

                    contentDiv.querySelectorAll('.delete-audio-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;

                            const confirmed = await UI.showConfirmModal(`确定要删除音频 ${id} 吗？`, '确认');
                            if (!confirmed) {

                                return;
                            }

                            await AudioStore.delete(id);
                            Notify.success(`音频 ${id} 已删除`);
                            loadAudios();
                        });
                    });

                } catch (err) {
                    console.error('[FileManager] 加载音频失败:', err);
                    contentDiv.innerHTML = `<div class="nc-color--error-padded">加载失败: ${err.message}</div>`;
                }
            };

            // ===== 加载音频书 =====
            const loadAudioBook = async () => {

                currentTab = 'audiobook';
                setActiveTab('audiobook');
                contentDiv.innerHTML = '<div class="nc-center--pad20">加载音频书...</div>';

                try {
                    const entries = await getAudioLibraryEntries();

                    if (entries.length === 0) {
                        contentDiv.innerHTML = '<div class="nc-center--pad20-muted">音频书为空</div>';
                        return;
                    }

                    const items = [];
                    for (const entry of entries) {
                        const audioId = entry.audio_id;
                        if (!audioId) continue;
                        const blob = await AudioStore.get(audioId);
                        if (!blob) continue;
                        items.push({ entry, audioId, blob });
                    }


                    if (items.length === 0) {
                        contentDiv.innerHTML = '<div class="nc-center--pad20-muted">音频书中无可播放的音频</div>';
                        return;
                    }

                    let html = '<div class="nc-flex--col-10-sp">';
                    for (const item of items) {
                        const { entry, audioId, blob } = item;
                        const url = URL.createObjectURL(blob);
                        const bookIndex = entry.book;
                        html += `
                    <div class="nc-card--dark-md">
                        <div class="nc-flex--row-between-mb5-sp">
                            <span class="nc-text--bold-primary">音频库${bookIndex}-${entry.uid}</span>
                            <span class="nc-text--xs-muted">${blob.type || 'audio'}</span>
                        </div>
                        <div class="nc-text--audio-name">${entry.name || ''}</div>
                        <audio controls class="nc-audio--compact">
                            <source src="${url}" type="${blob.type}">
                            您的浏览器不支持音频播放。
                        </audio>
                        <div class="nc-flex--row-5-mt5-sp">
                            <button class="nc-btn nc-btn-xs nc-btn-primary download-audiobook-btn" data-book="${bookIndex}" data-uid="${entry.uid}" data-id="${audioId}">下载</button>
                            <button class="nc-btn nc-btn-xs nc-btn-danger delete-audiobook-btn" data-book="${bookIndex}" data-uid="${entry.uid}" data-id="${audioId}">删除</button>
                        </div>
                    </div>
                `;
                    }
                    html += '</div>';
                    contentDiv.innerHTML = html;

                    contentDiv.querySelectorAll('.download-audiobook-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;

                            const blob = await AudioStore.get(id);
                            if (blob) {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = id + (blob.type.includes('mp3') ? '.mp3' : '.wav');
                                a.click();
                                URL.revokeObjectURL(url);
                            }
                        });
                    });

                    contentDiv.querySelectorAll('.delete-audiobook-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const bookIndex = parseInt(e.target.dataset.book);
                            const uid = parseInt(e.target.dataset.uid);
                            const audioId = e.target.dataset.id;

                            const confirmed = await UI.showConfirmModal(
                                `确定要删除音频库${bookIndex}的条目(uid=${uid})及其对应音频 ${audioId} 吗？`,
                                '确认'
                            );
                            if (!confirmed) {

                                return;
                            }

                            try {
                                await AudioStore.delete(audioId);
                                const bookName = `状态书-音频库${bookIndex}`;
                                const book = await API.getWorldbook(bookName);
                                let entries = Array.isArray(book) ? book : (book.entries || []);
                                const newEntries = entries.filter(e => e.uid !== uid);
                                if (newEntries.length !== entries.length) {
                                    await API.updateWorldbook(bookName, () => newEntries, { render: 'immediate' });
                                }
                                Notify.success(`音频书条目已删除`);
                                loadAudioBook();
                            } catch (err) {
                                console.error('[FileManager] 删除失败:', err);
                                Notify.error('删除失败: ' + err.message);
                            }
                        });
                    });

                } catch (err) {
                    console.error('[FileManager] 加载音频书失败:', err);
                    contentDiv.innerHTML = `<div class="nc-color--error-padded">加载失败: ${err.message}</div>`;
                }
            };

            // ===== 加载其余文件库 =====
            const loadOtherFiles = async () => {

                currentTab = 'other';
                setActiveTab('other');
                contentDiv.innerHTML = '<div class="nc-center--pad20">加载其余文件库...</div>';

                try {
                    const allTexts = await OtherFileStore.getAll();

                    if (allTexts.length === 0) {
                        contentDiv.innerHTML = '<div class="nc-center--pad20-muted">其余文件库为空</div>';
                        return;
                    }

                    let html = '';
                    for (const item of allTexts) {
                        const { id, text, format } = item;
                        const preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
                        html += `
                    <div class="nc-card--dark-md-mb10">
                        <div class="nc-flex--row-between-mid-sp">
                            <span class="nc-text--bold-primary">${id}</span>
                            <span class="nc-text--xs-muted">${format}</span>
                        </div>
                        <pre class="nc-code-pre--mini">${escapeHtml(preview)}</pre>
                        <div class="nc-flex--row-5-mt5-wrap-sp">
                            <button class="nc-btn nc-btn-xs nc-btn-primary view-text-btn" data-id="${id}" data-format="${format}">查看</button>
                            <button class="nc-btn nc-btn-xs nc-btn-primary download-text-btn" data-id="${id}" data-format="${format}">下载</button>
                            <button class="nc-btn nc-btn-xs nc-btn-danger delete-text-btn" data-id="${id}">删除</button>
                        </div>
                    </div>
                `;
                    }
                    contentDiv.innerHTML = html;

                    contentDiv.querySelectorAll('.view-text-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;
                            const format = e.target.dataset.format;

                            const item = await OtherFileStore.get(id);
                            if (item) {
                                this.showMarkdownModal(`文本预览: ${id}`, item.text, {
                                    maxWidth: '700px',
                                    fontFamily: 'Consolas, monospace',
                                    lineHeight: '1.6',
                                    accentColor: '#667eea'
                                });
                            }
                        });
                    });

                    contentDiv.querySelectorAll('.download-text-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;
                            const format = e.target.dataset.format;

                            const item = await OtherFileStore.get(id);
                            if (item) {
                                const ext = format === 'html' ? 'html' : format === 'js' ? 'js' : 'txt';
                                const blob = new Blob([item.text], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${id}.${ext}`;
                                a.click();
                                URL.revokeObjectURL(url);
                            }
                        });
                    });

                    contentDiv.querySelectorAll('.delete-text-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;

                            const confirmed = await UI.showConfirmModal(`确定要删除文本 ${id} 吗？`, '确认');
                            if (!confirmed) {

                                return;
                            }

                            await OtherFileStore.delete(id);
                            Notify.success(`文本 ${id} 已删除`);
                            loadOtherFiles();
                        });
                    });

                } catch (err) {
                    console.error('[FileManager] 加载文本失败:', err);
                    contentDiv.innerHTML = `<div class="nc-color--error-padded">加载失败: ${err.message}</div>`;
                }
            };

            // ===== 加载Galgame项目 =====
            const loadGalgames = async () => {

                currentTab = 'galgames';
                setActiveTab('galgames');
                contentDiv.innerHTML = '<div class="nc-center--pad20">加载Galgame项目...</div>';

                try {
                    const projects = await Storage.listGalgameProjects();

                    if (projects.length === 0) {
                        contentDiv.innerHTML = '<div class="nc-center--pad20-muted">暂无Galgame项目</div>';
                        return;
                    }

                    let html = '<div class="nc-flex--col-10-sp">';
                    for (const proj of projects) {
                        const date = new Date(proj.updatedAt).toLocaleString();
                        html += `
                    <div class="nc-card--dark-row">
                        <div class="nc-flex-item--grow">
                            <div class="nc-text--bold-primary">${escapeHtml(proj.name)}</div>
                            <div class="nc-text--xs-muted">ID: ${proj.id}</div>
                            <div class="nc-text--xs-muted">更新: ${date}</div>
                        </div>
                        <div class="nc-flex--row-5-sp">
                            <button class="nc-btn nc-btn-xs nc-btn-primary load-gal-btn" data-id="${proj.id}">加载</button>
                            <button class="nc-btn nc-btn-xs nc-btn-secondary export-gal-btn" data-id="${proj.id}" data-name="${proj.name}">导出</button>
                            <button class="nc-btn nc-btn-xs nc-btn-danger delete-gal-btn" data-id="${proj.id}">删除</button>
                        </div>
                    </div>
                `;
                    }
                    html += '</div>';
                    contentDiv.innerHTML = html;

                    // 加载按钮
                    contentDiv.querySelectorAll('.load-gal-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;

                            const project = await Storage.loadGalgameProject(id);
                            if (project) {
                                this._closeModal(overlay);
                                setTimeout(() => {
                                    this.showGalgameEditor();
                                    setTimeout(async () => {
                                        const editorOverlay = document.querySelector('.nc-modal-overlay .nc-modal');
                                        if (editorOverlay && editorOverlay.editor) {
                                            editorOverlay.editor.loadFromJSON(project.nodes);
                                            WORKFLOW_STATE.galProject = project;
                                            WORKFLOW_STATE.galProjectId = id;
                                            Notify.success('项目加载成功');
                                        }
                                    }, 500);
                                }, 300);
                            } else {
                                Notify.error('项目不存在');
                            }
                        });
                    });

                    // 导出按钮
                    contentDiv.querySelectorAll('.export-gal-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;
                            const name = e.target.dataset.name;

                            const project = await Storage.loadGalgameProject(id);
                            if (project) {
                                await UI._exportGalgameProject(name, project.nodes);
                            }
                        });
                    });

                    // 删除按钮
                    contentDiv.querySelectorAll('.delete-gal-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const id = e.target.dataset.id;

                            const confirmed = await UI.showConfirmModal(`确定要删除项目 ${id} 吗？`, '确认');
                            if (!confirmed) {

                                return;
                            }

                            await Storage.deleteGalgameProject(id);
                            Notify.success('项目已删除');
                            loadGalgames();
                        });
                    });

                } catch (err) {
                    console.error('[FileManager] 加载Galgame项目失败:', err);
                    contentDiv.innerHTML = `<div class="nc-color--error-padded">加载失败: ${err.message}</div>`;
                }
            };

            // ==================== 上传文件功能（支持自定义ID/自动生成） ====================
            uploadBtn.addEventListener('click', async () => {

                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);

                fileInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) {
                        fileInput.remove();
                        return;
                    }


                    // 确定文件类型和存储
                    const mime = file.type;
                    const ext = file.name.split('.').pop()?.toLowerCase();
                    let storeType = null;
                    let store = null;
                    let format = '';
                    let expectedPrefix = '';

                    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
                        storeType = 'image';
                        store = ImageStore;
                        expectedPrefix = 'img_';
                    } else if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
                        storeType = 'audio';
                        store = AudioStore;
                        expectedPrefix = 'audio_';
                    } else if (mime.startsWith('text/') || mime === 'application/javascript' || mime === 'application/json' ||
                        ['txt', 'html', 'js', 'json', 'css', 'md'].includes(ext)) {
                        storeType = 'text';
                        store = OtherFileStore;
                        format = ext === 'html' ? 'html' : ext === 'js' ? 'js' : ext === 'json' ? 'json' : 'txt';
                        expectedPrefix = 'other_';
                    } else {
                        console.warn('[FileManager] 不支持的文件类型，跳过');
                        Notify.warning('不支持的文件类型，仅支持图片、音频和常见文本格式');
                        fileInput.remove();
                        return;
                    }

                    // 弹出自定义ID输入模态框
                    let customId = '';
                    try {

                        customId = await new Promise((resolve, reject) => {
                            const overlay2 = document.createElement('div');
                            overlay2.className = 'nc-modal-overlay nc-font';
                            overlay2.style.zIndex = '100060';

                            const modal2 = document.createElement('div');
                            modal2.className = 'nc-modal';
                            modal2.style.maxWidth = '450px';

                            modal2.innerHTML = `
                        <div class="nc-modal-header">
                            <h2 class="nc-modal-title--primary-c">保存 ${storeType === 'image' ? '图片' : storeType === 'audio' ? '音频' : '其余文件'}</h2>
                        </div>
                        <div class="nc-modal-body nc-body--pad20">
                            <div class="nc-mb15">
                                <label class="nc-field-label--base">自定义ID（可选）</label>
                                <input type="text" id="nc-custom-id" placeholder="${expectedPrefix}your_id" class="nc-modal-input--base">
                                <div class="nc-text--xs-muted-mt5">必须以 ${expectedPrefix} 开头，只能包含字母、数字、下划线</div>
                            </div>
                            <div>
                                <p class="nc-color--muted-mb5">文件名: ${file.name}</p>
                            </div>
                        </div>
                        <div class="nc-modal-footer nc-flex--footer-10-center">
                            <button id="nc-confirm-ok" class="nc-modal-copy-btn nc-btn--grad-purple">确定</button>
                            <button id="nc-confirm-auto" class="nc-modal-copy-btn nc-btn--grad-teal">自动生成</button>
                            <button class="nc-modal-close-btn nc-btn--grad-red">取消</button>
                        </div>
                    `;

                            overlay2.appendChild(modal2);
                            document.body.appendChild(overlay2);
                            ModalStack.push(overlay2);

                            const idInput = modal2.querySelector('#nc-custom-id');
                            const okBtn = modal2.querySelector('#nc-confirm-ok');
                            const autoBtn = modal2.querySelector('#nc-confirm-auto');
                            const closeBtn = modal2.querySelector('.nc-modal-close-btn');

                            const handleSave = async (useAuto) => {
                                let inputId = useAuto ? null : idInput.value.trim();


                                if (!useAuto && !inputId) {
                                    Notify.error('请输入自定义ID或使用“自动生成”');
                                    return;
                                }

                                // 格式校验（仅当不是自动生成且提供了ID）
                                if (!useAuto && inputId) {
                                    const idRegex = new RegExp(`^${expectedPrefix}[a-zA-Z0-9_]+$`);
                                    if (!idRegex.test(inputId)) {
                                        Notify.error(`ID必须以 ${expectedPrefix} 开头，且只能包含字母、数字、下划线`);
                                        return;
                                    }
                                }

                                // 冲突检测（仅当使用自定义ID时）
                                if (!useAuto && inputId) {
                                    let existing;
                                    try {
                                        if (storeType === 'image') {
                                            existing = await ImageStore.get(inputId);
                                        } else if (storeType === 'audio') {
                                            existing = await AudioStore.get(inputId);
                                        } else {
                                            existing = await OtherFileStore.get(inputId);
                                        }
                                    } catch (e) {
                                        console.warn('[FileManager] 冲突检测出错', e);
                                        existing = null;
                                    }

                                    if (existing) {
                                        const action = await UI._showResourceConflictModal(inputId, storeType);

                                        if (action === 'cancel' || action === 'skip') {
                                            return; // 不关闭模态框
                                        }
                                        // action === 'overwrite' 则继续
                                    }
                                }

                                // 执行保存
                                try {
                                    let savedId;
                                    if (storeType === 'image') {
                                        savedId = await ImageStore.save(file, null, useAuto ? undefined : inputId);
                                    } else if (storeType === 'audio') {
                                        savedId = await AudioStore.save(file, useAuto ? undefined : inputId);
                                    } else {
                                        const text = await file.text();
                                        savedId = await OtherFileStore.save(text, format, useAuto ? undefined : inputId);
                                    }

                                    ModalStack.closeTop();
                                    resolve(savedId);
                                } catch (err) {
                                    console.error('[FileManager] 保存失败:', err);
                                    Notify.error('保存失败: ' + err.message);
                                    // 不关闭模态框，让用户重试
                                }
                            };

                            okBtn.addEventListener('click', () => handleSave(false));
                            autoBtn.addEventListener('click', () => handleSave(true));
                            closeBtn.addEventListener('click', () => {

                                ModalStack.closeTop();
                                reject(new Error('用户取消'));
                            });
                            overlay2.addEventListener('click', (e) => {
                                if (e.target === overlay2) {

                                    ModalStack.closeTop();
                                    reject(new Error('用户取消'));
                                }
                            });
                            idInput.addEventListener('keypress', (e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    okBtn.click();
                                }
                            });
                        });
                    } catch (err) {
                        console.error('[UI.openFileManager] 文件保存对话框出错:', err);
                        fileInput.remove();
                        return;
                    }

                    // 根据文件类型自动切换标签页并刷新
                    if (storeType === 'image') {
                        currentTab = 'images';
                        setActiveTab('images');
                        await loadImages();
                    } else if (storeType === 'audio') {
                        currentTab = 'audios';
                        setActiveTab('audios');
                        await loadAudios();
                    } else if (storeType === 'text') {
                        currentTab = 'other';
                        setActiveTab('other');
                        await loadOtherFiles();
                    } else {
                        if (currentTab === 'images') await loadImages();
                        else if (currentTab === 'library') await loadLibraryImages();
                        else if (currentTab === 'audios') await loadAudios();
                        else if (currentTab === 'audiobook') await loadAudioBook();
                        else if (currentTab === 'other') await loadOtherFiles();
                    }

                    fileInput.remove();
                });

                fileInput.click();
            });

            // 标签页点击事件
            imagesTab.addEventListener('click', loadImages);
            libraryTab.addEventListener('click', loadLibraryImages);
            audiosTab.addEventListener('click', loadAudios);
            otherFilesTab.addEventListener('click', loadOtherFiles);   // 原为 textsTab，现使用 otherFilesTab
            if (audiobookTab) audiobookTab.addEventListener('click', loadAudioBook);
            galgamesTab.addEventListener('click', loadGalgames);

            // 关闭按钮
            closeBtn.addEventListener('click', () => {

                const reopenMainPanel = () => {
                    setTimeout(() => {
                        if (ModalStack._stack.length === 0 && !document.getElementById(CONFIG.UI.panelId)) {

                            UI.createPanel();
                        }
                    }, 250);
                };
                this._closeModal(overlay);
                reopenMainPanel();
            });

            // 遮罩层点击关闭
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {

                    const reopenMainPanel = () => {
                        setTimeout(() => {
                            if (ModalStack._stack.length === 0 && !document.getElementById(CONFIG.UI.panelId)) {
                                UI.createPanel();
                            }
                        }, 250);
                    };
                    this._closeModal(overlay);
                    reopenMainPanel();
                }
            });

            // 默认显示图片库

            loadImages();
            console.timeEnd('FileManagerOpen');
        },

        showGalgameEditor: async function () {

            this.closeAll();

            // 加载项目列表（用于侧边栏）
            const projects = await Storage.listGalgameProjects();

            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100100';

            const modal = document.createElement('div');
            modal.className = 'nc-modal';
            modal.style.maxWidth = '1200px';
            modal.style.width = '95vw';
            modal.style.height = '85vh';
            modal.style.padding = '0';
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';
            modal.style.background = 'var(--nc-color-panel)';

            // 标题栏（已调整按钮顺序并添加显示指示线复选框）
            const header = document.createElement('div');
            header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 15px;
        border-bottom: 2px solid #667eea;
        background: rgba(0,0,0,0.2);
    `;
            header.innerHTML = `
        <div class="nc-flex--row-15-middle-sp">
            <span class="nc-toolbar-title">🎮 Galgame 制作器</span>
            <button id="nc-gal-mode-edit" class="nc-btn nc-btn-xs nc-gal-btn--edit-mode">✏️ 制作模式</button>
            <button id="nc-gal-mode-play" class="nc-btn nc-btn-xs nc-btn--teal">▶️ 播放模式</button>
        </div>
        <div class="nc-flex--row-8-center-sp">
            <!-- 自动布局按钮移到新建按钮左边 -->
            <label class="nc-checkbox-label--xs">
                <input type="checkbox" id="nc-gal-show-guides" checked> 显示指示线
            </label>
            <button id="nc-gal-auto-layout" class="nc-btn nc-btn-xs nc-btn--green">🔄 自动布局</button>
            <button id="nc-gal-new" class="nc-btn nc-btn-xs nc-btn--green">🆕 新建</button>
            <button id="nc-gal-save" class="nc-btn nc-btn-xs nc-btn--purple">💾 保存</button>
            <button id="nc-gal-load" class="nc-btn nc-btn-xs nc-btn--purple">📂 加载</button>
            <button id="nc-gal-export" class="nc-btn nc-btn-xs nc-btn--orange">📤 导出</button>
            <button id="nc-gal-import" class="nc-btn nc-btn-xs nc-btn--orange">📥 导入</button>
            <button id="nc-gal-package" class="nc-btn nc-btn-xs nc-btn--red">📦 打包</button>
            <button id="nc-gal-close" class="nc-btn nc-btn-xs nc-btn-ghost">❌ 关闭</button>
        </div>
    `;
            modal.appendChild(header);

            // 主内容区
            const main = document.createElement('div');
            main.style.cssText = 'flex:1; display:flex; overflow:hidden; min-height:0;';
            modal.appendChild(main);

            // 左侧资源面板
            const leftPanel = document.createElement('div');
            leftPanel.style.cssText = `
        width: 200px;
        background: rgba(0,0,0,0.2);
        border-right: 1px solid #333;
        padding: 10px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;
            leftPanel.innerHTML = '<h4 class="nc-heading--muted-h4">📦 资源库</h4><div id="nc-gal-resources"></div>';
            main.appendChild(leftPanel);

            // 中央画布容器
            const canvasContainer = document.createElement('div');
            canvasContainer.style.cssText = `
        flex: 1;
        background: #0f172a;
        position: relative;
        overflow: hidden;
    `;
            main.appendChild(canvasContainer);

            const canvas = document.createElement('canvas');
            canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        cursor: default;
    `;
            canvasContainer.appendChild(canvas);

            // 右侧属性面板
            const rightPanel = document.createElement('div');
            rightPanel.style.cssText = `
        width: 300px;
        background: rgba(0,0,0,0.2);
        border-left: 1px solid #333;
        padding: 10px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;
            rightPanel.innerHTML = `
        <div id="nc-gal-variables" class="nc-section--border-bottom">
            <h4 class="nc-heading--primary-h4">📊 变量监视器</h4>
            <div id="nc-gal-var-content" class="nc-text--sm"></div>
        </div>
        <div id="nc-gal-properties">
            <h4 class="nc-heading--primary-h4">🔧 节点属性</h4>
            <div class="nc-color--muted-center">未选中节点</div>
        </div>
    `;
            main.appendChild(rightPanel);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            this._openModal(overlay);

            // 资源清理函数
            const cleanupResources = () => {
                const container = leftPanel.querySelector('#nc-gal-resources');
                if (container) {
                    const imgs = container.querySelectorAll('img');
                    imgs.forEach(img => {
                        if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
                    });
                    const sources = container.querySelectorAll('audio source');
                    sources.forEach(source => {
                        if (source.src.startsWith('blob:')) URL.revokeObjectURL(source.src);
                    });
                }
            };

            // 自动保存定时器
            let autoSaveTimer = null;
            const startAutoSave = () => {
                if (autoSaveTimer) clearInterval(autoSaveTimer);
                autoSaveTimer = setInterval(async () => {
                    if (!WORKFLOW_STATE.galProjectId || !editor) return;
                    const nodes = editor.toJSON();
                    if (nodes.length === 0) return;
                    const project = {
                        name: WORKFLOW_STATE.galProject?.name || '未命名项目',
                        startNode: nodes.length > 0 ? nodes[0].id : 1,
                        nodes: nodes,
                        variables: WORKFLOW_STATE.galProject?.variables || {},
                        updatedAt: Date.now()
                    };
                    await Storage.saveGalgameProject(WORKFLOW_STATE.galProjectId, project);

                }, 300000); // 5分钟
            };

            // 初始化编辑器实例
            const editor = new GalgameEditor(canvas, {
                onNodeSelect: (node) => {

                    this._renderGalgameProperties(node, rightPanel.querySelector('#nc-gal-properties'), editor);
                },
                onNodesChange: () => this._updateGalgameCanvas(editor)
            });

            overlay.editor = editor;
            overlay.rightPanel = rightPanel;

            // 加载或初始化项目
            if (WORKFLOW_STATE.galProject) {

                editor.loadFromJSON(WORKFLOW_STATE.galProject.nodes);
            } else {
                WORKFLOW_STATE.galProject = {
                    name: '未命名项目',
                    nodes: [],
                    variables: {}
                };
                WORKFLOW_STATE.galProjectId = null;

            }

            startAutoSave();
            this._loadGalgameResources(leftPanel.querySelector('#nc-gal-resources'));
            this._renderGalgameVariables(rightPanel.querySelector('#nc-gal-var-content'));

            // 绑定工具栏事件（包含自动布局和指示线复选框）
            this._bindGalgameToolbar(overlay, editor, projects);

            // 绑定指示线复选框事件（单独绑定，也可合并到_bindGalgameToolbar中）
            const showGuidesCheckbox = modal.querySelector('#nc-gal-show-guides');
            if (showGuidesCheckbox) {
                showGuidesCheckbox.addEventListener('change', (e) => {
                    if (editor) {
                        editor.showGuides = e.target.checked;
                        editor._requestRender();

                    }
                });
            }

            modal.querySelector('#nc-gal-close').addEventListener('click', () => {

                if (autoSaveTimer) clearInterval(autoSaveTimer);
                cleanupResources();
                this._closeModal(overlay);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {

                    if (autoSaveTimer) clearInterval(autoSaveTimer);
                    cleanupResources();
                    this._closeModal(overlay);
                }
            });


        },

        _loadGalgameResources: async function (container) {


            // 清理容器内现有的 blob URL
            const oldImages = container.querySelectorAll('img');
            oldImages.forEach(img => {
                const src = img.src;
                if (src && src.startsWith('blob:')) {
                    URL.revokeObjectURL(src);
                }
            });
            const oldAudios = container.querySelectorAll('audio source');
            oldAudios.forEach(source => {
                const src = source.src;
                if (src && src.startsWith('blob:')) {
                    URL.revokeObjectURL(src);
                }
            });

            const images = await ImageStore.getAll();
            const audios = await AudioStore.getAll();

            let html = '<div class="nc-mb10"><strong class="nc-color--primary">图片</strong></div>';
            if (images.length === 0) html += '<div class="nc-color--muted-sm">无图片</div>';
            images.forEach(img => {
                const url = URL.createObjectURL(img.blob);
                html += `<div class="nc-mb8">
            <img src="${url}" class="nc-img--cover-60">
            <div class="nc-text--xxs-muted2">${img.id}</div>
        </div>`;
            });

            html += '<div class="nc-my10"><strong class="nc-color--primary">音频</strong></div>';
            if (audios.length === 0) html += '<div class="nc-color--muted-sm">无音频</div>';
            audios.forEach(audio => {
                const url = URL.createObjectURL(audio.blob);
                html += `<div class="nc-mb8">
            <audio controls class="nc-audio--full"><source src="${url}" type="${audio.blob.type}"></audio>
            <div class="nc-text--xxs-muted2">${audio.id}</div>
        </div>`;
            });

            container.innerHTML = html;
        },

        _renderGalgameVariables: function (container) {

            const vars = WORKFLOW_STATE.galProject?.variables || {};

            let html = `
                <table class="nc-table--sm2">
                    <thead><tr><th class="nc-th--muted">变量名</th><th class="nc-th--muted">初始值</th><th class="nc-th--muted">操作</th></tr></thead>
                    <tbody id="gal-var-tbody">
                    </tbody>
                </table>
                <button id="gal-add-var" class="nc-gal-btn--add-var">➕ 新增变量</button>
            `;
            container.innerHTML = html;

            const tbody = container.querySelector('#gal-var-tbody');
            const renderRows = () => {
                tbody.innerHTML = '';
                for (const [name, value] of Object.entries(vars)) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="nc-td--tight">${escapeHtml(name)}</td>
                        <td class="nc-td--tight">
                            <input type="text" class="var-value" data-var="${name}" value="${escapeHtml(JSON.stringify(value))}"
                                class="nc-gal-input--var-val">
                        </td>
                        <td class="nc-td--tight">
                            <button class="var-delete nc-gal-btn--var-delete" data-var="${name}">✖</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                }

                // 绑定变量值修改事件
                container.querySelectorAll('.var-value').forEach(input => {
                    input.addEventListener('change', (e) => {
                        const varName = e.target.dataset.var;
                        let newValue;
                        try {
                            newValue = JSON.parse(e.target.value);
                        } catch {
                            newValue = e.target.value; // 视为字符串
                        }
                        WORKFLOW_STATE.galProject.variables[varName] = newValue;

                    });
                });

                // 绑定变量删除事件（修复：使用正确的按钮选择器）
                container.querySelectorAll('.var-delete').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const varName = e.target.dataset.var;
                        if (confirm(`确定删除变量 ${varName} 吗？`)) {
                            delete WORKFLOW_STATE.galProject.variables[varName];
                            renderRows(); // 重新渲染

                        }
                    });
                });
            };

            const addBtn = container.querySelector('#gal-add-var');
            addBtn.addEventListener('click', async () => {
                const name = await UI.showPromptModal('输入变量名（字母、数字、下划线）', '', '变量名');
                if (!name) return;
                if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
                    Notify.error('变量名不合法');
                    return;
                }
                const valueStr = await UI.showPromptModal('输入初始值（JSON格式，如 0, "hello", []）', '0', '初始值');
                if (valueStr === null) return;
                let value;
                try {
                    value = JSON.parse(valueStr);
                } catch {
                    value = valueStr;
                }
                WORKFLOW_STATE.galProject.variables[name] = value;

                renderRows();
            });

            renderRows();
        },

        _renderGalgameProperties: function (node, container, editor) {


            // 如果 editor 未定义，尝试从 container 的祖先模态框中获取 editor
            let _editor = editor;
            if (!_editor) {

                const overlay = container.closest('.nc-modal-overlay');
                if (overlay && overlay.editor) {
                    _editor = overlay.editor;

                } else {
                    console.error('[GalgameProp] 无法获取 editor，属性面板将不可用');
                    container.innerHTML = '<div class="nc-color--error-center">❌ 编辑器实例丢失，请重新打开制作器</div>';
                    return;
                }
            }

            if (!node) {
                container.innerHTML = '<div class="nc-color--muted-center">未选中节点</div>';

                return;
            }

            // ===== 获取当前节点引用的章节快照（如果有） =====
            let snapshotEntries = [];
            let chapter = null;
            if (node.chapterNum) {
                const chapters = Storage.loadChapters();
                chapter = chapters.find(c => c.num === node.chapterNum);
                if (chapter && chapter.snapshot && chapter.snapshot.books) {
                    // 遍历所有状态书，收集状态条目（名称以 "状态-" 开头）
                    const books = chapter.snapshot.books;
                    for (const bookName in books) {
                        const entries = books[bookName] || [];
                        entries.forEach(entry => {
                            if (entry.name && entry.name.startsWith('状态-')) {
                                snapshotEntries.push({
                                    book: bookName,
                                    name: entry.name,
                                    content: entry.content || '',
                                    uid: entry.uid
                                });
                            }
                        });
                    }
                }
            }


            // ===== 构建HTML =====
            let html = `
        <div class="nc-mb15">
            <label class="nc-color--muted">节点ID</label>
            <input type="number" id="gal-node-id" value="${node.id}" readonly class="nc-gal-input--base">
        </div>
        <div class="nc-mb15">
            <label class="nc-color--muted">标题</label>
            <input type="text" id="gal-node-title" value="${escapeHtml(node.title || '')}" class="nc-gal-input--base">
        </div>
        <div class="nc-mb15">
            <label class="nc-color--muted">引用章节号</label>
            <input type="number" id="gal-node-chapter" value="${node.chapterNum || ''}" class="nc-gal-input--base">
            <button id="gal-import-chapter" class="nc-gal-btn--import-chapter">📖 从历史导入</button>
        </div>
        <div class="nc-mb15">
            <label class="nc-color--muted">节点脚本 (script)</label>
            <textarea id="gal-node-script" rows="8" class="nc-gal-input--mono"
                placeholder="示例：\n// 获取用户选择的文本\nlet choice = utils.getText(result);\nif (choice === '接受') {\n    vars.accepted = true;  // 修改变量\n    return 5;              // 跳转到节点5\n} else if (choice === '拒绝') {\n    return 6;\n}\n// 无返回则使用默认目标">${escapeHtml(node.script || '')}</textarea>
            <div class="nc-text--xs-muted-mt3">脚本可访问 vars（变量）和 result（用户交互结果），应返回数字节点ID或字符串路径。无返回则使用默认目标。</div>
        </div>
        <div class="nc-mb15">
            <label class="nc-color--muted">默认目标 (defaultTarget)</label>
            <input type="text" id="gal-default-target" value="${node.defaultTarget || ''}" class="nc-gal-input--base" placeholder="例如 5">
        </div>
        <div class="nc-mb15">
            <label class="nc-color--muted">进入脚本 (onEnterScript)</label>
            <textarea id="gal-on-enter-script" rows="3" class="nc-gal-input--mono"
                placeholder="示例：vars.enterCount = (vars.enterCount || 0) + 1;">${escapeHtml(node.onEnterScript || '')}</textarea>
            <div class="nc-text--xs-muted">进入节点时执行，可访问 vars。</div>
        </div>
        <hr class="nc-divider">
        <div id="gal-node-analysis" class="nc-card--dark-sm">
            <div class="nc-text--bold-muted">📈 当前节点变量分析</div>
            <div id="gal-analysis-content" class="nc-text--xs-light">分析中...</div>
        </div>
    `;

            // ===== 添加从快照导入变量的区域 =====
            if (snapshotEntries.length > 0) {
                html += `
            <hr class="nc-divider">
            <div class="nc-card--dark-sm">
                <div class="nc-text--bold-muted">📦 从本章快照导入变量</div>
                <div id="gal-snapshot-entries" class="nc-mt10--snapshot-scroll">
                    ${snapshotEntries.map((entry, index) => {
                    // 【修改点】生成建议的变量名：直接去掉 "状态-" 前缀，保留原始字符串
                    let suggestedName = entry.name.replace(/^状态-/, '');
                    return `
                            <div class="nc-flex--snapshot-row">
                                <span class="nc-flex-item--entry-name" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</span>
                                <input type="text" id="snapshot-var-name-${index}" value="${escapeHtml(suggestedName)}" placeholder="变量名" class="nc-gal-input--snapshot-var">
                                <button class="snapshot-add-btn nc-gal-btn--snapshot-add" data-index="${index}">添加</button>
                            </div>
                        `;
                }).join('')}
                </div>
                <div class="nc-text--xs-muted-mt5-cff0">点击“添加”将条目内容作为字符串存储到对应变量中，可在脚本中通过 vars.变量名 访问。</div>
            </div>
        `;
            } else if (node.chapterNum) {
                html += `
            <hr class="nc-divider">
            <div class="nc-card--dark-sm">
                <div class="nc-text--bold-muted">📦 从本章快照导入变量</div>
                <div class="nc-text--muted-padded">本章无状态书快照或未找到状态条目。</div>
            </div>
        `;
            } else {
                html += `
            <hr class="nc-divider">
            <div class="nc-card--dark-sm">
                <div class="nc-text--bold-muted">📦 从本章快照导入变量</div>
                <div class="nc-text--muted-padded">请先关联一个章节。</div>
            </div>
        `;
            }

            html += `<button id="gal-delete-node" class="nc-gal-btn--delete-node">🗑️ 删除节点</button>`;

            container.innerHTML = html;

            // 获取DOM元素
            const titleInput = container.querySelector('#gal-node-title');
            const chapterInput = container.querySelector('#gal-node-chapter');
            const scriptInput = container.querySelector('#gal-node-script');
            const defaultTargetInput = container.querySelector('#gal-default-target');
            const onEnterScriptInput = container.querySelector('#gal-on-enter-script');
            const importBtn = container.querySelector('#gal-import-chapter');
            const deleteBtn = container.querySelector('#gal-delete-node');
            const analysisDiv = container.querySelector('#gal-analysis-content');

            // 节点属性变化保存（使用 blur 事件避免频繁更新）
            titleInput.addEventListener('blur', () => {
                node.title = titleInput.value;
                _editor.updateNode(node.id, { title: node.title });

            });

            chapterInput.addEventListener('change', () => {
                const val = parseInt(chapterInput.value);
                if (!isNaN(val)) {
                    node.chapterNum = val;
                    _editor.updateNode(node.id, { chapterNum: node.chapterNum });

                }
            });

            scriptInput.addEventListener('blur', () => {
                node.script = scriptInput.value;
                _editor.updateNode(node.id, { script: node.script });

            });

            defaultTargetInput.addEventListener('blur', () => {
                node.defaultTarget = defaultTargetInput.value;
                _editor.updateNode(node.id, { defaultTarget: node.defaultTarget });

            });

            onEnterScriptInput.addEventListener('blur', () => {
                node.onEnterScript = onEnterScriptInput.value;
                _editor.updateNode(node.id, { onEnterScript: node.onEnterScript });

            });

            // 从历史导入章节号
            importBtn.addEventListener('click', () => {

                HistoryUI.showChapterSelectionModal((selected) => {
                    if (selected && selected.length > 0) {
                        const ch = selected[0];
                        node.chapterNum = ch.num;
                        chapterInput.value = ch.num;
                        _editor.updateNode(node.id, { chapterNum: ch.num });

                        Notify.success(`已关联章节 #${ch.num}`);
                        // 重新渲染属性面板以显示快照导入区域
                        UI._renderGalgameProperties(node, container, editor);
                    }
                });
            });

            // 删除节点
            deleteBtn.addEventListener('click', async () => {
                const confirmed = await UI.showConfirmModal(`确定删除节点 #${node.id} 吗？`, '确认');
                if (confirmed) {

                    _editor.deleteNode(node.id);
                }
            });

            // 变量分析函数
            const analyzeNodeVariables = () => {
                const scripts = [];
                if (node.onEnterScript) scripts.push(node.onEnterScript);
                if (node.script) scripts.push(node.script);
                const varUsage = {};
                scripts.forEach(script => {
                    const lines = script.split('\n');
                    lines.forEach(line => {
                        // 匹配 vars.xxx
                        const varMatches = line.match(/vars\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g) || [];
                        varMatches.forEach(m => {
                            const name = m.split('.')[1];
                            if (!varUsage[name]) varUsage[name] = { ref: true, assign: false, values: [] };
                        });
                        // 匹配赋值：vars.xxx = ... 或 vars.xxx += ... 等
                        const assignMatch = line.match(/vars\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(.+?);/);
                        if (assignMatch) {
                            const name = assignMatch[1];
                            const right = assignMatch[2].trim();
                            if (!varUsage[name]) varUsage[name] = { ref: true, assign: true, values: [] };
                            varUsage[name].assign = true;
                            try {
                                const val = eval('(' + right + ')');
                                varUsage[name].values.push(JSON.stringify(val));
                            } catch {
                                varUsage[name].values.push(right);
                            }
                        }
                        const plusMatch = line.match(/vars\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\+\=\s*(.+?);/);
                        if (plusMatch) {
                            const name = plusMatch[1];
                            const right = plusMatch[2].trim();
                            if (!varUsage[name]) varUsage[name] = { ref: true, assign: true, values: [] };
                            varUsage[name].assign = true;
                            varUsage[name].values.push(`原值 + ${right}`);
                        }
                        const minusMatch = line.match(/vars\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\-\=\s*(.+?);/);
                        if (minusMatch) {
                            const name = minusMatch[1];
                            const right = minusMatch[2].trim();
                            if (!varUsage[name]) varUsage[name] = { ref: true, assign: true, values: [] };
                            varUsage[name].assign = true;
                            varUsage[name].values.push(`原值 - ${right}`);
                        }
                    });
                });
                if (Object.keys(varUsage).length === 0) {
                    analysisDiv.innerHTML = '此节点未使用任何变量';
                } else {
                    let html = '';
                    for (const [name, info] of Object.entries(varUsage)) {
                        let desc = `${name}`;
                        if (info.assign) {
                            desc += ` (赋值) 可能值: ${info.values.join(' 或 ')}`;
                        } else {
                            desc += ` (仅引用)`;
                        }
                        html += `<div>${desc}</div>`;
                    }
                    analysisDiv.innerHTML = html;
                }
            };
            analyzeNodeVariables();

            // ===== 绑定快照导入按钮事件 =====
            if (snapshotEntries.length > 0) {
                const addButtons = container.querySelectorAll('.snapshot-add-btn');
                addButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const index = e.target.dataset.index;
                        const varNameInput = container.querySelector(`#snapshot-var-name-${index}`);
                        const varName = varNameInput.value.trim();
                        if (!varName) {
                            Notify.warning('请输入变量名');
                            return;
                        }
                        // 验证变量名合法性（允许包含中文、连字符等，但作为对象键无需严格验证）
                        // 这里不再强制限制标识符格式，但保留基本的空字符串检查
                        if (varName.length === 0) {
                            Notify.error('变量名不能为空');
                            return;
                        }
                        const entry = snapshotEntries[index];
                        // 存储条目内容到项目变量
                        if (!WORKFLOW_STATE.galProject) {
                            WORKFLOW_STATE.galProject = { variables: {} };
                        }
                        if (!WORKFLOW_STATE.galProject.variables) {
                            WORKFLOW_STATE.galProject.variables = {};
                        }
                        WORKFLOW_STATE.galProject.variables[varName] = entry.content; // 存储为字符串

                        Notify.success(`变量 ${varName} 已添加`);
                        // 刷新变量监视器
                        const varContainer = document.querySelector('#nc-gal-var-content');
                        if (varContainer && UI._renderGalgameVariables) {
                            UI._renderGalgameVariables(varContainer);
                        }
                    });
                });
            }


        },

        _analyzeNodeResults: async function (node, container, editor) {

            const analyzerKey = Object.keys(CONFIG.AGENTS).find(k => CONFIG.AGENTS[k].role === 'interactionAnalyzer');
            if (!analyzerKey) {
                Notify.warning('未找到分析助手 Agent (role: interactionAnalyzer)');
                // 在属性面板显示提示
                const warningDiv = document.createElement('div');
                warningDiv.style.cssText = 'margin-top:10px; padding:8px; background:#ffc107; color:#000; border-radius:4px; font-size:12px;';
                warningDiv.textContent = '⚠️ 未配置分析助手，无法自动分析。请手动添加结果值。';
                container.appendChild(warningDiv);
                setTimeout(() => warningDiv.remove(), 5000);
                return;
            }

            const chapter = Storage.loadChapters().find(c => c.num === node.chapterNum);
            if (!chapter) {
                Notify.error('章节内容不存在，无法分析');
                return;
            }

            const agent = CONFIG.AGENTS[analyzerKey];
            const prompt = agent.inputTemplate.replace('【】', chapter.content);


            try {
                const response = await Workflow.callAgent(analyzerKey, prompt);


                let results = [];
                try {
                    results = JSON.parse(response);
                    if (!Array.isArray(results)) results = [results];
                } catch (e) {
                    results = response.split('\n').map(l => l.trim()).filter(l => l);
                }

                results.forEach(val => {
                    const key = typeof val === 'string' ? val : JSON.stringify(val);
                    if (!node.resultMap.hasOwnProperty(key)) {
                        node.resultMap[key] = 0;
                    }
                });

                this._renderGalgameProperties(node, container, editor);
                editor._requestRender();
                Notify.success(`分析完成，添加 ${results.length} 个结果`);
            } catch (err) {
                console.error('[GalgameEditor] 分析失败:', err);
                Notify.error('分析失败: ' + err.message);
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = 'margin-top:10px; padding:8px; background:#dc3545; color:white; border-radius:4px; font-size:12px;';
                errorDiv.textContent = '分析失败，请手动添加结果值。';
                container.appendChild(errorDiv);
                setTimeout(() => errorDiv.remove(), 5000);
            }
        },

        _bindGalgameToolbar: function (overlay, editor, projects) {


            // 获取所有按钮（包括硬编码的自动布局按钮）
            const modeEdit = overlay.querySelector('#nc-gal-mode-edit');
            const modePlay = overlay.querySelector('#nc-gal-mode-play');
            const newBtn = overlay.querySelector('#nc-gal-new');
            const saveBtn = overlay.querySelector('#nc-gal-save');
            const loadBtn = overlay.querySelector('#nc-gal-load');
            const exportBtn = overlay.querySelector('#nc-gal-export');
            const importBtn = overlay.querySelector('#nc-gal-import');
            const autoLayoutBtn = overlay.querySelector('#nc-gal-auto-layout');
            const packageBtn = overlay.querySelector('#nc-gal-package');
            const closeBtn = overlay.querySelector('#nc-gal-close');

            console.log('[GalgameToolbar] 按钮查找结果:', {
                modeEdit: !!modeEdit,
                modePlay: !!modePlay,
                newBtn: !!newBtn,
                saveBtn: !!saveBtn,
                loadBtn: !!loadBtn,
                exportBtn: !!exportBtn,
                importBtn: !!importBtn,
                autoLayoutBtn: !!autoLayoutBtn,
                packageBtn: !!packageBtn,
                closeBtn: !!closeBtn
            });

            // 辅助函数：更新模式按钮样式
            const setMode = (mode) => {
                if (mode === 'edit') {
                    modeEdit.style.background = 'linear-gradient(135deg,#667eea,#764ba2)';
                    modeEdit.style.opacity = '1';
                    modeEdit.style.boxShadow = '0 2px 8px rgba(102,126,234,0.5)';
                    modePlay.style.background = '#4a4a6a';
                    modePlay.style.opacity = '0.6';
                    modePlay.style.boxShadow = 'none';
                } else {
                    modePlay.style.background = 'linear-gradient(135deg,#4ecdc4,#44a3aa)';
                    modePlay.style.opacity = '1';
                    modePlay.style.boxShadow = '0 2px 8px rgba(78,205,196,0.5)';
                    modeEdit.style.background = '#4a4a6a';
                    modeEdit.style.opacity = '0.6';
                    modeEdit.style.boxShadow = 'none';
                }
            };

            // 模式切换
            let currentMode = 'edit';
            let player = null;
            const canvasContainer = overlay.querySelector('canvas').parentElement;
            const playContainer = document.createElement('div');
            playContainer.id = 'nc-gal-play-container';
            playContainer.style.cssText = 'display:none; width:100%; height:100%; overflow-y:auto; padding:10px; background:#0f172a; color:#eaeaea;';
            canvasContainer.parentElement.appendChild(playContainer);

            setMode('edit');

            if (modeEdit) {
                modeEdit.addEventListener('click', () => {

                    if (currentMode === 'play') {
                        if (player) player.stop();
                        canvasContainer.style.display = 'block';
                        playContainer.style.display = 'none';
                        currentMode = 'edit';
                        editor.render();
                        setMode('edit');

                    }
                });
            } else {
                console.warn('[GalgameToolbar] 未找到 #nc-gal-mode-edit 按钮');
            }

            if (modePlay) {
                modePlay.addEventListener('click', () => {

                    if (currentMode === 'edit') {
                        const nodes = editor.toJSON();
                        if (nodes.length === 0) {
                            Notify.warning('当前没有节点，请先添加节点');
                            return;
                        }
                        canvasContainer.style.display = 'none';
                        playContainer.style.display = 'block';
                        currentMode = 'play';
                        setMode('play');
                        const project = {
                            startNode: nodes[0].id,
                            nodes: nodes,
                            variables: WORKFLOW_STATE.galProject?.variables || {}
                        };
                        player = new GalgamePlayer(playContainer, project);
                        player.start();

                    }
                });
            } else {
                console.warn('[GalgameToolbar] 未找到 #nc-gal-mode-play 按钮');
            }

            // 新建项目
            if (newBtn) {
                newBtn.addEventListener('click', async () => {

                    const confirmed = await UI.showConfirmModal('新建将清空当前编辑，确定？', '确认');
                    if (!confirmed) return;
                    editor.setNodes([]);
                    WORKFLOW_STATE.galProject = {
                        name: '未命名项目',
                        nodes: [],
                        variables: {}
                    };
                    WORKFLOW_STATE.galProjectId = null;
                    overlay.querySelector('#nc-gal-properties').innerHTML = '<div class="nc-color--muted">未选中节点</div>';
                    UI._renderGalgameVariables(overlay.querySelector('#nc-gal-var-content'));

                });
            } else {
                console.warn('[GalgameToolbar] 未找到 #nc-gal-new 按钮');
            }

            // 保存项目
            if (saveBtn) {
                saveBtn.addEventListener('click', async () => {

                    const nodes = editor.toJSON();
                    if (nodes.length === 0) {
                        Notify.warning('没有节点可保存');
                        return;
                    }
                    const projectName = await UI.showPromptModal('输入项目名称', WORKFLOW_STATE.galProject?.name || '未命名项目', '项目名称');
                    if (!projectName) return;

                    let thumbnail = '';
                    try {
                        thumbnail = editor.canvas.toDataURL('image/jpeg', 0.5);
                    } catch (e) {
                        console.warn('[Galgame._buildNode] 缩略图生成失败', e);
                    }

                    const project = {
                        name: projectName,
                        startNode: nodes.length > 0 ? nodes[0].id : 1,
                        nodes: nodes,
                        variables: WORKFLOW_STATE.galProject?.variables || {},
                        createdAt: WORKFLOW_STATE.galProject?.createdAt || Date.now(),
                        updatedAt: Date.now()
                    };

                    let id = WORKFLOW_STATE.galProjectId;
                    if (!id) {
                        id = `gal_${Date.now()}`;
                    }
                    await Storage.saveGalgameProject(id, project);
                    WORKFLOW_STATE.galProject = project;
                    WORKFLOW_STATE.galProjectId = id;
                    Notify.success('项目已保存');

                    UI._renderGalgameVariables(overlay.querySelector('#nc-gal-var-content'));
                });
            } else {
                console.warn('[GalgameToolbar] 未找到 #nc-gal-save 按钮');
            }

            // 加载项目
            if (loadBtn) {
                loadBtn.addEventListener('click', async () => {

                    const projects = await Storage.listGalgameProjects();


                    if (projects.length === 0) {
                        Notify.info('暂无保存的项目');
                        return;
                    }

                    const loadOverlay = document.createElement('div');
                    loadOverlay.className = 'nc-modal-overlay nc-font';
                    loadOverlay.style.zIndex = '100200';

                    const loadModal = document.createElement('div');
                    loadModal.className = 'nc-modal';
                    loadModal.style.maxWidth = '600px';
                    loadModal.style.width = '100%';

                    let projectsHTML = '';
                    projects.forEach(proj => {
                        const date = new Date(proj.updatedAt).toLocaleString();
                        projectsHTML += `
                <div class="project-item nc-card--project-item" data-id="${proj.id}" onmouseover="this.style.background='rgba(102,126,234,0.2)'; this.style.borderColor='#667eea'" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='transparent'">
                    <div class="nc-flex--row-10-middle">
                        <div class="nc-gal-project-icon">🎮</div>
                        <div class="nc-flex-item--grow">
                            <div class="nc-text--bold">${UI._escapeHtml(proj.name)}</div>
                            <div class="nc-text--xs-muted">ID: ${proj.id}</div>
                            <div class="nc-text--xxs-muted">更新: ${date}</div>
                        </div>
                    </div>
                </div>
            `;
                    });

                    loadModal.innerHTML = `
            <div class="nc-modal-header">
                <h2 class="nc-modal-title--primary-c">📂 选择项目</h2>
            </div>
            <div class="nc-modal-body nc-size--modal-50vh-pad">
                ${projectsHTML}
            </div>
            <div class="nc-modal-footer">
                <button class="nc-modal-close-btn">取消</button>
            </div>
        `;

                    loadOverlay.appendChild(loadModal);
                    document.body.appendChild(loadOverlay);
                    UI._openModal(loadOverlay);

                    loadModal.querySelectorAll('.project-item').forEach(item => {
                        item.addEventListener('click', async () => {
                            const id = item.dataset.id;

                            const project = await Storage.loadGalgameProject(id);
                            if (project) {
                                editor.loadFromJSON(project.nodes);
                                WORKFLOW_STATE.galProject = project;
                                WORKFLOW_STATE.galProjectId = id;
                                const selectedNode = editor.selectedNode;
                                if (selectedNode) {
                                    UI._renderGalgameProperties(selectedNode, overlay.querySelector('#nc-gal-properties'), editor);
                                } else {
                                    overlay.querySelector('#nc-gal-properties').innerHTML = '<div class="nc-color--muted">未选中节点</div>';
                                }
                                UI._renderGalgameVariables(overlay.querySelector('#nc-gal-var-content'));
                                Notify.success('项目加载成功');

                            } else {
                                Notify.error('项目不存在');
                            }
                            UI._closeModal(loadOverlay);
                        });
                    });

                    const closeBtn = loadModal.querySelector('.nc-modal-close-btn');
                    closeBtn.addEventListener('click', () => UI._closeModal(loadOverlay));
                    loadOverlay.addEventListener('click', (e) => {
                        if (e.target === loadOverlay) UI._closeModal(loadOverlay);
                    });
                });
            } else {
                console.warn('[GalgameToolbar] 未找到 #nc-gal-load 按钮');
            }

            // 导出项目
            if (exportBtn) {
                exportBtn.addEventListener('click', async () => {

                    const nodes = editor.toJSON();
                    if (nodes.length === 0) {
                        Notify.warning('没有节点可导出');
                        return;
                    }
                    const projectName = WORKFLOW_STATE.galProject?.name || '未命名项目';
                    await UI._exportGalgameProject(projectName, nodes);
                });
            } else {
                console.warn('[GalgameToolbar] 未找到 #nc-gal-export 按钮');
            }

            // 导入项目
            if (importBtn) {
                importBtn.addEventListener('click', () => {

                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.zip,application/zip';
                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        await UI._importGalgameProject(file, editor, overlay);
                        UI._renderGalgameVariables(overlay.querySelector('#nc-gal-var-content'));
                    };
                    input.click();
                });
            } else {
                console.warn('[GalgameToolbar] 未找到 #nc-gal-import 按钮');
            }

            // 自动布局按钮
            if (autoLayoutBtn) {
                autoLayoutBtn.addEventListener('click', () => {

                    if (editor && typeof editor.autoLayout === 'function') {
                        editor.autoLayout();

                    } else {
                        console.error('[GalgameToolbar] editor 无效或 autoLayout 方法不存在', editor);
                        Notify.error('自动布局功能不可用');
                    }
                });
            } else {
                console.warn('[GalgameToolbar] 未找到 #nc-gal-auto-layout 按钮');
            }

            // 打包按钮
            if (packageBtn) {
                packageBtn.addEventListener('click', async () => {

                    const nodes = editor.toJSON();
                    if (nodes.length === 0) {
                        Notify.warning('没有节点可打包');
                        return;
                    }
                    await UI._packageGalgameProject(nodes);
                });
            } else {
                console.warn('[GalgameToolbar] 未找到 #nc-gal-package 按钮');
            }

            // 关闭按钮已在外部绑定，这里不再重复绑定


        },

        /**
         * 打包 Galgame 项目为独立 HTML 文件
         * @param {Array} nodes - 节点数组
         */
        _packageGalgameProject: async function (nodes) {


            // 1. 收集所有引用的章节号
            const chapterNums = new Set();
            nodes.forEach(node => {
                if (node.chapterNum) chapterNums.add(node.chapterNum);
            });


            // 2. 加载章节内容
            const chapters = Storage.loadChapters();
            const chapterMap = {};
            chapters.forEach(ch => {
                if (chapterNums.has(ch.num)) {
                    chapterMap[ch.num] = ch.content;
                }
            });


            // 3. 为每个节点附加章节内容
            nodes.forEach(node => {
                if (node.chapterNum && chapterMap[node.chapterNum]) {
                    node.content = chapterMap[node.chapterNum];
                } else {
                    console.warn(`[GalgameEditor] 节点 ${node.id} 引用的章节 ${node.chapterNum} 不存在，内容为空`);
                    node.content = '';
                }
            });

            // 4. 收集所有资源 ID
            const imageIds = new Set();
            const audioIds = new Set();
            const otherFileIds = new Set();

            nodes.forEach(node => {
                if (node.content) {
                    extractImageIds(node.content).forEach(id => imageIds.add(id));
                    extractAudioIds(node.content).forEach(id => audioIds.add(id));
                    extractOtherFileIds(node.content).forEach(id => otherFileIds.add(id));
                }
            });


            // 5. 加载资源并转换为 base64
            const resources = {
                images: {},
                audios: {},
                otherFiles: {}
            };

            for (const id of imageIds) {
                const blob = await ImageStore.get(id);
                if (blob) {
                    resources.images[id] = await this._blobToBase64(blob);

                } else {
                    console.warn(`[GalgameEditor] 图片 ${id} 不存在，跳过`);
                }
            }

            for (const id of audioIds) {
                const blob = await AudioStore.get(id);
                if (blob) {
                    resources.audios[id] = await this._blobToBase64(blob);

                } else {
                    console.warn(`[GalgameEditor] 音频 ${id} 不存在，跳过`);
                }
            }

            for (const id of otherFileIds) {
                const item = await OtherFileStore.get(id);
                if (item) {
                    resources.otherFiles[id] = {
                        text: item.text,
                        format: item.format
                    };

                } else {
                    console.warn(`[GalgameEditor] 其余文件 ${id} 不存在，跳过`);
                }
            }

            // 6. 获取变量初始值
            const variables = WORKFLOW_STATE.galProject?.variables || {};


            // 7. 构建项目数据对象
            const projectData = {
                name: WORKFLOW_STATE.galProject?.name || '未命名项目',
                startNode: nodes.length > 0 ? nodes[0].id : 1,
                nodes: nodes,
                resources: resources,
                variables: variables
            };

            // 8. 生成 HTML 模板（包含完整的播放器逻辑，支持变量和脚本）
            const htmlTemplate = `<!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${escapeHtml(projectData.name)} - Galgame 独立版</title>
                    <style>
                        body, html {
                            margin: 0;
                            padding: 0;
                            width: 100%;
                            height: 100%;
                            background: #1a1a2e;
                            color: #eaeaea;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
                            overflow: hidden;
                        }
                        #player-container {
                            width: 100%;
                            height: 100%;
                            display: flex;
                            flex-direction: column;
                        }
                        #player-header {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 10px 20px;
                            background: rgba(0,0,0,0.3);
                            border-bottom: 2px solid #667eea;
                            flex-shrink: 0;
                        }
                        #player-header h1 {
                            margin: 0;
                            font-size: 18px;
                            color: #667eea;
                        }
                        #player-controls button {
                            background: #4a4a6a;
                            border: none;
                            color: white;
                            padding: 6px 12px;
                            border-radius: 6px;
                            cursor: pointer;
                            margin-left: 8px;
                            font-size: 12px;
                        }
                        #player-controls button:hover {
                            filter: brightness(1.1);
                        }
                        #player-content {
                            flex: 1;
                            overflow-y: auto;
                            padding: 20px;
                            background: #0f172a;
                        }
                        #player-options {
                            border-top: 1px solid #667eea;
                            background: rgba(0,0,0,0.3);
                            max-height: 120px;
                            overflow-y: auto;
                            padding: 10px;
                            flex-shrink: 0;
                        }
                        .option-btn {
                            background: linear-gradient(135deg,#667eea,#764ba2);
                            color: white;
                            border: none;
                            border-radius: 6px;
                            padding: 8px 12px;
                            margin: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        }
                        .option-btn:hover {
                            filter: brightness(1.1);
                        }
                        .markdown-body img {
                            max-width: 100%;
                            border-radius: 8px;
                            border: 1px solid #667eea;
                            display: block;
                            margin: 10px auto;
                        }
                    </style>
                </head>
                <body>
                    <div id="player-container">
                        <div id="player-header">
                            <h1>${escapeHtml(projectData.name)}</h1>
                            <div id="player-controls">
                                <button id="back-btn" class="nc-hidden">↩ 返回</button>
                            </div>
                        </div>
                        <div id="player-content" class="markdown-body"></div>
                        <div id="player-options"></div>
                    </div>
                    <script>
                        (function() {
                            'use strict';

                            const project = ${JSON.stringify(projectData, null, 2)};

                            const pathToId = {};
                            project.nodes.forEach(node => {
                                if (node.path) pathToId[node.path] = node.id;
                            });

                            function findNode(id) {
                                return project.nodes.find(n => n.id === id);
                            }

                            function resolveTarget(target) {

                                if (typeof target === 'number') {
                                    return findNode(target) ? target : null;
                                } else if (typeof target === 'string') {
                                    const parsed = parseInt(target, 10);
                                    if (!isNaN(parsed) && findNode(parsed)) {
                                        return parsed;
                                    }
                                    const id = pathToId[target];
                                    if (id !== undefined && findNode(id)) {
                                        return id;
                                    }
                                }
                                return null;
                            }

                            // 资源映射
                            const resources = project.resources || { images: {}, audios: {}, texts: {} };

                            // 变量初始值
                            let variables = JSON.parse(JSON.stringify(project.variables || {}));

                            // 辅助函数：替换图片占位符
                            async function replacePlaceholders(html) {
                                const imgRegex = /src="id:([^"]+)"/g;
                                const matches = [...html.matchAll(imgRegex)];
                                let result = html;
                                for (const match of matches) {
                                    const id = match[1];
                                    if (id.startsWith('img_') && resources.images[id]) {
                                        result = result.replace(match[0], \`src="\${resources.images[id]}"\`);
                                    } else if (id.startsWith('audio_') && resources.audios[id]) {
                                        result = result.replace(match[0], \`src="\${resources.audios[id]}"\`);
                                    } else if (id.startsWith('other_') && resources.otherFiles[id]) {
                                        const textData = resources.otherFiles[id];
                                        const blob = new Blob([textData.text], { type: textData.format === 'html' ? 'text/html' : 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        result = result.replace(match[0], \`src="\${url}"\`);
                                    } else {
                                        result = result.replace(match[0], \`src="#" alt="资源丢失"\`);
                                    }
                                }
                                return result;
                            }

                            // 安全执行脚本
                            function evalScript(script, result) {
                                try {
                                    const fn = new Function('vars', 'result', script);
                                    return fn(variables, result);
                                } catch (e) {
                                    console.error('[Galgame.playNode] 脚本执行错误:', e);
                                    return undefined;
                                }
                            }

                            // 播放器状态
                            let currentNodeId = project.startNode;
                            let history = [];
                            let canGoBack = false;

                            const contentDiv = document.getElementById('player-content');
                            const optionsDiv = document.getElementById('player-options');
                            const backBtn = document.getElementById('back-btn');

                            function findNode(id) {
                                return project.nodes.find(n => n.id === id);
                            }

                            async function loadNode(id, skipHistory = false) {
                                const node = findNode(id);
                                if (!node) {
                                    contentDiv.innerHTML = '<div class="nc-color--error">节点不存在</div>';
                                    return;
                                }
                                if (!skipHistory && currentNodeId !== id) {
                                    history.push(currentNodeId);
                                    canGoBack = true;
                                    backBtn.style.display = 'inline-block';
                                }
                                currentNodeId = id;

                                // 执行进入脚本
                                if (node.onEnterScript) {
                                    evalScript(node.onEnterScript, null);
                                }

                                let html = node.content || '';
                                html = await replacePlaceholders(html);
                                contentDiv.innerHTML = html;

                                // 执行内容中的脚本
                                contentDiv.querySelectorAll('script').forEach(oldScript => {
                                    const newScript = document.createElement('script');
                                    Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                                    newScript.textContent = oldScript.textContent;
                                    oldScript.parentNode.replaceChild(newScript, oldScript);
                                });

                                // 生成选项按钮（如果有结果映射，此处为兼容旧版，但新版使用脚本控制，所以暂时不生成按钮）
                                // 实际上在新版中，选项由控件（如按钮组）在内容中定义，并通过 window.__interactionResolver 传递结果
                                // 所以我们只需要等待用户交互
                                optionsDiv.innerHTML = '<div class="nc-color--muted-center">等待你的选择...</div>';
                            }

                            // 处理用户交互结果
                            window.__interactionResolver = function(result) {

                                const node = findNode(currentNodeId);
                                if (!node) return;

                                if (!node.script) {
                                    console.warn('[Player] 当前节点没有脚本，无法处理');
                                    return;
                                }

                                const scriptResult = evalScript(node.script, result);
                                let targetId = null;
                                if (typeof scriptResult === 'number') {
                                    targetId = scriptResult;
                                } else if (typeof scriptResult === 'string') {
                                    // 尝试将字符串解析为节点ID（数字）或通过路径查找
                                    const parsed = parseInt(scriptResult, 10);
                                    if (!isNaN(parsed)) {
                                        targetId = parsed;
                                    } else {
                                        // 路径查找，但独立版中我们只有节点ID，没有路径映射，所以这里简单处理
                                        console.warn('[Player] 字符串目标暂不支持，使用数字ID');
                                    }
                                }
                                // 如果 scriptResult 为 undefined 或其他，targetId 保持 null

                                if (targetId !== null && findNode(targetId)) {
                                    loadNode(targetId);
                                } else {
                                    // 使用默认目标
                                    if (node.defaultTarget) {
                                        const defaultId = parseInt(node.defaultTarget, 10);
                                        if (!isNaN(defaultId) && findNode(defaultId)) {
                                            loadNode(defaultId);
                                        } else {
                                            console.warn('[Player] 默认目标无效，停留当前节点');
                                        }
                                    } else {
                                        console.warn('[Player] 脚本未返回有效目标且无默认目标，停留当前节点');
                                    }
                                }
                            };

                            backBtn.addEventListener('click', () => {
                                if (history.length > 0) {
                                    const prev = history.pop();
                                    canGoBack = history.length > 0;
                                    backBtn.style.display = canGoBack ? 'inline-block' : 'none';
                                    loadNode(prev, true);
                                }
                            });

                            // 启动
                            loadNode(project.startNode, true);
                        })();
                    </script>
                </body>
                </html>`;

            // 9. 创建并下载 HTML 文件
            const blob = new Blob([htmlTemplate], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectData.name.replace(/[^a-z0-9]/gi, '_')}.html`;
            a.click();
            URL.revokeObjectURL(url);

            Notify.success(`Galgame 已打包为独立 HTML 文件`);

        },

        _exportGalgameProject: async function (projectName, nodes) {

            const zip = new JSZip();

            // 收集所有引用的章节
            const chapters = Storage.loadChapters();
            const usedChapterNums = new Set(nodes.map(n => n.chapterNum).filter(n => n));
            const usedChapters = chapters.filter(ch => usedChapterNums.has(ch.num));
            const chapterBackup = {
                version: CONFIG.VERSION,
                exportTime: new Date().toISOString(),
                totalChapters: usedChapters.length,
                data: { chapters: usedChapters }
            };
            zip.file('chapters.json', JSON.stringify(chapterBackup, null, 2));

            // 收集资源ID
            const imageIds = new Set();
            const audioIds = new Set();
            const otherFileIds = new Set();   // 原 otherFileIds

            usedChapters.forEach(ch => {
                extractImageIds(ch.content).forEach(id => imageIds.add(id));
                extractAudioIds(ch.content).forEach(id => audioIds.add(id));
                extractOtherFileIds(ch.content).forEach(id => otherFileIds.add(id));   // 使用新函数
            });

            // 添加图片
            if (imageIds.size > 0) {
                const imageFolder = zip.folder('images');
                for (const id of imageIds) {
                    const blob = await ImageStore.get(id);
                    if (blob) {
                        let ext = blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('png') ? 'png' : 'bin';
                        imageFolder.file(`${id}.${ext}`, blob, { binary: true });
                    }
                }
            }

            // 添加音频
            if (audioIds.size > 0) {
                const audioFolder = zip.folder('audios');
                for (const id of audioIds) {
                    const blob = await AudioStore.get(id);
                    if (blob) {
                        let ext = blob.type.includes('mp3') ? 'mp3' : blob.type.includes('wav') ? 'wav' : 'bin';
                        audioFolder.file(`${id}.${ext}`, blob, { binary: true });
                    }
                }
            }

            // 添加文本
            if (otherFileIds.size > 0) {
                const textFolder = zip.folder('texts');
                for (const id of otherFileIds) {
                    const item = await OtherFileStore.get(id);
                    if (item) {
                        const ext = item.format === 'html' ? 'html' : item.format === 'js' ? 'js' : 'txt';
                        textFolder.file(`${id}.${ext}`, item.text);
                    }
                }
            }

            // 添加项目文件，包含 variables
            const projectData = {
                version: '1.0',
                name: projectName,
                nodes: nodes,
                variables: WORKFLOW_STATE.galProject?.variables || {},
                exportTime: new Date().toISOString()
            };
            zip.file('project.json', JSON.stringify(projectData, null, 2));

            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            Notify.success('项目导出成功');

        },

        _updateGalgameCanvas: function (editor) {
            // 当画布节点发生变化（移动、添加、删除）时，将最新节点数据同步到全局项目对象
            if (WORKFLOW_STATE.galProject) {
                WORKFLOW_STATE.galProject.nodes = editor.toJSON();
                // 可选：设置未保存标记，便于提示用户
                // WORKFLOW_STATE.galProject.hasUnsavedChanges = true;
            }

        },

        _showConflictResolutionModal: function (conflictCount) {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'nc-modal-overlay nc-font';
                overlay.style.zIndex = '100200';

                const modal = document.createElement('div');
                modal.className = 'nc-modal';
                modal.style.maxWidth = '500px';

                modal.innerHTML = `
            <div class="nc-modal-header">
                <h2 class="nc-modal-title--primary-c">章节冲突</h2>
            </div>
            <div class="nc-modal-body nc-center--pad20">
                <p>导入的章节中有 ${conflictCount} 个与现有章节号冲突。</p>
                <p>请选择处理方式：</p>
            </div>
            <div class="nc-modal-footer nc-flex--footer-10-center">
                <button id="nc-conflict-replace" class="nc-btn nc-btn-primary">替换</button>
                <button id="nc-conflict-skip" class="nc-btn nc-btn-primary">跳过</button>
                <button id="nc-conflict-renumber" class="nc-btn nc-btn-primary">重编号</button>
                <button id="nc-conflict-cancel" class="nc-btn nc-btn-ghost">取消</button>
            </div>
        `;

                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                this._openModal(overlay);

                const replaceBtn = modal.querySelector('#nc-conflict-replace');
                const skipBtn = modal.querySelector('#nc-conflict-skip');
                const renumberBtn = modal.querySelector('#nc-conflict-renumber');
                const cancelBtn = modal.querySelector('#nc-conflict-cancel');

                const close = (result) => {
                    this._closeModal(overlay);
                    resolve(result);
                };

                replaceBtn.addEventListener('click', () => close('replace'));
                skipBtn.addEventListener('click', () => close('skip'));
                renumberBtn.addEventListener('click', () => close('renumber'));
                cancelBtn.addEventListener('click', () => close('cancel'));

                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) close('cancel');
                });
            });
        },

        _importGalgameProject: async function (file, editor, overlay) {

            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);

            // 1. 恢复资源
            const imageFolder = zip.folder('images');
            if (imageFolder) {
                const imageFiles = Object.keys(imageFolder.files).filter(name => name.startsWith('images/') && !name.endsWith('/'));
                for (const fileName of imageFiles) {
                    const blob = await zip.file(fileName).async('blob');
                    const id = fileName.replace('images/', '').replace(/\.[^/.]+$/, '');
                    const existing = await ImageStore.get(id).catch(() => null);
                    if (existing) {
                        const action = await this._showResourceConflictModal(id, '图片');
                        if (action === 'cancel') {
                            Notify.info('导入已取消');
                            return;
                        } else if (action === 'skip') {
                            continue;
                        }
                    }
                    await ImageStore.save(blob, null, id);
                }
            }

            const audioFolder = zip.folder('audios');
            if (audioFolder) {
                const audioFiles = Object.keys(audioFolder.files).filter(name => name.startsWith('audios/') && !name.endsWith('/'));
                for (const fileName of audioFiles) {
                    const blob = await zip.file(fileName).async('blob');
                    const id = fileName.replace('audios/', '').replace(/\.[^/.]+$/, '');
                    const existing = await AudioStore.get(id).catch(() => null);
                    if (existing) {
                        const action = await this._showResourceConflictModal(id, '音频');
                        if (action === 'cancel') {
                            Notify.info('导入已取消');
                            return;
                        } else if (action === 'skip') {
                            continue;
                        }
                    }
                    await AudioStore.save(blob, null, id);
                }
            }

            const textFolder = zip.folder('texts');
            if (textFolder) {
                const textFiles = Object.keys(textFolder.files).filter(name => name.startsWith('others/') && !name.endsWith('/'));
                for (const fileName of textFiles) {
                    const content = await zip.file(fileName).async('string');
                    const id = fileName.replace('others/', '').replace(/\.[^/.]+$/, '');
                    const ext = fileName.split('.').pop();
                    const format = ext === 'html' ? 'html' : ext === 'js' ? 'js' : 'txt';
                    const existing = await OtherFileStore.get(id).catch(() => null);
                    if (existing) {
                        const action = await this._showResourceConflictModal(id, '其余文件');
                        if (action === 'cancel') {
                            Notify.info('导入已取消');
                            return;
                        } else if (action === 'skip') {
                            continue;
                        }
                    }
                    await OtherFileStore.save(content, format, id);
                }
            }

            // 2. 恢复章节
            const chaptersFile = zip.file('chapters.json');
            if (chaptersFile) {
                const chaptersJson = await chaptersFile.async('string');
                const chaptersData = JSON.parse(chaptersJson);
                if (chaptersData.data && Array.isArray(chaptersData.data.chapters)) {
                    const existing = Storage.loadChapters();
                    const imported = chaptersData.data.chapters;
                    const existingNums = new Set(existing.map(c => c.num));
                    const conflicting = imported.filter(c => existingNums.has(c.num));

                    if (conflicting.length > 0) {
                        const action = await this._showConflictResolutionModal(conflicting.length);
                        if (action === 'cancel') {
                            Notify.info('导入已取消');
                            return;
                        }
                        let merged;
                        if (action === 'replace') {
                            merged = existing.filter(c => !conflicting.some(ic => ic.num === c.num));
                            merged.push(...imported);
                        } else if (action === 'skip') {
                            merged = existing.concat(imported.filter(c => !existingNums.has(c.num)));
                        } else if (action === 'renumber') {
                            let maxNum = existing.length > 0 ? Math.max(...existing.map(c => c.num)) : 0;
                            const renumbered = imported.map(c => {
                                if (existingNums.has(c.num)) {
                                    maxNum++;
                                    return { ...c, num: maxNum };
                                }
                                return c;
                            });
                            merged = existing.concat(renumbered);
                        }
                        merged.sort((a, b) => a.num - b.num);
                        Storage.save({ chapters: merged });
                    } else {
                        const merged = existing.concat(imported);
                        merged.sort((a, b) => a.num - b.num);
                        Storage.save({ chapters: merged });
                    }
                }
            }

            // 3. 读取项目文件
            const projectFile = zip.file('project.json');
            if (!projectFile) {
                Notify.error('ZIP 中缺少 project.json');
                return;
            }
            const projectJson = await projectFile.async('string');
            const projectData = JSON.parse(projectJson);
            const version = projectData.version || '1.0';
            if (version !== '1.0') {
                Notify.warning(`导入的项目版本为 ${version}，当前系统支持版本 1.0，可能存在兼容性问题。`);
            }
            const nodes = projectData.nodes || [];
            const variables = projectData.variables || {};

            // 验证每个节点的章节号是否存在
            const chapters = Storage.loadChapters();
            const missing = nodes.filter(n => !chapters.some(c => c.num === n.chapterNum));
            if (missing.length > 0) {
                console.warn('[GalgameEditor] 导入的节点引用了不存在的章节:', missing.map(n => n.id));
                Notify.warning(`${missing.length} 个节点引用的章节不存在，可能无法播放`);
            }

            editor.loadFromJSON(nodes);
            WORKFLOW_STATE.galProject = {
                name: projectData.name,
                nodes: nodes,
                variables: variables,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            WORKFLOW_STATE.galProjectId = null; // 未保存到 IndexedDB

            // 重新渲染属性面板
            const selectedNode = editor.selectedNode;
            if (selectedNode) {
                UI._renderGalgameProperties(selectedNode, overlay.querySelector('#nc-gal-properties'), editor);
            } else {
                overlay.querySelector('#nc-gal-properties').innerHTML = '<div class="nc-color--muted">未选中节点</div>';
            }

            Notify.success('项目导入成功');

        },

        showErrorSummary: function () {
            let content = '# 错误汇总\n\n';
            const errors = WORKFLOW_STATE.lastAgentError || {};
            if (Object.keys(errors).length === 0) {
                content += '暂无错误记录。';
            } else {
                for (const [key, error] of Object.entries(errors)) {
                    const name = getAgentDisplayName(key);
                    content += `## ${name} (${key})\n`;
                    content += `- **时间**：${new Date(error.timestamp).toLocaleString()}\n`;
                    content += `- **错误**：${error.message}\n`;
                    if (error.apiConfig) {
                        content += `- **API**：${error.apiConfig.source} / ${error.apiConfig.model}\n`;
                    }
                    if (error.prompt) {
                        content += `- **提示词预览**：\n\`\`\`\n${error.prompt}\n\`\`\`\n`;
                    }
                    content += '\n';
                }
            }
            UI.showMarkdownModal('错误详情', content, {
                maxWidth: '700px',
                fontFamily: 'Consolas,monospace',
                lineHeight: '1.6',
                accentColor: '#dc3545'
            });
        },

        // 在 UI 对象内部，与其他方法并列（例如放在 showErrorSummary 之后）
        showConfirmModal: function (message, title = '确认', options = {}) {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'nc-modal-overlay nc-font';
                overlay.style.zIndex = '100200';

                const modal = document.createElement('div');
                modal.className = 'nc-modal';
                modal.style.maxWidth = '400px';
                modal.style.width = '100%';

                modal.innerHTML = `
            <div class="nc-modal-header">
                <h2 class="nc-modal-title--primary-c">${escapeHtml(title)}</h2>
            </div>
            <div class="nc-modal-body nc-center--confirm">
                ${message.replace(/\n/g, '<br>')}
            </div>
            <div class="nc-modal-footer nc-flex--footer-10-center">
                <button class="nc-modal-copy-btn nc-btn--grad-purple" id="nc-confirm-ok">确认</button>
                <button class="nc-modal-close-btn" id="nc-confirm-cancel">取消</button>
            </div>
        `;

                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                this._openModal(overlay);

                const okBtn = modal.querySelector('#nc-confirm-ok');
                const cancelBtn = modal.querySelector('#nc-confirm-cancel');

                const close = (result) => {
                    this._closeModal(overlay);
                    resolve(result);
                };

                okBtn.addEventListener('click', () => close(true));
                cancelBtn.addEventListener('click', () => close(false));
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) close(false);
                });
            });
        },

        showPromptModal: function (message, defaultValue = '', title = '输入', options = {}) {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'nc-modal-overlay nc-font';
                overlay.style.zIndex = '100200';

                const modal = document.createElement('div');
                modal.className = 'nc-modal';
                modal.style.maxWidth = '400px';
                modal.style.width = '100%';

                modal.innerHTML = `
            <div class="nc-modal-header">
                <h2 class="nc-modal-title--primary-c">${escapeHtml(title)}</h2>
            </div>
            <div class="nc-modal-body nc-body--pad20">
                <div class="nc-mb15--confirm-msg">${message.replace(/\n/g, '<br>')}</div>
                <input type="text" id="nc-prompt-input" value="${escapeHtml(defaultValue)}" class="nc-modal-input--base">
            </div>
            <div class="nc-modal-footer nc-flex--footer-10-center">
                <button class="nc-modal-copy-btn nc-btn--grad-purple" id="nc-prompt-ok">确认</button>
                <button class="nc-modal-close-btn" id="nc-prompt-cancel">取消</button>
            </div>
        `;

                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                this._openModal(overlay);

                const input = modal.querySelector('#nc-prompt-input');
                const okBtn = modal.querySelector('#nc-prompt-ok');
                const cancelBtn = modal.querySelector('#nc-prompt-cancel');

                const close = (result) => {
                    this._closeModal(overlay);
                    resolve(result);
                };

                okBtn.addEventListener('click', () => close(input.value));
                cancelBtn.addEventListener('click', () => close(null));
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) close(null);
                });

                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        okBtn.click();
                    }
                });
                input.focus();
            });
        },

        _renderMarkdown: function (text) {


            if (!text) {

                return '';
            }

            // 去除可能的最外层 ```html 或 ```markdown 代码块标记
            const trimmed = text.trim();
            const codeBlockRegex = /^\s*```(?:html|markdown)?\s*\n([\s\S]*?)\n\s*```\s*$/;
            const match = trimmed.match(codeBlockRegex);
            if (match) {
                text = match[1];


            } else {

            }

            // ===== 判断是否为 HTML（文档或片段） =====
            const trimmedLower = text.trim().toLowerCase();
            const isHtmlDoc = trimmedLower.startsWith('<!doctype') ||
                trimmedLower.startsWith('<html') ||
                trimmedLower.startsWith('<head') ||
                trimmedLower.startsWith('<body');
            const hasHtmlTags = /<\/?[a-z][\s\S]*?>/i.test(text);
            const treatAsHtml = isHtmlDoc || hasHtmlTags;


            // ===== 处理图片占位符 =====
            const markdownImageRegex = /!\[([^\]]*)\]\(id:([^)]+)\)/g;
            const htmlImageRegex = /<img[^>]*src="id:([^"]+)"[^>]*>/g;

            let processedText = text;
            const imagePromises = [];
            const placeholders = [];
            const idSet = new Set();

            // 新增：图片 URL 缓存，用于在模态框关闭时释放
            if (!UI._imageUrlCache) UI._imageUrlCache = new Map();

            // 替换 Markdown 图片
            processedText = processedText.replace(markdownImageRegex, (match, alt, id) => {

                if (!idSet.has(id)) {
                    idSet.add(id);
                    const placeholder = `<!--IMG_PLACEHOLDER_${id}-->`;
                    placeholders.push({ id, placeholder, alt });

                    imagePromises.push(
                        ImageStore.get(id).then(blob => {

                            if (blob) {
                                // 检查缓存中是否已存在该 id 的 URL
                                let url = UI._imageUrlCache.get(id);
                                if (!url) {
                                    url = URL.createObjectURL(blob);
                                    UI._imageUrlCache.set(id, url);

                                } else {

                                }
                                return {
                                    id,
                                    html: `<img src="${url}" alt="${alt}" class="nc-img--markdown">`
                                };
                            } else {
                                console.warn('[DEBUG][_renderMarkdown] 图片 id=', id, '未找到，使用文本占位符');
                                return { id, html: `![${alt}](图片丢失)` };
                            }
                        }).catch(err => {
                            console.error('[DEBUG][_renderMarkdown] 获取图片 id=', id, '出错:', err);
                            return { id, html: `![${alt}](图片加载错误)` };
                        })
                    );
                    return placeholder;
                } else {

                    return match;
                }
            });

            // 替换 HTML 图片
            processedText = processedText.replace(htmlImageRegex, (match, id) => {

                if (!idSet.has(id)) {
                    idSet.add(id);
                    const placeholder = `<!--HTML_IMG_PLACEHOLDER_${id}-->`;
                    placeholders.push({ id, placeholder, isHtml: true });

                    imagePromises.push(
                        ImageStore.get(id).then(blob => {

                            if (blob) {
                                let url = UI._imageUrlCache.get(id);
                                if (!url) {
                                    url = URL.createObjectURL(blob);
                                    UI._imageUrlCache.set(id, url);

                                } else {

                                }
                                const altMatch = match.match(/alt="([^"]*)"/);
                                const alt = altMatch ? altMatch[1] : '';
                                const classMatch = match.match(/class="([^"]*)"/);
                                const cls = classMatch ? classMatch[1] : '';

                                return {
                                    id,
                                    html: `<img src="${url}" alt="${alt}" class="${cls} nc-img--markdown">`
                                };
                            } else {
                                console.warn('[DEBUG][_renderMarkdown] 图片 id=', id, '未找到，使用文本占位符');
                                return { id, html: `[图片丢失: ${id}]` };
                            }
                        }).catch(err => {
                            console.error('[DEBUG][_renderMarkdown] 获取图片 id=', id, '出错:', err);
                            return { id, html: `[图片加载错误: ${id}]` };
                        })
                    );
                    return placeholder;
                } else {

                    return match;
                }
            });


            let html;
            if (treatAsHtml) {
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(processedText, 'text/html');
                    const styleTags = Array.from(doc.head?.querySelectorAll('style') || []);
                    const styleHTML = styleTags.map(style => style.outerHTML).join('');
                    const bodyHTML = doc.body?.innerHTML || '';
                    html = styleHTML + bodyHTML;


                } catch (e) {
                    console.error('[DEBUG][_renderMarkdown] DOMParser 解析失败，降级返回原始文本:', e);
                    html = processedText;
                }
            } else {
                if (typeof marked !== 'undefined') {
                    try {
                        html = marked.parse(processedText, { gfm: true, breaks: true });


                    } catch (e) {
                        console.error('[DEBUG][_renderMarkdown] marked 解析失败:', e);
                        html = `<pre class="nc-code-block--error">${escapeHtml(text)}</pre>`;
                    }
                } else {
                    console.warn('[DEBUG][_renderMarkdown] marked 未定义，使用降级显示');
                    html = `<pre class="nc-code-block">${escapeHtml(text)}</pre>`;
                }
            }

            if (imagePromises.length > 0) {

                Promise.all(imagePromises).then(results => {
                    const replaceMap = {};
                    results.forEach(r => {
                        replaceMap[`<!--IMG_PLACEHOLDER_${r.id}-->`] = r.html;
                        replaceMap[`<!--HTML_IMG_PLACEHOLDER_${r.id}-->`] = r.html;

                    });

                    const attemptReplace = (retryCount = 0) => {

                        const containers = document.querySelectorAll('.markdown-body');


                        let replacedAny = false;
                        containers.forEach((container, idx) => {
                            let innerHTML = container.innerHTML;
                            let changed = false;
                            for (const [placeholder, imgHtml] of Object.entries(replaceMap)) {
                                if (innerHTML.includes(placeholder)) {
                                    innerHTML = innerHTML.split(placeholder).join(imgHtml);
                                    changed = true;
                                    replacedAny = true;

                                }
                            }
                            if (changed) {
                                container.innerHTML = innerHTML;

                            }
                        });

                        if (!replacedAny) {
                            console.warn(`[DEBUG][_renderMarkdown] 第 ${retryCount} 次尝试未找到任何占位符`);
                            if (retryCount < 5) {
                                setTimeout(() => attemptReplace(retryCount + 1), 200);
                            } else {
                                console.error('[DEBUG][_renderMarkdown] 重试5次后仍无法替换图片占位符，请检查 DOM 结构');
                            }
                        } else {

                        }
                    };

                    attemptReplace();
                }).catch(err => {
                    console.error('[DEBUG][_renderMarkdown] Promise.all 执行失败:', err);
                });
            } else {

            }

            return html;
        },

        /**
         * 显示主审核模态框
         * @param {string} agentKey - Agent键
         * @param {string} originalContent - Agent生成的原始输出
         * @returns {Promise<{action: 'continue'|'reject', content?: string, suggestion?: string, attachType?: 'original'|'modified'}>}
         */
        showReviewModal: function (agentKey, originalContent) {

            const agent = CONFIG.AGENTS[agentKey];
            const agentName = getAgentDisplayName(agentKey);
            const isHtml = this._detectHTML(originalContent);


            return new Promise((resolve, reject) => {


                // 创建遮罩层
                const overlay = document.createElement('div');
                overlay.className = 'nc-modal-overlay nc-font';
                overlay.style.zIndex = '100100';
                // 禁止点击遮罩关闭
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {

                        e.stopPropagation();
                    }
                });

                const modal = document.createElement('div');
                modal.className = 'nc-modal';
                modal.style.maxWidth = '900px';
                modal.style.width = '100%';
                modal.style.height = '80vh';
                modal.style.display = 'flex';
                modal.style.flexDirection = 'column';

                // 标题
                const header = document.createElement('div');
                header.className = 'nc-modal-header';
                header.innerHTML = `<h2 class="nc-modal-title--primary-c">审核: ${escapeHtml(agentName)}</h2>`;
                modal.appendChild(header);

                // 内容区（flex:1）
                const contentDiv = document.createElement('div');
                contentDiv.style.flex = '1';
                contentDiv.style.display = 'flex';
                contentDiv.style.flexDirection = 'column';
                contentDiv.style.overflow = 'hidden';

                let textarea, previewContainer, sourceContainer;
                let currentContent = originalContent; // 用于保存按钮暂存

                if (isHtml) {

                    // 视图切换按钮
                    const viewBar = document.createElement('div');
                    viewBar.style.display = 'flex';
                    viewBar.style.gap = '10px';
                    viewBar.style.padding = '10px';
                    viewBar.style.borderBottom = '1px solid #333';

                    const sourceBtn = this._createButton('📄 源码', 'nc-btn-xs');
                    const previewBtn = this._createButton('🌐 预览', 'nc-btn-xs');
                    sourceBtn.style.background = '#667eea';
                    previewBtn.style.background = '#4a4a6a';

                    viewBar.appendChild(sourceBtn);
                    viewBar.appendChild(previewBtn);
                    contentDiv.appendChild(viewBar);

                    // 源码容器
                    sourceContainer = document.createElement('div');
                    sourceContainer.style.flex = '1';
                    sourceContainer.style.overflow = 'auto';
                    sourceContainer.style.padding = '10px';
                    sourceContainer.style.display = 'block';

                    textarea = document.createElement('textarea');
                    textarea.style.width = '100%';
                    textarea.style.height = '100%';
                    textarea.style.background = 'var(--nc-color-dark-bg)';
                    textarea.style.color = '#eaeaea';
                    textarea.style.border = '1px solid #667eea';
                    textarea.style.fontFamily = 'monospace';
                    textarea.style.fontSize = '12px';
                    textarea.style.padding = '8px';
                    textarea.value = originalContent;
                    sourceContainer.appendChild(textarea);

                    // 预览容器
                    previewContainer = document.createElement('div');
                    previewContainer.style.flex = '1';
                    previewContainer.style.overflow = 'auto';
                    previewContainer.style.padding = '10px';
                    previewContainer.style.display = 'none';
                    previewContainer.className = 'markdown-body';

                    contentDiv.appendChild(sourceContainer);
                    contentDiv.appendChild(previewContainer);

                    // 渲染预览函数
                    const renderPreview = async () => {

                        const raw = textarea.value;
                        const processed = await this._replaceImagePlaceholders(raw);
                        previewContainer.innerHTML = processed;
                        // 执行脚本
                        previewContainer.querySelectorAll('script').forEach(oldScript => {
                            const newScript = document.createElement('script');
                            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                            newScript.textContent = oldScript.textContent;
                            oldScript.parentNode.replaceChild(newScript, oldScript);
                        });

                    };

                    // 视图切换
                    sourceBtn.addEventListener('click', () => {

                        sourceContainer.style.display = 'block';
                        previewContainer.style.display = 'none';
                        sourceBtn.style.background = '#667eea';
                        previewBtn.style.background = '#4a4a6a';
                    });
                    previewBtn.addEventListener('click', async () => {

                        sourceContainer.style.display = 'none';
                        previewContainer.style.display = 'block';
                        sourceBtn.style.background = '#4a4a6a';
                        previewBtn.style.background = '#667eea';
                        await renderPreview();
                    });
                } else {

                    // 纯文本：直接一个大的 textarea
                    textarea = document.createElement('textarea');
                    textarea.style.width = '100%';
                    textarea.style.height = '100%';
                    textarea.style.background = 'var(--nc-color-dark-bg)';
                    textarea.style.color = '#eaeaea';
                    textarea.style.border = '1px solid #667eea';
                    textarea.style.fontFamily = 'monospace';
                    textarea.style.fontSize = '12px';
                    textarea.style.padding = '8px';
                    textarea.value = originalContent;
                    contentDiv.appendChild(textarea);
                }

                modal.appendChild(contentDiv);

                // 底部按钮 - 使用统一样式
                const footer = document.createElement('div');
                footer.className = 'nc-modal-footer';
                footer.style.justifyContent = 'center';
                footer.style.gap = '10px';
                footer.style.padding = '15px 20px';   // 增加内边距，使按钮不贴边

                // 创建保存按钮 (使用保存样式，但功能是暂存)
                const saveBtn = document.createElement('button');
                saveBtn.className = 'nc-modal-copy-btn';
                saveBtn.textContent = '💾 保存';
                saveBtn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
                saveBtn.style.color = 'white';
                saveBtn.style.border = 'none';

                // 创建继续按钮
                const continueBtn = document.createElement('button');
                continueBtn.className = 'nc-modal-copy-btn';
                continueBtn.textContent = '▶️ 继续';
                continueBtn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
                continueBtn.style.color = 'white';
                continueBtn.style.border = 'none';

                // 创建打回按钮 (使用危险样式)
                const rejectBtn = document.createElement('button');
                rejectBtn.className = 'nc-modal-close-btn';
                rejectBtn.textContent = '↩️ 打回';
                rejectBtn.style.background = 'linear-gradient(135deg, #dc3545, #c82333)';
                rejectBtn.style.color = 'white';
                rejectBtn.style.border = 'none';

                footer.appendChild(saveBtn);
                footer.appendChild(rejectBtn);
                footer.appendChild(continueBtn);
                modal.appendChild(footer);

                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                ModalStack.push(overlay);


                // 内部状态：打回建议暂存
                let rejectState = {
                    suggestion: '',
                    attachType: 'original' // 'original' 或 'modified'
                };

                // 保存按钮：仅更新内部暂存，不关闭
                saveBtn.addEventListener('click', () => {

                    currentContent = textarea.value;
                    Notify.success('修改已保存，可继续编辑或预览');
                    if (previewContainer && previewContainer.style.display === 'block') {
                        renderPreview(); // 刷新预览
                    }
                });

                // 继续按钮
                continueBtn.addEventListener('click', () => {

                    const finalContent = textarea.value;
                    ModalStack.remove(overlay);
                    overlay.remove();

                    resolve({ action: 'continue', content: finalContent });
                });

                // 打回按钮：打开次级框
                rejectBtn.addEventListener('click', async () => {

                    try {
                        const rejectResult = await UI.showRejectModal(rejectState);

                        if (rejectResult) {
                            // 更新 rejectState（保留输入）
                            rejectState = rejectResult.state;
                            ModalStack.remove(overlay);
                            overlay.remove();
                            console.log('[UI.showReviewModal] 打回，resolve 结果:', {
                                action: 'reject',
                                suggestion: rejectResult.suggestion,
                                attachType: rejectResult.attachType
                            });
                            resolve({
                                action: 'reject',
                                suggestion: rejectResult.suggestion,
                                attachType: rejectResult.attachType
                            });
                        } else {
                            // 用户取消，不做任何事

                        }
                    } catch (err) {
                        console.error('[UI.showReviewModal] 次级框异常:', err);
                        Notify.error('打回操作异常');
                    }
                });

                // 中断监听
                const interruptInterval = setInterval(() => {
                    if (WORKFLOW_STATE.shouldStop) {

                        clearInterval(interruptInterval);
                        ModalStack.remove(overlay);
                        overlay.remove();
                        reject(new UserInterruptError());
                    }
                }, 200);

            });
        },

        /**
         * 显示打回建议模态框
         * @param {Object} initialState - 初始状态 { suggestion, attachType }
         * @returns {Promise<{suggestion: string, attachType: 'original'|'modified', state: Object} | null>} null表示取消
         */
        showRejectModal: function (initialState) {

            return new Promise((resolve) => {

                const overlay = document.createElement('div');
                overlay.className = 'nc-modal-overlay nc-font';
                overlay.style.zIndex = '100200';
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {

                        e.stopPropagation();
                    }
                });

                const modal = document.createElement('div');
                modal.className = 'nc-modal';
                modal.style.maxWidth = '500px';
                modal.style.width = '100%';

                modal.innerHTML = `
            <div class="nc-modal-header">
                <h2 class="nc-modal-title--primary-c">打回原因与建议</h2>
            </div>
            <div class="nc-modal-body nc-body--pad20">
                <div class="nc-mb15">
                    <label class="nc-field-label--base-c">修改建议</label>
                    <textarea id="nc-reject-suggestion" class="nc-modal-textarea--base">${escapeHtml(initialState.suggestion)}</textarea>
                </div>
                <div class="nc-mb15">
                    <label class="nc-field-label--base-c">附加内容</label>
                    <div class="nc-flex--row-15-middle-c">
                        <label><input type="radio" name="attachType" value="original" ${initialState.attachType === 'original' ? 'checked' : ''}> 附加原始输出</label>
                        <label><input type="radio" name="attachType" value="modified" ${initialState.attachType === 'modified' ? 'checked' : ''}> 附加修改后输出</label>
                    </div>
                </div>
            </div>
            <div class="nc-modal-footer nc-flex--footer-10-center-c">
                <button id="nc-reject-confirm" class="nc-modal-copy-btn nc-btn--grad-purple">确认打回</button>
                <button id="nc-reject-cancel" class="nc-modal-close-btn">取消</button>
            </div>
        `;

                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                ModalStack.push(overlay);


                const suggestionInput = modal.querySelector('#nc-reject-suggestion');
                const originalRadio = modal.querySelector('input[value="original"]');
                const modifiedRadio = modal.querySelector('input[value="modified"]');
                const confirmBtn = modal.querySelector('#nc-reject-confirm');
                const cancelBtn = modal.querySelector('#nc-reject-cancel');

                // 实时更新状态
                const getCurrentState = () => ({
                    suggestion: suggestionInput.value,
                    attachType: originalRadio.checked ? 'original' : 'modified'
                });

                confirmBtn.addEventListener('click', () => {

                    const state = getCurrentState();
                    ModalStack.remove(overlay);
                    overlay.remove();
                    console.log('[UI.showRejectModal] 打回结果:', {
                        suggestion: state.suggestion,
                        attachType: state.attachType,
                        state: state
                    });
                    resolve({
                        suggestion: state.suggestion,
                        attachType: state.attachType,
                        state: state
                    });
                });

                cancelBtn.addEventListener('click', () => {

                    const state = getCurrentState();
                    ModalStack.remove(overlay);
                    overlay.remove();

                    resolve(null);
                });

                // 中断监听
                const interruptInterval = setInterval(() => {
                    if (WORKFLOW_STATE.shouldStop) {

                        clearInterval(interruptInterval);
                        ModalStack.remove(overlay);
                        overlay.remove();
                        resolve(null);
                    }
                }, 200);

            });
        },

        /**
         * 显示独立预览模态框
         * @param {string} content - 要预览的HTML内容
         * @param {string} title - 预览标题
         */
        showPreviewModal: async function (content, title = '预览') {

            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100300';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {

                    this._closeModal(overlay);
                }
            });

            const modal = document.createElement('div');
            modal.className = 'nc-modal';
            modal.style.maxWidth = '800px';
            modal.style.width = '100%';
            modal.style.height = '80vh';
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';

            const header = document.createElement('div');
            header.className = 'nc-modal-header';
            header.innerHTML = `<h2 class="nc-modal-title--primary-c">${escapeHtml(title)}</h2>`;
            modal.appendChild(header);

            const body = document.createElement('div');
            body.className = 'nc-modal-body markdown-body';
            body.style.flex = '1';
            body.style.overflow = 'auto';
            body.style.padding = '12px';
            body.innerHTML = '加载预览中...';
            modal.appendChild(body);

            const footer = document.createElement('div');
            footer.className = 'nc-modal-footer';
            const closeBtn = this._createButton('关闭', 'nc-modal-close-btn');
            closeBtn.addEventListener('click', () => this._closeModal(overlay));
            footer.appendChild(closeBtn);
            modal.appendChild(footer);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            this._openModal(overlay);

            // 异步渲染内容
            try {
                const processed = await this._replaceImagePlaceholders(content);
                body.innerHTML = processed;
                // 执行脚本
                body.querySelectorAll('script').forEach(oldScript => {
                    const newScript = document.createElement('script');
                    Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                    newScript.textContent = oldScript.textContent;
                    oldScript.parentNode.replaceChild(newScript, oldScript);
                });

            } catch (err) {
                console.error('[UI.showPreviewModal] 预览渲染失败', err);
                body.innerHTML = `<div class="nc-color--error">预览失败: ${err.message}</div>`;
            }
        },

        /**
         * 创建统一风格的按钮（简化）
         */
        _createButton: function (text, className = 'nc-btn') {
            const btn = document.createElement('button');
            btn.className = className;
            btn.textContent = text;
            return btn;
        },

        openConfigGUI: async function () {


            const existing = document.querySelector('#nc-config-gui-overlay');
            if (existing) {
                UI._closeModal(existing);
                return;
            }

            // 动态添加样式（仅在当前编辑器有效）
            const styleId = 'nc-config-gui-styles';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
            .nc-config-editor * {
                box-sizing: border-box;
            }
            .nc-config-editor .resource-panel {
                width: 240px;
                background: #1e1e2f;
                border-right: 1px solid #2d2d44;
                overflow-y: auto;
                padding: 16px 12px;
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            .nc-config-editor .resource-section {
                background: rgba(0,0,0,0.15);
                border-radius: 10px;
                padding: 12px;
                border: 1px solid #2d2d44;
            }
            .nc-config-editor .resource-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                color: #a0a0c0;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .nc-config-editor .resource-header button {
                background: #2a2a3a;
                border: none;
                color: #a0a0c0;
                font-size: 16px;
                width: 24px;
                height: 24px;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .nc-config-editor .resource-header button:hover {
                background: #3a3a4a;
                color: #667eea;
            }
            .nc-config-editor .resource-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .nc-config-editor .resource-item {
                background: #2a2a3a;
                border-radius: 8px;
                padding: 8px 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                transition: background 0.2s, border-color 0.2s;
                border: 1px solid transparent;
                font-size: 12px;
                color: #ccc;
            }
            .nc-config-editor .resource-item:hover {
                background: #323246;
                border-color: #667eea;
            }
            .nc-config-editor .resource-item.selected {
                background: #2d2d4a;
                border-color: #667eea;
            }
            .nc-config-editor .resource-item .delete-icon {
                color: #ff6b6b;
                font-size: 14px;
                visibility: hidden;
                transition: visibility 0.2s;
            }
            .nc-config-editor .resource-item:hover .delete-icon {
                visibility: visible;
            }
            .nc-config-editor .property-panel {
                width: 380px;
                background: #1e1e2f;
                border-left: 1px solid #2d2d44;
                overflow-y: auto;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .nc-config-editor .property-section {
                background: rgba(0,0,0,0.2);
                border-radius: 12px;
                padding: 16px;
                border: 1px solid #2d2d44;
            }
            .nc-config-editor .property-title {
                color: #667eea;
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 16px;
                border-bottom: 1px solid #2d2d44;
                padding-bottom: 8px;
            }
            .nc-config-editor .field-group {
                margin-bottom: 16px;
            }
            .nc-config-editor .field-label {
                display: block;
                color: #aaa;
                font-size: 12px;
                margin-bottom: 4px;
            }
            .nc-config-editor .field-input,
            .nc-config-editor .field-select,
            .nc-config-editor .field-textarea {
                width: 100%;
                background: #0f172a;
                color: #eaeaea;
                border: 1px solid #3a3a5a;
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 13px;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .nc-config-editor .field-input:focus,
            .nc-config-editor .field-select:focus,
            .nc-config-editor .field-textarea:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102,126,234,0.2);
            }
            .nc-config-editor .field-textarea {
                font-family: monospace;
                line-height: 1.5;
            }
            .nc-config-editor .checkbox-group {
                display: flex;
                gap: 20px;
                flex-wrap: wrap;
            }
            .nc-config-editor .checkbox-label {
                display: flex;
                align-items: center;
                gap: 6px;
                color: #ccc;
                font-size: 13px;
                cursor: pointer;
            }
            .nc-config-editor .checkbox-label input[type="checkbox"] {
                accent-color: #667eea;
                width: 16px;
                height: 16px;
            }
            .nc-config-editor .input-sources {
                margin-top: 10px;
                background: #0f172a;
                border-radius: 8px;
                padding: 12px;
            }
            .nc-config-editor .source-header {
                display: grid;
                grid-template-columns: 1fr 90px 70px 1fr 30px;
                gap: 8px;
                margin-bottom: 8px;
                padding: 0 4px;
                color: #888;
                font-size: 11px;
                font-weight: 500;
                text-transform: uppercase;
            }
            .nc-config-editor .source-row {
                display: grid;
                grid-template-columns: 1fr 90px 70px 1fr 30px;
                gap: 8px;
                margin-bottom: 8px;
                align-items: center;
            }
            .nc-config-editor .source-row input,
            .nc-config-editor .source-row select,
            .nc-config-editor .source-src,
            .nc-config-editor .source-auto,
            .nc-config-editor .source-prompt,
            .nc-config-editor .source-mode {
                background: #1e1e2f;
                border: 1px solid #3a3a5a;
                border-radius: 6px;
                padding: 6px 8px;
                color: #eaeaea;
                font-size: 11px;
                width: 100%;
                box-sizing: border-box;
            }
            .nc-config-editor .source-src:focus,
            .nc-config-editor .source-auto:focus,
            .nc-config-editor .source-prompt:focus,
            .nc-config-editor .source-mode:focus {
                border-color: #667eea;
                outline: none;
                box-shadow: 0 0 0 2px rgba(102,126,234,0.2);
            }
            .nc-config-editor .source-auto { width: 70px; }
            .nc-config-editor .source-mode { width: 90px; }
            .nc-config-editor .source-row input:focus,
            .nc-config-editor .source-row select:focus {
                border-color: #667eea;
                outline: none;
            }
            .nc-config-editor .delete-source {
                background: #dc3545;
                border: none;
                color: white;
                border-radius: 6px;
                width: 24px;
                height: 24px;
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            }
            .nc-config-editor .delete-source:hover {
                background: #ff6b6b;
            }
            .nc-config-editor .btn-add {
                background: linear-gradient(135deg, #10b981, #059669);
                border: none;
                color: white;
                border-radius: 20px;
                padding: 6px 16px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: filter 0.2s, transform 0.1s;
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            .nc-config-editor .btn-add:hover {
                filter: brightness(1.1);
                transform: translateY(-1px);
            }
            .nc-config-editor .btn-add:active {
                transform: translateY(0);
            }
            .nc-config-editor .toolbar-btn {
                background: #2a2a3a;
                border: 1px solid #3a3a5a;
                color: #eaeaea;
                border-radius: 20px;
                padding: 6px 14px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            .nc-config-editor .toolbar-btn:hover {
                background: #3a3a4a;
                border-color: #667eea;
            }
        `;
                document.head.appendChild(style);
            }

            const overlay = document.createElement('div');
            overlay.id = 'nc-config-gui-overlay';
            overlay.className = 'nc-overlay nc-font nc-config-editor';
            overlay.style.zIndex = '100080';

            const modal = document.createElement('div');
            modal.className = 'nc-modal';
            modal.style.maxWidth = '1400px';
            modal.style.width = '95vw';
            modal.style.height = '85vh';
            modal.style.padding = '0';
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';
            modal.style.background = 'var(--nc-color-panel)';
            modal.style.borderRadius = '16px';
            modal.style.overflow = 'hidden';

            // 标题栏
            const header = document.createElement('div');
            header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px;
        border-bottom: 2px solid #667eea;
        background: rgba(0,0,0,0.25);
        flex-shrink: 0;
    `;
            header.innerHTML = `
        <span class="nc-toolbar-title">⚙️ 配置文件可视化编辑器</span>
        <div class="nc-flex--row-8-sp">
            <button id="nc-config-load-current" class="toolbar-btn">📂 加载当前配置</button>
            <button id="nc-config-apply" class="toolbar-btn nc-btn--green-solid">✅ 应用配置</button>
            <button id="nc-config-export" class="toolbar-btn nc-btn--orange-solid">📤 导出JSON</button>
            <button id="nc-config-import" class="toolbar-btn nc-btn--orange-solid">📥 导入JSON</button>
            <button id="nc-workshop-open" class="toolbar-btn nc-btn--purple-solid">🏭 Agent工坊</button>
            <button id="nc-config-validate" class="toolbar-btn nc-btn--amber-solid">🔍 检测配置</button>
            <button id="nc-config-close" class="toolbar-btn">❌ 关闭</button>
        </div>
    `;
            modal.appendChild(header);

            // 主内容区
            const main = document.createElement('div');
            main.style.cssText = 'flex:1; display:flex; overflow:hidden; min-height:0;';
            modal.appendChild(main);

            // --- 左侧资源面板（使用新样式类）---
            const resourcePanel = document.createElement('div');
            resourcePanel.className = 'resource-panel';

            // Agent管理区域
            resourcePanel.innerHTML = `
        <div class="resource-section">
            <div class="resource-header">
                <span>🤖 Agent管理</span>
                <button id="nc-add-agent">➕</button>
            </div>
            <div id="nc-agent-list" class="resource-list"></div>
        </div>
        <div class="resource-section">
            <div class="resource-header">
                <span>🔌 API配置</span>
                <button id="nc-add-api">➕</button>
            </div>
            <div id="nc-api-list" class="resource-list"></div>
        </div>
        <div class="resource-section">
            <div class="resource-header">
                <span>🎯 预选分类</span>
                <button id="nc-add-category">➕</button>
            </div>
            <div id="nc-category-list" class="resource-list"></div>
        </div>
        <div class="resource-section">
            <div class="resource-header">
                <span>🔗 互斥组</span>
                <button id="nc-add-group">➕</button>
            </div>
            <div id="nc-group-list" class="resource-list"></div>
        </div>
    `;
            main.appendChild(resourcePanel);

            // 画布容器（保留原有，增加阴影）
            const canvasContainer = document.createElement('div');
            canvasContainer.style.cssText = 'flex:2; background:#0f172a; position:relative; overflow:hidden; box-shadow: inset 0 0 20px rgba(0,0,0,0.5);';
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%;';
            canvasContainer.appendChild(canvas);
            main.appendChild(canvasContainer);

            // 右侧属性面板（使用新样式类）
            const propertyPanel = document.createElement('div');
            propertyPanel.id = 'nc-config-property-panel';
            propertyPanel.className = 'property-panel';
            propertyPanel.innerHTML = '<div class="nc-color--muted-placeholder">选择一个节点、API、分类或组查看属性</div>';
            main.appendChild(propertyPanel);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            UI._openModal(overlay);

            const currentConfig = UI._getCurrentConfigForEditor();
            const editor = new ConfigEditor(canvas, propertyPanel, currentConfig, {
                onConfigChange: (newConfig) => {

                    window.__editorConfig = newConfig;
                    renderResourceLists(editor);
                },
                onSelect: (selected) => {
                    // 属性面板已由编辑器内部更新
                }
            });

            overlay.editor = editor;

            // 渲染左侧资源列表的函数（使用新样式类）
            const renderResourceLists = (editor) => {
                const config = editor.config;
                // Agent 列表
                const agentList = resourcePanel.querySelector('#nc-agent-list');
                agentList.innerHTML = '';
                Object.keys(config.agents || {}).forEach(key => {
                    const div = document.createElement('div');
                    div.className = 'resource-item';
                    div.setAttribute('data-agent', key);
                    div.innerHTML = `
                <span>${key}</span>
                <span class="delete-icon" data-action="delete-agent" data-agent="${key}">✖</span>
            `;
                    div.addEventListener('click', async (e) => {
                        if (e.target.classList.contains('delete-icon')) {
                            e.stopPropagation();
                            const confirmed = await UI.showConfirmModal(`确定删除Agent ${key} 吗？`, '确认删除');
                            if (!confirmed) return;
                            config.workflowStages.forEach(stage => {
                                stage.agents = stage.agents.filter(k => k !== key);
                            });
                            delete config.agents[key];
                            editor.loadConfig(config);
                            renderResourceLists(editor);
                            if (editor.callbacks.onConfigChange) editor.callbacks.onConfigChange(config);
                        } else {
                            editor.selectAgent(key);
                        }
                    });
                    agentList.appendChild(div);
                });

                // API 列表
                const apiList = resourcePanel.querySelector('#nc-api-list');
                apiList.innerHTML = '';
                Object.keys(config.apiConfigs || {}).forEach(id => {
                    const item = document.createElement('div');
                    item.className = 'resource-item';
                    item.setAttribute('data-api-id', id);
                    item.innerHTML = `
                <span>${id}</span>
                <span class="delete-icon" data-action="delete-api" data-api="${id}">✖</span>
            `;
                    item.addEventListener('click', async (e) => {
                        if (e.target.classList.contains('delete-icon')) {
                            e.stopPropagation();
                            const confirmed = await UI.showConfirmModal(`确定删除API配置 ${id} 吗？`);
                            if (!confirmed) return;
                            config.workflowStages.forEach(stage => {
                                stage.agents = stage.agents.filter(k => k !== key);
                            });
                            delete config.agents[key];
                            editor.loadConfig(config);
                            renderResourceLists(editor);
                            if (editor.callbacks.onConfigChange) editor.callbacks.onConfigChange(config);
                        } else {
                            editor.selectApiConfig(id);
                        }
                    });
                    apiList.appendChild(item);
                });

                // 分类列表
                const categoryList = resourcePanel.querySelector('#nc-category-list');
                categoryList.innerHTML = '';
                Object.keys(config.categories || {}).forEach(id => {
                    const cat = config.categories[id];
                    const item = document.createElement('div');
                    item.className = 'resource-item';
                    item.setAttribute('data-category', id);
                    item.innerHTML = `
                <span>${id} (${cat?.name || ''})</span>
                <span class="delete-icon" data-action="delete-category" data-category="${id}">✖</span>
            `;
                    item.addEventListener('click', async (e) => {
                        if (e.target.classList.contains('delete-icon')) {
                            e.stopPropagation();
                            const confirmed = await UI.showConfirmModal(`确定删除分类 ${id} 吗？`);
                            if (!confirmed) return;
                            config.workflowStages.forEach(stage => {
                                stage.agents = stage.agents.filter(k => k !== key);
                            });
                            delete config.agents[key];
                            editor.loadConfig(config);
                            renderResourceLists(editor);
                            if (editor.callbacks.onConfigChange) editor.callbacks.onConfigChange(config);
                        } else {
                            editor.selectCategory(id);
                        }
                    });
                    categoryList.appendChild(item);
                });

                // 互斥组列表
                const groupList = resourcePanel.querySelector('#nc-group-list');
                groupList.innerHTML = '';
                (config.categoryGroups || []).forEach((group, index) => {
                    const groupName = group.name || `组${index + 1}`;
                    const item = document.createElement('div');
                    item.className = 'resource-item';
                    item.setAttribute('data-group-index', index);
                    item.innerHTML = `
                <span>${groupName}</span>
                <span class="delete-icon" data-action="delete-group" data-group-index="${index}">✖</span>
            `;
                    item.addEventListener('click', async (e) => {
                        if (e.target.classList.contains('delete-icon')) {
                            e.stopPropagation();
                            const confirmed = await UI.showConfirmModal(`确定删除互斥组 ${groupName} 吗？`);
                            if (!confirmed) return;
                            config.workflowStages.forEach(stage => {
                                stage.agents = stage.agents.filter(k => k !== key);
                            });
                            delete config.agents[key];
                            editor.loadConfig(config);
                            renderResourceLists(editor);
                            if (editor.callbacks.onConfigChange) editor.callbacks.onConfigChange(config);
                        } else {
                            editor.selectGroup(index);
                        }
                    });
                    groupList.appendChild(item);
                });
            };

            renderResourceLists(editor);

            // 绑定顶部按钮事件（保持不变）
            modal.querySelector('#nc-config-load-current').addEventListener('click', () => {

                const newConfig = UI._getCurrentConfigForEditor();


                editor.loadConfig(newConfig);

                renderResourceLists(editor);

            });

            modal.querySelector('#nc-config-apply').addEventListener('click', async () => {

                const configJSON = editor.getConfig();


                const validation = validateConfig(configJSON);

                if (!validation.valid) {
                    console.error('[ConfigGUI] 验证失败，错误列表:', validation.errors);
                    editor.showValidationErrors(validation.errors);
                    Notify.error('配置校验失败，请查看错误详情');
                    return;
                }

                const success = loadConfigFromJson(configJSON, '编辑器配置', JSON.stringify(configJSON).length);

                if (success) {
                    Notify.success('配置已应用，重新打开面板...');

                    UI.closeAll();
                    await openPanelWithCheck();
                } else {
                    Notify.error('配置加载失败');
                }
            });

            modal.querySelector('#nc-config-export').addEventListener('click', () => {
                const configJSON = editor.getConfig();
                const blob = new Blob([JSON.stringify(configJSON, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'config.json';
                a.click();
                URL.revokeObjectURL(url);
            });

            modal.querySelector('#nc-config-import').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json,application/json';
                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    try {
                        const text = await file.text();
                        const json = JSON.parse(text);
                        editor.loadConfig(json);
                        renderResourceLists(editor);
                    } catch (err) {
                        Notify.error('导入失败: ' + err.message);
                    }
                };
                input.click();
            });

            // Agent 工坊按钮
            modal.querySelector('#nc-workshop-open')?.addEventListener('click', () => {
                // 关闭当前编辑器
                UI.closeAll();
                // 打开 Agent 工坊
                setTimeout(() => {
                    if (window.AgentWorkshop) {
                        const workshop = new AgentWorkshop();
                        workshop.openWorkshop();
                        workshop.onComplete = (result) => {
                            // 导入生成的配置
                            if (result.config && window.configEditor) {
                                configEditor.loadConfig(result.config);
                                Notify.success('配置已导入，请检查并应用');
                            }
                        };
                    } else {
                        Notify.error('Agent 工坊未加载');
                    }
                }, 100);
            });

            modal.querySelector('#nc-config-validate').addEventListener('click', () => {
                const configJSON = editor.getConfig();
                const validation = validateConfig(configJSON);
                if (validation.valid) {
                    editor.showValidationErrors([]); // 清空错误
                    Notify.success('配置校验通过！');
                } else {
                    editor.showValidationErrors(validation.errors);
                    Notify.error('配置存在错误，请查看右侧面板');
                }
            });

            modal.querySelector('#nc-config-close').addEventListener('click', () => {
                UI._closeModal(overlay);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) UI._closeModal(overlay);
            });

            // 资源面板添加按钮
            resourcePanel.querySelector('#nc-add-agent').addEventListener('click', async () => {
                if (!editor.selectedNode || editor.selectedNode.type !== 'stage') {
                    Notify.warning('请先选中一个阶段节点');
                    return;
                }
                const stageNode = editor.selectedNode;
                const stageId = stageNode.stageData.id;
                const agentKey = await UI.showPromptModal('输入新Agent的唯一键', '', '新建Agent');
                if (!agentKey) return;
                if (editor.config.agents[agentKey]) {
                    Notify.error(`Agent键 ${agentKey} 已存在`);
                    return;
                }
                const defaultAgent = {
                    name: '',
                    displayName: agentKey,
                    hover: '',
                    stage: stageId,
                    order: 10,
                    required: false,
                    parallel: false,
                    apiConfigId: '',
                    inputs: [],
                    inputTemplate: '',
                    inputMode: [],
                    autoConfig: [],
                    inputPrompts: [],
                    outputs: [],
                    description: '',
                    reflowConditions: [],
                    executeInterval: 0,
                    role: '',
                    review: false,
                };
                editor.config.agents[agentKey] = defaultAgent;
                const stage = editor.config.workflowStages.find(s => s.id === stageId);
                if (stage) {
                    stage.agents.push(agentKey);
                }
                editor.loadConfig(editor.config);
                renderResourceLists(editor);
                Notify.success(`Agent ${agentKey} 已添加到阶段 ${stageNode.label}`);
            });

            resourcePanel.querySelector('#nc-add-api').addEventListener('click', async () => {
                const apiId = await UI.showPromptModal('输入API配置ID（唯一）', '', '新建API');
                if (!apiId) return;
                if (editor.config.apiConfigs[apiId]) {
                    Notify.error(`API ID ${apiId} 已存在`);
                    return;
                }
                editor.config.apiConfigs[apiId] = {
                    type: 'text',
                    source: 'openai',
                    apiUrl: '',
                    key: '',
                    model: '',
                    timeout: 3600000,
                };
                renderResourceLists(editor);
                editor.selectApiConfig(apiId);
                Notify.success(`API配置 ${apiId} 已创建`);
            });

            resourcePanel.querySelector('#nc-add-category').addEventListener('click', async () => {
                const catId = await UI.showPromptModal('输入分类ID（唯一）', '', '新建分类');
                if (!catId) return;
                if (editor.config.categories[catId]) {
                    Notify.error(`分类ID ${catId} 已存在`);
                    return;
                }
                editor.config.categories[catId] = {
                    name: catId,
                    description: '',
                    selectionMode: 'single',
                    options: {}
                };
                renderResourceLists(editor);
                editor.selectCategory(catId);
                Notify.success(`分类 ${catId} 已创建`);
            });

            resourcePanel.querySelector('#nc-add-group').addEventListener('click', async () => {
                const groupName = await UI.showPromptModal('输入互斥组名称', '', '新建互斥组');
                if (!groupName) return;
                editor.config.categoryGroups = editor.config.categoryGroups || [];
                editor.config.categoryGroups.push({
                    name: groupName,
                    categories: []
                });
                renderResourceLists(editor);
                editor.selectGroup(editor.config.categoryGroups.length - 1);
                Notify.success(`互斥组 ${groupName} 已创建`);
            });

            // 编辑器关闭时移除动态样式
            overlay.addEventListener('remove', () => {
                const styleEl = document.getElementById(styleId);
                if (styleEl) styleEl.remove();
            });
        },


        _getCurrentConfigForEditor: function () {


            const configCopy = {
                version: WORKFLOW_STATE.configVersion || CONFIG.VERSION,
                description: WORKFLOW_STATE.configDescription || '',
                mode: WORKFLOW_STATE.configMode || 'normal',
                maxStateBooks: CONFIG.MAX_STATE_BOOKS,
                stateTypeLimit: CONFIG.STATE_TYPE_LIMIT,
                maxImagesPerBook: CONFIG.MAX_IMAGES_PER_BOOK,
                maxAudiosPerBook: CONFIG.MAX_AUDIOS_PER_BOOK,
                maxConsecutiveReflows: CONFIG.MAX_CONSECUTIVE_REFLOWS,
                maxReflowDepth: CONFIG.MAX_REFLOOP_DEPTH,
                apiConfigs: CONFIG.apiConfigs || {},
                agents: {},
                workflowStages: CONFIG.WORKFLOW_STAGES || [],
                categories: CONFIG.categories || {},
                categoryGroups: CONFIG.categoryGroups || [],
                extensions: {}
            };

            // 复制 agents
            for (const [key, agent] of Object.entries(CONFIG.AGENTS)) {
                configCopy.agents[key] = {
                    name: agent.name,
                    displayName: agent.displayName,
                    hover: agent.hover,
                    stage: agent.stage,
                    order: agent.order,
                    required: agent.required,
                    parallel: agent.parallel,
                    apiConfigId: agent.apiConfigId,
                    inputs: agent.inputs.slice(),
                    inputTemplate: agent.inputTemplate,
                    inputMode: agent.inputMode.slice(),
                    autoConfig: agent.autoConfig.slice(),
                    inputPrompts: agent.inputPrompts.slice(),
                    description: agent.description,
                    reflowConditions: agent.reflowConditions.slice(),
                    executeInterval: agent.executeInterval,
                    role: agent.role,
                    review: agent.review
                };
            }


            return configCopy;
        }
    };

    UI.updateWorkflowAgentStates = (function () {
        let timeout;
        return function () {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {

                const container = document.getElementById('nc-workflow-viz');
                if (container) {
                    container.querySelectorAll('[data-agent]').forEach(btn => {
                        const agentKey = btn.dataset.agent;
                        if (agentKey === 'DISCARD') {
                            if (WORKFLOW_STATE.discardedChapter) {
                                btn.classList.add('has-discard');
                            } else {
                                btn.classList.remove('has-discard');
                            }
                        } else {
                            const newState = AgentStateManager.getState(agentKey);
                            const oldState = btn.dataset.state;
                            if (oldState !== newState) {

                                btn.dataset.state = newState;
                            }
                        }
                    });
                }

                const launchLayer = document.getElementById('nc-launch-layer');
                if (launchLayer) {
                    launchLayer.querySelectorAll('[data-agent]').forEach(btn => {
                        const agentKey = btn.dataset.agent;
                        const newState = AgentStateManager.getState(agentKey);
                        btn.dataset.state = newState;
                    });
                }

            }, 50);

        };
    })();


    // ╔══════════════════════════════════════════════════════════════════╗
