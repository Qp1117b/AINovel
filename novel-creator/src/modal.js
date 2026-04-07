    // ║  模块 15：模态框栈                                               ║
    // ║  ModalStack — 管理多层模态框的 ESC 关闭顺序                       ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module ModalStack — 多级模态框管理，支持 Escape 关闭最顶层 */

    // ==================== 模态框栈 ====================

    const ModalStack = {
        _stack: [],
        push(overlay) {
            this._stack.push(overlay);
        },
        remove(overlay) {
            const idx = this._stack.indexOf(overlay);
            if (idx !== -1) this._stack.splice(idx, 1);
        },
        closeTop() {
            const top = this._stack.pop();
            if (!top) return;
            const isHistoryPanel = top.querySelector('.nc-history-panel') !== null;
            top.style.opacity = '0';
            top.style.transition = 'opacity .2s';
            setTimeout(() => {
                top.remove();
                if (isHistoryPanel && this._stack.length === 0) {
                    UI.createPanel();
                }
            }, 200);
        }
    };


    // ╔══════════════════════════════════════════════════════════════════╗