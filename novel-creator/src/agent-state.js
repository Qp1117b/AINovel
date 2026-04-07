    // ║  模块 11：Agent 状态管理                                          ║
    // ║  AgentStateManager — StateStore.agent 的向后兼容外观              ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /**
     * @module AgentStateManager
     * @deprecated 新代码请直接使用 StateStore.agent
     * 此对象是 StateStore.agent 的薄包装，保持旧调用点不改动。
     *
     * 状态值（AgentStatus）:
     *   'idle' | 'running' | 'pending' | 'waiting_input'
     *   'reflow_processing' | 'reflow_waiting' | 'completed' | 'error'
     */
    const AgentStateManager = {
        /** @returns {Object} 当前所有 agent 状态快照（只读） */
        get states() { return StateStore.agent.snapshot(); },

        init() { StateStore.agent.init(); },
        setState(agentKey, status) { StateStore.agent.setState(agentKey, status); },
        getState(agentKey) { return StateStore.agent.getState(agentKey); },
        reset() { StateStore.agent.reset(); },
    };

    // ==================== 前置检测 ====================

    // ==================== 辅助函数：获取Agent显示名称 ====================

    function getAgentDisplayName(agentKey) {
        const agent = CONFIG.AGENTS[agentKey];
        if (!agent) {
            console.warn(`[getAgentDisplayName] 未找到 agentKey="${agentKey}"`);
            return agentKey;
        }
        return agent.displayName; // 可能为空字符串
    }

    // ==================== 辅助函数：获取Agent悬浮提示 ====================

    function getAgentHoverText(agentKey) {
        const agent = CONFIG.AGENTS[agentKey];
        if (!agent) {
            console.warn(`[getAgentHoverText] 未找到 agentKey="${agentKey}"`);
            return '';
        }
        return agent.hover || ''; // 若 hover 为 undefined/null 则返回空字符串
    }


    // ╔══════════════════════════════════════════════════════════════════╗