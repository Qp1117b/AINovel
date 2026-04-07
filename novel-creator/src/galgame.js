    // ║  模块 21：Galgame 编辑器与播放器                                  ║
    // ║  GalgameEditor / GalgamePlayer — 视觉小说制作与播放               ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module GalgameEditor — 节点图编辑器 + 分支播放器 */

    // ==================== Galgame 编辑器类 ====================

    class GalgameEditor {
        constructor(canvas, callbacks) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.callbacks = callbacks || {};

            // 节点数据
            this.nodes = [];
            this.selectedNode = null;
            this.selectedNodes = new Set(); // 多选节点ID集合

            // 拖拽状态
            this.draggingNode = null;
            this.draggingOffset = { x: 0, y: 0 };
            this.draggingStartX = 0;
            this.draggingStartY = 0;

            // 连接点拖拽
            this.draggingFrom = null;
            this._lastMouseX = 0;          // 鼠标最后位置（画布坐标系，缩放后）
            this._lastMouseY = 0;

            // 视图变换
            this.scale = 1;
            this.offsetX = 0;
            this.offsetY = 0;
            this.isPanning = false;
            this.panStart = { x: 0, y: 0 };

            // 框选
            this.isSelecting = false;
            this.selectStart = { x: 0, y: 0 };
            this.selectRect = null;

            // 对齐辅助线与吸附
            this.alignLines = [];
            this.snapThreshold = 10;        // 吸附阈值（像素）

            // 搜索高亮
            this.searchKeyword = '';

            // 撤销/重做
            this.undoStack = [];
            this.redoStack = [];
            this.maxHistory = 50;

            // 性能优化
            this._renderPending = false;
            this.visibleNodes = [];

            // 节点尺寸常量
            this.nodeWidth = 120;
            this.nodeHeight = 70;
            this.dotSize = 8;

            this.showGuides = true;

            // 类型颜色映射
            this.typeColors = {
                start: '#27ae60',  // 绿
                end: '#e74c3c',    // 红
                normal: '#3498db', // 蓝
                default: '#2a2a3a'
            };

            this._initEvents();
            this._resizeCanvas();
            window.addEventListener('resize', () => this._resizeCanvas());
            this._requestRender();
        }

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

            // 新增：双击画布创建节点
            this.canvas.addEventListener('dblclick', this._onDoubleClick.bind(this));

            // 阻止右键菜单
            this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

            // 鼠标离开画布时的清理
            this.canvas.addEventListener('mouseleave', () => {
                this.draggingNode = null;
                this.draggingFrom = null;
                this.isPanning = false;
                this.isSelecting = false;
                this.selectRect = null;
                this.alignLines = [];
                this._requestRender();
            });

            window.addEventListener('keydown', this._onKeyDown.bind(this));
        }

        // ==================== 事件处理 ====================

        _onMouseDown(e) {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left - this.offsetX) / this.scale;
            const y = (e.clientY - rect.top - this.offsetY) / this.scale;
            this._lastMouseX = x;
            this._lastMouseY = y;

            // 检测节点
            for (const node of this.nodes) {
                if (x >= node.x && x <= node.x + this.nodeWidth &&
                    y >= node.y && y <= node.y + this.nodeHeight) {


                    // 多选逻辑
                    if (e.ctrlKey || e.metaKey) {
                        if (this.selectedNodes.has(node.id)) {
                            this.selectedNodes.delete(node.id);
                            if (this.selectedNode === node) this.selectedNode = null;
                        } else {
                            this.selectedNodes.add(node.id);
                            this.selectedNode = node;
                        }
                    } else if (e.shiftKey) {
                        if (this.selectedNodes.has(node.id)) {
                            this.selectedNodes.delete(node.id);
                            this.selectedNode = this.selectedNodes.size > 0 ? this.getNodeById(Array.from(this.selectedNodes)[0]) : null;
                        } else {
                            this.selectedNodes.add(node.id);
                            this.selectedNode = node;
                        }
                    } else {
                        this.selectedNodes.clear();
                        this.selectedNodes.add(node.id);
                        this.selectedNode = node;
                    }

                    // 触发回调，更新属性面板
                    if (this.callbacks.onNodeSelect) {

                        this.callbacks.onNodeSelect(this.selectedNode);
                    }

                    // 开始拖拽节点
                    this.draggingNode = node;
                    this.draggingStartX = node.x;
                    this.draggingStartY = node.y;
                    this.draggingOffset = { x: x - node.x, y: y - node.y };
                    this.isSelecting = false;
                    this._requestRender();
                    e.preventDefault();
                    return;
                }
            }

            // 点击空白，取消选中
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                this.selectedNodes.clear();
                this.selectedNode = null;
                if (this.callbacks.onNodeSelect) {

                    this.callbacks.onNodeSelect(null);
                }
            }

            // 中键或右键：平移画布
            if (e.button === 1 || e.button === 2) {
                this.isPanning = true;
                this.panStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY };
                e.preventDefault();
                return;
            }

            // 左键：开始框选
            this.isSelecting = true;
            this.selectStart = { x, y };
            this.selectRect = { x, y, width: 0, height: 0 };
            this._requestRender();
        }

        _onDoubleClick(e) {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left - this.offsetX) / this.scale;
            const y = (e.clientY - rect.top - this.offsetY) / this.scale;


            // 检测是否点击到节点
            for (const node of this.nodes) {
                if (x >= node.x && x <= node.x + this.nodeWidth &&
                    y >= node.y && y <= node.y + this.nodeHeight) {

                    if (node.chapterNum) {
                        HistoryUI.viewChapter(node.chapterNum, { mode: 'readonly' });
                    } else {
                        Notify.info('该节点未绑定任何章节');
                    }
                    e.preventDefault();
                    return;
                }
            }

            // 双击空白区域，创建新节点
            const maxId = this.nodes.reduce((max, n) => Math.max(max, n.id), 0);
            const newId = maxId + 1;

            const newNode = {
                id: newId,
                title: `场景${newId}`,
                chapterNum: 0,
                resultMap: {},
                type: 'normal',
                x: x - this.nodeWidth / 2,
                y: y - this.nodeHeight / 2
            };
            this.addNode(newNode);

            // 选中新节点
            this.selectedNodes.clear();
            this.selectedNodes.add(newNode.id);
            this.selectedNode = newNode;
            if (this.callbacks.onNodeSelect) {

                this.callbacks.onNodeSelect(this.selectedNode);
            }
            this._requestRender();
        }

        _onMouseMove(e) {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.clientX;
            const clientY = e.clientY;
            const worldX = (clientX - rect.left - this.offsetX) / this.scale;
            const worldY = (clientY - rect.top - this.offsetY) / this.scale;
            this._lastMouseX = worldX;
            this._lastMouseY = worldY;

            if (this.isPanning) {
                this.offsetX = clientX - this.panStart.x;
                this.offsetY = clientY - this.panStart.y;
                this._requestRender();
                return;
            }

            if (this.draggingNode) {
                // 计算本次移动增量
                const dx = worldX - this.draggingNode.x - this.draggingOffset.x;
                const dy = worldY - this.draggingNode.y - this.draggingOffset.y;

                if (dx !== 0 || dy !== 0) {
                    // 移动所有选中节点
                    for (const nodeId of this.selectedNodes) {
                        const node = this.getNodeById(nodeId);
                        if (node) {
                            node.x += dx;
                            node.y += dy;
                        }
                    }
                    // 更新对齐线
                    this._updateAlignLines(this.draggingNode);
                    // 吸附
                    this._snapToAlignLines();
                    this._requestRender();
                }
            } else if (this.draggingFrom) {
                this._requestRender(); // 重绘以更新临时连线
            } else if (this.isSelecting) {
                this.selectRect = {
                    x: Math.min(this.selectStart.x, worldX),
                    y: Math.min(this.selectStart.y, worldY),
                    width: Math.abs(worldX - this.selectStart.x),
                    height: Math.abs(worldY - this.selectStart.y)
                };
                this._requestRender();
            }
        }

        _onMouseUp(e) {
            if (this.draggingFrom) {
                const rect = this.canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left - this.offsetX) / this.scale;
                const y = (e.clientY - rect.top - this.offsetY) / this.scale;
                let targetNode = null;
                for (const node of this.nodes) {
                    if (x >= node.x && x <= node.x + this.nodeWidth &&
                        y >= node.y && y <= node.y + this.nodeHeight &&
                        node !== this.draggingFrom.node) {
                        targetNode = node;
                        break;
                    }
                }
                if (targetNode) {

                    const oldTarget = this.draggingFrom.node.resultMap[this.draggingFrom.key];
                    this.draggingFrom.node.resultMap[this.draggingFrom.key] = targetNode.id;
                    this._recordAction({
                        type: 'update',
                        nodeId: this.draggingFrom.node.id,
                        oldProps: { resultMap: { [this.draggingFrom.key]: oldTarget } },
                        newProps: { resultMap: { [this.draggingFrom.key]: targetNode.id } }
                    });
                    if (this.callbacks.onNodeSelect) this.callbacks.onNodeSelect(this.selectedNode);
                    if (this.callbacks.onNodesChange) this.callbacks.onNodesChange();
                }
                this.draggingFrom = null;
                this._requestRender();
            }

            if (this.draggingNode) {
                // 记录批量移动
                const movedNodes = [];
                for (const nodeId of this.selectedNodes) {
                    const node = this.getNodeById(nodeId);
                    if (node) {
                        movedNodes.push({
                            id: nodeId,
                            oldX: this.draggingStartX + (node.x - this.draggingNode.x),
                            oldY: this.draggingStartY + (node.y - this.draggingNode.y),
                            newX: node.x,
                            newY: node.y
                        });
                    }
                }
                if (movedNodes.length > 0) {
                    this._recordAction({
                        type: 'moveMultiple',
                        nodes: movedNodes
                    });
                }
                this.draggingNode = null;
                this.alignLines = [];
                this._requestRender();
            }

            if (this.isSelecting) {
                if (this.selectRect && (this.selectRect.width > 5 || this.selectRect.height > 5)) {
                    for (const node of this.nodes) {
                        if (node.x >= this.selectRect.x && node.x + this.nodeWidth <= this.selectRect.x + this.selectRect.width &&
                            node.y >= this.selectRect.y && node.y + this.nodeHeight <= this.selectRect.y + this.selectRect.height) {
                            this.selectedNodes.add(node.id);
                        }
                    }
                    if (this.selectedNodes.size > 0) {
                        this.selectedNode = this.nodes.find(n => n.id === Array.from(this.selectedNodes)[0]);
                    }
                    if (this.callbacks.onNodeSelect) this.callbacks.onNodeSelect(this.selectedNode);
                }
                this.isSelecting = false;
                this.selectRect = null;
                this._requestRender();
            }

            this.draggingNode = null;
            this.isPanning = false;
        }

        _onWheel(e) {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = this.scale * delta;
            if (newScale < 0.2 || newScale > 5) return;

            const worldX = (mouseX - this.offsetX) / this.scale;
            const worldY = (mouseY - this.offsetY) / this.scale;

            this.scale = newScale;
            this.offsetX = mouseX - worldX * this.scale;
            this.offsetY = mouseY - worldY * this.scale;

            this._requestRender();
        }

        _onKeyDown(e) {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'a') {
                    e.preventDefault();
                    this.selectAll();
                } else if (e.key === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) this.redo(); else this.undo();
                } else if (e.key === 'y') {
                    e.preventDefault();
                    this.redo();
                } else if (e.key === 'c') {
                    e.preventDefault();
                    this.copySelected();
                } else if (e.key === 'v') {
                    e.preventDefault();
                    this.paste();
                }
            } else if (e.key === 'Delete' || e.key === 'Del') {
                e.preventDefault();
                this.deleteSelected();
            }
        }

        // ==================== 对齐辅助线与吸附 ====================

        /**
         * 更新对齐线（包括节点之间的对齐线和列边界线）
         * @param {Object} draggedNode - 当前拖拽的节点
         */
        _updateAlignLines(draggedNode) {

            const threshold = this.snapThreshold || 10;
            this.alignLines = [];

            // 1. 节点之间的对齐线（原有逻辑）
            for (const node of this.nodes) {
                if (node === draggedNode || !this.selectedNodes.has(node.id)) continue;

                const draggedCenterY = draggedNode.y + this.nodeHeight / 2;
                const nodeCenterY = node.y + this.nodeHeight / 2;
                if (Math.abs(draggedCenterY - nodeCenterY) < threshold) {

                    this.alignLines.push({ y: nodeCenterY, horizontal: true });
                }
                if (Math.abs(draggedNode.y - node.y) < threshold) {

                    this.alignLines.push({ y: node.y, horizontal: true });
                }
                if (Math.abs(draggedNode.y + this.nodeHeight - node.y - this.nodeHeight) < threshold) {

                    this.alignLines.push({ y: node.y + this.nodeHeight, horizontal: true });
                }

                const draggedCenterX = draggedNode.x + this.nodeWidth / 2;
                const nodeCenterX = node.x + this.nodeWidth / 2;
                if (Math.abs(draggedCenterX - nodeCenterX) < threshold) {

                    this.alignLines.push({ x: nodeCenterX, horizontal: false });
                }
                if (Math.abs(draggedNode.x - node.x) < threshold) {

                    this.alignLines.push({ x: node.x, horizontal: false });
                }
                if (Math.abs(draggedNode.x + this.nodeWidth - node.x - this.nodeWidth) < threshold) {

                    this.alignLines.push({ x: node.x + this.nodeWidth, horizontal: false });
                }
            }

            // 2. 网格列边界线（垂直虚线）
            if (!this.columnWidth) this.columnWidth = 200;
            const viewLeft = (-this.offsetX) / this.scale;
            const viewRight = (this.canvas.width - this.offsetX) / this.scale;
            const startCol = Math.floor(viewLeft / this.columnWidth) * this.columnWidth;
            const endCol = Math.ceil(viewRight / this.columnWidth) * this.columnWidth;


            for (let x = startCol; x <= endCol; x += this.columnWidth) {
                const dist = Math.abs(draggedNode.x + this.nodeWidth / 2 - x);
                if (dist < threshold) {

                    this.alignLines.push({ x: x, horizontal: false, isColumn: true });
                }
            }

            // 3. 网格行边界线（水平虚线）—— 新增
            if (!this.rowHeight) this.rowHeight = 150;
            const viewTop = (-this.offsetY) / this.scale;
            const viewBottom = (this.canvas.height - this.offsetY) / this.scale;
            const startRow = Math.floor(viewTop / this.rowHeight) * this.rowHeight;
            const endRow = Math.ceil(viewBottom / this.rowHeight) * this.rowHeight;


            for (let y = startRow; y <= endRow; y += this.rowHeight) {
                const dist = Math.abs(draggedNode.y + this.nodeHeight / 2 - y);
                if (dist < threshold) {

                    this.alignLines.push({ y: y, horizontal: true, isRow: true });
                }
            }
        }

        /**
         * 将选中节点吸附到最近的对齐线（支持列边界）
         */
        _snapToAlignLines() {

            if (this.selectedNodes.size === 0 || this.alignLines.length === 0) {

                return;
            }

            // 取第一个选中的节点作为基准（通常是 draggingNode）
            const primaryId = this.selectedNode ? this.selectedNode.id : Array.from(this.selectedNodes)[0];
            const primary = this.getNodeById(primaryId);
            if (!primary) {
                console.warn('[GalgameEditor._snapToAlignLines] 未找到基准节点');
                return;
            }


            let snapX = null, snapY = null;
            let minDistX = Infinity, minDistY = Infinity;

            for (const line of this.alignLines) {
                if (line.horizontal) {
                    const dist = Math.abs(primary.y - line.y);
                    if (dist < this.snapThreshold && dist < minDistY) {
                        minDistY = dist;
                        snapY = line.y;

                    }
                } else {
                    const dist = Math.abs(primary.x + this.nodeWidth / 2 - line.x);
                    if (dist < this.snapThreshold && dist < minDistX) {
                        minDistX = dist;
                        snapX = line.x;

                    }
                }
            }

            if (snapX !== null || snapY !== null) {
                const dx = snapX !== null ? snapX - (primary.x + this.nodeWidth / 2) : 0;
                const dy = snapY !== null ? snapY - primary.y : 0;


                for (const nodeId of this.selectedNodes) {
                    const node = this.getNodeById(nodeId);
                    if (node) {
                        node.x += dx;
                        node.y += dy;

                    }
                }
            } else {

            }
        }

        // ==================== 批量操作 ====================

        selectAll() {
            this.selectedNodes.clear();
            for (const node of this.nodes) {
                this.selectedNodes.add(node.id);
            }
            if (this.nodes.length > 0) this.selectedNode = this.nodes[0];
            if (this.callbacks.onNodeSelect) this.callbacks.onNodeSelect(this.selectedNode);
            this._requestRender();
        }

        deleteSelected() {
            if (this.selectedNodes.size === 0) return;
            const toDelete = Array.from(this.selectedNodes);
            for (const id of toDelete) {
                this.deleteNode(id, true); // 批量删除，不单独记录
            }
            this.selectedNodes.clear();
            this.selectedNode = null;
            if (this.callbacks.onNodeSelect) this.callbacks.onNodeSelect(null);
            this._requestRender();
            if (this.callbacks.onNodesChange) this.callbacks.onNodesChange();
        }

        copySelected() {
            if (this.selectedNodes.size === 0) return;
            this.copiedNodes = [];
            for (const id of this.selectedNodes) {
                const node = this.getNodeById(id);
                if (node) {
                    const copy = JSON.parse(JSON.stringify(node));
                    delete copy.id;
                    delete copy.x;
                    delete copy.y;
                    this.copiedNodes.push(copy);
                }
            }
            Notify.success(`已复制 ${this.copiedNodes.length} 个节点`);
        }

        paste() {
            if (!this.copiedNodes || this.copiedNodes.length === 0) return;
            const maxId = this.nodes.reduce((max, n) => Math.max(max, n.id), 0);
            let newId = maxId + 1;
            const newNodes = [];

            const viewCenterX = (this.canvas.width / 2 - this.offsetX) / this.scale;
            const viewCenterY = (this.canvas.height / 2 - this.offsetY) / this.scale;

            if (this.copiedNodes.length === 1) {
                const copy = this.copiedNodes[0];
                const newNode = {
                    ...copy,
                    id: newId++,
                    x: viewCenterX,
                    y: viewCenterY,
                    resultMap: copy.resultMap ? JSON.parse(JSON.stringify(copy.resultMap)) : {}
                };
                newNodes.push(newNode);
            } else {
                const first = this.copiedNodes[0];
                const offsetX = viewCenterX - first.x;
                const offsetY = viewCenterY - first.y;
                for (const copy of this.copiedNodes) {
                    const newNode = {
                        ...copy,
                        id: newId++,
                        x: copy.x + offsetX,
                        y: copy.y + offsetY,
                        resultMap: copy.resultMap ? JSON.parse(JSON.stringify(copy.resultMap)) : {}
                    };
                    newNodes.push(newNode);
                }
            }

            for (const node of newNodes) {
                this.nodes.push(node);
                this._recordAction({ type: 'add', node: JSON.parse(JSON.stringify(node)) });
            }
            this.selectedNodes.clear();
            for (const node of newNodes) {
                this.selectedNodes.add(node.id);
            }
            this.selectedNode = newNodes[0];
            if (this.callbacks.onNodeSelect) this.callbacks.onNodeSelect(this.selectedNode);
            this._requestRender();
            if (this.callbacks.onNodesChange) this.callbacks.onNodesChange();
        }

        // ==================== 节点管理 ====================

        getNodeById(id) {
            return this.nodes.find(n => n.id === id);
        }

        addNode(node) {
            // 确保节点有 type 字段
            if (!node.type) node.type = 'normal';
            this.nodes.push(node);
            this._recordAction({ type: 'add', node: JSON.parse(JSON.stringify(node)) });
            this._requestRender();
            if (this.callbacks.onNodesChange) this.callbacks.onNodesChange();
        }

        deleteNode(nodeId, batch = false) {
            const node = this.getNodeById(nodeId);
            if (!node) return;

            const references = [];
            for (const n of this.nodes) {
                if (n.id === nodeId) continue;
                if (n.resultMap) {
                    for (const [key, target] of Object.entries(n.resultMap)) {
                        if (target === nodeId) {
                            references.push({ nodeId: n.id, key, oldTarget: target });
                        }
                    }
                    if (n.resultMap.default === nodeId) {
                        references.push({ nodeId: n.id, key: 'default', oldTarget: nodeId });
                    }
                }
            }

            const nodeCopy = JSON.parse(JSON.stringify(node));

            for (const ref of references) {
                const refNode = this.getNodeById(ref.nodeId);
                if (refNode) {
                    if (ref.key === 'default') {
                        refNode.resultMap.default = 0;
                    } else {
                        refNode.resultMap[ref.key] = 0;
                    }
                }
            }

            const idx = this.nodes.findIndex(n => n.id === nodeId);
            if (idx !== -1) this.nodes.splice(idx, 1);

            if (!batch) {
                this._recordAction({ type: 'delete', node: nodeCopy, references });
            }
            this._requestRender();
            if (this.callbacks.onNodesChange) this.callbacks.onNodesChange();
        }

        updateNode(nodeId, updates) {
            const node = this.getNodeById(nodeId);
            if (node) {
                const oldProps = {};
                for (const key in updates) {
                    oldProps[key] = node[key];
                }
                Object.assign(node, updates);
                this._recordAction({ type: 'update', nodeId, oldProps, newProps: updates });
                this._requestRender();
                if (this.callbacks.onNodeSelect && this.selectedNode && this.selectedNode.id === nodeId) {
                    this.callbacks.onNodeSelect(node);
                }
                if (this.callbacks.onNodesChange) this.callbacks.onNodesChange();
            }
        }

        setNodes(nodes) {
            this.nodes = nodes.map(n => ({
                ...n,
                // 确保新字段存在
                script: n.script || '',
                defaultTarget: n.defaultTarget || '',
                onEnterScript: n.onEnterScript || '',
                path: n.path || '',
                type: n.type || 'normal',
                x: n.x,
                y: n.y
            }));
            this.selectedNode = null;
            this.selectedNodes.clear();
            this._requestRender();
        }

        loadFromJSON(nodes) {
            this.setNodes(nodes);
        }

        toJSON() {
            return this.nodes.map(n => ({
                id: n.id,
                title: n.title,
                chapterNum: n.chapterNum,
                script: n.script,               // 新增
                defaultTarget: n.defaultTarget,  // 新增
                onEnterScript: n.onEnterScript,  // 新增
                path: n.path,                    // 新增
                type: n.type || 'normal',
                x: n.x,
                y: n.y
            }));
        }

        // ==================== 撤销/重做 ====================

        _recordAction(action) {
            this.undoStack.push(action);
            if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
            this.redoStack = [];
        }

        undo() {
            if (this.undoStack.length === 0) return;
            const action = this.undoStack.pop();
            this._applyAction(action, true);
            this.redoStack.push(action);
            this._requestRender();
            if (this.callbacks.onNodesChange) this.callbacks.onNodesChange();
        }

        redo() {
            if (this.redoStack.length === 0) return;
            const action = this.redoStack.pop();
            this._applyAction(action, false);
            this.undoStack.push(action);
            this._requestRender();
            if (this.callbacks.onNodesChange) this.callbacks.onNodesChange();
        }

        _applyAction(action, isUndo) {
            switch (action.type) {
                case 'add':
                    if (isUndo) {
                        const idx = this.nodes.findIndex(n => n.id === action.node.id);
                        if (idx !== -1) this.nodes.splice(idx, 1);
                    } else {
                        this.nodes.push(action.node);
                    }
                    break;
                case 'delete':
                    if (isUndo) {
                        this.nodes.push(action.node);
                        if (action.references) {
                            for (const ref of action.references) {
                                const node = this.getNodeById(ref.nodeId);
                                if (node) {
                                    if (ref.key === 'default') {
                                        node.resultMap.default = ref.oldTarget;
                                    } else {
                                        node.resultMap[ref.key] = ref.oldTarget;
                                    }
                                }
                            }
                        }
                    }
                    break;
                case 'moveMultiple':
                    for (const m of action.nodes) {
                        const node = this.getNodeById(m.id);
                        if (node) {
                            if (isUndo) {
                                node.x = m.oldX;
                                node.y = m.oldY;
                            } else {
                                node.x = m.newX;
                                node.y = m.newY;
                            }
                        }
                    }
                    break;
                case 'update':
                    const node = this.getNodeById(action.nodeId);
                    if (node) {
                        if (isUndo) {
                            Object.assign(node, action.oldProps);
                        } else {
                            Object.assign(node, action.newProps);
                        }
                    }
                    break;
            }
        }

        // ==================== 渲染（含视口裁剪、临时连线）====================

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

            // 计算可视范围（世界坐标）
            const viewLeft = (-this.offsetX) / this.scale;
            const viewTop = (-this.offsetY) / this.scale;
            const viewRight = (w - this.offsetX) / this.scale;
            const viewBottom = (h - this.offsetY) / this.scale;

            // 绘制背景网格（灰色细线）
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 0.5;
            const gridSize = 50;
            const startX = Math.floor(viewLeft / gridSize) * gridSize - gridSize;
            const startY = Math.floor(viewTop / gridSize) * gridSize - gridSize;
            const endX = Math.ceil(viewRight / gridSize) * gridSize + gridSize;
            const endY = Math.ceil(viewBottom / gridSize) * gridSize + gridSize;
            ctx.beginPath();
            for (let x = startX; x < endX; x += gridSize) {
                ctx.moveTo(x, startY);
                ctx.lineTo(x, endY);
            }
            for (let y = startY; y < endY; y += gridSize) {
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
            }
            ctx.strokeStyle = '#2d3748';
            ctx.stroke();

            // ========== 根据 showGuides 绘制指示线 ==========
            if (this.showGuides) {
                // 绘制列边界虚线（垂直指示线）
                if (!this.columnWidth) this.columnWidth = 200;
                const colStart = Math.floor(viewLeft / this.columnWidth) * this.columnWidth;
                const colEnd = Math.ceil(viewRight / this.columnWidth) * this.columnWidth;
                ctx.save();
                ctx.strokeStyle = '#4a6fa5'; // 淡蓝色
                ctx.lineWidth = 1 / this.scale;
                ctx.setLineDash([5 / this.scale, 5 / this.scale]);
                ctx.beginPath();
                for (let x = colStart; x <= colEnd; x += this.columnWidth) {
                    ctx.moveTo(x, viewTop);
                    ctx.lineTo(x, viewBottom);
                }
                ctx.stroke();
                ctx.restore();

                // 绘制行边界虚线（水平指示线）
                if (!this.rowHeight) this.rowHeight = 150;
                const rowStart = Math.floor(viewTop / this.rowHeight) * this.rowHeight;
                const rowEnd = Math.ceil(viewBottom / this.rowHeight) * this.rowHeight;
                ctx.save();
                ctx.strokeStyle = '#4a6fa5';
                ctx.lineWidth = 1 / this.scale;
                ctx.setLineDash([5 / this.scale, 5 / this.scale]);
                ctx.beginPath();
                for (let y = rowStart; y <= rowEnd; y += this.rowHeight) {
                    ctx.moveTo(viewLeft, y);
                    ctx.lineTo(viewRight, y);
                }
                ctx.stroke();
                ctx.restore();
            }

            // 绘制节点之间的连线
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            for (const node of this.nodes) {
                if (!node._targets) continue;
                node._targets.forEach(target => {
                    const targetNode = this.getNodeById(target.id);
                    if (!targetNode) return;
                    const fromX = node.x + this.nodeWidth + 5;
                    const fromY = node.y + this.nodeHeight / 2;
                    const toX = targetNode.x + 5;
                    const toY = targetNode.y + this.nodeHeight / 2;

                    ctx.save();
                    if (target.conditional) {
                        ctx.globalAlpha = 0.3;
                    } else {
                        ctx.globalAlpha = 1.0;
                    }
                    ctx.strokeStyle = '#aa66cc';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(fromX, fromY);
                    ctx.lineTo(toX, toY);
                    ctx.stroke();
                    ctx.restore();
                });
            }

            // 绘制所有节点
            for (const node of this.nodes) {
                this._drawNode(ctx, node);
            }

            // 绘制对齐线（节点间对齐线和网格边界吸附线）
            ctx.save();
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2 / this.scale;
            ctx.setLineDash([5 / this.scale, 5 / this.scale]);
            for (const line of this.alignLines) {
                ctx.beginPath();
                if (line.horizontal) {
                    ctx.moveTo(viewLeft, line.y);
                    ctx.lineTo(viewRight, line.y);
                } else {
                    ctx.moveTo(line.x, viewTop);
                    ctx.lineTo(line.x, viewBottom);
                }
                ctx.stroke();
            }
            ctx.restore();

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

            ctx.restore();
        }

        _drawNode(ctx, node) {
            const isSelected = this.selectedNodes.has(node.id);
            const matchesSearch = this.searchKeyword && (
                node.id.toString().includes(this.searchKeyword) ||
                (node.title && node.title.toLowerCase().includes(this.searchKeyword))
            );

            const typeColor = this.typeColors[node.type] || this.typeColors.default;

            let bgColor;
            if (matchesSearch) {
                bgColor = '#5a3a3a';
            } else if (isSelected) {
                bgColor = '#3a3a5a';
            } else {
                bgColor = typeColor + '40'; // 半透明
            }

            ctx.fillStyle = bgColor;
            ctx.strokeStyle = matchesSearch ? '#ffaa00' : typeColor;
            ctx.lineWidth = isSelected ? 3 : (matchesSearch ? 2 : 1);
            ctx.fillRect(node.x, node.y, this.nodeWidth, this.nodeHeight);
            ctx.strokeRect(node.x, node.y, this.nodeWidth, this.nodeHeight);

            // 标题
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(node.title || '场景', node.x + 8, node.y + 20);

            // ID
            ctx.font = '10px monospace';
            ctx.fillStyle = '#aaa';
            ctx.fillText(`#${node.id}`, node.x + this.nodeWidth - 30, node.y + 15);

            // 显示章节信息（双击可查看）
            if (node.chapterNum) {
                // 章节号
                ctx.font = '10px monospace';
                ctx.fillStyle = '#4ecdc4';
                ctx.fillText(`📖 第${node.chapterNum}章`, node.x + 8, node.y + 40);

                // 内容预览（前20字符）
                const chapters = Storage.loadChapters();
                const chapter = chapters.find(c => c.num === node.chapterNum);
                if (chapter) {
                    const preview = chapter.content.replace(/\n/g, ' ').substring(0, 20) + (chapter.content.length > 20 ? '…' : '');
                    ctx.font = '9px monospace';
                    ctx.fillStyle = '#888';
                    ctx.fillText(preview, node.x + 8, node.y + 55);
                } else {
                    ctx.font = '9px monospace';
                    ctx.fillStyle = '#ff6b6b';
                    ctx.fillText('章节不存在', node.x + 8, node.y + 55);
                }
            } else {
                ctx.font = '10px monospace';
                ctx.fillStyle = '#aaa';
                ctx.fillText('📭 无章节', node.x + 8, node.y + 40);
            }
        }

        /**
         * 自动布局节点：按网格中心对齐，若目标网格被占用，则通过 BFS 寻找最近的空闲网格
         */
        autoLayout() {

            // 初始化列宽和行高（若未设置）
            if (!this.columnWidth) {
                this.columnWidth = 200;

            }
            if (!this.rowHeight) {
                this.rowHeight = 150;

            }

            const movedNodes = [];
            // 按节点 ID 排序，使布局结果稳定
            const sortedNodes = [...this.nodes].sort((a, b) => a.id - b.id);
            const occupied = new Set(); // 存储 "col,row" 字符串，表示已被占用的网格

            for (const node of sortedNodes) {
                // 计算节点的中心点
                const centerX = node.x + this.nodeWidth / 2;
                const centerY = node.y + this.nodeHeight / 2;
                let targetCol = Math.round(centerX / this.columnWidth);
                let targetRow = Math.round(centerY / this.rowHeight);
                let key = `${targetCol},${targetRow}`;

                // 若目标单元格已被占用，则搜索最近的空闲单元格
                if (occupied.has(key)) {


                    // BFS 逐层向外搜索（无半径限制）
                    let found = false;
                    let bestCol = targetCol, bestRow = targetRow;
                    const queue = [{ col: targetCol, row: targetRow, dist: 0 }];
                    const visited = new Set([key]);
                    let idx = 0;

                    while (idx < queue.length && !found) {
                        const { col, row, dist } = queue[idx++];
                        const currentKey = `${col},${row}`;
                        if (!occupied.has(currentKey)) {
                            bestCol = col;
                            bestRow = row;
                            found = true;

                            break;
                        }

                        // 四个方向扩展（右、左、下、上）
                        const directions = [
                            { dc: 1, dr: 0 },  // 右
                            { dc: -1, dr: 0 }, // 左
                            { dc: 0, dr: 1 },  // 下
                            { dc: 0, dr: -1 }  // 上
                        ];
                        for (const { dc, dr } of directions) {
                            const ncol = col + dc;
                            const nrow = row + dr;
                            const nkey = `${ncol},${nrow}`;
                            if (!visited.has(nkey)) {
                                visited.add(nkey);
                                queue.push({ col: ncol, row: nrow, dist: dist + 1 });
                            }
                        }
                    }

                    if (found) {
                        targetCol = bestCol;
                        targetRow = bestRow;
                        key = `${targetCol},${targetRow}`;
                    } else {
                        // 理论上不会执行到这里，因为画布无限大，总有空闲网格
                        console.error(`[GalgameEditor.autoLayout] 节点 ${node.id} 未找到空闲网格，保留原位置`);
                        continue; // 跳过移动
                    }
                }

                // 计算目标网格中心的左上角坐标
                const targetCenterX = targetCol * this.columnWidth;
                const targetCenterY = targetRow * this.rowHeight;
                const newX = targetCenterX - this.nodeWidth / 2;
                const newY = targetCenterY - this.nodeHeight / 2;

                // 记录移动（仅当位置有显著变化时）
                if (Math.abs(node.x - newX) > 0.1 || Math.abs(node.y - newY) > 0.1) {
                    movedNodes.push({
                        id: node.id,
                        oldX: node.x,
                        oldY: node.y,
                        newX: newX,
                        newY: newY
                    });
                    node.x = newX;
                    node.y = newY;

                } else {

                }

                // 标记该单元格为已占用
                occupied.add(key);
            }

            if (movedNodes.length > 0) {
                this._recordAction({ type: 'moveMultiple', nodes: movedNodes });

            } else {

            }

            this._requestRender();
            if (this.callbacks.onNodesChange) {
                this.callbacks.onNodesChange();

            }

        }
    }

    // ==================== Galgame 播放器类 ====================

    class GalgamePlayer {
        constructor(container, project, optionsContainer, callbacks = {}) {

            this.container = container;
            this.optionsContainer = optionsContainer;
            this.project = project;
            this.callbacks = callbacks;
            this.currentNodeId = project.startNode;
            this.variables = JSON.parse(JSON.stringify(project.variables || {}));
            this.history = [];
            this.canGoBack = false;
            this.originalResolver = null;

        }

        start() {
            this.originalResolver = window.__interactionResolver;
            window.__interactionResolver = (result) => this.handleInteraction(result);
            this.loadNode(this.currentNodeId, true);
        }

        stop() {
            window.__interactionResolver = this.originalResolver;
            this.container.innerHTML = '';
        }

        _evalScript(script, result) {

            const utils = {
                getControl: (res) => {
                    const match = res.match(/^\[([^:]+):\s*(.*)\]$/);
                    return match ? { type: match[1], value: match[2] } : null;
                },
                getNumber: (res) => {
                    const ctrl = utils.getControl(res);
                    return ctrl ? parseFloat(ctrl.value) : NaN;
                },
                getText: (res) => {
                    const ctrl = utils.getControl(res);
                    return ctrl ? ctrl.value : '';
                }
            };
            try {
                const fn = new Function('vars', 'result', 'utils', script);
                const resultValue = fn(this.variables, result, utils);

                return resultValue;
            } catch (e) {
                console.error('[GalgamePlayer] 脚本执行错误:', e);
                return undefined;
            }
        }

        resolveTarget(target) {
            if (typeof target === 'number') {
                return findNode(target) ? target : null;
            } else if (typeof target === 'string') {
                // 尝试解析为数字ID
                const parsed = parseInt(target, 10);
                if (!isNaN(parsed) && findNode(parsed)) {
                    return parsed;
                }
                // 否则作为路径查找
                const id = pathToId[target];
                if (id !== undefined && findNode(id)) {
                    return id;
                }
            }
            return null;
        }

        getNode(nodeId) {
            return this.project.nodes.find(n => n.id === nodeId);
        }

        getCurrentNode() {
            return this.getNode(this.currentNodeId);
        }

        async loadNode(nodeId, skipHistory = false) {

            if (!skipHistory && this.currentNodeId && this.currentNodeId !== nodeId) {
                this.history.push(this.currentNodeId);
                this.canGoBack = true;
            }
            this.currentNodeId = nodeId;
            const node = this.getNode(nodeId);
            if (!node) {
                console.error('[GalgamePlayer] 节点不存在:', nodeId);
                this.container.innerHTML = '<div class="nc-color--error">节点不存在</div>';
                return;
            }

            // 执行进入脚本
            if (node.onEnterScript) {
                this._evalScript(node.onEnterScript, null);
            }

            // 渲染内容
            const chapters = Storage.loadChapters();
            const chapter = chapters.find(c => c.num === node.chapterNum);
            if (!chapter) {
                console.error('[GalgamePlayer] 章节丢失:', node.chapterNum);
                this.container.innerHTML = '<div class="nc-color--error">章节内容丢失</div>';
                return;
            }


            const processed = await UI._replaceImagePlaceholders(chapter.content);
            this.container.innerHTML = processed;
            this.executeScripts(this.container);

            if (this.optionsContainer) {
                this.optionsContainer.innerHTML = '<div class="nc-color--muted-center">交互区域</div>';
            }

            if (this.callbacks.onNodeChange) {
                this.callbacks.onNodeChange(this.currentNodeId, this.canGoBack);
            }
        }

        handleInteraction(result) {

            const node = this.getCurrentNode();
            if (!node) return;

            if (!node.script) {
                console.warn('[GalgamePlayer] 当前节点没有脚本，无法处理');
                return;
            }

            const scriptResult = this._evalScript(node.script, result);
            let targetId = this._resolveTarget(scriptResult);

            if (targetId === null && node.defaultTarget !== undefined) {
                targetId = this._resolveTarget(node.defaultTarget);

            }

            if (targetId !== null) {
                this.loadNode(targetId);
            } else {
                console.warn('[GalgamePlayer] 无法确定跳转目标，停留在当前节点');
            }

            window.__interactionResolver = function (result) {

                const node = findNode(currentNodeId);
                if (!node) return;

                if (!node.script) {
                    console.warn('[Player] 当前节点没有脚本，无法处理');
                    return;
                }

                const scriptResult = evalScript(node.script, result);
                let targetId = resolveTarget(scriptResult);

                if (targetId === null && node.defaultTarget !== undefined) {
                    targetId = resolveTarget(node.defaultTarget);

                }

                if (targetId !== null) {
                    loadNode(targetId);
                } else {
                    console.warn('[Player] 无法确定跳转目标，停留在当前节点');
                }
            };
        }

        goBack() {
            if (this.history.length === 0) return;
            const prevNodeId = this.history.pop();
            this.canGoBack = this.history.length > 0;
            this.loadNode(prevNodeId, true);
        }

        executeScripts(container) {
            container.querySelectorAll('script').forEach(oldScript => {
                const newScript = document.createElement('script');
                Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                newScript.textContent = oldScript.textContent;
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });
        }
    }


    // ╔══════════════════════════════════════════════════════════════════╗