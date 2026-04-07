    // ║  模块 20：配置编辑器                                              ║
    // ║  ConfigEditor 类 — 可视化 Agent 配置图编辑器                      ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module ConfigEditor — 可视化 JSON 配置编辑器：阶段/Agent/API/分类/选项 */

    // ==================== ConfigEditor 类 ====================

    class ConfigEditor {

        constructor(canvas, propertyPanel, initialConfig, callbacks) {

            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.propertyPanel = propertyPanel;
            this.callbacks = callbacks || {};

            // 配置数据
            this.config = initialConfig;

            // 节点数据
            this.nodes = [];
            this.edges = [];
            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedApiId = null;
            this.selectedCategoryId = null;
            this.selectedGroupIndex = null;
            this.selectedAgentKey = null;
            this.selectedAgentStageNode = null;
            this.selectedGlobal = false;
            this.highlightedAgents = new Set(); // 新增：存储与选中 Agent 有直接依赖关系的 Agent 键
            this.selectRect = null;

            // 视图变换
            this.scale = 1;
            this.offsetX = 0;
            this.offsetY = 0;
            this.isPanning = false;
            this.panStart = { x: 0, y: 0 };

            // 拖拽节点
            this.draggingNode = null;
            this.draggingOffset = { x: 0, y: 0 };
            this.draggingStartX = 0;
            this.draggingStartY = 0;

            // Agent 拖拽状态
            this.draggingAgentKey = null;
            this.draggingAgentWorldX = 0;
            this.draggingAgentWorldY = 0;
            this.draggingInsertIndex = -1;
            this.draggingTargetStageNode = null;
            this.draggingSourceStageId = null;
            this.draggingSourceStageNode = null;

            // 新增：用于区分单击和拖拽
            this.potentialDragAgentKey = null;
            this.potentialDragStageId = null;
            this.dragStartX = 0;
            this.dragStartY = 0;
            this.dragThreshold = 5;

            // 新增：用于测量文本宽度的 Canvas 上下文
            this.measureCanvas = document.createElement('canvas');
            this.measureCtx = this.measureCanvas.getContext('2d');
            this.measureCtx.font = '14px Arial';

            // 节点尺寸常量（阶段节点不变）
            this.nodeWidth = 140;
            this.nodeHeight = 60;
            this.specialNodeWidth = 80;
            this.specialNodeHeight = 30;
            this.stageNodeWidth = 100;
            this.stageNodeHeight = 40;

            this.agentNodeHeight = 65;
            this.agentHPadding = 20;
            this.stageAgentOffsetX = 20;
            this.unassignedAreaX = 50;
            this.unassignedAreaY = 100;
            this.unassignedAreaWidth = 200;
            this.unassignedAreaAgentSpacing = 65;

            this.roleRectHeight = 24;   // 角色框高度
            this.roleTopMargin = 6;     // 角色框与节点顶部的间距

            this.orderRectHeight = 24;
            this.orderTopMargin = 6;

            this.unassignedAreaTopPadding = 40;
            this.unassignedAreaBottomPadding = 40;

            // 错误信息列表
            this.validationErrors = [];

            // 初始化节点和边
            this._buildFromConfig();

            // 调整画布大小并渲染
            this._resizeCanvas();
            window.addEventListener('resize', () => this._resizeCanvas());

            // 绑定事件
            this._initEvents();
            this._fitView();
        }

        /**
         * 统一显示校验错误信息（插入到面板顶部）
         */
        _showValidationErrors() {
            const panel = this.propertyPanel;
            const existingError = panel.querySelector('.validation-error-card');
            if (existingError) existingError.remove();

            if (this.validationErrors.length === 0) return;

            const errorDiv = document.createElement('div');
            errorDiv.className = 'validation-error-card';
            errorDiv.style.cssText = 'background:#2a1a1a; border:1px solid #dc3545; border-radius:8px; padding:12px; margin-bottom:16px;';
            errorDiv.innerHTML = `<div class="nc-color--error-title">❌ 配置错误</div>`;
            const list = document.createElement('ul');
            list.style.cssText = 'margin:0; padding-left:20px; color:#ffa0a0; font-size:12px;';
            this.validationErrors.forEach(err => {
                const li = document.createElement('li');
                li.textContent = err;
                list.appendChild(li);
            });
            errorDiv.appendChild(list);
            panel.prepend(errorDiv);
        }

        // ---------- 构建和布局 ----------
        _buildFromConfig() {


            const stages = this.config.workflowStages || [];

            // 创建阶段节点，按 stage 排序
            this.nodes = [];
            stages.sort((a, b) => a.stage - b.stage).forEach((stage, index) => {
                const stageNum = typeof stage.stage === 'number' ? stage.stage : index + 1;

                this.nodes.push({
                    id: `stage-${stage.stage}`,
                    type: 'stage',
                    key: stage.id,
                    label: stage.name || `阶段${stage.stage}`,
                    color: stage.color || '#667eea',
                    x: 300,
                    y: 100 + index * (this.nodeHeight + 50),
                    width: this.nodeWidth,
                    height: this.nodeHeight,
                    stageData: {
                        stage: stageNum,
                        id: stage.id,
                        name: stage.name,
                        color: stage.color,
                        mode: stage.mode,
                        agents: stage.agents || [],
                        description: stage.description || '',
                    },
                });
            });

            // 创建边
            this.edges = [];
            for (let i = 0; i < this.nodes.length - 1; i++) {
                const source = this.nodes[i];
                const target = this.nodes[i + 1];
                const sourceMode = source.stageData.mode || 'serial';
                const targetMode = target.stageData.mode || 'serial';
                const edgeType = (sourceMode === 'parallel' && targetMode === 'parallel') ? 'parallel' : 'normal';
                this.edges.push({
                    id: `edge-${source.id}-${target.id}`,
                    source: source.id,
                    target: target.id,
                    type: edgeType,
                });
            }


        }

        loadConfig(newConfig) {


            this.config = newConfig;

            this._buildFromConfig();
            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedApiId = null;
            this.selectedCategoryId = null;
            this.selectedGroupIndex = null;
            this.selectedAgentKey = null;
            this.selectedAgentStageNode = null;
            this.selectedGlobal = false;
            this.draggingAgentKey = null;
            this.dropTargetStageId = null;
            this.validationErrors = [];

            this._renderPropertyPanel(null);

            this._fitView();

        }

        getConfig() {


            const newConfig = JSON.parse(JSON.stringify(this.config));

            const stageNodes = this.nodes.filter(n => n.type === 'stage').sort((a, b) => a.y - b.y);

            newConfig.workflowStages = stageNodes.map((node, index) => {
                const oldStage = node.stageData || {};
                const userStage = oldStage.stage !== undefined ? oldStage.stage : index + 1;

                const stageObj = {
                    stage: userStage,
                    id: node.key,
                    name: node.label,
                    color: oldStage.color || node.color || '#667eea',
                    mode: oldStage.mode || 'serial',
                    agents: oldStage.agents || [],
                    description: oldStage.description || '',
                };

                return stageObj;
            });


            return newConfig;
        }

        // ---------- 画布事件 ----------
        _resizeCanvas() {
            const container = this.canvas.parentElement;
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
            this._requestRender();
        }

        _initEvents() {
            this.canvas.addEventListener('mousedown', this._onMouseDown.bind(this));
            this.canvas.addEventListener('mousemove', this._onMouseMove.bind(this));
            this.canvas.addEventListener('mouseup', this._onMouseUp.bind(this));
            this.canvas.addEventListener('wheel', this._onWheel.bind(this), { passive: false });
            this.canvas.addEventListener('contextmenu', e => e.preventDefault());
            window.addEventListener('keydown', this._onKeyDown.bind(this));
        }

        // ========== 辅助方法 ==========
        _getSortedAgentsForStage(stageId) {
            const stage = this.config.workflowStages.find(s => s.id === stageId);
            if (!stage) return [];
            return stage.agents
                .map(key => ({ key, agent: this.config.agents[key] }))
                .filter(item => item.agent)
                .sort((a, b) => (a.agent.order || 999) - (b.agent.order || 999));
        }

        /**
         * 获取阶段内某个 Agent 的位置
         * @param {object} stageNode - 阶段节点对象
         * @param {number} index - Agent 在排序后数组中的索引
         * @returns {{x: number, y: number}} 世界坐标
         */
        _getAgentPosition(stageNode, index) {
            const stageId = stageNode.key;
            const sortedAgents = this._getSortedAgentsForStage(stageId);
            let offsetX = 0;
            for (let i = 0; i < index; i++) {
                const agent = sortedAgents[i].agent;
                offsetX += this._getAgentWidth(agent) + this.agentHPadding;
            }
            const x = stageNode.x + stageNode.width + this.stageAgentOffsetX + offsetX;
            const y = stageNode.y + (stageNode.height / 2) - (this.agentNodeHeight / 2);
            return { x, y };
        }

        _getUnassignedAgents() {
            const allAgents = Object.entries(this.config.agents || {});
            return allAgents
                .filter(([key, agent]) => !agent.stage || agent.stage.trim() === '')
                .map(([key, agent]) => ({ key, agent }))
                .sort((a, b) => (a.agent.order || 999) - (b.agent.order || 999));
        }

        /**
         * 检测鼠标世界坐标是否命中某个阶段节点
         * @param {number} worldX - 鼠标世界 X
         * @param {number} worldY - 鼠标世界 Y
         * @returns {object|null} 命中的阶段节点，无则返回 null
         */
        _detectDropTarget(worldX, worldY) {
            for (const node of this.nodes) {
                if (node.type !== 'stage') continue;
                if (worldX >= node.x && worldX <= node.x + node.width &&
                    worldY >= node.y && worldY <= node.y + node.height) {

                    return node;
                }
            }
            return null;
        }

        /**
         * 计算鼠标距离目标阶段右侧哪个插入点最近
         * @param {object} stageNode - 目标阶段节点
         * @param {number} worldX - 鼠标世界 X
         * @param {number} worldY - 鼠标世界 Y
         * @returns {number} 插入索引（0 ~ agentCount）
         */
        _getNearestPlusIndex(stageNode, worldX, worldY) {
            const agentCount = stageNode.agents?.length || 0;
            // 计算该阶段内所有加号的 X 坐标（与 Agent 水平对齐）
            const baseX = stageNode.x + stageNode.width + this.stageAgentOffsetX;
            const plusXList = [];
            for (let i = 0; i <= agentCount; i++) {
                const x = baseX + i * (this.agentNodeWidth + this.agentHPadding);
                plusXList.push(x);
            }

            // 找到最近的 X 索引
            let minDist = Infinity;
            let bestIndex = 0;
            for (let i = 0; i < plusXList.length; i++) {
                const dist = Math.abs(worldX - plusXList[i]);
                if (dist < minDist) {
                    minDist = dist;
                    bestIndex = i;
                }
            }

            // 可选：检查垂直距离是否在可接受范围内（例如 20 像素）
            const stageCenterY = stageNode.y + stageNode.height / 2;
            const distY = Math.abs(worldY - stageCenterY);
            if (distY > 20) {

                // 仍返回索引，但释放时可依据此决定是否插入
            }


            return bestIndex;
        }

        _onMouseDown(e) {

            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left - this.offsetX) / this.scale;
            const y = (e.clientY - rect.top - this.offsetY) / this.scale;


            // 清除潜在拖拽状态
            this.potentialDragAgentKey = null;
            this.potentialDragStageId = null;

            // ===== 移除 order 区域检测，角色框不再可编辑 =====

            // 清除其他选中
            this.selectedApiId = null;
            this.selectedCategoryId = null;
            this.selectedGroupIndex = null;
            this.selectedGlobal = false;

            // ===== 检测未分配区的 Agent =====
            const unassignedAgents = this._getUnassignedAgents();
            if (unassignedAgents.length > 0) {
                const maxWidth = this._getMaxUnassignedWidth();
                const columnWidth = maxWidth + this.agentHPadding;
                const rowsPerColumn = 10;
                const agentTotalHeight = this.orderRectHeight + this.orderTopMargin + this.agentNodeHeight;

                for (let i = 0; i < unassignedAgents.length; i++) {
                    const { key, agent } = unassignedAgents[i];
                    const col = Math.floor(i / rowsPerColumn);
                    const row = i % rowsPerColumn;
                    const ax = this.unassignedAreaX + col * columnWidth;
                    const ay = this.unassignedAreaY + row * (agentTotalHeight + this.agentHPadding) + this.orderRectHeight + this.orderTopMargin;
                    const agentWidth = this._getAgentWidth(agent);
                    if (x >= ax && x <= ax + agentWidth && y >= ay && y <= ay + this.agentNodeHeight) {


                        this.potentialDragAgentKey = key;
                        this.potentialDragStageId = null;
                        this.dragStartX = x;
                        this.dragStartY = y;

                        this.selectAgent(key);
                        e.preventDefault();
                        return;
                    }
                }
            }

            // ===== 检测阶段内的 Agent =====
            for (let i = this.nodes.length - 1; i >= 0; i--) {
                const node = this.nodes[i];
                if (node.type !== 'stage') continue;
                const sortedAgents = this._getSortedAgentsForStage(node.key);
                for (let j = sortedAgents.length - 1; j >= 0; j--) {
                    const { key, agent } = sortedAgents[j];
                    const { x: ax, y: ay } = this._getAgentPosition(node, j);
                    const agentWidth = this._getAgentWidth(agent);
                    if (x >= ax && x <= ax + agentWidth && y >= ay && y <= ay + this.agentNodeHeight) {


                        this.potentialDragAgentKey = key;
                        this.potentialDragStageId = node.key;
                        this.dragStartX = x;
                        this.dragStartY = y;

                        this.selectAgent(key);
                        e.preventDefault();
                        return;
                    }
                }
            }

            // 检查点击阶段节点
            const clickedNode = this._getNodeAt(x, y);
            if (clickedNode) {

                this.selectedNode = clickedNode;
                this.selectedEdge = null;
                this.selectedAgentKey = null;
                this.highlightedAgents.clear();
                this._renderPropertyPanel(clickedNode);
                this._requestRender();
                e.preventDefault();
                return;
            }

            // 检查点击边
            const clickedEdge = this._getEdgeNear(x, y);
            if (clickedEdge) {

                this.selectedEdge = clickedEdge;
                this.selectedNode = null;
                this.selectedAgentKey = null;
                this.highlightedAgents.clear();
                this._renderPropertyPanel(clickedEdge);
                this._requestRender();
                e.preventDefault();
                return;
            }

            // 点击空白

            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedAgentKey = null;
            this.highlightedAgents.clear();
            this.selectedGlobal = false;
            this._renderPropertyPanel(null);
            this._requestRender();

            // 中键平移
            if (e.button === 1 || e.button === 2) {
                this.isPanning = true;
                this.panStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY };
                e.preventDefault();
            } else if (e.button === 0) {
                // 左键开始框选
                this.isSelecting = true;
                this.selectStart = { x, y };
                this.selectRect = { x, y, width: 0, height: 0 };
                this._requestRender();
            }
        }

        _onMouseMove(e) {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.clientX;
            const clientY = e.clientY;
            const worldX = (clientX - rect.left - this.offsetX) / this.scale;
            const worldY = (clientY - rect.top - this.offsetY) / this.scale;

            // 更新拖拽跟随坐标
            this.draggingAgentWorldX = worldX;
            this.draggingAgentWorldY = worldY;

            if (this.isPanning) {
                this.offsetX = clientX - this.panStart.x;
                this.offsetY = clientY - this.panStart.y;
                this._requestRender();
                return;
            }

            // 检查是否从潜在拖拽转为真正拖拽
            if (!this.draggingAgentKey && this.potentialDragAgentKey) {
                const dx = worldX - this.dragStartX;
                const dy = worldY - this.dragStartY;
                const dist = Math.hypot(dx, dy);
                const screenDist = dist * this.scale;

                if (screenDist > this.dragThreshold) {

                    this.draggingAgentKey = this.potentialDragAgentKey;
                    this.draggingAgentWorldX = worldX;
                    this.draggingAgentWorldY = worldY;
                    this.draggingInsertIndex = -1;
                    this.draggingTargetStageNode = null;
                    this.draggingSourceStageId = this.potentialDragStageId;
                    this.draggingSourceStageNode = this.potentialDragStageId ? this.nodes.find(n => n.key === this.potentialDragStageId) : null;
                    this.potentialDragAgentKey = null;
                    this.potentialDragStageId = null;
                    this._requestRender();
                }
            }

            if (this.draggingAgentKey) {


                // 检测目标阶段
                const targetNode = this._detectDropTarget(worldX, worldY);
                if (targetNode) {
                    if (this.draggingTargetStageNode !== targetNode) {

                        this.draggingTargetStageNode = targetNode;
                        this.draggingInsertIndex = 0; // 固定插入索引为 0
                    }
                } else {
                    if (this.draggingTargetStageNode !== null) {

                        this.draggingTargetStageNode = null;
                        this.draggingInsertIndex = -1;
                    }
                }

                this._requestRender();
                return;
            }

            if (this.draggingNode) {
                const dx = worldX - this.draggingNode.x - this.draggingOffset.x;
                const dy = worldY - this.draggingNode.y - this.draggingOffset.y;
                if (dx !== 0 || dy !== 0) {
                    this.draggingNode.x += dx;
                    this.draggingNode.y += dy;
                    this._requestRender();
                }
            } else if (this.selectRect) {
                this.selectRect.width = worldX - this.selectRect.x;
                this.selectRect.height = worldY - this.selectRect.y;
                this._requestRender();
            }
        }

        _onMouseUp(e) {


            // 处理单击（未开始拖拽）
            if (this.potentialDragAgentKey && !this.draggingAgentKey) {

                this.potentialDragAgentKey = null;
                this.potentialDragStageId = null;
                this._requestRender();
                this.isPanning = false;
                return;
            }

            if (this.draggingAgentKey) {
                const rect = this.canvas.getBoundingClientRect();
                const worldX = (e.clientX - rect.left - this.offsetX) / this.scale;
                const worldY = (e.clientY - rect.top - this.offsetY) / this.scale;

                const agentKey = this.draggingAgentKey;
                const agent = this.config.agents[agentKey];
                const sourceStageId = this.draggingSourceStageId;

                const targetStageNode = this._detectDropTarget(worldX, worldY);
                const targetStageId = targetStageNode ? targetStageNode.key : null;
                const targetStage = targetStageId ? this.config.workflowStages.find(s => s.id === targetStageId) : null;
                const sourceStage = sourceStageId ? this.config.workflowStages.find(s => s.id === sourceStageId) : null;


                // 移除模式兼容性检查：任何 Agent 均可放入任何阶段

                let configChanged = false;

                // 从源阶段移除
                if (sourceStage) {
                    const idx = sourceStage.agents.indexOf(agentKey);
                    if (idx !== -1) {
                        sourceStage.agents.splice(idx, 1);

                        configChanged = true;
                    }
                }

                // 添加到目标阶段
                if (targetStage) {
                    agent.stage = targetStageId;

                    const currentAgents = targetStage.agents
                        .map(key => ({ key, order: this.config.agents[key]?.order || 0 }))
                        .sort((a, b) => a.order - b.order)
                        .map(item => item.key);

                    const insertIndex = 0; // 始终插入最前面
                    if (!currentAgents.includes(agentKey)) {
                        currentAgents.splice(insertIndex, 0, agentKey);
                        targetStage.agents = currentAgents;

                        configChanged = true;
                    } else {
                        console.warn(`[ConfigEditor._onMouseUp] Agent ${agentKey} 已在目标阶段 ${targetStageId} 中，跳过添加`);
                    }

                    // 重新分配 order
                    const updatedList = targetStage.agents;
                    updatedList.forEach((key, idx) => {
                        this.config.agents[key].order = (idx + 1) * 10;
                    });

                } else {
                    // 拖入空白区：移入未分配区
                    if (sourceStage) {
                        agent.stage = '';

                        configChanged = true;
                    }
                }

                if (configChanged && this.callbacks.onConfigChange) {
                    this.callbacks.onConfigChange(this.getConfig());
                }

                this._resetDraggingState();
                this._requestRender();
                return;
            }

            // 原有拖拽节点处理
            if (this.draggingNode) {
                this.draggingNode = null;
                this._reorderStagesByPosition();
                this._requestRender();
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
            }
            if (this.selectRect) {
                if (Math.abs(this.selectRect.width) > 5 && Math.abs(this.selectRect.height) > 5) {
                    const rect = {
                        x: Math.min(this.selectRect.x, this.selectRect.x + this.selectRect.width),
                        y: Math.min(this.selectRect.y, this.selectRect.y + this.selectRect.height),
                        width: Math.abs(this.selectRect.width),
                        height: Math.abs(this.selectRect.height),
                    };
                    const selected = this.nodes.filter(node =>
                        node.type === 'stage' &&
                        node.x >= rect.x && node.x + node.width <= rect.x + rect.width &&
                        node.y >= rect.y && node.y + node.height <= rect.y + rect.height
                    );
                    if (selected.length > 0) {
                        this.selectedNode = selected[0];
                    }
                }
                this.selectRect = null;
                this._requestRender();
            }

            this.isPanning = false;
        }

        _onWheel(e) {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = this.scale * delta;
            if (newScale < 0.2 || newScale > 3) return;

            const worldX = (mouseX - this.offsetX) / this.scale;
            const worldY = (mouseY - this.offsetY) / this.scale;

            this.scale = newScale;
            this.offsetX = mouseX - worldX * this.scale;
            this.offsetY = mouseY - worldY * this.scale;

            this._requestRender();
        }

        /**
         * 键盘按下事件处理
         * @param {KeyboardEvent} e
         */
        async _onKeyDown(e) {


            // 检查当前焦点是否在输入框或文本域内
            const activeElement = document.activeElement;
            const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');


            if (e.key === 'Delete') {
                if (this.selectedEdge) {

                    Notify.warning('阶段线由顺序自动生成，无法手动删除');
                } else if (this.selectedNode) {
                    e.preventDefault(); // 阻止默认删除行为（比如删除文本）

                    const confirmed = await UI.showConfirmModal(
                        `确定删除阶段节点 ${this.selectedNode.label} 吗？`,
                        '确认删除'
                    );
                    if (!confirmed) {

                        return;
                    }

                    const stageIdx = this.config.workflowStages.findIndex(s => s.stage === this.selectedNode.key);
                    if (stageIdx !== -1) {
                        const stage = this.config.workflowStages[stageIdx];
                        stage.agents.forEach(agentKey => {
                            delete this.config.agents[agentKey];
                        });
                        this.config.workflowStages.splice(stageIdx, 1);
                    }
                    this.nodes = this.nodes.filter(n => n.id !== this.selectedNode.id);
                    this.selectedNode = null;
                    this._reorderStagesByPosition();
                    this._renderPropertyPanel(null);
                    this._requestRender();
                    if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());

                }
            } else if (e.ctrlKey && e.key === 'a') {

                if (isInput) {

                    // 让浏览器处理默认行为，不执行任何自定义逻辑
                    return;
                }
                e.preventDefault();

                if (this.nodes.length > 0) {
                    this.selectedNode = this.nodes[0];
                    this._renderPropertyPanel(this.selectedNode);
                    this._requestRender();
                }
            } else {

            }
        }

        /**
         * 重置所有拖拽相关状态
         */
        _resetDraggingState() {
            this.draggingAgentKey = null;
            this.draggingAgentWorldX = 0;
            this.draggingAgentWorldY = 0;
            this.draggingInsertIndex = -1;
            this.draggingTargetStageNode = null;
            this.draggingSourceStageId = null;
            this.draggingSourceStageNode = null;
            this.potentialDragAgentKey = null;
            this.potentialDragStageId = null;
        }

        _reorderStagesByPosition() {

            const stageNodes = this.nodes.filter(n => n.type === 'stage').sort((a, b) => a.y - b.y);


            const newStages = stageNodes.map((node, index) => {
                const oldStage = node.stageData || {};
                const userStage = oldStage.stage !== undefined ? oldStage.stage : index + 1;

                return {
                    stage: userStage,
                    id: node.key,
                    name: node.label,
                    mode: oldStage.mode || 'serial',
                    agents: oldStage.agents || [],
                    description: oldStage.description || '',
                    color: oldStage.color || node.color,
                };
            });

            const stageSet = new Set();
            const duplicates = [];
            newStages.forEach(s => {
                if (stageSet.has(s.stage)) {
                    duplicates.push(s.stage);
                }
                stageSet.add(s.stage);
            });
            if (duplicates.length > 0) {
                console.warn('[ConfigEditor._reorderStagesByPosition] 检测到重复的阶段序号:', duplicates);
            }

            this.config.workflowStages = newStages;


            stageNodes.forEach((node, index) => {
                node.stageData = newStages[index];
            });

            // 重建边
            this.edges = [];
            for (let i = 0; i < stageNodes.length - 1; i++) {
                const source = stageNodes[i];
                const target = stageNodes[i + 1];
                const edgeType = (source.stageData.mode === 'parallel' && target.stageData.mode === 'parallel') ? 'parallel' : 'normal';
                this.edges.push({
                    id: `edge-${source.id}-${target.id}`,
                    source: source.id,
                    target: target.id,
                    type: edgeType,
                });
            }


        }

        /**
         * 计算未分配区所有 Agent 的最大宽度（用于列对齐）
         * @returns {number} 最大宽度
         */
        _getMaxUnassignedWidth() {
            const unassignedAgents = this._getUnassignedAgents();
            if (unassignedAgents.length === 0) {

                return 80;
            }
            let max = 0;
            unassignedAgents.forEach(item => {
                const w = this._getAgentWidth(item.agent);
                if (w > max) max = w;
            });

            return max;
        }

        // ---------- 辅助检测 ----------
        _getNodeAt(x, y) {
            for (let i = this.nodes.length - 1; i >= 0; i--) {
                const node = this.nodes[i];
                if (x >= node.x && x <= node.x + node.width &&
                    y >= node.y && y <= node.y + node.height) {
                    return node;
                }
            }
            return null;
        }

        _getEdgeNear(x, y, threshold = 10) {
            let minDist = Infinity;
            let closestEdge = null;
            this.edges.forEach(edge => {
                const sourceNode = this.nodes.find(n => n.id === edge.source);
                const targetNode = this.nodes.find(n => n.id === edge.target);
                if (!sourceNode || !targetNode) return;
                const sx = sourceNode.x + sourceNode.width / 2;
                const sy = sourceNode.y + sourceNode.height / 2;
                const tx = targetNode.x + targetNode.width / 2;
                const ty = targetNode.y + targetNode.height / 2;
                const dist = this._distanceToSegment(x, y, sx, sy, tx, ty);
                if (dist < threshold && dist < minDist) {
                    minDist = dist;
                    closestEdge = edge;
                }
            });
            return closestEdge;
        }

        _distanceToSegment(px, py, x1, y1, x2, y2) {
            const A = px - x1;
            const B = py - y1;
            const C = x2 - x1;
            const D = y2 - y1;
            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            let param = len_sq === 0 ? 0 : dot / len_sq;
            if (param < 0) param = 0;
            if (param > 1) param = 1;
            const xx = x1 + param * C;
            const yy = y1 + param * D;
            const dx = px - xx;
            const dy = py - yy;
            return Math.sqrt(dx * dx + dy * dy);
        }

        // ---------- 视图控制 ----------
        /**
         * 调整视图使所有节点居中显示，并设置合适的缩放比例
         * 增加最小缩放限制，防止文字过小
         */
        _fitView() {
            if (this.nodes.length === 0) return;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            this.nodes.forEach(node => {
                minX = Math.min(minX, node.x);
                minY = Math.min(minY, node.y);
                maxX = Math.max(maxX, node.x + node.width);
                maxY = Math.max(maxY, node.y + node.height);
            });
            const padding = 50;
            minX -= padding;
            minY -= padding;
            maxX += padding;
            maxY += padding;
            const canvasWidth = this.canvas.width;
            const canvasHeight = this.canvas.height;
            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;

            // 计算理论缩放（使内容区域适应画布，并留10%边距）
            let scale = Math.min(canvasWidth / contentWidth, canvasHeight / contentHeight) * 0.9;

            // 最小缩放限制（可根据需要调整）
            const MIN_SCALE = 0.8;
            if (scale < MIN_SCALE) {

                scale = MIN_SCALE;
            }

            this.scale = scale;
            // 计算偏移量使内容居中
            this.offsetX = (canvasWidth - contentWidth * this.scale) / 2 - minX * this.scale;
            this.offsetY = (canvasHeight - contentHeight * this.scale) / 2 - minY * this.scale;


            this._requestRender();
        }

        // ---------- 渲染 ----------
        _requestRender() {
            if (this._renderPending) return;
            this._renderPending = true;
            requestAnimationFrame(() => {
                this._renderPending = false;
                this.render();
            });
        }

        render() {
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;

            ctx.clearRect(0, 0, w, h);
            ctx.save();
            ctx.translate(this.offsetX, this.offsetY);
            ctx.scale(this.scale, this.scale);

            // 绘制网格
            ctx.strokeStyle = '#2d3748';
            ctx.lineWidth = 1 / this.scale;
            ctx.beginPath();
            const gridSize = 50;
            const startX = Math.floor(-this.offsetX / this.scale / gridSize) * gridSize;
            const startY = Math.floor(-this.offsetY / this.scale / gridSize) * gridSize;
            const endX = startX + w / this.scale + gridSize;
            const endY = startY + h / this.scale + gridSize;
            for (let x = startX; x < endX; x += gridSize) {
                ctx.moveTo(x, startY);
                ctx.lineTo(x, endY);
            }
            for (let y = startY; y < endY; y += gridSize) {
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
            }
            ctx.stroke();

            // 绘制边（原样）
            this.edges.forEach(edge => {
                const sourceNode = this.nodes.find(n => n.id === edge.source);
                const targetNode = this.nodes.find(n => n.id === edge.target);
                if (!sourceNode || !targetNode) return;
                const sx = sourceNode.x + sourceNode.width / 2;
                const sy = sourceNode.y + sourceNode.height / 2;
                const tx = targetNode.x + targetNode.width / 2;
                const ty = targetNode.y + targetNode.height / 2;

                const sourceMode = sourceNode.stageData?.mode || 'serial';
                const targetMode = targetNode.stageData?.mode || 'serial';
                const isParallel = sourceMode === 'parallel' && targetMode === 'parallel';


                const offset = 20 / this.scale;
                const cpx1 = sx + (tx - sx) * 0.25;
                const cpy1 = sy + (ty - sy) * 0.25 - offset;
                const cpx2 = sx + (tx - sx) * 0.75;
                const cpy2 = sy + (ty - sy) * 0.75 + offset;

                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, tx, ty);
                ctx.strokeStyle = isParallel ? '#10b981' : '#667eea';
                ctx.lineWidth = 2 / this.scale;
                ctx.setLineDash(isParallel ? [5 / this.scale, 5 / this.scale] : []);
                ctx.stroke();

                // 箭头
                const angle = Math.atan2(ty - sy, tx - sx);
                const arrowSize = 10 / this.scale;
                ctx.fillStyle = ctx.strokeStyle;
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.lineTo(tx - arrowSize * Math.cos(angle - 0.3), ty - arrowSize * Math.sin(angle - 0.3));
                ctx.lineTo(tx - arrowSize * Math.cos(angle + 0.3), ty - arrowSize * Math.sin(angle + 0.3));
                ctx.closePath();
                ctx.fill();
            });

            // 绘制阶段节点
            this.nodes.forEach(node => {
                if (node.type === 'stage') {
                    this._drawStageNode(ctx, node);
                }
            });

            // 绘制正式 Agent
            this.nodes.forEach(node => {
                if (node.type === 'stage') {
                    const stageId = node.key;
                    const sortedAgents = this._getSortedAgentsForStage(stageId);
                    sortedAgents.forEach((item, index) => {
                        const { x, y } = this._getAgentPosition(node, index);
                        let alpha = 1.0;
                        if (this.draggingAgentKey &&
                            this.draggingTargetStageNode === node &&
                            this.draggingInsertIndex !== -1 &&
                            index === 0) {
                            alpha = 0.3;
                        }
                        this._drawAgent(ctx, item.key, item.agent, x, y, alpha);
                    });
                }
            });

            // 绘制目标阶段节点的高亮（橙色外发光）
            if (this.draggingAgentKey && this.draggingTargetStageNode) {
                const node = this.draggingTargetStageNode;
                ctx.save();
                ctx.shadowColor = '#ffaa00';
                ctx.shadowBlur = 20 / this.scale;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.strokeStyle = '#ffaa00';
                ctx.lineWidth = 3 / this.scale;
                ctx.strokeRect(node.x, node.y, node.width, node.height);
                ctx.restore();
            }

            // 加号仅在拖拽且存在目标阶段时绘制在阶段左侧
            if (this.draggingAgentKey && this.draggingTargetStageNode) {
                const node = this.draggingTargetStageNode;
                const plusX = node.x - 20;
                const plusY = node.y + node.height / 2 - 5;
                ctx.save();
                ctx.translate(plusX, plusY);
                ctx.scale(1, 1);
                ctx.beginPath();
                ctx.arc(0, 0, 8 / this.scale, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(255,170,0,0.3)';
                ctx.fill();
                ctx.strokeStyle = '#ffaa00';
                ctx.lineWidth = 1.5 / this.scale;
                ctx.stroke();
                ctx.fillStyle = '#ffaa00';
                ctx.font = `bold ${14 / this.scale}px Arial`;
                ctx.fillText('+', -4 / this.scale, 4 / this.scale);
                ctx.restore();
                ctx.save();
                ctx.translate(plusX, plusY + 15 / this.scale);
                ctx.fillStyle = '#fff';
                ctx.font = `${10 / this.scale}px monospace`;
                ctx.fillText('插入到最前', -30 / this.scale, 0);
                ctx.restore();
            }

            // ========== 修改：未分配区网格布局（调整间距和边框） ==========
            const unassignedAgents = this._getUnassignedAgents();
            if (unassignedAgents.length > 0) {

                // 计算最大宽度用于列对齐
                const maxWidth = this._getMaxUnassignedWidth();
                const columnWidth = maxWidth + this.agentHPadding;
                const rowsPerColumn = 10; // 每列10个

                const totalColumns = Math.ceil(unassignedAgents.length / rowsPerColumn);
                // 计算区域总高度：考虑 order 区域的高度和边距
                const agentTotalHeight = this.orderRectHeight + this.orderTopMargin + this.agentNodeHeight;
                const areaHeight = rowsPerColumn * agentTotalHeight + (rowsPerColumn - 1) * this.agentHPadding
                    + this.unassignedAreaTopPadding + this.unassignedAreaBottomPadding;
                const areaWidth = totalColumns * columnWidth + 20;

                // 边框左上角坐标
                const borderX = this.unassignedAreaX - 10;
                const borderY = this.unassignedAreaY - this.unassignedAreaTopPadding;


                ctx.save();
                ctx.fillStyle = 'rgba(255,255,255,0.03)';
                ctx.strokeStyle = '#667eea';
                ctx.lineWidth = 1;
                ctx.setLineDash([5 / this.scale, 5 / this.scale]);
                ctx.strokeRect(borderX, borderY, areaWidth, areaHeight);
                ctx.setLineDash([]);
                ctx.restore();

                // 绘制每个 Agent
                unassignedAgents.forEach((item, index) => {
                    const col = Math.floor(index / rowsPerColumn);
                    const row = index % rowsPerColumn;
                    // Agent 主体的 y 坐标 = 边框顶部 + 上边距 + row * (单个Agent总高 + 垂直间距) + order高度 + order间距
                    const baseY = borderY + this.unassignedAreaTopPadding + row * (agentTotalHeight + this.agentHPadding);
                    const agentY = baseY + this.orderRectHeight + this.orderTopMargin; // 主体左上角 Y
                    const x = this.unassignedAreaX + col * columnWidth;

                    this._drawAgent(ctx, item.key, item.agent, x, agentY, 1.0);
                });
            }

            // 绘制拖拽跟随 Agent
            if (this.draggingAgentKey) {
                const agent = this.config.agents[this.draggingAgentKey];
                if (agent) {
                    const agentWidth = this._getAgentWidth(agent);
                    const x = this.draggingAgentWorldX - agentWidth / 2;
                    const y = this.draggingAgentWorldY - this.agentNodeHeight / 2;
                    this._drawAgent(ctx, this.draggingAgentKey, agent, x, y, 0.6);
                }
            }

            // 绘制框选矩形
            if (this.selectRect) {
                ctx.save();
                ctx.strokeStyle = '#667eea';
                ctx.lineWidth = 2 / this.scale;
                ctx.setLineDash([5 / this.scale, 5 / this.scale]);
                ctx.strokeRect(this.selectRect.x, this.selectRect.y, this.selectRect.width, this.selectRect.height);
                ctx.fillStyle = 'rgba(102,126,234,0.1)';
                ctx.fillRect(this.selectRect.x, this.selectRect.y, this.selectRect.width, this.selectRect.height);
                ctx.restore();
            }

            // 绘制未分配区高亮（当拖拽中且没有目标阶段时）
            if (this.draggingAgentKey && !this.draggingTargetStageNode) {
                const unassignedAgents = this._getUnassignedAgents();
                if (unassignedAgents.length > 0) {
                    const maxWidth = this._getMaxUnassignedWidth();
                    const columnWidth = maxWidth + this.agentHPadding;
                    const rowsPerColumn = 10;
                    const totalColumns = Math.ceil(unassignedAgents.length / rowsPerColumn);
                    const agentTotalHeight = this.orderRectHeight + this.orderTopMargin + this.agentNodeHeight;
                    const areaHeight = rowsPerColumn * agentTotalHeight + (rowsPerColumn - 1) * this.agentHPadding
                        + this.unassignedAreaTopPadding + this.unassignedAreaBottomPadding;
                    const areaWidth = totalColumns * columnWidth + 20;
                    const borderX = this.unassignedAreaX - 10;
                    const borderY = this.unassignedAreaY - this.unassignedAreaTopPadding;
                    ctx.save();
                    ctx.shadowColor = '#ffaa00';
                    ctx.shadowBlur = 20 / this.scale;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    ctx.strokeStyle = '#ffaa00';
                    ctx.lineWidth = 3 / this.scale;
                    ctx.strokeRect(borderX, borderY, areaWidth, areaHeight);
                    ctx.restore();
                }
            }

            ctx.restore();
        }

        /**
         * 绘制阶段节点，并在节点内显示执行模式
         * @param {CanvasRenderingContext2D} ctx - 画布上下文
         * @param {Object} node - 节点对象
         */
        _drawStageNode(ctx, node) {

            const isSelected = this.selectedNode === node;
            const bgColor = isSelected ? '#3a3a5a' : node.color + '40';
            const borderColor = node.color;
            const mode = node.stageData?.mode || 'serial';
            const modeText = mode === 'parallel' ? '并行' : '串行';

            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 10 / this.scale;
            ctx.shadowOffsetX = 2 / this.scale;
            ctx.shadowOffsetY = 2 / this.scale;
            ctx.fillStyle = bgColor;
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = isSelected ? 3 / this.scale : 2 / this.scale;
            const radius = 8 / this.scale;
            ctx.beginPath();
            ctx.moveTo(node.x + radius, node.y);
            ctx.lineTo(node.x + node.width - radius, node.y);
            ctx.quadraticCurveTo(node.x + node.width, node.y, node.x + node.width, node.y + radius);
            ctx.lineTo(node.x + node.width, node.y + node.height - radius);
            ctx.quadraticCurveTo(node.x + node.width, node.y + node.height, node.x + node.width - radius, node.y + node.height);
            ctx.lineTo(node.x + radius, node.y + node.height);
            ctx.quadraticCurveTo(node.x, node.y + node.height, node.x, node.y + node.height - radius);
            ctx.lineTo(node.x, node.y + radius);
            ctx.quadraticCurveTo(node.x, node.y, node.x + radius, node.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.font = '16px Arial';
            ctx.fillText(node.label, node.x + 8, node.y + 30);

            ctx.fillStyle = '#ccc';
            ctx.font = '12px Arial';
            ctx.fillText(modeText, node.x + 8, node.y + 48);
        }

        /**
         * 绘制单个 Agent 节点
         * - 节点上方：角色名称框 (roleRect)，显示完整角色名，白色文字，深色背景
         * - 第一行：显示名称
         * - 第二行：键名
         * - 第三行：彩色标记 + order 数字（仅数字，无前缀）
         */
        _drawAgent(ctx, key, agent, x, y, alpha = 1.0) {

            const isSelected = this.selectedAgentKey === key;
            const isHighlighted = this.highlightedAgents.has(key) && !isSelected;
            const isDragging = this.draggingAgentKey === key;

            ctx.save();
            if (alpha < 1.0) ctx.globalAlpha = alpha;

            const agentWidth = this._getAgentWidth(agent);
            const agentHeight = this.agentNodeHeight;

            // 绘制节点背景
            ctx.fillStyle = isDragging ? '#3a3a5a' : (isSelected ? '#3a3a5a' : (isHighlighted ? '#5a3a3a' : '#2a2a3a'));
            ctx.strokeStyle = isSelected ? '#667eea' : (isHighlighted ? '#ffaa00' : '#4a4a6a');
            ctx.lineWidth = isSelected ? 3 : (isHighlighted ? 2 : 1);
            ctx.fillRect(x, y, agentWidth, agentHeight);
            ctx.strokeRect(x, y, agentWidth, agentHeight);

            // 第一行：显示名称
            ctx.fillStyle = '#fff';
            ctx.font = '14px Arial';
            const displayName = agent.displayName || key;
            const shortName = displayName.length > 12 ? displayName.substring(0, 12) + '…' : displayName;
            ctx.fillText(shortName, x + 6, y + 24);

            // 第二行：键名
            ctx.fillStyle = '#aaa';
            ctx.font = '14px monospace';
            ctx.fillText(key, x + 6, y + 40);

            // ========== 节点上方：角色名称框 ==========
            // 使用新变量名：roleRectHeight, roleTopMargin（需在构造函数中定义，或直接使用默认值）
            const roleRectHeight = this.roleRectHeight || 24;   // 角色框高度
            const roleTopMargin = this.roleTopMargin || 6;      // 角色框与节点顶部的间距
            const roleRectY = y - roleRectHeight - roleTopMargin;
            const roleRectX = x;

            // 绘制背景框（与原先 order 框样式一致）
            ctx.fillStyle = '#4a4a6a';
            ctx.fillRect(roleRectX, roleRectY, agentWidth, roleRectHeight);
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 1;
            ctx.strokeRect(roleRectX, roleRectY, agentWidth, roleRectHeight);

            // 绘制角色名称（完整名称，居中显示）
            ctx.fillStyle = '#fff';
            ctx.font = '14px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const roleText = agent.role || '无角色';
            ctx.fillText(roleText, roleRectX + agentWidth / 2, roleRectY + roleRectHeight / 2);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';

            // ========== 第三行：彩色标记 + order 数字 ==========
            const markerY = y + 56;
            ctx.font = '12px monospace';
            ctx.textBaseline = 'middle';
            let cursorX = x + 6;

            // 标记颜色映射
            const colorMap = {
                'U': '#4ecdc4', // 用户输入
                'A': '#9b59b6', // 自动提取
                'F': '#f39c12', // 文件操作
                'I': '#e74c3c', // 交互代理
                'L': '#2ecc71', // last 后缀
                'R': '#e67e22', // raw 后缀
                'B': '#3498db'  // before 源
            };

            // 收集标记
            const markers = [];
            if (agent.inputs?.includes('user')) markers.push('U');
            if (agent.inputs?.includes('auto')) markers.push('A');
            if (agent.inputs?.some(src => typeof src === 'string' && (src.startsWith('read.') || src.startsWith('save.')))) markers.push('F');
            if (agent.role === 'interactiveAgent') markers.push('I');
            if (agent.inputs?.some(src => typeof src === 'string' && src.endsWith('.last'))) markers.push('L');
            if (agent.inputs?.some(src => typeof src === 'string' && src.endsWith('.raw'))) markers.push('R');
            if (agent.inputs?.some(src => src === 'before')) markers.push('B');

            // 绘制标记
            for (let i = 0; i < markers.length; i++) {
                const ch = markers[i];
                ctx.fillStyle = colorMap[ch] || '#ccc';
                ctx.fillText(ch, cursorX, markerY);
                cursorX += ctx.measureText(ch).width;
                if (i < markers.length - 1) cursorX += ctx.measureText(' ').width;
            }

            // 如果存在标记，在标记后添加两个空格再显示 order 数字
            if (markers.length > 0) {
                cursorX += ctx.measureText('  ').width;
            }

            // 绘制 order 数字（仅数字，无前缀）
            if (agent.order !== undefined) {
                ctx.fillStyle = '#aaa';
                ctx.fillText(String(agent.order), cursorX, markerY);
            }
            ctx.textBaseline = 'alphabetic';

            ctx.restore();
        }

        /**
         * 根据 Agent 的显示名称计算框的宽度（世界坐标系）
         * @param {object} agent - Agent 配置对象
         * @returns {number} 宽度
         */
        _getAgentWidth(agent) {

            const displayName = agent.displayName || agent.key;
            // 测量完整文本的宽度（使用与绘制一致的字体）
            this.measureCtx.font = '14px Arial'; // 原为 '10px Arial'
            const textWidth = this.measureCtx.measureText(displayName).width;
            const minWidth = 100;                 // 原为 80
            const maxWidth = 250;                 // 原为 200
            // 左右内边距从 12 增加到 16
            const width = Math.min(maxWidth, Math.max(minWidth, textWidth + 16));

            return width;
        }

        // ---------- 属性面板更新 ----------
        _renderPropertyPanel(selected) {
            if (this.selectedAgentKey) {

                this._renderAgentPropertiesInPanel(this.selectedAgentKey, this.selectedAgentStageNode);
                return;
            }

            if (this.selectedGlobal) {

                this._renderGlobalProperties();
                return;
            }

            this.propertyPanel.innerHTML = '';

            if (this.validationErrors.length > 0) {

                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = 'background:#2a1a1a; border:1px solid #dc3545; border-radius:4px; padding:8px; margin-bottom:10px;';
                errorDiv.innerHTML = `<div class="nc-color--error-title-bold">❌ 配置错误</div>`;
                const list = document.createElement('ul');
                list.style.cssText = 'margin:0; padding-left:20px; color:#ffa0a0; font-size:11px;';
                this.validationErrors.forEach(err => {
                    const li = document.createElement('li');
                    li.textContent = err;
                    list.appendChild(li);
                });
                errorDiv.appendChild(list);
                this.propertyPanel.appendChild(errorDiv);
            }

            if (selected === null) {

                this._renderGlobalProperties();
                return;
            }

            if (selected.type === 'stage') {

                this._renderStageProperties(selected);
            } else if (selected.type === 'edge') {

                this._renderEdgeProperties(selected);
            } else if (this.selectedApiId) {

                this._renderApiProperties(this.selectedApiId);
            } else if (this.selectedCategoryId) {

                this._renderCategoryProperties(this.selectedCategoryId);
            } else if (this.selectedGroupIndex !== null) {

                this._renderGroupProperties(this.selectedGroupIndex);
            } else {

                const div = document.createElement('div');
                div.style.cssText = 'color:#aaa; text-align:center; padding:20px;';
                div.textContent = '选择一个阶段节点、API、分类或组查看属性';
                this.propertyPanel.appendChild(div);
            }
        }

        /**
         * 渲染阶段属性面板（修复阶段名称更新问题）
         * @param {Object} node - 阶段节点对象
         */
        _renderStageProperties(node) {

            const stageData = node.stageData || {};
            const panel = this.propertyPanel;
            panel.innerHTML = '';

            this._showValidationErrors();

            const container = document.createElement('div');
            container.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

            // 基础信息卡片
            const basicCard = document.createElement('div');
            basicCard.className = 'property-section';
            basicCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            basicCard.innerHTML = `
        <div class="property-title nc-prop-title--sm">📌 阶段信息</div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--sm">阶段序号</label>
            <input type="number" id="stage-number" class="field-input nc-field-input--sm" value="${stageData.stage || 1}" min="1" step="1">
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--sm">阶段ID (唯一标识)</label>
            <input type="text" id="stage-id" class="field-input nc-field-input--sm" value="${this._escapeHtml(stageData.id || '')}">
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--sm">阶段名称</label>
            <input type="text" id="stage-name" class="field-input nc-field-input--sm" value="${this._escapeHtml(stageData.name || '')}">
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--sm">颜色</label>
            <input type="color" id="stage-color" class="field-input nc-field-input--color" value="${node.color || '#667eea'}">
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--sm">执行模式</label>
            <div class="nc-flex--row-20">
                <label class="checkbox-label nc-checkbox-label--sm">
                    <input type="radio" name="stage-mode" value="serial" ${stageData.mode !== 'parallel' ? 'checked' : ''} class="nc-radio--purple"> 串行
                </label>
                <label class="checkbox-label nc-checkbox-label--sm">
                    <input type="radio" name="stage-mode" value="parallel" ${stageData.mode === 'parallel' ? 'checked' : ''} class="nc-radio--purple"> 并行
                </label>
            </div>
        </div>
    `;
            container.appendChild(basicCard);

            // 描述卡片
            const descCard = document.createElement('div');
            descCard.className = 'property-section';
            descCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            descCard.innerHTML = `
        <div class="property-title nc-prop-title--sm">📝 描述</div>
        <div class="field-group">
            <textarea id="stage-description" class="field-textarea nc-field-input--sm-mono" rows="3" placeholder="阶段描述">${this._escapeHtml(stageData.description || '')}</textarea>
        </div>
    `;
            container.appendChild(descCard);

            // 操作卡片
            const actionCard = document.createElement('div');
            actionCard.className = 'property-section';
            actionCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            actionCard.innerHTML = `
        <div class="property-title nc-prop-title--sm">⚙️ 操作</div>
        <div class="nc-flex--row-8-wrap">
            <button id="add-stage-before" class="btn-add nc-cfgedit-btn--stage-insert">⬆️ 在前面添加</button>
            <button id="add-stage-after" class="btn-add nc-cfgedit-btn--stage-insert">⬇️ 在后面添加</button>
            <button id="delete-stage" class="btn-add nc-cfgedit-btn--stage-delete">🗑️ 删除阶段</button>
        </div>
        <div class="nc-mt12">
            <button id="manage-agents" class="btn-add nc-cfgedit-btn--add-full">🤖 管理Agent</button>
        </div>
    `;
            container.appendChild(actionCard);

            panel.appendChild(container);

            const updateField = (field, value) => {

                stageData[field] = value;
                if (field === 'color') node.color = value;
                if (field === 'name') node.label = value; // 同步节点标签
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                this._requestRender();
            };

            panel.querySelector('#stage-number')?.addEventListener('input', e => {
                const newStage = parseInt(e.target.value);
                if (!isNaN(newStage) && newStage > 0) {
                    stageData.stage = newStage;
                    if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    this._requestRender();
                }
            });

            panel.querySelector('#stage-id').addEventListener('input', e => {
                const newId = e.target.value.trim();
                if (!newId) {
                    Notify.error('阶段ID不能为空');
                    e.target.value = stageData.id;
                    return;
                }
                const exists = this.config.workflowStages.some(s => s.id === newId && s !== stageData);
                if (exists) {
                    Notify.error(`阶段ID ${newId} 已存在`);
                    e.target.value = stageData.id;
                    return;
                }
                const oldId = stageData.id;
                stageData.id = newId;
                node.key = newId;
                const oldNodeId = node.id;
                node.id = `stage-${newId}`;
                this.edges.forEach(edge => {
                    if (edge.source === oldNodeId) edge.source = node.id;
                    if (edge.target === oldNodeId) edge.target = node.id;
                });
                Object.values(this.config.agents).forEach(agent => {
                    if (agent.stage === oldId) agent.stage = newId;
                });
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                this._requestRender();
            });

            panel.querySelector('#stage-name').addEventListener('input', e => updateField('name', e.target.value));
            panel.querySelector('#stage-color').addEventListener('input', e => updateField('color', e.target.value));
            panel.querySelectorAll('input[name="stage-mode"]').forEach(radio => {
                radio.addEventListener('change', e => {
                    if (e.target.checked) updateField('mode', e.target.value);
                });
            });
            panel.querySelector('#stage-description').addEventListener('input', e => updateField('description', e.target.value));
            panel.querySelector('#manage-agents').addEventListener('click', () => this._openAgentManager(node));
            panel.querySelector('#add-stage-before').addEventListener('click', () => this._insertStage(node, 'before'));
            panel.querySelector('#add-stage-after').addEventListener('click', () => this._insertStage(node, 'after'));
            panel.querySelector('#delete-stage').addEventListener('click', async () => {
                const confirmed = await UI.showConfirmModal(`确定删除阶段 ${node.label} 吗？`, '确认删除');
                if (!confirmed) return;
                const stageIdx = this.config.workflowStages.findIndex(s => s.id === node.key);
                if (stageIdx !== -1) {
                    const stage = this.config.workflowStages[stageIdx];
                    stage.agents.forEach(agentKey => {
                        if (this.config.agents[agentKey]) this.config.agents[agentKey].stage = '';
                    });
                    this.config.workflowStages.splice(stageIdx, 1);
                }
                this.nodes = this.nodes.filter(n => n.id !== node.id);
                this.selectedNode = null;
                this._reorderStagesByPosition();
                this._renderPropertyPanel(null);
                this._requestRender();
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
            });
        }

        _renderEdgeProperties(edge) {
            const container = document.createElement('div');
            container.innerHTML = `
            <h3 class="nc-heading--primary-h3">连线属性</h3>
            <div class="nc-mb8">
                <label class="nc-label--muted">类型</label>
                <select id="edge-type" class="nc-field-select--edge">
                    <option value="normal" ${edge.type === 'normal' ? 'selected' : ''}>普通</option>
                    <option value="parallel" ${edge.type === 'parallel' ? 'selected' : ''}>并行</option>
                </select>
            </div>
            <button id="delete-edge" class="nc-gal-btn--delete-edge">删除连线</button>
        `;
            this.propertyPanel.appendChild(container);

            container.querySelector('#edge-type').addEventListener('change', e => {
                edge.type = e.target.value;
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                this._requestRender();
            });
            container.querySelector('#delete-edge').addEventListener('click', () => {
                Notify.warning('阶段线由顺序自动生成，无法手动删除');
            });
        }

        _renderApiProperties(apiId) {

            const api = this.config.apiConfigs[apiId];
            if (!api) {
                console.error(`[ConfigEditor._renderApiProperties] API ${apiId} 不存在`);
                return;
            }

            const panel = this.propertyPanel;
            panel.innerHTML = '';

            this._showValidationErrors();

            const container = document.createElement('div');
            container.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

            // ----- 基础信息卡片 -----
            const basicCard = document.createElement('div');
            basicCard.className = 'property-section';
            basicCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            basicCard.innerHTML = `
                <div class="property-title nc-prop-title--lg">
                    🔌 API 配置: ${this._escapeHtml(apiId)}
                </div>
                <div class="field-group nc-mb16">
                    <label class="field-label nc-field-label--md">类型</label>
                    <select id="api-type" class="field-select nc-field-input--md">
                        <option value="text" ${api.type === 'text' ? 'selected' : ''}>text</option>
                        <option value="image" ${api.type === 'image' ? 'selected' : ''}>image</option>
                        <option value="audio" ${api.type === 'audio' ? 'selected' : ''}>audio</option>
                    </select>
                </div>
                <!-- 模式选择，紧接类型下方 -->
                <div class="field-group nc-mb16" id="api-mode-group">
                    <label class="field-label nc-field-label--md">模式 (mode)</label>
                    <select id="api-mode" class="field-select nc-field-input--md"></select>
                </div>
                <div class="field-group nc-mb16">
                    <label class="field-label nc-field-label--md">平台 (source)</label>
                    <select id="api-source" class="field-select nc-field-input--md"></select>
                </div>
                <div class="field-group nc-mb16">
                    <label class="field-label nc-field-label--md">API URL</label>
                    <input type="text" id="api-url" class="field-input nc-field-input--md" value="${api.apiUrl || ''}">
                </div>
                <div class="field-group nc-mb16">
                    <label class="field-label nc-field-label--md">密钥 (key)</label>
                    <input type="password" id="api-key" class="field-input nc-field-input--md" value="${api.key || ''}">
                </div>
                <div class="field-group nc-mb16">
                    <label class="field-label nc-field-label--md">超时 (ms)</label>
                    <input type="number" id="api-timeout" class="field-input nc-field-input--md" value="${api.timeout || 3600000}" min="1000" step="1000">
                </div>
                <div class="field-group nc-mb16">
                    <div class="nc-flex-item--grow">
                        <label class="field-label nc-field-label--md">模型 (model)</label>
                        <div class="nc-flex--row-8">
                            <input type="text" id="api-model" class="field-input nc-field-input--md-flex" value="${api.model || ''}" placeholder="模型名称">
                            <button id="fetch-models-btn" class="btn-add nc-cfgedit-btn--fetch-model">🔄 获取模型</button>
                        </div>
                    </div>
                </div>
                <div id="model-select-container" class="nc-hidden--model-select">
                    <select id="model-select" class="field-select nc-field-input--md">
                        <option value="">选择模型</option>
                    </select>
                    <div class="nc-mt4--right">
                        <span id="back-to-manual" class="nc-color--primary-link-sm">返回手动输入</span>
                    </div>
                </div>
                <div id="model-tip" class="nc-text--model-tip"></div>
            `;
            container.appendChild(basicCard);

            // ----- 类型特有字段容器 -----
            const extraFieldsContainer = document.createElement('div');
            extraFieldsContainer.id = 'api-extra-fields';
            extraFieldsContainer.className = 'property-section';
            extraFieldsContainer.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            container.appendChild(extraFieldsContainer);

            // ----- 测试按钮区域 -----
            const testDiv = document.createElement('div');
            testDiv.className = 'property-section';
            testDiv.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            testDiv.innerHTML = `
                <button id="test-api" class="btn-add nc-cfgedit-btn--test-api">测试连通性</button>
                <div id="test-result" class="nc-mt8--test-result"></div>
            `;
            container.appendChild(testDiv);

            panel.appendChild(container);

            // ==================== 辅助函数 ====================
            const updateField = (field, value) => {
                this.config.apiConfigs[apiId][field] = value;
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
            };

            // 定义模式到平台的映射（根据现有平台支持情况）- 已移除 custom
            const modeSourceMap = {
                'text': {
                    'txt-txt': ['openai', 'claude', 'gemini', 'deepseek', 'wenxin', 'qwen', 'glm', 'mistral', 'siliconflow', 'huggingface', 'groq', 'inference', 'openrouter', '4sapi', 'doubao', 'other']
                },
                'image': {
                    'txt2img': ['openai', 'stability', 'midjourney', 'sora', 'flux', 'picsart', 'siliconflow', 'sdwebui', 'other'],
                    'img2img': ['openai', 'stability', 'midjourney', 'flux', 'sdwebui', 'other'],
                    'fusion': ['sdwebui', 'stability', 'flux', 'other']
                },
                'audio': {
                    'music-generation': ['elevenlabs', 'stableaudio', 'huggingface', 'openai-tts', 'azure-tts', 'google-tts', 'minimax', 'minimax-music', 'mureka', 'mubert', 'aiva', 'wondera', 'riffusion', 'audiocraft', 'edge-tts', 'other'],
                    'voice-cloning': ['elevenlabs', 'azure-tts', 'google-tts', 'minimax', 'minimax-speech', 'edge-tts', 'other'],
                    'audio-editing': ['stableaudio', 'lalal', 'other']
                }
            };

            // 根据类型和模式获取平台列表
            const getSourcesForMode = (type, mode) => {
                if (!mode) {
                    // 如果模式为空，返回类型对应的所有平台（降级）- 已移除 custom
                    const allByType = {
                        text: ['openai', 'claude', 'gemini', 'deepseek', 'wenxin', 'qwen', 'glm', 'mistral', 'siliconflow', 'huggingface', 'groq', 'inference', 'openrouter', '4sapi', 'doubao', 'other'],
                        image: ['openai', 'stability', 'midjourney', 'sora', 'flux', 'picsart', 'siliconflow', 'sdwebui', 'other'],
                        audio: ['elevenlabs', 'stableaudio', 'huggingface', 'openai-tts', 'azure-tts', 'google-tts', 'minimax', 'minimax-music', 'minimax-speech', 'mureka', 'mubert', 'aiva', 'wondera', 'riffusion', 'audiocraft', 'edge-tts', 'lalal', 'other']
                    };
                    return allByType[type] || [];
                }
                return modeSourceMap[type]?.[mode] || modeSourceMap[type]?.[Object.keys(modeSourceMap[type] || {})[0]] || [];
            };

            // 更新模式下拉框选项
            const updateModeOptions = (type) => {
                const modeSelect = panel.querySelector('#api-mode');
                if (!modeSelect) return;

                let modeOptions = [];
                if (type === 'text') {
                    modeOptions = ['txt-txt'];
                } else if (type === 'image') {
                    modeOptions = ['txt2img', 'img2img', 'fusion'];
                } else if (type === 'audio') {
                    modeOptions = ['music-generation', 'voice-cloning', 'audio-editing'];
                } else {
                    modeOptions = [];
                }

                let currentMode = api.mode;
                if (!currentMode || !modeOptions.includes(currentMode)) {
                    currentMode = modeOptions[0] || '';
                }

                modeSelect.innerHTML = modeOptions.map(m => `<option value="${m}" ${currentMode === m ? 'selected' : ''}>${m}</option>`).join('');
                // 如果当前 API 的 mode 与下拉框选中不一致，更新配置
                if (api.mode !== currentMode) {
                    updateField('mode', currentMode);
                }
            };

            // 更新平台下拉框选项（关键修改点）
            const updateSourceOptions = (type, mode) => {
                const sourceSelect = panel.querySelector('#api-source');
                if (!sourceSelect) return;

                const sources = getSourcesForMode(type, mode);
                const currentSource = api.source;
                let newSource = sources.includes(currentSource) ? currentSource : (sources[0] || '');


                sourceSelect.innerHTML = sources.map(s => `<option value="${s}" ${newSource === s ? 'selected' : ''}>${s}</option>`).join('');

                if (api.source !== newSource) {

                    updateField('source', newSource);
                }

                // ===== 关键修复：始终根据新平台设置默认 URL（即使原 URL 非空）=====
                const urlInput = panel.querySelector('#api-url');
                if (urlInput) {
                    const defaultUrl = defaultApiUrls[newSource];

                    if (defaultUrl) {
                        // 始终将 URL 设置为默认值（覆盖原值）

                        urlInput.value = defaultUrl;
                        updateField('apiUrl', defaultUrl);
                    } else {

                    }
                } else {
                    console.warn('[updateSourceOptions] urlInput 未找到');
                }

                // 主动触发 source 的 change 事件，确保后续处理（如重新渲染额外字段）执行
                sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
            };

            // 默认 API URL 映射 - 已移除 custom
            const defaultApiUrls = {
                // 文本平台
                'openai': 'https://api.openai.com/v1',
                'gemini': 'https://generativelanguage.googleapis.com',
                'claude': 'https://api.anthropic.com/v1',
                'deepseek': 'https://api.deepseek.com/v1',
                'siliconflow': 'https://api.siliconflow.cn/v1',
                'qwen': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                'doubao': 'https://ark.cn-beijing.volces.com/api/v3',
                'wenxin': 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions',
                'glm': 'https://open.bigmodel.cn/api/paas/v4',
                'mistral': 'https://api.mistral.ai/v1',
                'huggingface': 'https://api-inference.huggingface.co',
                'groq': 'https://api.groq.com/openai/v1',
                'inference': 'https://api.inference.net/v1',
                'openrouter': 'https://openrouter.ai/api/v1',
                '4sapi': 'https://api.4sapi.com/v1',
                'doubao': 'https://ark.cn-beijing.volces.com/api/v3',
                'other': '',
                // 图像平台
                'stability': 'https://api.stability.ai/v2beta',
                'midjourney': 'https://api.midjourney.com/v1',
                'sora': 'https://api.sora.com/v1',
                'flux': 'https://api.flux.ai/v1',
                'picsart': 'https://api.picsart.io/v1',
                'sdwebui': 'http://127.0.0.1:7860',
                // 音频平台
                'elevenlabs': 'https://api.elevenlabs.io/v1',
                'stableaudio': 'https://api.stableaudio.com/v1beta',
                'openai-tts': 'https://api.openai.com/v1',
                'azure-tts': 'https://YOUR_REGION.tts.speech.microsoft.com/cognitiveservices',
                'google-tts': 'https://texttospeech.googleapis.com/v1',
                'minimax': 'https://api.minimax.io/v1',
                'minimax-music': 'https://api.minimax.io/v1',
                'minimax-speech': 'https://api.minimax.io/v1',
                'mureka': 'https://api.mureka.ai/v1',
                'mubert': 'https://api.mubert.com/v2',
                'aiva': 'https://api.aiva.ai/v1',
                'wondera': 'https://api.wondera.com/v1',
                'riffusion': 'https://api.riffusion.com/v1',
                'audiocraft': 'https://api.replicate.com/v1',
                'edge-tts': 'https://speech.platform.bing.com',
                'lalal': 'https://api.lalal.ai/v1',
            };

            // 获取 DOM 元素
            const typeSelect = basicCard.querySelector('#api-type');
            const modeSelect = basicCard.querySelector('#api-mode');
            const sourceSelect = basicCard.querySelector('#api-source');
            const urlInput = basicCard.querySelector('#api-url');
            const keyInput = basicCard.querySelector('#api-key');
            const timeoutInput = basicCard.querySelector('#api-timeout');
            const modelInput = basicCard.querySelector('#api-model');
            const fetchBtn = basicCard.querySelector('#fetch-models-btn');
            const modelSelectContainer = basicCard.querySelector('#model-select-container');
            const modelSelect = basicCard.querySelector('#model-select');
            const backToManual = basicCard.querySelector('#back-to-manual');
            const modelTip = basicCard.querySelector('#model-tip');

            // 初始化模式下拉框
            updateModeOptions(api.type);

            // 初始化平台下拉框（基于当前类型和模式）
            updateSourceOptions(api.type, api.mode);

            // ---------- 获取模型列表按钮逻辑 ----------
            fetchBtn.addEventListener('click', async () => {
                const currentConfig = {
                    type: typeSelect.value,
                    source: sourceSelect.value,
                    apiUrl: urlInput.value,
                    key: keyInput.value,
                };


                if (!currentConfig.apiUrl || !currentConfig.key) {
                    Notify.error('请先填写 API URL 和密钥');
                    return;
                }

                fetchBtn.disabled = true;
                fetchBtn.textContent = '获取中...';
                modelTip.textContent = '';

                try {
                    const models = await fetchModelList(currentConfig);
                    if (models && models.length > 0) {
                        modelSelect.innerHTML = '<option value="">选择模型</option>' +
                            models.map(m => `<option value="${m.id}">${m.id}${m.description ? ' - ' + m.description : ''}</option>`).join('');
                        modelSelectContainer.style.display = 'block';
                        modelInput.style.display = 'none';


                        if (modelInput.value) {
                            const option = Array.from(modelSelect.options).find(opt => opt.value === modelInput.value);
                            if (option) option.selected = true;
                        }
                        Notify.success(`获取到 ${models.length} 个模型`);
                    } else {
                        modelTip.textContent = '未获取到模型列表，请手动输入';
                    }
                } catch (err) {
                    console.error('[获取模型] 失败:', err);
                    modelTip.textContent = `❌ ${err.message}`;
                } finally {
                    fetchBtn.disabled = false;
                    fetchBtn.textContent = '🔄 获取模型';
                }
            });

            modelSelect.addEventListener('change', () => {
                if (modelSelect.value) {
                    modelInput.value = modelSelect.value;
                    updateField('model', modelSelect.value);

                }
            });

            backToManual.addEventListener('click', () => {
                modelSelectContainer.style.display = 'none';
                modelInput.style.display = 'block';

            });

            modelInput.addEventListener('input', () => {
                updateField('model', modelInput.value);
            });

            // ---------- 绑定基础字段事件 ----------
            // 类型改变
            typeSelect.addEventListener('change', e => {
                const newType = e.target.value;
                const oldType = api.type;

                if (newType === 'image' && oldType !== 'image') {
                    const hasOtherImage = Object.values(this.config.apiConfigs || {}).some(cfg => cfg.type === 'image' && cfg !== api);
                    if (hasOtherImage) {
                        Notify.error('已存在图像配置，无法添加第二个图像配置');
                        typeSelect.value = oldType;
                        return;
                    }
                }
                updateField('type', newType);

                // 更新模式下拉框
                updateModeOptions(newType);
                const newMode = modeSelect.value;
                updateField('mode', newMode);

                // 更新平台下拉框
                updateSourceOptions(newType, newMode);

                // 重新渲染额外字段
                renderExtraFields();
            });

            // 模式改变
            modeSelect.addEventListener('change', e => {
                const newMode = e.target.value;
                const currentType = typeSelect.value;

                updateField('mode', newMode);

                // 更新平台下拉框（自动触发 source 的 change 事件）
                updateSourceOptions(currentType, newMode);

                // 重新渲染额外字段（由于上面 updateSourceOptions 会触发 source change，此句可省略，但保留无害）
                renderExtraFields();
            });

            // 平台改变
            sourceSelect.addEventListener('change', e => {
                const newSource = e.target.value;

                updateField('source', newSource);
                // 自动填充默认 URL（已在 updateSourceOptions 中强制设置，此处可省略，但保留以防 updateSourceOptions 未触发）
                if (urlInput && defaultApiUrls[newSource]) {

                    urlInput.value = defaultApiUrls[newSource];
                    updateField('apiUrl', defaultApiUrls[newSource]);
                }
                // 重新渲染额外字段（可能影响一些平台特有的参数）
                renderExtraFields();
            });

            // URL 和密钥输入事件
            urlInput.addEventListener('input', e => updateField('apiUrl', e.target.value));
            keyInput.addEventListener('input', e => updateField('key', e.target.value));
            timeoutInput?.addEventListener('input', e => updateField('timeout', parseInt(e.target.value) || 3600000));

            // ---------- 渲染额外字段（根据类型和模式）----------
            const renderExtraFields = () => {
                const extraContainer = panel.querySelector('#api-extra-fields');
                const currentType = typeSelect.value;
                const currentSource = sourceSelect.value;
                const currentMode = modeSelect.value;

                let extraHTML = '';

                if (currentType === 'image') {
                    // 图像特有参数，不再包含 mode
                    const samplers = ['DPM++ 2M Karras', 'DPM++ SDE Karras', 'DPM++ 2M SDE', 'Euler a', 'Euler', 'LMS', 'Heun', 'DPM2', 'DPM2 a', 'DPM++ 2S a', 'DPM++ 2M SDE Karras', 'DPM++ 2M SDE Exponential', 'DPM++ 3M SDE', 'DPM++ 3M SDE Karras', 'DPM++ 3M SDE Exponential'];
                    extraHTML = `
                        <div class="property-title nc-prop-title--lg">🖼️ 图像参数</div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">尺寸 (size)</label>
                            <input type="text" id="api-size" class="field-input nc-field-input--md" value="${api.size || '1024x1024'}" placeholder="如 1024x1024">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">采样步数 (steps)</label>
                            <input type="number" id="api-steps" class="field-input nc-field-input--md" value="${api.steps || 20}" min="1" max="150">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">CFG Scale</label>
                            <input type="number" step="0.5" id="api-cfg-scale" class="field-input nc-field-input--md" value="${api.cfg_scale || 7}" min="1" max="30">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">反向提示词</label>
                            <input type="text" id="api-negative-prompt" class="field-input nc-field-input--md" value="${api.negative_prompt || ''}" placeholder="反向提示词">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">采样器 (sampler_name)</label>
                            <select id="api-sampler-name" class="field-select nc-field-input--md">
                                ${samplers.map(s => `<option value="${s}" ${api.sampler_name === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">种子 (seed)</label>
                            <input type="number" id="api-seed" class="field-input nc-field-input--md" value="${api.seed !== undefined ? api.seed : -1}">
                            <div class="nc-text--sm-muted">-1 表示随机</div>
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">批次大小 (batch_size)</label>
                            <input type="number" id="api-batch-size" class="field-input nc-field-input--md" value="${api.batch_size || 1}" min="1">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">生成数量 (n / samples)</label>
                            <input type="number" id="api-samples" class="field-input nc-field-input--md" value="${api.samples || 1}" min="1">
                        </div>
                        <div class="checkbox-group nc-flex--checkbox-group">
                            <label class="checkbox-label nc-checkbox-label--md">
                                <input type="checkbox" id="api-restore-faces" ${api.restore_faces ? 'checked' : ''} class="nc-checkbox--purple-md"> 面部修复
                            </label>
                            <label class="checkbox-label nc-checkbox-label--md">
                                <input type="checkbox" id="api-tiling" ${api.tiling ? 'checked' : ''} class="nc-checkbox--purple-md"> 平铺
                            </label>
                        </div>
                    `;
                } else if (currentType === 'audio') {
                    // 音频特有参数，不再包含 mode
                    extraHTML = `
                        <div class="property-title nc-prop-title--lg">🎵 音频参数</div>
                    `;
                    if (currentSource === 'elevenlabs') {
                        extraHTML += `
                            <div class="field-group nc-mb16">
                                <label class="field-label">Voice ID (可选)</label>
                                <input type="text" id="api-voiceId" class="field-input nc-field-input--md" value="${api.voiceId || ''}">
                            </div>
                            <div class="field-group nc-mb16">
                                <label class="field-label">Stability (0-1)</label>
                                <input type="number" step="0.05" id="api-stability" class="field-input nc-field-input--md" value="${api.stability || 0.5}" min="0" max="1">
                            </div>
                            <div class="field-group nc-mb16">
                                <label class="field-label">Similarity Boost (0-1)</label>
                                <input type="number" step="0.05" id="api-similarity" class="field-input nc-field-input--md" value="${api.similarity_boost || 0.75}" min="0" max="1">
                            </div>
                        `;
                    } else if (currentSource === 'stableaudio') {
                        extraHTML += `
                            <div class="field-group nc-mb16">
                                <label class="field-label">时长 (秒)</label>
                                <input type="number" id="api-duration" class="field-input nc-field-input--md" value="${api.duration || 30}" min="1" max="300">
                            </div>
                            <div class="field-group nc-mb16">
                                <label class="field-label">输出格式</label>
                                <select id="api-output-format" class="field-select nc-field-input--md">
                                    <option value="mp3" ${api.output_format === 'mp3' ? 'selected' : ''}>mp3</option>
                                    <option value="wav" ${api.output_format === 'wav' ? 'selected' : ''}>wav</option>
                                </select>
                            </div>
                        `;
                    } else if (currentSource === 'azure-tts') {
                        extraHTML += `
                            <div class="field-group nc-mb16">
                                <label class="field-label">区域 (region)</label>
                                <input type="text" id="api-region" class="field-input nc-field-input--md" value="${api.region || 'eastus'}">
                            </div>
                        `;
                    } else if (currentSource === 'huggingface') {
                        extraHTML += `
                            <div class="field-group nc-mb16">
                                <label class="field-label">模型 (model)</label>
                                <input type="text" id="api-hf-model" class="field-input nc-field-input--md" value="${api.model || ''}" placeholder="如 facebook/musicgen-small">
                            </div>
                        `;
                    } else if (currentSource === 'minimax' || currentSource === 'minimax-music' || currentSource === 'minimax-speech') {
                        extraHTML += `
                            <div class="field-group nc-mb16">
                                <label class="field-label">Group ID (必填)</label>
                                <input type="text" id="api-group-id" class="field-input nc-field-input--md" value="${api.group_id || ''}" placeholder="MiniMax Group ID">
                                <div class="nc-text--sm-muted">从 MiniMax 控制台获取</div>
                            </div>
                        `;
                    } else if (currentSource === 'mubert') {
                        extraHTML += `
                            <div class="field-group nc-mb16">
                                <label class="field-label">Customer ID (可选)</label>
                                <input type="text" id="api-customer-id" class="field-input nc-field-input--md" value="${api.customer_id || ''}" placeholder="Mubert Customer ID">
                            </div>
                        `;
                    } else if (currentSource === 'edge-tts') {
                        extraHTML += `
                            <div class="field-group nc-mb16">
                                <label class="field-label">代理 URL (可选)</label>
                                <input type="text" id="api-proxy-url" class="field-input nc-field-input--md" value="${api.proxy_url || ''}" placeholder="Edge TTS 代理地址">
                                <div class="nc-text--sm-muted">若不填则使用默认公共端点</div>
                            </div>
                        `;
                    }
                } else if (currentType === 'text') {
                    extraHTML = `
                        <div class="property-title nc-prop-title--lg">📝 文本参数</div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">max_tokens</label>
                            <input type="number" id="api-max-tokens" class="field-input nc-field-input--md" value="${api.maxTokens || 4000}" min="1" step="1">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">temperature</label>
                            <input type="number" step="0.1" id="api-temperature" class="field-input nc-field-input--md" value="${api.temperature || 0.8}" min="0" max="2">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">top_p</label>
                            <input type="number" step="0.05" id="api-top-p" class="field-input nc-field-input--md" value="${api.top_p || 1}" min="0" max="1">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">top_k</label>
                            <input type="number" id="api-top-k" class="field-input nc-field-input--md" value="${api.top_k || 0}" min="0">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">frequency_penalty</label>
                            <input type="number" step="0.1" id="api-frequency-penalty" class="field-input nc-field-input--md" value="${api.frequency_penalty || 0}" min="-2" max="2">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">presence_penalty</label>
                            <input type="number" step="0.1" id="api-presence-penalty" class="field-input nc-field-input--md" value="${api.presence_penalty || 0}" min="-2" max="2">
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">停止序列 (stop)</label>
                            <textarea id="api-stop" class="field-textarea nc-field-input--md-mono" rows="3" placeholder="每行一个停止词">${Array.isArray(api.stop) ? api.stop.join('\n') : (api.stop || '')}</textarea>
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">logit_bias (token_id:bias)</label>
                            <textarea id="api-logit-bias" class="field-textarea nc-field-input--md-mono" rows="3" placeholder="每行一个，如 123: -100">${api.logit_bias ? Object.entries(api.logit_bias).map(([k, v]) => `${k}: ${v}`).join('\n') : ''}</textarea>
                        </div>
                        <div class="checkbox-group nc-flex--checkbox-group">
                            <label class="checkbox-label nc-checkbox-label--md">
                                <input type="checkbox" id="api-stream" ${api.stream ? 'checked' : ''} class="nc-checkbox--purple-md"> 流式输出
                            </label>
                        </div>
                        <div class="field-group nc-mb16">
                            <label class="field-label">n (生成数量)</label>
                            <input type="number" id="api-n" class="field-input nc-field-input--md" value="${api.n || 1}" min="1">
                        </div>
                    `;
                }
                extraContainer.innerHTML = extraHTML;

                // 绑定额外字段的事件（原有逻辑）
                if (currentType === 'image') {
                    const sizeInput = panel.querySelector('#api-size');
                    if (sizeInput) sizeInput.addEventListener('input', e => updateField('size', e.target.value));
                    const stepsInput = panel.querySelector('#api-steps');
                    if (stepsInput) stepsInput.addEventListener('input', e => updateField('steps', parseInt(e.target.value) || 20));
                    const cfgInput = panel.querySelector('#api-cfg-scale');
                    if (cfgInput) cfgInput.addEventListener('input', e => updateField('cfg_scale', parseFloat(e.target.value) || 7));
                    const negInput = panel.querySelector('#api-negative-prompt');
                    if (negInput) negInput.addEventListener('input', e => updateField('negative_prompt', e.target.value));
                    const samplerSelect = panel.querySelector('#api-sampler-name');
                    if (samplerSelect) samplerSelect.addEventListener('change', e => updateField('sampler_name', e.target.value));
                    const seedInput = panel.querySelector('#api-seed');
                    if (seedInput) seedInput.addEventListener('input', e => updateField('seed', parseInt(e.target.value) || -1));
                    const batchSizeInput = panel.querySelector('#api-batch-size');
                    if (batchSizeInput) batchSizeInput.addEventListener('input', e => updateField('batch_size', parseInt(e.target.value) || 1));
                    const samplesInput = panel.querySelector('#api-samples');
                    if (samplesInput) samplesInput.addEventListener('input', e => updateField('samples', parseInt(e.target.value) || 1));
                    const restoreFacesCheck = panel.querySelector('#api-restore-faces');
                    if (restoreFacesCheck) restoreFacesCheck.addEventListener('change', e => updateField('restore_faces', e.target.checked));
                    const tilingCheck = panel.querySelector('#api-tiling');
                    if (tilingCheck) tilingCheck.addEventListener('change', e => updateField('tiling', e.target.checked));
                } else if (currentType === 'audio') {
                    const voiceIdInput = panel.querySelector('#api-voiceId');
                    if (voiceIdInput) voiceIdInput.addEventListener('input', e => updateField('voiceId', e.target.value));
                    const stabilityInput = panel.querySelector('#api-stability');
                    if (stabilityInput) stabilityInput.addEventListener('input', e => updateField('stability', parseFloat(e.target.value)));
                    const similarityInput = panel.querySelector('#api-similarity');
                    if (similarityInput) similarityInput.addEventListener('input', e => updateField('similarity_boost', parseFloat(e.target.value)));
                    const durationInput = panel.querySelector('#api-duration');
                    if (durationInput) durationInput.addEventListener('input', e => updateField('duration', parseInt(e.target.value) || 30));
                    const formatSelect = panel.querySelector('#api-output-format');
                    if (formatSelect) formatSelect.addEventListener('change', e => updateField('output_format', e.target.value));
                    const regionInput = panel.querySelector('#api-region');
                    if (regionInput) regionInput.addEventListener('input', e => updateField('region', e.target.value));
                    const hfModelInput = panel.querySelector('#api-hf-model');
                    if (hfModelInput) hfModelInput.addEventListener('input', e => updateField('model', e.target.value));
                    const groupIdInput = panel.querySelector('#api-group-id');
                    if (groupIdInput) groupIdInput.addEventListener('input', e => updateField('group_id', e.target.value));
                    const customerIdInput = panel.querySelector('#api-customer-id');
                    if (customerIdInput) customerIdInput.addEventListener('input', e => updateField('customer_id', e.target.value));
                    const proxyUrlInput = panel.querySelector('#api-proxy-url');
                    if (proxyUrlInput) proxyUrlInput.addEventListener('input', e => updateField('proxy_url', e.target.value));
                } else if (currentType === 'text') {
                    const maxTokensInput = panel.querySelector('#api-max-tokens');
                    if (maxTokensInput) maxTokensInput.addEventListener('input', e => updateField('maxTokens', parseInt(e.target.value) || 4000));
                    const tempInput = panel.querySelector('#api-temperature');
                    if (tempInput) tempInput.addEventListener('input', e => updateField('temperature', parseFloat(e.target.value) || 0.8));
                    const topPInput = panel.querySelector('#api-top-p');
                    if (topPInput) topPInput.addEventListener('input', e => updateField('top_p', parseFloat(e.target.value) || 1));
                    const topKInput = panel.querySelector('#api-top-k');
                    if (topKInput) topKInput.addEventListener('input', e => updateField('top_k', parseInt(e.target.value) || 0));
                    const freqInput = panel.querySelector('#api-frequency-penalty');
                    if (freqInput) freqInput.addEventListener('input', e => updateField('frequency_penalty', parseFloat(e.target.value) || 0));
                    const presInput = panel.querySelector('#api-presence-penalty');
                    if (presInput) presInput.addEventListener('input', e => updateField('presence_penalty', parseFloat(e.target.value) || 0));
                    const stopInput = panel.querySelector('#api-stop');
                    if (stopInput) stopInput.addEventListener('input', e => {
                        const lines = stopInput.value.split('\n').map(l => l.trim()).filter(l => l);
                        updateField('stop', lines.length ? lines : '');
                    });
                    const logitInput = panel.querySelector('#api-logit-bias');
                    if (logitInput) logitInput.addEventListener('input', e => {
                        const lines = logitInput.value.split('\n').map(l => l.trim()).filter(l => l);
                        const bias = {};
                        lines.forEach(line => {
                            const parts = line.split(':').map(p => p.trim());
                            if (parts.length === 2) {
                                const token = parseInt(parts[0]);
                                const value = parseInt(parts[1]);
                                if (!isNaN(token) && !isNaN(value)) {
                                    bias[token] = value;
                                }
                            }
                        });
                        updateField('logit_bias', bias);
                    });
                    const streamCheck = panel.querySelector('#api-stream');
                    if (streamCheck) streamCheck.addEventListener('change', e => updateField('stream', e.target.checked));
                    const nInput = panel.querySelector('#api-n');
                    if (nInput) nInput.addEventListener('input', e => updateField('n', parseInt(e.target.value) || 1));
                }
            };
            renderExtraFields();

            // ---------- 测试按钮 ----------
            const testBtn = panel.querySelector('#test-api');
            const testResultDiv = panel.querySelector('#test-result');
            testBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                testBtn.disabled = true;
                testBtn.textContent = '测试中...';
                testResultDiv.innerHTML = '';

                const currentConfig = {
                    type: typeSelect.value,
                    source: sourceSelect.value,
                    apiUrl: urlInput.value,
                    key: keyInput.value,
                    model: modelInput.value,
                    timeout: parseInt(timeoutInput?.value) || 3600000,
                };


                const result = await testAPIConnection(currentConfig);
                if (result.ok) {
                    testResultDiv.innerHTML = '<span class="nc-text--success">✅ 连接成功</span>';

                } else {
                    testResultDiv.innerHTML = `<span class="nc-text--danger">❌ 失败: ${result.error}</span>`;
                    console.error('[testAPI] 测试失败:', result.error);
                }
                testBtn.disabled = false;
                testBtn.textContent = '测试连通性';
            });
        }

        _renderCategoryProperties(catId) {

            const cat = this.config.categories[catId];
            if (!cat) return;

            const panel = this.propertyPanel;
            panel.innerHTML = '';

            this._showValidationErrors();

            const container = document.createElement('div');
            container.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

            const basicCard = document.createElement('div');
            basicCard.className = 'property-section';
            basicCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            basicCard.innerHTML = `
        <div class="property-title nc-prop-title--sm">🎯 分类: ${catId}</div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--sm">名称</label>
            <input type="text" id="cat-name" class="field-input nc-field-input--sm" value="${this._escapeHtml(cat.name || '')}">
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--sm">描述</label>
            <textarea id="cat-description" class="field-textarea nc-field-input--sm-mono" rows="2">${this._escapeHtml(cat.description || '')}</textarea>
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--sm">选择模式</label>
            <select id="cat-mode" class="field-select nc-field-input--sm">
                <option value="single" ${cat.selectionMode === 'single' ? 'selected' : ''}>单选</option>
                <option value="multiple" ${cat.selectionMode === 'multiple' ? 'selected' : ''}>多选</option>
            </select>
        </div>
    `;
            container.appendChild(basicCard);

            const optionsCard = document.createElement('div');
            optionsCard.className = 'property-section';
            optionsCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            optionsCard.innerHTML = `
        <div class="nc-flex--row-between-mb12">
            <span class="property-title nc-prop-title--sm-inline">📋 选项</span>
            <button id="add-option" class="btn-add nc-cfgedit-btn--add-sm">➕ 添加选项</button>
        </div>
        <div id="cat-options-list" class="nc-size--scroll-300"></div>
    `;
            container.appendChild(optionsCard);

            panel.appendChild(container);

            const openAgentSelectionModal = async (optKey, currentAgents) => {
                const agentKeys = Object.keys(this.config.agents || {});
                if (agentKeys.length === 0) {
                    Notify.info('暂无 Agent 可关联');
                    return;
                }

                const stageMap = {};
                (this.config.workflowStages || []).forEach(stage => {
                    stageMap[stage.id] = stage.name;
                });

                const overlay = document.createElement('div');
                overlay.className = 'nc-modal-overlay nc-font';
                overlay.style.zIndex = '100200';

                const modal = document.createElement('div');
                modal.className = 'nc-modal';
                modal.style.maxWidth = '600px';
                modal.style.width = '100%';
                modal.style.maxHeight = '70vh';
                modal.style.display = 'flex';
                modal.style.flexDirection = 'column';

                modal.innerHTML = `
            <div class="nc-modal-header">
                <h2 class="nc-modal-title--primary-c">选择关联 Agent - ${optKey}</h2>
            </div>
            <div class="nc-modal-body nc-flex-item--modal-scroll">
                <table class="nc-table--sm">
                    <thead>
                        <tr class="nc-table-row--header">
                            <th class="nc-th--checkbox">选择</th>
                            <th class="nc-th--padded">Agent键</th>
                            <th class="nc-th--padded">显示名称</th>
                            <th class="nc-th--padded">角色</th>
                            <th class="nc-th--padded">阶段</th>
                        </tr>
                    </thead>
                    <tbody id="agent-select-tbody">
                        ${agentKeys.map(key => {
                    const agent = this.config.agents[key];
                    const stageName = stageMap[agent.stage] || (agent.stage ? agent.stage : '未分配');
                    const checked = currentAgents.includes(key) ? 'checked' : '';
                    return `
                                <tr class="nc-table-row--body">
                                    <td class="nc-td--padded"><input type="checkbox" value="${key}" ${checked}></td>
                                    <td class="nc-td--padded">${key}</td>
                                    <td class="nc-td--padded">${agent.displayName || ''}</td>
                                    <td class="nc-td--padded">${agent.role || ''}</td>
                                    <td class="nc-td--padded">${stageName}</td>
                                </tr>
                            `;
                }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="nc-modal-footer">
                <button id="agent-select-confirm" class="nc-modal-copy-btn">确认</button>
                <button class="nc-modal-close-btn">取消</button>
            </div>
        `;

                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                ModalStack.push(overlay);

                const tbody = modal.querySelector('#agent-select-tbody');
                const confirmBtn = modal.querySelector('#agent-select-confirm');
                const closeBtn = modal.querySelector('.nc-modal-close-btn');

                const closeModal = () => {
                    ModalStack.remove(overlay);
                    overlay.remove();
                };

                confirmBtn.addEventListener('click', () => {
                    const selected = [];
                    tbody.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => selected.push(cb.value));
                    cat.options[optKey].agents = selected;
                    renderOptions();
                    if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    closeModal();
                });

                closeBtn.addEventListener('click', closeModal);
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) closeModal();
                });
            };

            const renderOptions = () => {
                const optionsDiv = container.querySelector('#cat-options-list');
                optionsDiv.innerHTML = '';
                Object.entries(cat.options || {}).forEach(([optKey, opt]) => {
                    const optDiv = document.createElement('div');
                    optDiv.style.cssText = 'background:#2a2a3a; border-radius:8px; padding:12px; margin-bottom:8px; border:1px solid #3a3a5a;';
                    optDiv.innerHTML = `
                <div class="nc-flex--row-between-mb8">
                    <span class="nc-color--primary-bold">${optKey}</span>
                    <span class="delete-option nc-color--error-btn-md">✖</span>
                </div>
                <div class="nc-mb6">
                    <input type="text" class="opt-name nc-opt-input--sm" data-key="${optKey}" value="${this._escapeHtml(opt.name || '')}" placeholder="名称">
                </div>
                <div class="nc-mb6">
                    <input type="text" class="opt-description nc-opt-input--sm" data-key="${optKey}" value="${this._escapeHtml(opt.description || '')}" placeholder="描述">
                </div>
                <div class="nc-mb6">
                    <input type="text" class="opt-icon nc-opt-input--sm" data-key="${optKey}" value="${this._escapeHtml(opt.icon || '')}" placeholder="图标">
                </div>
                <div>
                    <label class="nc-label--agents-hint">关联 Agents</label>
                    <div class="nc-flex--row-8-center">
                        <div id="agent-tags-${optKey}" class="nc-flex-item--agent-tags">
                            ${(opt.agents || []).map(agentKey => {
                        const agent = this.config.agents[agentKey];
                        const display = agent ? (agent.displayName || agentKey) : agentKey;
                        return `<span class="nc-tag--agent">${display}</span>`;
                    }).join('')}
                        </div>
                        <button class="select-agents-btn nc-icon-btn--select-agents" data-key="${optKey}">选择</button>
                    </div>
                </div>
            `;
                    optionsDiv.appendChild(optDiv);

                    optDiv.querySelector('.delete-option').addEventListener('click', () => {
                        delete cat.options[optKey];
                        renderOptions();
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    });

                    optDiv.querySelector('.opt-name').addEventListener('input', e => {
                        if (!cat.options[optKey]) cat.options[optKey] = {};
                        cat.options[optKey].name = e.target.value;
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    });
                    optDiv.querySelector('.opt-description').addEventListener('input', e => {
                        cat.options[optKey].description = e.target.value;
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    });
                    optDiv.querySelector('.opt-icon').addEventListener('input', e => {
                        cat.options[optKey].icon = e.target.value;
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    });
                    optDiv.querySelector('.select-agents-btn').addEventListener('click', () => {
                        openAgentSelectionModal(optKey, opt.agents || []);
                    });
                });
            };
            renderOptions();

            container.querySelector('#add-option').addEventListener('click', async () => {
                const optKey = await UI.showPromptModal('输入选项ID', '', '新增选项');
                if (!optKey) return;
                if (cat.options[optKey]) {
                    Notify.error(`选项ID ${optKey} 已存在`);
                    return;
                }
                cat.options[optKey] = { name: optKey, description: '', icon: '', agents: [] };
                renderOptions();
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
            });

            const updateField = (field, value) => {
                cat[field] = value;
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
            };
            container.querySelector('#cat-name').addEventListener('input', e => updateField('name', e.target.value));
            container.querySelector('#cat-description').addEventListener('input', e => updateField('description', e.target.value));
            container.querySelector('#cat-mode').addEventListener('change', e => updateField('selectionMode', e.target.value));
        }

        _renderGroupProperties(index) {

            const group = this.config.categoryGroups[index];
            if (!group) return;

            const panel = this.propertyPanel;
            panel.innerHTML = '';

            this._showValidationErrors();

            const container = document.createElement('div');
            container.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

            const card = document.createElement('div');
            card.className = 'property-section';
            card.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            card.innerHTML = `
            <div class="property-title nc-prop-title--sm">🔗 互斥组</div>
            <div class="field-group nc-mb16">
                <label class="field-label nc-field-label--sm">组名</label>
                <input type="text" id="group-name" class="field-input nc-field-input--sm" value="${this._escapeHtml(group.name || '')}">
            </div>
            <div class="field-group">
                <label class="field-label nc-field-label--sm">包含分类</label>
                <select id="group-categories" class="field-select nc-field-input--sm" multiple size="5">
                    ${Object.keys(this.config.categories || {}).map(cid => `<option value="${cid}" ${(group.categories || []).includes(cid) ? 'selected' : ''}>${cid}</option>`).join('')}
                </select>
                <div class="nc-text--xs-muted-mt4">按住 Ctrl 多选</div>
            </div>
        `;
            container.appendChild(card);

            panel.appendChild(container);

            container.querySelector('#group-name').addEventListener('input', e => {
                group.name = e.target.value;
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
            });
            container.querySelector('#group-categories').addEventListener('change', e => {
                group.categories = Array.from(e.target.selectedOptions).map(opt => opt.value);
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
            });
        }

        _renderGlobalProperties() {

            const panel = this.propertyPanel;
            const config = this.config;

            const container = document.createElement('div');
            container.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

            const metaCard = document.createElement('div');
            metaCard.className = 'property-section';
            metaCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            metaCard.innerHTML = `
            <div class="property-title nc-prop-title--sm">📄 元信息</div>
            <div class="field-group nc-mb16">
                <label class="field-label nc-field-label--sm">版本</label>
                <input type="text" id="global-version" class="field-input nc-field-input--sm" value="${this._escapeHtml(config.version || '1.0')}">
            </div>
            <div class="field-group nc-mb16">
                <label class="field-label nc-field-label--sm">描述</label>
                <textarea id="global-description" class="field-textarea nc-field-input--sm-mono" rows="3">${this._escapeHtml(config.description || '')}</textarea>
            </div>
            <div class="field-group nc-mb16">
                <label class="field-label nc-field-label--sm">模式</label>
                <select id="global-mode" class="field-select nc-field-input--sm">
                    <option value="normal" ${config.mode === 'normal' ? 'selected' : ''}>normal</option>
                    <option value="datafication" ${config.mode === 'datafication' ? 'selected' : ''}>datafication</option>
                    <option value="interactive" ${config.mode === 'interactive' ? 'selected' : ''}>interactive</option>
                    <option value="workshop" ${config.mode === 'workshop' ? 'selected' : ''}>workshop</option>
                </select>
            </div>
        `;
            container.appendChild(metaCard);

            const limitCard = document.createElement('div');
            limitCard.className = 'property-section';
            limitCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            limitCard.innerHTML = `
            <div class="property-title nc-prop-title--sm">🔧 系统限制</div>
            <div class="field-group nc-mb16">
                <label class="field-label nc-field-label--sm">最大状态书数量 (maxStateBooks)</label>
                <input type="number" id="global-maxStateBooks" class="field-input nc-field-input--sm" value="${config.maxStateBooks || 5}" min="1" step="1">
            </div>
            <div class="field-group nc-mb16">
                <label class="field-label nc-field-label--sm">每本书状态条目上限 (stateTypeLimit)</label>
                <input type="number" id="global-stateTypeLimit" class="field-input nc-field-input--sm" value="${config.stateTypeLimit || 20}" min="1" step="1">
            </div>
            <div class="field-group nc-mb16">
                <label class="field-label nc-field-label--sm">每本图库书图片上限 (maxImagesPerBook)</label>
                <input type="number" id="global-maxImagesPerBook" class="field-input nc-field-input--sm" value="${config.maxImagesPerBook !== undefined ? config.maxImagesPerBook : 20}" min="1" step="1">
            </div>
            <div class="field-group nc-mb16">
                <label class="field-label nc-field-label--sm">每本音频库书音频上限 (maxAudiosPerBook)</label>
                <input type="number" id="global-maxAudiosPerBook" class="field-input nc-field-input--sm" value="${config.maxAudiosPerBook !== undefined ? config.maxAudiosPerBook : 20}" min="1" step="1">
            </div>
        `;
            container.appendChild(limitCard);

            const reflowCard = document.createElement('div');
            reflowCard.className = 'property-section';
            reflowCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            reflowCard.innerHTML = `
            <div class="property-title nc-prop-title--sm">🔄 回流控制</div>
            <div class="field-group nc-mb16">
                <label class="field-label nc-field-label--sm">最大连续回流次数 (maxConsecutiveReflows)</label>
                <input type="number" id="global-maxConsecutiveReflows" class="field-input nc-field-input--sm" value="${config.maxConsecutiveReflows || 3}" min="1" step="1">
            </div>
            <div class="field-group nc-mb16">
                <label class="field-label nc-field-label--sm">最大回流深度 (maxReflowDepth)</label>
                <input type="number" id="global-maxReflowDepth" class="field-input nc-field-input--sm" value="${config.maxReflowDepth || 100}" min="1" step="1">
            </div>
        `;
            container.appendChild(reflowCard);

            panel.appendChild(container);

            const updateField = (field, value) => {

                this.config[field] = value;
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
            };

            panel.querySelector('#global-version').addEventListener('input', e => updateField('version', e.target.value));
            panel.querySelector('#global-description').addEventListener('input', e => updateField('description', e.target.value));
            panel.querySelector('#global-mode').addEventListener('change', e => updateField('mode', e.target.value));
            panel.querySelector('#global-maxStateBooks').addEventListener('input', e => updateField('maxStateBooks', parseInt(e.target.value) || 5));
            panel.querySelector('#global-stateTypeLimit').addEventListener('input', e => updateField('stateTypeLimit', parseInt(e.target.value) || 20));
            panel.querySelector('#global-maxImagesPerBook').addEventListener('input', e => updateField('maxImagesPerBook', parseInt(e.target.value) || 20));
            panel.querySelector('#global-maxAudiosPerBook').addEventListener('input', e => updateField('maxAudiosPerBook', parseInt(e.target.value) || 20));
            panel.querySelector('#global-maxConsecutiveReflows').addEventListener('input', e => updateField('maxConsecutiveReflows', parseInt(e.target.value) || 3));
            panel.querySelector('#global-maxReflowDepth').addEventListener('input', e => updateField('maxReflowDepth', parseInt(e.target.value) || 100));
        }

        /**
         * @param {string} agentKey - Agent 键
         * @param {Object} stageNode - 所属阶段节点（可能为空）
         */
        _renderAgentPropertiesInPanel(agentKey, stageNode) {


            const agent = this.config.agents[agentKey];
            if (!agent) {
                console.error(`[ConfigEditor._renderAgentPropertiesInPanel] Agent ${agentKey} 不存在`);
                return;
            }

            const panel = this.propertyPanel;
            panel.innerHTML = '';

            this._showValidationErrors();

            // 获取角色卡列表
            let characterNames = [];
            let contextError = null;
            try {
                const context = API.getContext();

                if (context.characters && Array.isArray(context.characters)) {
                    characterNames = context.characters.map(c => c.name || c.data?.name).filter(Boolean);

                } else {
                    console.warn('[ConfigEditor._renderAgentPropertiesInPanel] context.characters 不存在或不是数组');
                }
            } catch (e) {
                console.error('[ConfigEditor._renderAgentPropertiesInPanel] 获取角色卡列表失败:', e);
                contextError = e.message;
            }

            const container = document.createElement('div');
            container.style.cssText = 'display:flex; flex-direction:column; gap:20px;';

            // 头部（键名编辑 + 返回按钮）
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;';
            headerDiv.innerHTML = `
        <div class="nc-flex--row-8-middle">
            <input type="text" id="agent-key-input" value="${this._escapeHtml(agentKey)}" class="nc-modal-input--agent-key">
            <span class="nc-color--muted-md">(修改后自动更新引用)</span>
        </div>
        <span class="nc-color--teal-link" id="back-to-stage">↩ 返回阶段</span>
    `;
            container.appendChild(headerDiv);

            // 基础信息卡片
            const basicCard = document.createElement('div');
            basicCard.className = 'property-section';
            basicCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            basicCard.innerHTML = `
        <div class="property-title nc-prop-title--lg">📌 基础信息</div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--md">名称 (name) <span class="nc-color--error">*必须从角色卡选择</span></label>
            ${contextError ? `<div class="nc-color--error-msg">❌ ${contextError}</div>` : ''}
            <select id="agent-name" class="field-select nc-field-input--md">
                <option value="">— 请选择角色卡 —</option>
                ${characterNames.map(name => `<option value="${this._escapeHtml(name)}" ${agent.name === name ? 'selected' : ''}>${this._escapeHtml(name)}</option>`).join('')}
            </select>
            ${characterNames.length === 0 && !contextError ? '<div class="nc-text--warning-tip">⚠️ 未检测到角色卡</div>' : ''}
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--md">显示名 (displayName)</label>
            <input type="text" id="agent-displayName" class="field-input nc-field-input--md" value="${this._escapeHtml(agent.displayName || '')}">
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--md">悬停提示 (hover)</label>
            <input type="text" id="agent-hover" class="field-input nc-field-input--md" value="${this._escapeHtml(agent.hover || '')}">
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--md">阶段  (stage)</label>
            <select id="agent-stage" class="field-select nc-field-input--md">
                ${(this.config.workflowStages || []).map(s => `<option value="${s.id}" ${agent.stage === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
                <option value="" ${!agent.stage ? 'selected' : ''}>无</option>
            </select>
            <div class="nc-text--sm-muted-mt2">选择所属阶段，留空则出现在左侧未分配区</div>
        </div>
        <div class="field-group">
            <label class="field-label nc-field-label--md">顺序 (order)</label>
            <input type="number" id="agent-order" class="field-input nc-field-input--md" value="${agent.order || 0}" min="0">
        </div>
    `;
            container.appendChild(basicCard);

            // 配置选项卡片（移除了 parallel 复选框）
            const optionsCard = document.createElement('div');
            optionsCard.className = 'property-section';
            optionsCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            optionsCard.innerHTML = `
        <div class="property-title nc-prop-title--lg">⚙️ 配置选项</div>
        <div class="checkbox-group nc-flex--checkbox-group">
            <label class="checkbox-label nc-checkbox-label--md">
                <input type="checkbox" id="agent-required" ${agent.required ? 'checked' : ''} class="nc-checkbox--purple-md"> 必需
            </label>
            <label class="checkbox-label nc-checkbox-label--md">
                <input type="checkbox" id="agent-review" ${agent.review ? 'checked' : ''} class="nc-checkbox--purple-md"> 人工审核
            </label>
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--md">API 配置 ID</label>
            <select id="agent-apiConfigId" class="field-select nc-field-input--md">
                <option value="">无</option>
                ${Object.entries(this.config.apiConfigs || {})
                    .filter(([_, cfg]) => cfg.type === 'text')
                    .map(([id]) => `<option value="${id}" ${agent.apiConfigId === id ? 'selected' : ''}>${id}</option>`)
                    .join('')}
            </select>
        </div>
        <div class="field-group">
            <label class="field-label nc-field-label--md">执行间隔 (executeInterval)</label>
            <input type="number" id="agent-executeInterval" class="field-input nc-field-input--md" value="${agent.executeInterval || 0}" min="0">
            <div class="nc-text--sm-muted">0 = 每章执行，N>0 = 每N章执行</div>
        </div>
    `;
            container.appendChild(optionsCard);

            // 输入模板卡片
            const templateCard = document.createElement('div');
            templateCard.className = 'property-section';
            templateCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            templateCard.innerHTML = `
        <div class="property-title nc-prop-title--lg">📝 输入模板</div>
        <div class="field-group nc-mb16">
            <textarea id="agent-inputTemplate" class="field-textarea nc-field-input--md-mono-lg" rows="10" placeholder="输入模板，用【】作为占位符"></textarea>
        </div>
        <div class="field-group nc-mb16">
            <label class="field-label nc-field-label--md">角色 (role)</label>
            <select id="agent-role" class="field-select nc-field-input--md">
                <option value="">无</option>
                ${PREDEFINED_ROLES.map(r => `<option value="${r}" ${agent.role === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
        </div>
        <div class="field-group">
            <label class="field-label nc-field-label--md">描述 (description)</label>
            <textarea id="agent-description" class="field-textarea nc-field-input--md-mono-lg" rows="2" placeholder="功能描述">${this._escapeHtml(agent.description || '')}</textarea>
        </div>
    `;
            container.appendChild(templateCard);

            // 回流条件卡片（数组模式）
            const conditionsCard = document.createElement('div');
            conditionsCard.className = 'property-section';
            conditionsCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            conditionsCard.innerHTML = `
        <div class="property-title nc-prop-title--lg">🔄 回流条件</div>
        <div class="nc-mb8">
            <div class="nc-flex--row-between-mb8">
                <span class="nc-color--subtle-label">关键词列表（每行一个）</span>
                <button id="add-reflow-condition" class="btn-add nc-cfgedit-btn--add-md">➕ 添加条件</button>
            </div>
            <div id="reflow-conditions-list" class="nc-size--scroll-200-mb8"></div>
        </div>
    `;
            container.appendChild(conditionsCard);

            // 输入源卡片
            const sourcesCard = document.createElement('div');
            sourcesCard.className = 'property-section';
            sourcesCard.style.cssText = 'background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; border:1px solid #2d2d44;';
            sourcesCard.innerHTML = `
        <div class="nc-flex--row-between-mb12">
            <span class="property-title nc-prop-title--lg-inline">🔗 输入源</span>
            <button id="add-input-source" class="btn-add nc-cfgedit-btn--add-md">➕ 添加输入源</button>
        </div>
        <div class="source-header nc-grid--source-header">
            <span>源标识符</span>
            <span>模式</span>
            <span>auto</span>
            <span>提示词</span>
            <span></span>
        </div>
        <div id="input-sources-container" class="nc-size--scroll-280"></div>
    `;
            container.appendChild(sourcesCard);

            panel.appendChild(container);

            // 设置 textarea 的值，并进行字面 \n 转换
            const inputTemplateTextarea = panel.querySelector('#agent-inputTemplate');
            if (inputTemplateTextarea) {
                let templateValue = agent.inputTemplate || '';


                const convertedValue = templateValue.replace(/\\n/g, '\n');
                const afterLength = convertedValue.length;


                if (templateValue !== convertedValue) {

                }
                inputTemplateTextarea.value = convertedValue;
            } else {
                console.warn('[ConfigEditor._renderAgentPropertiesInPanel] 未找到 #agent-inputTemplate 元素');
            }

            // 渲染回流条件列表
            const renderReflowConditions = () => {
                const listDiv = panel.querySelector('#reflow-conditions-list');
                const conditions = agent.reflowConditions || [];
                let html = '';
                conditions.forEach((cond, index) => {
                    html += `
                <div class="nc-flex--row-6-mb6-mid">
                    <input type="text" class="reflow-condition-item nc-source-input--flex" data-index="${index}" value="${this._escapeHtml(cond)}">
                    <button class="delete-reflow-condition" data-index="${index}">✖</button>
                </div>
            `;
                });
                listDiv.innerHTML = html;

                listDiv.querySelectorAll('.reflow-condition-item').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const idx = e.target.dataset.index;
                        const newValue = e.target.value;
                        const conditions = agent.reflowConditions || [];
                        conditions[idx] = newValue;
                        agent.reflowConditions = conditions;
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                        this._requestRender();
                    });
                });

                listDiv.querySelectorAll('.delete-reflow-condition').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = e.target.dataset.index;
                        const conditions = agent.reflowConditions || [];
                        conditions.splice(idx, 1);
                        agent.reflowConditions = conditions;
                        renderReflowConditions();
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                        this._requestRender();
                    });
                });
            };
            renderReflowConditions();

            // 添加回流条件按钮
            const addReflowBtn = panel.querySelector('#add-reflow-condition');
            if (addReflowBtn) {
                addReflowBtn.addEventListener('click', () => {
                    const conditions = agent.reflowConditions || [];
                    conditions.push('');
                    agent.reflowConditions = conditions;
                    renderReflowConditions();
                    if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    this._requestRender();
                });
            }

            // 渲染输入源列表
            const renderInputSources = () => {
                const containerDiv = document.getElementById('input-sources-container');
                if (!containerDiv) return;

                let currentStage = null;
                let currentStageNum = Infinity;
                let currentStageMode = 'serial';
                if (agent.stage) {
                    currentStage = this.config.workflowStages.find(s => s.id === agent.stage);
                    if (currentStage) {
                        currentStageNum = currentStage.stage;
                        currentStageMode = currentStage.mode || 'serial';

                    } else {
                        console.warn(`[renderInputSources] 未找到阶段 ${agent.stage}，将允许所有Agent`);
                    }
                } else {
                    console.warn('[renderInputSources] Agent 未设置阶段，将允许所有Agent');
                }

                const currentStageAgents = currentStage ? currentStage.agents : [];

                const inputs = agent.inputs || [];
                const modes = agent.inputMode || [];
                const autos = agent.autoConfig || [];
                const prompts = agent.inputPrompts || [];

                const maxLen = Math.max(inputs.length, modes.length, autos.length, prompts.length);
                while (inputs.length < maxLen) inputs.push('');
                while (modes.length < maxLen) modes.push('txt');
                while (autos.length < maxLen) autos.push(0);
                while (prompts.length < maxLen) prompts.push('');

                const sourceItems = [];
                for (let i = 0; i < maxLen; i++) {
                    sourceItems.push({
                        src: inputs[i],
                        mode: modes[i],
                        auto: autos[i],
                        prompt: prompts[i]
                    });
                }

                const allAgentKeys = Object.keys(this.config.agents || {});
                const allStageIds = (this.config.workflowStages || []).map(s => s.id);

                const allowedAgentKeys = allAgentKeys.filter(key => {
                    if (key === agentKey) return false;
                    const agentConfig = this.config.agents[key];
                    if (!agentConfig || !agentConfig.stage) return true;
                    const stage = this.config.workflowStages.find(s => s.id === agentConfig.stage);
                    if (!stage) return true;
                    if (stage.stage < currentStageNum) return true;
                    if (stage.stage === currentStageNum) {
                        if (currentStageMode === 'serial') {
                            return currentStageAgents.includes(key);
                        } else {
                            return false;
                        }
                    }
                    return false;
                });

                const allowedStageIds = allStageIds.filter(id => {
                    const stage = this.config.workflowStages.find(s => s.id === id);
                    if (!stage) return true;
                    return stage.stage <= currentStageNum;
                });

                const readTypes = ['read.png', 'read.txt', 'read.html', 'read.js', 'read.audio'];
                const saveTypes = ['save.png', 'save.txt', 'save.html', 'save.js', 'save.audio'];
                const baseSources = ['user', 'auto', 'before'];

                const agentVariants = [];
                allowedAgentKeys.forEach(key => {
                    agentVariants.push(key);
                    agentVariants.push(key + '.last');
                    agentVariants.push(key + '.raw');
                });

                const stageVariants = [];
                allowedStageIds.forEach(id => {
                    stageVariants.push(id);
                    stageVariants.push(id + '.last');
                    stageVariants.push(id + '.raw');
                });

                const allCandidates = [
                    ...baseSources,
                    ...agentVariants,
                    ...stageVariants,
                    ...readTypes,
                    ...saveTypes
                ];
                allCandidates.push('id.other_example', 'id.img_example', 'id.audio_example');
                const uniqueCandidates = [...new Set(allCandidates)];


                let html = '';
                sourceItems.forEach((item, index) => {
                    const listId = `source-list-${agentKey}-${index}`;
                    html += `
                <div class="source-card nc-card--source-card" data-index="${index}">
                    <div class="nc-flex--row-8-middle-mb8">
                        <div class="nc-flex-item--relative">
                            <input type="text" class="source-src nc-source-input--main" data-index="${index}" value="${this._escapeHtml(item.src)}"
                                placeholder="源标识符 (可输入或选择)"
                                list="${listId}">
                            <datalist id="${listId}">
                                ${uniqueCandidates.map(s => `<option value="${s}">`).join('')}
                            </datalist>
                        </div>
                        <button class="delete-source" data-index="${index}">✖</button>
                    </div>
                    <div class="nc-flex--row-8-mb8">
                        <select class="source-mode nc-source-select--flex" data-index="${index}">
                            <option value="txt" ${item.mode === 'txt' ? 'selected' : ''}>txt</option>
                            <option value="status" ${item.mode === 'status' ? 'selected' : ''}>status</option>
                            <option value="chapter" ${item.mode === 'chapter' ? 'selected' : ''}>chapter</option>
                            <option value="all" ${item.mode === 'all' ? 'selected' : ''}>all</option>
                        </select>
                        <input type="number" class="source-auto nc-source-input--type" data-index="${index}" value="${item.auto}" min="0" step="1"
                            placeholder="auto">
                    </div>
                    <div>
                        <input type="text" class="source-prompt nc-source-input--main" data-index="${index}" value="${this._escapeHtml(item.prompt)}"
                            placeholder="提示词">
                    </div>
                </div>
            `;
                });

                containerDiv.innerHTML = html;

                containerDiv.querySelectorAll('.delete-source').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const index = parseInt(e.target.dataset.index);
                        sourceItems.splice(index, 1);
                        agent.inputs = sourceItems.map(item => item.src);
                        agent.inputMode = sourceItems.map(item => item.mode);
                        agent.autoConfig = sourceItems.map(item => item.auto);
                        agent.inputPrompts = sourceItems.map(item => item.prompt);
                        renderInputSources();
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                        this._requestRender();
                    });
                });

                containerDiv.querySelectorAll('.source-src').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const index = e.target.dataset.index;
                        sourceItems[index].src = e.target.value;
                        agent.inputs = sourceItems.map(item => item.src);
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                        this._requestRender();
                    });
                });
                containerDiv.querySelectorAll('.source-mode').forEach(select => {
                    select.addEventListener('change', (e) => {
                        const index = e.target.dataset.index;
                        sourceItems[index].mode = e.target.value;
                        agent.inputMode = sourceItems.map(item => item.mode);
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    });
                });
                containerDiv.querySelectorAll('.source-auto').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const index = e.target.dataset.index;
                        let val = parseInt(e.target.value);
                        if (isNaN(val)) val = 0;
                        sourceItems[index].auto = val;
                        agent.autoConfig = sourceItems.map(item => item.auto);
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    });
                });
                containerDiv.querySelectorAll('.source-prompt').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const index = e.target.dataset.index;
                        sourceItems[index].prompt = e.target.value;
                        agent.inputPrompts = sourceItems.map(item => item.prompt);
                        if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    });
                });
            };
            renderInputSources();

            // 添加输入源按钮
            const addSourceBtn = container.querySelector('#add-input-source');
            addSourceBtn.addEventListener('click', () => {
                const inputs = agent.inputs || [];
                const modes = agent.inputMode || [];
                const autos = agent.autoConfig || [];
                const prompts = agent.inputPrompts || [];

                inputs.push('');
                modes.push('txt');
                autos.push(0);
                prompts.push('');

                agent.inputs = inputs;
                agent.inputMode = modes;
                agent.autoConfig = autos;
                agent.inputPrompts = prompts;

                renderInputSources();
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                this._requestRender();
            });

            // 其他字段更新函数
            const updateField = (field, value) => {


                if (field === 'stage') {
                    const oldStage = agent.stage;

                    // 从原阶段的 agents 列表中移除该 Agent（如果存在）
                    if (oldStage) {
                        const oldStage = this.config.workflowStages.find(s => s.id === oldStage);
                        if (oldStage && oldStage.agents) {
                            oldStage.agents = oldStage.agents.filter(k => k !== agentKey);

                        }
                    }

                    agent.stage = value;

                    if (value) {
                        const newStage = this.config.workflowStages.find(s => s.id === value);
                        if (newStage) {
                            if (!newStage.agents.includes(agentKey)) {
                                newStage.agents.push(agentKey);

                            } else {

                            }
                        } else {
                            console.warn(`[ConfigEditor._renderAgentPropertiesInPanel] 未找到阶段 ${value}，无法添加 Agent`);
                        }
                    }

                    if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                    this._requestRender();
                    return;
                }

                agent[field] = value;

                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                this._requestRender();
            };

            container.querySelector('#agent-name').addEventListener('change', e => {

                updateField('name', e.target.value);
            });
            container.querySelector('#agent-displayName').addEventListener('input', e => updateField('displayName', e.target.value));
            container.querySelector('#agent-hover').addEventListener('input', e => updateField('hover', e.target.value));
            container.querySelector('#agent-stage').addEventListener('change', e => {
                updateField('stage', e.target.value);
            });
            container.querySelector('#agent-order').addEventListener('input', e => updateField('order', parseInt(e.target.value) || 0));
            container.querySelector('#agent-required').addEventListener('change', e => updateField('required', e.target.checked));
            container.querySelector('#agent-review').addEventListener('change', e => updateField('review', e.target.checked));
            container.querySelector('#agent-apiConfigId').addEventListener('change', e => updateField('apiConfigId', e.target.value));
            container.querySelector('#agent-inputTemplate').addEventListener('input', e => {

                updateField('inputTemplate', e.target.value);
            });
            container.querySelector('#agent-executeInterval').addEventListener('input', e => updateField('executeInterval', parseInt(e.target.value) || 0));
            container.querySelector('#agent-role').addEventListener('change', e => updateField('role', e.target.value));
            container.querySelector('#agent-description').addEventListener('input', e => updateField('description', e.target.value));

            const keyInput = container.querySelector('#agent-key-input');
            keyInput.addEventListener('blur', () => {
                const newKey = keyInput.value.trim();

                if (newKey === agentKey) {

                    return;
                }
                if (!newKey) {
                    console.warn('[ConfigEditor._renderAgentPropertiesInPanel] 新键为空，重置为旧键');
                    Notify.error('Agent 键名不能为空');
                    keyInput.value = agentKey;
                    return;
                }
                if (this.config.agents[newKey]) {
                    console.warn(`[ConfigEditor._renderAgentPropertiesInPanel] 新键 ${newKey} 已存在`);
                    Notify.error(`Agent 键名 ${newKey} 已存在`);
                    keyInput.value = agentKey;
                    return;
                }

                this._updateAgentKey(agentKey, newKey);
            });

            container.querySelector('#back-to-stage').addEventListener('click', () => {
                this.selectedAgentKey = null;
                this.selectedAgentStageNode = null;
                if (stageNode) {
                    this.selectedNode = stageNode;
                    this._renderPropertyPanel(stageNode);
                } else {
                    this._renderPropertyPanel(null);
                }
            });
        }

        // ---------- 资源管理方法 ----------
        selectApiConfig(id) {

            this.selectedApiId = id;
            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedCategoryId = null;
            this.selectedGroupIndex = null;
            this.selectedAgentKey = null;
            this.highlightedAgents.clear();      // 新增：清空高亮
            this.selectedGlobal = false;
            this._renderPropertyPanel({ type: 'api' });
        }

        selectCategory(id) {

            this.selectedCategoryId = id;
            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedApiId = null;
            this.selectedGroupIndex = null;
            this.selectedAgentKey = null;
            this.highlightedAgents.clear();      // 新增：清空高亮
            this.selectedGlobal = false;
            this._renderPropertyPanel({ type: 'category' });
        }

        selectGroup(index) {

            this.selectedGroupIndex = index;
            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedApiId = null;
            this.selectedCategoryId = null;
            this.selectedAgentKey = null;
            this.highlightedAgents.clear();      // 新增：清空高亮
            this.selectedGlobal = false;
            this._renderPropertyPanel({ type: 'group' });
        }

        selectAgent(agentKey) {

            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedApiId = null;
            this.selectedCategoryId = null;
            this.selectedGroupIndex = null;
            this.selectedAgentKey = agentKey;
            this.selectedGlobal = false;

            // 清空并重新计算高亮依赖
            this.highlightedAgents.clear();
            if (agentKey) {

                this._calculateAgentDependencies(agentKey);

            }

            const owningStage = this.config.workflowStages.find(stage => stage.agents.includes(agentKey));
            if (owningStage) {
                const stageNode = this.nodes.find(n => n.type === 'stage' && n.key === owningStage.stage);
                this.selectedAgentStageNode = stageNode;

            } else {
                this.selectedAgentStageNode = null;

            }


            this._renderAgentPropertiesInPanel(agentKey, this.selectedAgentStageNode);


            this._requestRender();
        }

        selectGlobal() {

            this.selectedGlobal = true;
            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedApiId = null;
            this.selectedCategoryId = null;
            this.selectedGroupIndex = null;
            this.selectedAgentKey = null;
            this.highlightedAgents.clear();      // 新增：清空高亮
            this.selectedAgentStageNode = null;
            this._renderPropertyPanel(null);
        }

        deleteApiConfig(id) {
            delete this.config.apiConfigs[id];
            Object.values(this.config.agents).forEach(agent => {
                if (agent.apiConfigId === id) {
                    agent.apiConfigId = '';
                }
            });
            this.selectedApiId = null;
            this._renderPropertyPanel(null);
            if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
        }

        deleteCategory(id) {
            delete this.config.categories[id];
            (this.config.categoryGroups || []).forEach(group => {
                group.categories = group.categories.filter(cid => cid !== id);
            });
            this.selectedCategoryId = null;
            this._renderPropertyPanel(null);
            if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
        }

        deleteGroup(index) {
            this.config.categoryGroups.splice(index, 1);
            this.selectedGroupIndex = null;
            this._renderPropertyPanel(null);
            if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
        }

        _calculateAgentDependencies(agentKey) {

            const agents = this.config.agents || {};
            const stages = this.config.workflowStages || [];
            const dependsOn = new Set(); // 当前 Agent 依赖的其他 Agent
            const dependedBy = new Set(); // 依赖当前 Agent 的其他 Agent

            // 辅助函数：提取 Agent 键（去除 .last 或 .raw）
            const extractAgentKeyFromSrc = (src) => {
                if (typeof src !== 'string') return null;
                if (src.endsWith('.last')) return src.slice(0, -5);
                if (src.endsWith('.raw')) return src.slice(0, -4);
                if (agents[src]) return src;
                return null;
            };

            // 辅助函数：判断是否为阶段 ID
            const isStageId = (id) => {
                return stages.some(s => s.id === id);
            };

            // 1. 找出当前 Agent 依赖的其他 Agent（包括阶段内的所有 Agent）
            const currentAgent = agents[agentKey];
            if (currentAgent && currentAgent.inputs) {

                for (const src of currentAgent.inputs) {
                    // 处理直接 Agent 键
                    const depKey = extractAgentKeyFromSrc(src);
                    if (depKey && depKey !== agentKey) {
                        dependsOn.add(depKey);

                        continue;
                    }
                    // 处理阶段 ID：该阶段内的所有 Agent 都是依赖
                    if (isStageId(src)) {
                        const stage = stages.find(s => s.id === src);
                        if (stage && stage.agents) {
                            stage.agents.forEach(key => {
                                if (key !== agentKey && agents[key]) {
                                    dependsOn.add(key);

                                }
                            });
                        }
                    }
                    // 其他源（user, auto, before, read., save., id.）忽略
                }
            }

            // 2. 找出依赖当前 Agent 的其他 Agent（直接引用或通过阶段引用）
            for (const [otherKey, otherAgent] of Object.entries(agents)) {
                if (otherKey === agentKey || !otherAgent.inputs) continue;
                for (const src of otherAgent.inputs) {
                    // 直接引用
                    const depKey = extractAgentKeyFromSrc(src);
                    if (depKey === agentKey) {
                        dependedBy.add(otherKey);

                        continue;
                    }
                    // 通过阶段引用：如果 src 是阶段 ID 且该阶段包含当前 Agent
                    if (isStageId(src)) {
                        const stage = stages.find(s => s.id === src);
                        if (stage && stage.agents && stage.agents.includes(agentKey)) {
                            dependedBy.add(otherKey);

                        }
                    }
                }
            }

            // 合并两个集合
            dependsOn.forEach(key => this.highlightedAgents.add(key));
            dependedBy.forEach(key => this.highlightedAgents.add(key));


        }

        showValidationErrors(errors) {
            this.validationErrors = errors;
            this._renderPropertyPanel(this.selectedNode || this.selectedEdge || null);
        }

        // ---------- 插入阶段 ----------
        _insertStage(referenceNode, position) {
            const stageNodes = this.nodes.filter(n => n.type === 'stage').sort((a, b) => a.y - b.y);
            const refIndex = stageNodes.findIndex(n => n.id === referenceNode.id);
            if (refIndex === -1) return;

            const newId = `stage_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const newStage = {
                stage: 0,
                id: newId,
                name: '新阶段',
                color: '#667eea',
                mode: 'serial',
                agents: [],
                description: ''
            };

            const stageIndex = this.config.workflowStages.findIndex(s => s.id === referenceNode.key);
            if (position === 'before') {
                this.config.workflowStages.splice(stageIndex, 0, newStage);
            } else {
                this.config.workflowStages.splice(stageIndex + 1, 0, newStage);
            }

            this._buildFromConfig();
            const newNode = this.nodes.find(n => n.type === 'stage' && n.key === newStage.id);
            if (newNode) {
                this.selectedNode = newNode;
            }
            this._fitView();
            this._renderPropertyPanel(this.selectedNode);
            if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
        }

        /**
         * 打开管理Agent弹窗（支持添加/删除Agent，并自动进行兼容性检查和移动）
         * @param {Object} stageNode - 阶段节点对象
         */
        _openAgentManager(stageNode) {
            const stageData = stageNode.stageData;
            if (!stageData) return;


            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay nc-font';
            overlay.style.zIndex = '100090';

            const modal = document.createElement('div');
            modal.className = 'nc-modal';
            modal.style.maxWidth = '600px';
            modal.style.width = '90%';
            modal.style.maxHeight = '70vh';
            modal.style.overflow = 'hidden';
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';

            const header = document.createElement('div');
            header.className = 'nc-modal-header';
            header.innerHTML = `<h2 class="nc-modal-title--primary-c">管理Agent - ${stageNode.label}</h2>`;
            modal.appendChild(header);

            const agentList = document.createElement('div');
            agentList.style.cssText = 'flex:1; overflow-y:auto; padding:10px; display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:8px;';
            modal.appendChild(agentList);

            const footer = document.createElement('div');
            footer.className = 'nc-modal-footer';
            footer.innerHTML = `
        <button id="agent-add" class="nc-btn nc-btn-primary">➕ 添加Agent</button>
        <button class="nc-modal-close-btn">关闭</button>
    `;
            modal.appendChild(footer);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            UI._openModal(overlay);

            const renderAgentGrid = () => {
                agentList.innerHTML = '';
                const agents = stageData.agents || [];
                agents.sort((a, b) => (this.config.agents[a]?.order || 0) - (this.config.agents[b]?.order || 0));
                agents.forEach(agentKey => {
                    const agent = this.config.agents[agentKey];
                    if (!agent) return;
                    const card = document.createElement('div');
                    card.className = 'agent-card';
                    card.setAttribute('data-agent', agentKey);
                    card.style.cssText = 'background:#2a2a3a; border-radius:6px; padding:8px; cursor:pointer; border:1px solid #667eea;';
                    card.innerHTML = `
                <div class="nc-flex--row-between">
                    <span class="nc-text--bolder-primary">${agent.displayName || agentKey}</span>
                    <span class="nc-color--muted-xs">order:${agent.order || 0}</span>
                </div>
                <div class="nc-text--xs-light-mt4">${agent.role || '无角色'}</div>
                <div class="nc-flex--row-5-mt5-c">
                    <span class="edit-agent nc-color--teal-btn">✎</span>
                    <span class="delete-agent nc-color--error-btn">✖</span>
                </div>
            `;
                    agentList.appendChild(card);

                    card.addEventListener('click', async (e) => {
                        if (e.target.classList.contains('delete-agent')) {
                            const confirmed = await UI.showConfirmModal(`确定将 Agent ${agent.displayName || agentKey} 移出该阶段吗？`, '确认');
                            if (!confirmed) return;
                            // 从阶段agents列表中移除
                            stageData.agents = stageData.agents.filter(k => k !== agentKey);
                            agent.stage = '';
                            Notify.info(`Agent ${agent.displayName || agentKey} 已移至未分配区`, '', { timeOut: 2000 });
                            renderAgentGrid();
                            if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                        } else {
                            this.selectAgent(agentKey);
                            UI._closeModal(overlay);
                        }
                    });
                });
            };
            renderAgentGrid();

            modal.querySelector('#agent-add').addEventListener('click', async () => {
                const agentKey = await UI.showPromptModal('输入新Agent的唯一键', '', '新建Agent');
                if (!agentKey) return;
                if (this.config.agents[agentKey]) {
                    Notify.error(`Agent键 ${agentKey} 已存在`);
                    return;
                }

                // 获取所有可能的角色卡名称用于默认 name（可选）
                let characterNames = [];
                try {
                    const context = API.getContext();
                    if (context.characters && Array.isArray(context.characters)) {
                        characterNames = context.characters.map(c => c.name || c.data?.name).filter(Boolean);
                    }
                } catch (e) {
                    console.warn('[ConfigEditor._renderAgentProperties] 无法获取角色卡列表', e);
                }

                const defaultName = characterNames.length > 0 ? characterNames[0] : '';

                const defaultAgent = {
                    name: defaultName,
                    displayName: agentKey,
                    hover: '',
                    stage: stageNode.key,
                    order: 10,
                    required: false,
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

                // 检查并行属性与阶段模式是否兼容
                const stageMode = stageData.mode || 'serial';
                if ((stageMode === 'parallel' && !defaultAgent.parallel) || (stageMode === 'serial' && defaultAgent.parallel)) {
                    // 如果不兼容，可以提示用户，但允许创建，只是会自动移至未分配区
                    const confirmMsg = `阶段 ${stageData.name} 的模式是 ${stageMode}，而默认Agent的并行属性为 ${defaultAgent.parallel}，不兼容。\n\n创建后该Agent将自动移至未分配区，确定创建吗？`;
                    const confirmed = await UI.showConfirmModal(confirmMsg, '不兼容确认');
                    if (!confirmed) return;
                    defaultAgent.stage = '';
                } else {
                    // 兼容，直接添加到阶段列表
                    stageData.agents.push(agentKey);
                }

                this.config.agents[agentKey] = defaultAgent;
                renderAgentGrid();
                if (this.callbacks.onConfigChange) this.callbacks.onConfigChange(this.getConfig());
                Notify.success(`Agent ${agentKey} 已创建${defaultAgent.stage ? '并加入阶段' : '并移至未分配区'}`);
            });

            modal.querySelector('.nc-modal-close-btn').addEventListener('click', () => {
                UI._closeModal(overlay);
            });
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) UI._closeModal(overlay);
            });
        }

        _updateAgentKey(oldKey, newKey) {


            // 1. 更新 agents 对象

            this.config.agents[newKey] = this.config.agents[oldKey];
            delete this.config.agents[oldKey];

            // 2. 更新所有阶段中的 agents 列表

            this.config.workflowStages.forEach(stage => {
                const idx = stage.agents.indexOf(oldKey);
                if (idx !== -1) {
                    stage.agents[idx] = newKey;

                }
            });

            // 3. 更新所有 Agent 的 inputs 数组中的引用

            Object.entries(this.config.agents).forEach(([key, agent]) => {
                if (agent.inputs && Array.isArray(agent.inputs)) {
                    const originalInputs = [...agent.inputs];
                    agent.inputs = agent.inputs.map(src => {
                        if (src === oldKey) return newKey;
                        if (src.endsWith('.last') && src.slice(0, -5) === oldKey) return newKey + '.last';
                        if (src.endsWith('.raw') && src.slice(0, -4) === oldKey) return newKey + '.raw';
                        return src;
                    });
                    if (JSON.stringify(originalInputs) !== JSON.stringify(agent.inputs)) {

                    }
                }
            });

            // 4. 更新当前选中的 AgentKey
            this.selectedAgentKey = newKey;


            // 5. 重新计算高亮依赖
            this.highlightedAgents.clear();
            this._calculateAgentDependencies(newKey);


            // 6. 请求重绘画布

            this._requestRender();

            // 7. 重新渲染属性面板为当前 Agent
            const owningStage = this.config.workflowStages.find(stage => stage.agents.includes(newKey));
            const stageNode = owningStage ? this.nodes.find(n => n.type === 'stage' && n.key === owningStage.stage) : null;

            this._renderAgentPropertiesInPanel(newKey, stageNode);

            // 8. 触发配置变更回调
            if (this.callbacks.onConfigChange) {

                this.callbacks.onConfigChange(this.getConfig());
            }

            Notify.success(`Agent 键名已修改为 ${newKey}`);

        }

        // ---------- 辅助：HTML转义 ----------
        _escapeHtml(text) {
            if (!text) return '';
            return text.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    }


    // ╔══════════════════════════════════════════════════════════════════╗
