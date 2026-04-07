    // ║  模块 X：AI Agent 工坊                                        ║
    // ║  AgentWorkshop — 通用生成器 + 主/子AI 协作 + 可视化编辑器       ║
    // ║  核心：通用生成器.json（通用） 或 AI生成专属.json（专用）        ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module AgentWorkshop — AI Agent 工坊
     * 
     * 流程：
     * 1. 用户描述需求 → 主 AI 生成配置结构（可反复对话微调）
     * 2. 对每个 Agent → 选择【通用】或【专用】
     * 3. 专用 → 子 AI 生成专属角色卡
     * 4. 用户微调每个角色卡内容
     * 5. 导出配置 + 角色卡文件
     * 
     * 通用生成器.json 格式：
     * - 使用【职能】【职能规则】【唯一输出格式】【输出示例】【自定义】【输入】标记
     * - 是元Agent，可动态切换角色
     */

    // ==================== 常量定义 ====================

    const AGENT_WORKSHOP = {

        // 通用生成器（唯一的通用角色卡）
        GENERAL_GENERATOR: {
            id: 'general_generator',
            name: '通用生成器',
            description: '元Agent，通过标记动态切换角色，适用于任何职能',
            icon: '🔧',
            color: '#3498db',
            file: 'agents/general/通用生成器.json',
            // 标记说明
            markers: ['职能', '职能规则', '唯一输出格式', '输出示例', '自定义', '输入']
        },

        // Workshop 专用 AI 角色卡
        WORKSHOP_AI: {
            // 主AI：生成配置结构
            mainAI: {
                id: 'workshop_main_ai',
                name: 'Workshop主AI',
                description: '负责生成工作流配置结构',
                file: 'agents/workshop/主AI配置生成器.json',
                systemPrompt: `你是自动化小说创作系统的配置规划专家。

你的任务是根据用户的描述，设计整个工作流的配置结构。

【输出格式】
请输出一个JSON对象，包含以下结构：

{
  "description": "配置描述",
  "mode": "normal" | "interactive" | "datafication",
  "agentCount": 数字（总Agent数量）,
  "agents": [
    {
      "id": "agent_id",
      "name": "Agent名称",
      "desc": "Agent职责描述",
      "category": "core" | "image" | "audio" | "interactive" | "state" | "summary",
      "required": true | false,
      "suggestedType": "general" | "special"
    }
  ],
  "workflowStages": [
    {
      "id": "stage_id",
      "name": "阶段名称",
      "agents": ["agent_id1", "agent_id2"],
      "mode": "serial" | "parallel"
    }
  ],
  "notes": "给用户的说明或建议"
}

【规则】
1. core类Agent（章节创作、剧情概览、状态优化、状态维护）是必须的
2. image/audio/interactive类Agent根据用户需求可选
3. suggestedType建议：如果Agent职责复杂/专业，建议用special
4. 工作流阶段要有合理的依赖关系
5. 始终输出合法的JSON，不要包含其他文字`
            },
            // 子AI：生成专用角色卡
            subAI: {
                id: 'workshop_sub_ai',
                name: 'Workshop子AI',
                description: '负责生成专用角色卡',
                file: 'agents/workshop/专用角色卡生成器.json',
                systemPrompt: `你是自动化小说创作系统的角色卡设计师。

你的任务是根据用户描述的Agent职责，生成一个完整的角色卡JSON文件。

【输入格式】
你会收到一个结构化JSON对象作为输入，包含以下字段：
- agent: {id, name, category, desc, required} — 目标Agent的基本信息
- workflow: {mode, description, upstreamAgents[], downstreamAgents[]} — 工作流上下文
- novelContext: {type, style, complexity} — 小说创作上下文

请根据这些信息设计该Agent的角色卡，确保system_prompt中体现上下游Agent的协作关系。

【角色卡格式要求】
输出一个完整的角色卡JSON，遵循 chara_card_v2 规范：

{
  "spec": "chara_card_v2",
  "spec_version": "1.0",
  "data": {
    "name": "角色名称",
    "description": "【角色定位】简短描述\\n\\n【核心工作原理】工作原理说明",
    "personality": "性格特点关键词（逗号分隔）",
    "scenario": "场景设定描述",
    "first_mes": "首次消息",
    "alternate_greetings": ["备选问候1", "备选问候2"],
    "system_prompt": "详细的系统提示词，包含：\\n1. 角色定位\\n2. 输入信息\\n3. 输出格式\\n4. 规则约束\\n5. 最佳实践",
    "post_history_instructions": "对话历史指令",
    "tags": ["标签1", "标签2"],
    "creator": "AI生成",
    "character_version": "1.0",
    "extensions": {
      "sillytavern": {
        "agent_type": "专用",
        "agent_id": "对应AgentID"
      }
    }
  }
}

【重要】
1. system_prompt 是核心，要详细描述角色的职能、规则、输出格式
2. description 中的【核心工作原理】要清晰说明工作流程
3. 输出必须是完整的JSON，不要包含其他文字`
            }
        },

        // 支持生成专用角色卡的 Agent 列表
        SPECIALIZABLE_AGENTS: [
            { id: 'imageGenerator', name: '生图师', desc: '生成图像提示词', icon: '🖼️' },
            { id: 'typesetter', name: '排版师', desc: 'HTML格式化排版', icon: '📝' },
            { id: 'fusionGenerator', name: '融合生图师', desc: '多图融合生成', icon: '🔀' },
            { id: 'musicGenerator', name: '音乐生成师', desc: '背景音乐生成', icon: '🎵' },
            { id: 'voiceClone', name: '语音克隆师', desc: '语音合成', icon: '🎤' },
            { id: 'interactiveTypesetter', name: '互动排版师', desc: '互动控件排版', icon: '🎮' },
            { id: 'interactiveFusionGen', name: '互动融合生图师', desc: '互动场景融合', icon: '✨' },
            { id: 'interactiveElementGen', name: '互动元素生图师', desc: '交互元素生成', icon: '🔳' }
        ],

        // 核心 Agent（必须包含，只能用通用生成器）
        CORE_AGENTS: [
            { id: 'finalChapter', name: '章节创作师', desc: '生成完整章节正文', icon: '📖' },
            { id: 'storySummarizer', name: '剧情概览师', desc: '跨章剧情记忆', icon: '🧠' },
            { id: 'optimizer', name: '状态优化师', desc: '优化状态描述', icon: '⚡' },
            { id: 'updater', name: '状态维护师', desc: '维护故事状态', icon: '🔄' }
        ],

        // 小说类型预设
        NOVEL_TYPES: [
            { id: 'xianxia', name: '修仙玄幻', icon: '⚔️' },
            { id: 'urban', name: '都市言情', icon: '🏙️' },
            { id: 'fantasy', name: '奇幻冒险', icon: '🏰' },
            { id: 'scifi', name: '科幻未来', icon: '🚀' },
            { id: 'horror', name: '悬疑恐怖', icon: '🔍' },
            { id: 'game', name: '游戏异界', icon: '🎮' }
        ],

        // 复杂度预设
        COMPLEXITY_PRESETS: {
            'minimal': { name: '极简', agents: 3, desc: '核心Agent最少配置' },
            'quick': { name: '快速', agents: 5, desc: '基础创作流程' },
            'full': { name: '完整', agents: 8, desc: '包含优化和维护' },
            'interactive': { name: '互动', agents: 10, desc: '带交互控件' }
        },

        // 创作模式
        CREATION_MODES: [
            { id: 'serial', name: '连载小说', icon: '📚', desc: '长篇连载，按章节推进' },
            { id: 'short', name: '短篇小说', icon: '📖', desc: '完整短篇，一次性输出' },
            { id: 'interactive', name: '互动小说', icon: '🎮', desc: '含选择分支的互动体验' }
        ],

        // 叙事视角
        NARRATIVE_POVS: [
            { id: 'third', name: '第三人称', desc: '上帝视角或限知第三人称' },
            { id: 'first', name: '第一人称', desc: '"我"的视角叙述' },
            { id: 'second', name: '第二人称', desc: '"你"的视角，适合互动' },
            { id: 'mixed', name: '混合视角', desc: '根据需要切换视角' }
        ],

        // 输出目标
        OUTPUT_TARGETS: [
            { id: 'text', name: '纯文本', icon: '📝', desc: '仅文字输出' },
            { id: 'illustrated', name: '图文小说', icon: '🖼️', desc: '文字配插图' },
            { id: 'multimedia', name: '多媒体', icon: '🎬', desc: '含音效/音乐/互动' }
        ]
    };

    // ==================== AgentWorkshop 类 ====================

    class AgentWorkshop {
        constructor() {
            // 状态
            this.currentStep = 0; // 0=需求描述 1=主AI配置 2=Agent选择 3=生成专用 4=微调 5=导出
            this.totalSteps = 5;

            this.workshopData = {
                // Step 0: 需求描述
                novelType: '',
                creationMode: '',       // 创作模式（连载/短篇/互动）
                narrativePov: '',       // 叙事视角（第三/第一/第二/混合）
                outputTarget: '',       // 输出目标（纯文本/图文/多媒体）
                style: '',
                complexity: 'quick',
                customRequirement: '',

                // Step 1: 主AI配置结构
                configStructure: null, // { agents: [], workflowStages: [], ... }
                chatHistory: [], // 主AI对话历史

                // Step 2: Agent类型选择
                agentConfigs: {}, // { agentId: { type: 'general'|'special', ... } }

                // Step 3: 生成的专用角色卡
                specialCards: {}, // { agentId: { name, description, systemPrompt, ... } }

                // Step 4: 微调后的角色卡
                finalCards: {} // { agentId: fullJson }
            };

            this.onComplete = null; // 完成回调
            this.isGenerating = false;

            // Workshop 专用角色卡导入状态
            this.workshopCardsImported = false;
        }

        // ==================== Workshop 角色卡管理 ====================

        /**
         * 导入 Workshop 专用角色卡到酒馆
         * 包括：主AI角色卡、子AI角色卡
         */
        async _importWorkshopCards() {
            if (this.workshopCardsImported) return;

            try {
                // 从配置文件读取 systemPrompt（inputTemplate）
                const mainAgent = CONFIG.agents?.['主AI配置生成器'];
                const subAgent = CONFIG.agents?.['专用角色卡生成器'];
                const mainPrompt = mainAgent?.inputTemplate || AGENT_WORKSHOP.WORKSHOP_AI.mainAI.systemPrompt;
                const subPrompt = subAgent?.inputTemplate || AGENT_WORKSHOP.WORKSHOP_AI.subAI.systemPrompt;

                // 主AI角色卡
                const mainAICard = {
                    spec: 'chara_card_v2',
                    spec_version: '1.0',
                    data: {
                        name: 'Workshop主AI',
                        description: '负责生成工作流配置结构',
                        personality: '专业、高效、结构化、善于理解需求',
                        scenario: '自动化小说创作系统的配置规划专家',
                        first_mes: '【Workshop主AI】已就绪。请描述你的小说创作需求，我将生成工作流配置。',
                        alternate_greetings: [],
                        system_prompt: mainPrompt,
                        post_history_instructions: '只输出JSON，不输出任何其他内容。',
                        creator_notes: 'Workshop主AI角色卡',
                        creator: 'Agent工坊',
                        character_version: '1.0',
                        tags: ['Workshop', '主AI', '配置生成'],
                        extensions: {}
                    }
                };

                // 子AI角色卡
                const subAICard = {
                    spec: 'chara_card_v2',
                    spec_version: '1.0',
                    data: {
                        name: 'Workshop子AI',
                        description: '负责生成专用角色卡',
                        personality: '专业、创意、善于设计角色、输出标准化',
                        scenario: '自动化小说创作系统的角色卡设计师',
                        first_mes: '【Workshop子AI】已就绪。请提供Agent信息，我将生成专属角色卡。',
                        alternate_greetings: [],
                        system_prompt: subPrompt,
                        post_history_instructions: '只输出JSON，不输出任何其他内容。',
                        creator_notes: 'Workshop子AI角色卡',
                        creator: 'Agent工坊',
                        character_version: '1.0',
                        tags: ['Workshop', '子AI', '角色卡生成'],
                        extensions: {}
                    }
                };

                // 导入到酒馆
                if (typeof TavernHelper?.createOrReplaceCharacter === 'function') {
                    await TavernHelper.createOrReplaceCharacter(mainAICard.data.name, mainAICard, { render: 'debounced' });
                    await TavernHelper.createOrReplaceCharacter(subAICard.data.name, subAICard, { render: 'debounced' });
                    console.log('[AgentWorkshop] Workshop角色卡已导入');
                    this.workshopCardsImported = true;
                } else {
                    console.warn('[AgentWorkshop] TavernHelper.createOrReplaceCharacter 不可用');
                }
            } catch (e) {
                console.error('[AgentWorkshop] 导入Workshop角色卡失败:', e);
            }
        }

        /**
         * 调用 AI 生成
         * @param {string} characterName - 角色名称（Workshop主AI / Workshop子AI）
         * @param {string} message - 用户输入
         * @returns {Promise<string>} - AI 返回的文本
         */
        async _callAIWithCharacter(characterName, message) {
            try {
                // 优先使用直接 API 调用（需要配置文件中的 apiConfigs）
                if (this.workshopData?.useDirectAPI && CONFIG.apiConfigs) {
                    const mainAgent = CONFIG.agents?.['主AI配置生成器'];
                    const subAgent = CONFIG.agents?.['专用角色卡生成器'];
                    const systemPrompt = characterName === 'Workshop子AI'
                        ? (subAgent?.inputTemplate || AGENT_WORKSHOP.WORKSHOP_AI.subAI.systemPrompt)
                        : (mainAgent?.inputTemplate || AGENT_WORKSHOP.WORKSHOP_AI.mainAI.systemPrompt);
                    return await this._callWorkshopAPI(systemPrompt, message);
                }

                // 降级到 TavernHelper
                if (typeof TavernHelper?.triggerSlash === 'function') {
                    await TavernHelper.triggerSlash(`/go ${characterName}`);
                    await this._sleep(500);
                }

                if (typeof TavernHelper?.generate === 'function') {
                    const result = await TavernHelper.generate({
                        user_input: message,
                        max_chat_history: 0,
                        should_silence: true
                    });

                    if (typeof result === 'string') {
                        return result;
                    } else if (result && typeof result === 'object') {
                        return result.text || result.message || result.response || '';
                    }
                    return '';
                } else {
                    throw new Error('TavernHelper.generate 不可用');
                }
            } catch (e) {
                console.error(`[AgentWorkshop] 调用AI失败:`, e);
                throw e;
            }
        }

        _sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        /**
         * 使用配置的 API 直接调用 AI（绕过 TavernHelper）
         * @param {string} systemPrompt - 系统提示词
         * @param {string} userMessage - 用户消息
         * @returns {Promise<string>}
         */
        async _callWorkshopAPI(systemPrompt, userMessage) {
            try {
                // 获取 API 配置
                const apiKeyId = Object.keys(CONFIG.apiConfigs || {})[0] || 'default';
                const apiConfig = CONFIG.apiConfigs?.[apiKeyId];

                if (!apiConfig) {
                    throw new Error('未找到 API 配置');
                }

                // 构建请求
                const endpoint = apiConfig.apiUrl || apiConfig.endpoint || 'https://api.deepseek.com/v1/chat/completions';
                const model = apiConfig.model || 'deepseek-chat';
                const temperature = apiConfig.temperature || 0.7;
                const maxTokens = apiConfig.maxTokens || 4096;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiConfig.key || apiConfig.apiKey || ''}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userMessage }
                        ],
                        temperature: temperature,
                        max_tokens: maxTokens
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API 请求失败: ${response.status} - ${errText}`);
                }

                const data = await response.json();
                return data.choices?.[0]?.message?.content || '';

            } catch (e) {
                console.error('[AgentWorkshop] API 调用失败:', e);
                throw e;
            }
        }

        // ==================== 入口 ====================

        async openWorkshop() {
            // 检测是否为 workshop 模式
            if (!CONFIG.mode || CONFIG.mode !== 'workshop') {
                Notify.warning('模式不匹配', 'Agent 工坊仅在加载【Agent工坊配置.json】后可用（mode=workshop）');
                return;
            }

            // 检测是否有有效的 apiConfigs
            if (!CONFIG.apiConfigs || Object.keys(CONFIG.apiConfigs).length === 0) {
                Notify.warning('缺少 AI 配置', 'Agent 工坊需要配置文件中的 apiConfigs');
                return;
            }

            this.currentStep = 0;
            this.workshopData = {
                novelType: '',
                style: '',
                complexity: 'quick',
                customRequirement: '',
                configStructure: null,
                chatHistory: [],
                agentConfigs: {},
                specialCards: {},
                finalCards: {},
                useDirectAPI: true // 使用直接 API 调用
            };
            
            const overlay = this._createOverlay();
            document.body.appendChild(overlay);
            ModalStack.push(overlay);
            overlay.addEventListener('click', e => {
                if (e.target === overlay) this._closeOverlay(overlay);
            });
        }

        _closeOverlay(overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => {
                ModalStack.remove(overlay);
                overlay.remove();
            }, 200);
        }

        // ==================== UI 创建 ====================

        _createOverlay() {
            const overlay = document.createElement('div');
            overlay.className = 'nc-modal-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.8); z-index: 10000;
                display: flex; align-items: center; justify-content: center;
            `;

            const container = document.createElement('div');
            container.className = 'nc-agent-workshop';
            container.style.cssText = `
                background: #1a1a2e; border: 1px solid #333;
                border-radius: 16px; width: 900px; max-width: 95vw;
                max-height: 92vh; overflow: hidden; display: flex; flex-direction: column;
            `;

            overlay.appendChild(container);
            this._renderWorkshop(container);
            return overlay;
        }

        _renderWorkshop(container) {
            container.innerHTML = '';

            // 头部
            const header = this._createHeader();
            container.appendChild(header);

            // 主内容区
            const main = document.createElement('div');
            main.style.cssText = `
                flex: 1; display: flex; overflow: hidden;
            `;
            main.id = 'nc-workshop-main';
            container.appendChild(main);

            // 底部
            const footer = document.createElement('div');
            footer.id = 'nc-workshop-footer';
            footer.style.cssText = `
                padding: 16px 24px; border-top: 1px solid #333;
                display: flex; justify-content: space-between; align-items: center;
            `;
            container.appendChild(footer);

            this._renderStepContent(main);
            this._renderFooter(footer);
        }

        _createHeader() {
            const header = document.createElement('div');
            header.style.cssText = `
                padding: 20px 24px; border-bottom: 1px solid #333;
                display: flex; align-items: center; justify-content: space-between;
            `;
            
            const steps = ['📝 需求描述', '🤖 主AI配置', '🔧 Agent选择', '✨ 生成专用', '📐 微调角色', '💾 导出'];
            const stepNames = ['需求描述', '主AI配置', 'Agent选择', '生成专用', '微调角色', '导出'];
            
            header.innerHTML = `
                <div>
                    <div style="font-size: 18px; font-weight: bold; color: #fff;">
                        🏭 Agent 工坊
                    </div>
                    <div style="font-size: 12px; color: #888; margin-top: 4px;">
                        ${stepNames[this.currentStep]} — 第 ${this.currentStep + 1} / ${this.totalSteps + 1} 步
                    </div>
                </div>
                <div style="display: flex; gap: 6px;">
                    ${steps.map((s, i) => `
                        <div style="
                            width: 28px; height: 28px; border-radius: 50%;
                            background: ${i === this.currentStep ? '#667eea' : i < this.currentStep ? '#27ae60' : 'transparent'};
                            border: 2px solid ${i === this.currentStep ? '#667eea' : i < this.currentStep ? '#27ae60' : '#444'};
                            color: ${i <= this.currentStep ? '#fff' : '#666'};
                            display: flex; align-items: center; justify-content: center;
                            font-size: 12px;
                        " title="${s}">${i < this.currentStep ? '✓' : i + 1}</div>
                    `).join('')}
                </div>
            `;
            return header;
        }

        _renderStepContent(main) {
            main.innerHTML = '';
            main.style.display = 'flex';

            switch (this.currentStep) {
                case 0: this._renderStep0Requirement(main); break;
                case 1: this._renderStep1MainAI(main); break;
                case 2: this._renderStep2AgentSelect(main); break;
                case 3: this._renderStep3GenerateSpecial(main); break;
                case 4: this._renderStep4FineTune(main); break;
                case 5: this._renderStep5Export(main); break;
            }
        }

        // ==================== Step 0: 需求描述 ====================

        _renderStep0Requirement(main) {
            // 左侧：表单
            const left = document.createElement('div');
            left.style.cssText = `
                flex: 1; padding: 24px; overflow-y: auto; border-right: 1px solid #333;
            `;

            left.innerHTML = `
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        📚 小说类型
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                        ${AGENT_WORKSHOP.NOVEL_TYPES.map(t => `
                            <div class="nc-novel-type" data-type="${t.id}" style="
                                padding: 12px; border-radius: 8px; text-align: center;
                                border: 1px solid ${this.workshopData.novelType === t.id ? '#667eea' : '#444'};
                                background: ${this.workshopData.novelType === t.id ? 'rgba(102,126,234,0.15)' : 'transparent'};
                                cursor: pointer; transition: all 0.2s;
                            ">
                                <div style="font-size: 20px; margin-bottom: 4px;">${t.icon}</div>
                                <div style="font-size: 12px; color: ${this.workshopData.novelType === t.id ? '#fff' : '#aaa'};">${t.name}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        📐 创作模式
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                        ${AGENT_WORKSHOP.CREATION_MODES.map(m => `
                            <div class="nc-creation-mode" data-mode="${m.id}" style="
                                padding: 12px; border-radius: 8px; text-align: center;
                                border: 1px solid ${this.workshopData.creationMode === m.id ? '#e74c3c' : '#444'};
                                background: ${this.workshopData.creationMode === m.id ? 'rgba(231,76,60,0.15)' : 'transparent'};
                                cursor: pointer; transition: all 0.2s;
                            ">
                                <div style="font-size: 20px; margin-bottom: 4px;">${m.icon}</div>
                                <div style="font-size: 12px; color: ${this.workshopData.creationMode === m.id ? '#fff' : '#aaa'};">${m.name}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        👁️ 叙事视角
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                        ${AGENT_WORKSHOP.NARRATIVE_POVS.map(p => `
                            <div class="nc-narrative-pov" data-pov="${p.id}" style="
                                padding: 10px 8px; border-radius: 8px; text-align: center;
                                border: 1px solid ${this.workshopData.narrativePov === p.id ? '#27ae60' : '#444'};
                                background: ${this.workshopData.narrativePov === p.id ? 'rgba(39,174,96,0.15)' : 'transparent'};
                                cursor: pointer; transition: all 0.2s;
                            ">
                                <div style="font-size: 12px; font-weight: bold; color: ${this.workshopData.narrativePov === p.id ? '#fff' : '#aaa'};">${p.name}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        🎯 输出目标
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                        ${AGENT_WORKSHOP.OUTPUT_TARGETS.map(t => `
                            <div class="nc-output-target" data-target="${t.id}" style="
                                padding: 12px; border-radius: 8px; text-align: center;
                                border: 1px solid ${this.workshopData.outputTarget === t.id ? '#f39c12' : '#444'};
                                background: ${this.workshopData.outputTarget === t.id ? 'rgba(243,156,18,0.15)' : 'transparent'};
                                cursor: pointer; transition: all 0.2s;
                            ">
                                <div style="font-size: 20px; margin-bottom: 4px;">${t.icon}</div>
                                <div style="font-size: 12px; color: ${this.workshopData.outputTarget === t.id ? '#fff' : '#aaa'};">${t.name}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        🎭 风格/氛围
                    </div>
                    <input type="text" id="nc-style-input" placeholder="例如：轻松愉快、紧张刺激、悬疑惊悚..."
                           value="${this.workshopData.style}" style="
                        width: 100%; padding: 10px 14px; border-radius: 8px;
                        border: 1px solid #444; background: #252540; color: #fff;
                        font-size: 13px; box-sizing: border-box;
                    ">
                </div>

                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        ⚡ 复杂度
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                        ${Object.entries(AGENT_WORKSHOP.COMPLEXITY_PRESETS).map(([key, preset]) => `
                            <div class="nc-complexity" data-complexity="${key}" style="
                                padding: 12px; border-radius: 8px; text-align: center;
                                border: 1px solid ${this.workshopData.complexity === key ? '#667eea' : '#444'};
                                background: ${this.workshopData.complexity === key ? 'rgba(102,126,234,0.15)' : 'transparent'};
                                cursor: pointer; transition: all 0.2s;
                            ">
                                <div style="font-size: 14px; font-weight: bold; color: ${this.workshopData.complexity === key ? '#fff' : '#aaa'};">
                                    ${preset.name}
                                </div>
                                <div style="font-size: 10px; color: #888; margin-top: 4px;">
                                    ${preset.agents} Agent
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div>
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        💬 详细需求描述
                    </div>
                    <textarea id="nc-requirement-input" placeholder="描述你想要的创作流程和特殊需求..." style="
                        width: 100%; height: 150px; padding: 12px; border-radius: 8px;
                        border: 1px solid #444; background: #252540; color: #fff;
                        font-size: 13px; resize: none; box-sizing: border-box;
                    ">${this.workshopData.customRequirement}</textarea>
                </div>
            `;

            // 右侧：预览
            const right = document.createElement('div');
            right.style.cssText = `
                width: 280px; padding: 24px; overflow-y: auto;
            `;
            right.innerHTML = this._renderRequirementSummary();

            main.appendChild(left);
            main.appendChild(right);

            // 绑定事件
            this._bindStep0Events();
        }

        _renderRequirementSummary() {
            const novelType = AGENT_WORKSHOP.NOVEL_TYPES.find(t => t.id === this.workshopData.novelType);
            const complexity = AGENT_WORKSHOP.COMPLEXITY_PRESETS[this.workshopData.complexity];
            const creationMode = AGENT_WORKSHOP.CREATION_MODES.find(m => m.id === this.workshopData.creationMode);
            const narrativePov = AGENT_WORKSHOP.NARRATIVE_POVS.find(p => p.id === this.workshopData.narrativePov);
            const outputTarget = AGENT_WORKSHOP.OUTPUT_TARGETS.find(t => t.id === this.workshopData.outputTarget);

            return `
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 16px;">
                    📋 需求摘要
                </div>
                <div style="padding: 12px; background: rgba(102,126,234,0.1); border-radius: 8px; margin-bottom: 12px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;">小说类型</div>
                    <div style="font-size: 13px; color: #fff;">
                        ${novelType ? novelType.icon + ' ' + novelType.name : '未选择'}
                    </div>
                </div>
                <div style="padding: 12px; background: rgba(231,76,60,0.1); border-radius: 8px; margin-bottom: 12px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;">创作模式</div>
                    <div style="font-size: 13px; color: #fff;">
                        ${creationMode ? creationMode.icon + ' ' + creationMode.name + ' — ' + creationMode.desc : '未选择'}
                    </div>
                </div>
                <div style="padding: 12px; background: rgba(39,174,96,0.1); border-radius: 8px; margin-bottom: 12px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;">叙事视角</div>
                    <div style="font-size: 13px; color: #fff;">
                        ${narrativePov ? narrativePov.name + ' — ' + narrativePov.desc : '未选择'}
                    </div>
                </div>
                <div style="padding: 12px; background: rgba(243,156,18,0.1); border-radius: 8px; margin-bottom: 12px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;">输出目标</div>
                    <div style="font-size: 13px; color: #fff;">
                        ${outputTarget ? outputTarget.icon + ' ' + outputTarget.name + ' — ' + outputTarget.desc : '未选择'}
                    </div>
                </div>
                <div style="padding: 12px; background: rgba(102,126,234,0.1); border-radius: 8px; margin-bottom: 12px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;">风格/氛围</div>
                    <div style="font-size: 13px; color: #fff;">
                        ${this.workshopData.style || '未指定'}
                    </div>
                </div>
                <div style="padding: 12px; background: rgba(102,126,234,0.1); border-radius: 8px; margin-bottom: 12px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;">复杂度</div>
                    <div style="font-size: 13px; color: #fff;">
                        ${complexity ? complexity.name + ' (' + complexity.agents + ' Agent)' : '未选择'}
                    </div>
                </div>
                <div style="padding: 12px; background: rgba(102,126,234,0.1); border-radius: 8px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;">详细需求</div>
                    <div style="font-size: 12px; color: #ccc; max-height: 100px; overflow-y: auto;">
                        ${this.workshopData.customRequirement || '未填写'}
                    </div>
                </div>
            `;
        }

        _bindStep0Events() {
            document.querySelectorAll('.nc-novel-type').forEach(el => {
                el.addEventListener('click', () => {
                    document.querySelectorAll('.nc-novel-type').forEach(e =>
                        e.style.borderColor = '#444');
                    el.style.borderColor = '#667eea';
                    this.workshopData.novelType = el.dataset.type;
                    this._updateRequirementSummary();
                });
            });

            document.querySelectorAll('.nc-creation-mode').forEach(el => {
                el.addEventListener('click', () => {
                    document.querySelectorAll('.nc-creation-mode').forEach(e =>
                        e.style.borderColor = '#444');
                    el.style.borderColor = '#e74c3c';
                    this.workshopData.creationMode = el.dataset.mode;
                    this._updateRequirementSummary();
                });
            });

            document.querySelectorAll('.nc-narrative-pov').forEach(el => {
                el.addEventListener('click', () => {
                    document.querySelectorAll('.nc-narrative-pov').forEach(e =>
                        e.style.borderColor = '#444');
                    el.style.borderColor = '#27ae60';
                    this.workshopData.narrativePov = el.dataset.pov;
                    this._updateRequirementSummary();
                });
            });

            document.querySelectorAll('.nc-output-target').forEach(el => {
                el.addEventListener('click', () => {
                    document.querySelectorAll('.nc-output-target').forEach(e =>
                        e.style.borderColor = '#444');
                    el.style.borderColor = '#f39c12';
                    this.workshopData.outputTarget = el.dataset.target;
                    this._updateRequirementSummary();
                });
            });

            document.querySelectorAll('.nc-complexity').forEach(el => {
                el.addEventListener('click', () => {
                    document.querySelectorAll('.nc-complexity').forEach(e => 
                        e.style.borderColor = '#444');
                    el.style.borderColor = '#667eea';
                    this.workshopData.complexity = el.dataset.complexity;
                    this._updateRequirementSummary();
                });
            });

            const styleInput = document.getElementById('nc-style-input');
            if (styleInput) {
                styleInput.addEventListener('input', () => {
                    this.workshopData.style = styleInput.value;
                    this._updateRequirementSummary();
                });
            }

            const reqInput = document.getElementById('nc-requirement-input');
            if (reqInput) {
                reqInput.addEventListener('input', () => {
                    this.workshopData.customRequirement = reqInput.value;
                    this._updateRequirementSummary();
                });
            }
        }

        _updateRequirementSummary() {
            const right = document.querySelector('#nc-workshop-main > div:last-child');
            if (right) {
                right.innerHTML = this._renderRequirementSummary();
            }
        }

        // ==================== Step 1: 主AI配置 ====================

        _renderStep1MainAI(main) {
            main.style.display = 'flex';

            // 左侧：对话区
            const left = document.createElement('div');
            left.style.cssText = `
                flex: 1; display: flex; flex-direction: column; border-right: 1px solid #333;
            `;

            // 对话历史
            const chatContainer = document.createElement('div');
            chatContainer.id = 'nc-main-chat';
            chatContainer.style.cssText = `
                flex: 1; padding: 24px; overflow-y: auto;
            `;
            
            // 输入区
            const inputArea = document.createElement('div');
            inputArea.style.cssText = `
                padding: 16px 24px; border-top: 1px solid #333;
            `;
            inputArea.innerHTML = `
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="nc-chat-input" placeholder="输入你的调整需求..." style="
                        flex: 1; padding: 10px 14px; border-radius: 8px;
                        border: 1px solid #444; background: #252540; color: #fff;
                        font-size: 13px;
                    ">
                    <button id="nc-chat-send" style="
                        padding: 10px 20px; border-radius: 8px;
                        border: none; background: #667eea; color: #fff;
                        cursor: pointer; font-size: 13px;
                    ">发送</button>
                    <button id="nc-chat-regenerate" style="
                        padding: 10px 16px; border-radius: 8px;
                        border: 1px solid #667eea; background: transparent; color: #667eea;
                        cursor: pointer; font-size: 13px;
                    ">🔄</button>
                </div>
            `;

            left.appendChild(chatContainer);
            left.appendChild(inputArea);

            // 右侧：配置预览
            const right = document.createElement('div');
            right.style.cssText = `
                width: 320px; padding: 24px; overflow-y: auto;
            `;
            right.id = 'nc-config-preview';
            right.innerHTML = this._renderConfigPreview();

            main.appendChild(left);
            main.appendChild(right);

            // 渲染对话历史
            this._renderChatHistory();
            
            // 绑定事件
            this._bindStep1Events();
        }

        _renderChatHistory() {
            const container = document.getElementById('nc-main-chat');
            if (!container) return;

            let html = '';

            // 系统消息
            html += `
                <div style="margin-bottom: 20px;">
                    <div style="
                        padding: 12px 16px; background: rgba(102,126,234,0.15); 
                        border-radius: 12px; border: 1px solid #667eea;
                        font-size: 13px; color: #ccc; line-height: 1.6;
                    ">
                        <div style="font-weight: bold; color: #667eea; margin-bottom: 8px;">🤖 主AI助手</div>
                        我已经根据你的需求生成了配置结构。你可以直接修改 JSON，或者用自然语言描述你的调整需求。
                    </div>
                </div>
            `;

            // 对话历史
            this.workshopData.chatHistory.forEach(msg => {
                if (msg.role === 'user') {
                    html += `
                        <div style="margin-bottom: 12px; text-align: right;">
                            <div style="
                                display: inline-block; padding: 10px 14px;
                                background: #667eea; border-radius: 12px 12px 4px 12px;
                                color: #fff; font-size: 13px; max-width: 80%;
                            ">${msg.content}</div>
                        </div>
                    `;
                } else if (msg.role === 'assistant') {
                    html += `
                        <div style="margin-bottom: 12px;">
                            <div style="
                                padding: 12px 16px; background: #252540;
                                border-radius: 12px 12px 12px 4px;
                                color: #ccc; font-size: 13px;
                            ">${msg.content}</div>
                        </div>
                    `;
                }
            });

            // 加载状态
            if (this.isGenerating) {
                html += `
                    <div style="margin-bottom: 12px;">
                        <div style="
                            padding: 12px 16px; background: #252540;
                            border-radius: 12px; color: #888; font-size: 13px;
                        ">
                            <span>⏳ 正在生成配置...</span>
                        </div>
                    </div>
                `;
            }

            container.innerHTML = html;
            container.scrollTop = container.scrollHeight;
        }

        _renderConfigPreview() {
            const config = this.workshopData.configStructure;
            
            if (!config) {
                return `
                    <div style="text-align: center; padding: 40px 20px; color: #666;">
                        <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
                        <div style="font-size: 14px;">点击"生成配置"开始</div>
                    </div>
                `;
            }

            return `
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 16px;">
                    📋 配置预览
                </div>
                
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;">描述</div>
                    <div style="font-size: 12px; color: #ccc;">${config.description || '无'}</div>
                </div>

                <div style="margin-bottom: 16px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 8px;">Agent 列表（${config.agents?.length || 0}个）</div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${(config.agents || []).map(a => `
                            <div style="
                                padding: 8px 10px; background: #252540; border-radius: 6px;
                                font-size: 12px;
                            ">
                                <div style="color: #fff; margin-bottom: 2px;">
                                    ${a.icon || '•'} ${a.name}
                                    <span style="font-size: 10px; color: #666;">
                                        [${a.required ? '必需' : '可选'}]
                                    </span>
                                </div>
                                <div style="color: #888; font-size: 11px;">${a.desc}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-bottom: 16px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 8px;">工作流阶段（${config.workflowStages?.length || 0}个）</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${(config.workflowStages || []).map(s => `
                            <div style="
                                padding: 6px 10px; background: #252540; border-radius: 4px;
                                font-size: 11px; color: #aaa;
                            ">
                                ${s.name} (${s.mode})
                            </div>
                        `).join('')}
                    </div>
                </div>

                ${config.notes ? `
                    <div style="padding: 12px; background: rgba(102,126,234,0.1); border-radius: 8px;">
                        <div style="font-size: 11px; color: #667eea; margin-bottom: 4px;">💡 备注</div>
                        <div style="font-size: 12px; color: #ccc;">${config.notes}</div>
                    </div>
                ` : ''}

                <div style="margin-top: 16px;">
                    <button id="nc-edit-json" style="
                        width: 100%; padding: 10px; border-radius: 8px;
                        border: 1px solid #444; background: transparent; color: #888;
                        cursor: pointer; font-size: 12px;
                    ">📝 编辑 JSON</button>
                </div>
            `;
        }

        _bindStep1Events() {
            const chatInput = document.getElementById('nc-chat-input');
            const sendBtn = document.getElementById('nc-chat-send');
            const regenBtn = document.getElementById('nc-chat-regenerate');

            if (sendBtn) {
                sendBtn.addEventListener('click', () => this._sendChatMessage());
            }
            if (chatInput) {
                chatInput.addEventListener('keypress', e => {
                    if (e.key === 'Enter') this._sendChatMessage();
                });
            }
            if (regenBtn) {
                regenBtn.addEventListener('click', () => this._regenerateConfig());
            }
        }

        async _sendChatMessage() {
            const chatInput = document.getElementById('nc-chat-input');
            if (!chatInput || !chatInput.value.trim() || this.isGenerating) return;

            const message = chatInput.value.trim();
            chatInput.value = '';

            // 添加用户消息
            this.workshopData.chatHistory.push({ role: 'user', content: message });

            // 如果是第一次，生成配置
            if (!this.workshopData.configStructure) {
                await this._generateInitialConfig(message);
            } else {
                // 调整现有配置
                await this._adjustConfig(message);
            }
        }

        // ==================== JSON Schema 校验器 ====================

        /**
         * 校验主AI输出的配置结构
         * @param {object} config - 待校验的配置对象
         * @returns {{valid: boolean, errors: string[]}}
         */
        _validateMainAIConfig(config) {
            const errors = [];

            // 顶层字段检查
            if (!config || typeof config !== 'object') {
                errors.push('输出不是有效的JSON对象');
                return { valid: false, errors };
            }

            // 必填顶层字段
            const requiredTopFields = ['description', 'mode', 'agents', 'workflowStages'];
            for (const field of requiredTopFields) {
                if (!(field in config)) {
                    errors.push(`缺少必填字段: "${field}"`);
                }
            }

            // mode 校验
            if (config.mode && !['normal', 'interactive', 'datafication'].includes(config.mode)) {
                errors.push(`mode 值无效: "${config.mode}"，应为 normal/interactive/datafication`);
            }

            // agents 校验
            if (Array.isArray(config.agents)) {
                if (config.agents.length === 0) {
                    errors.push('agents 数组为空，至少需要1个Agent');
                }
                const agentIds = new Set();
                config.agents.forEach((agent, idx) => {
                    if (!agent.id) {
                        errors.push(`agents[${idx}] 缺少 id`);
                    } else if (agentIds.has(agent.id)) {
                        errors.push(`agents[${idx}] id 重复: "${agent.id}"`);
                    } else {
                        agentIds.add(agent.id);
                    }
                    if (!agent.name) errors.push(`agents[${idx}]（${agent.id || '?'}）缺少 name`);
                    if (!agent.desc) errors.push(`agents[${idx}]（${agent.id || '?'}）缺少 desc`);
                    if (agent.category && !['core', 'image', 'audio', 'interactive', 'state', 'summary'].includes(agent.category)) {
                        errors.push(`agents[${idx}]（${agent.id || '?'}）category 值无效: "${agent.category}"`);
                    }
                    if (agent.suggestedType && !['general', 'special'].includes(agent.suggestedType)) {
                        errors.push(`agents[${idx}]（${agent.id || '?'}）suggestedType 值无效: "${agent.suggestedType}"`);
                    }
                });
            } else if ('agents' in config) {
                errors.push('agents 不是数组');
            }

            // workflowStages 校验
            if (Array.isArray(config.workflowStages)) {
                const stageIds = new Set();
                config.workflowStages.forEach((stage, idx) => {
                    if (!stage.id) {
                        errors.push(`workflowStages[${idx}] 缺少 id`);
                    } else if (stageIds.has(stage.id)) {
                        errors.push(`workflowStages[${idx}] id 重复: "${stage.id}"`);
                    } else {
                        stageIds.add(stage.id);
                    }
                    if (!stage.name) errors.push(`workflowStages[${idx}]（${stage.id || '?'}）缺少 name`);
                    if (!Array.isArray(stage.agents)) {
                        errors.push(`workflowStages[${idx}]（${stage.id || '?'}）agents 不是数组`);
                    }
                    if (stage.mode && !['serial', 'parallel'].includes(stage.mode)) {
                        errors.push(`workflowStages[${idx}]（${stage.id || '?'}）mode 值无效: "${stage.mode}"`);
                    }
                });

                // 交叉校验：stage 中的 agent id 必须在 agents 中存在
                if (Array.isArray(config.agents)) {
                    const validAgentIds = new Set(config.agents.map(a => a.id).filter(Boolean));
                    config.workflowStages.forEach((stage, idx) => {
                        if (Array.isArray(stage.agents)) {
                            stage.agents.forEach(aid => {
                                if (!validAgentIds.has(aid)) {
                                    errors.push(`workflowStages[${idx}]（${stage.id || '?'}）引用了不存在的Agent: "${aid}"`);
                                }
                            });
                        }
                    });
                }
            } else if ('workflowStages' in config) {
                errors.push('workflowStages 不是数组');
            }

            return { valid: errors.length === 0, errors };
        }

        /**
         * 校验子AI输出的角色卡结构
         * @param {object} card - 待校验的角色卡对象
         * @returns {{valid: boolean, errors: string[]}}
         */
        _validateSpecialCard(card) {
            const errors = [];

            if (!card || typeof card !== 'object') {
                errors.push('输出不是有效的JSON对象');
                return { valid: false, errors };
            }

            // spec 校验
            if (card.spec !== 'chara_card_v2') {
                errors.push(`spec 应为 "chara_card_v2"，实际为: "${card.spec || '(缺失)'}"`);
            }

            // spec_version 类型校验
            if (card.spec_version !== undefined && typeof card.spec_version !== 'string') {
                errors.push(`spec_version 应为字符串，实际类型为: "${typeof card.spec_version}"`);
            }

            // data 字段检查
            if (!card.data || typeof card.data !== 'object') {
                errors.push('缺少 data 字段或 data 不是对象');
                return { valid: false, errors };
            }

            // data 中的必填字段
            const requiredDataFields = ['name', 'system_prompt'];
            for (const field of requiredDataFields) {
                if (!card.data[field]) {
                    errors.push(`data 缺少必填字段: "${field}"`);
                }
            }

            // data.name 类型校验
            if (card.data.name && typeof card.data.name !== 'string') {
                errors.push(`data.name 应为字符串，实际类型为: "${typeof card.data.name}"`);
            }

            // data.description 类型校验（推荐字段）
            if (card.data.description !== undefined && typeof card.data.description !== 'string') {
                errors.push(`data.description 应为字符串，实际类型为: "${typeof card.data.description}"`);
            }

            // data.personality 类型校验（推荐字段）
            if (card.data.personality !== undefined && typeof card.data.personality !== 'string') {
                errors.push(`data.personality 应为字符串，实际类型为: "${typeof card.data.personality}"`);
            }

            // data.tags 类型校验（推荐字段）
            if (card.data.tags !== undefined && !Array.isArray(card.data.tags)) {
                errors.push(`data.tags 应为数组，实际类型为: "${typeof card.data.tags}"`);
            }

            // system_prompt 类型校验
            if (card.data.system_prompt && typeof card.data.system_prompt !== 'string') {
                errors.push(`data.system_prompt 应为字符串，实际类型为: "${typeof card.data.system_prompt}"`);
            } else if (card.data.system_prompt && card.data.system_prompt.length < 50) {
                // system_prompt 不能太短，至少需要50字才能包含完整的职能定义
                errors.push(`data.system_prompt 过短（${card.data.system_prompt.length}字，至少需要50字），请确保包含完整的职能定义（角色定位、核心职责、行为规则、输出格式、约束条件）`);
            }

            // system_prompt 内容结构校验（检查是否包含关键段落标记）
            if (card.data.system_prompt && typeof card.data.system_prompt === 'string' && card.data.system_prompt.length >= 50) {
                const sp = card.data.system_prompt;
                const structureMarkers = ['职责', '任务', '角色', '功能', '负责'];
                const hasStructure = structureMarkers.some(marker => sp.includes(marker));
                if (!hasStructure) {
                    errors.push('data.system_prompt 缺少明确的职能描述（应包含"职责"、"任务"、"角色"等关键词）');
                }
            }

            return { valid: errors.length === 0, errors };
        }

        /**
         * 在聊天区域渲染校验错误详情
         * @param {string[]} errors - 错误列表
         * @param {string} rawResponse - AI的原始响应（用于用户参考修正）
         */
        _renderValidationErrors(errors, rawResponse = '') {
            const errorHtml = errors.map(e => `<div style="color:#ff6b6b;padding:2px 0;">• ${this._escapeHtml(e)}</div>`).join('');
            const rawSection = rawResponse
                ? `<details style="margin-top:8px;color:#999;cursor:pointer;"><summary>查看AI原始输出</summary><pre style="margin-top:4px;padding:8px;background:#1a1a2e;border-radius:6px;font-size:12px;max-height:300px;overflow:auto;white-space:pre-wrap;">${this._escapeHtml(rawResponse)}</pre></details>`
                : '';

            this.workshopData.chatHistory.push({
                role: 'assistant',
                content: `⚠️ JSON校验失败，共 ${errors.length} 个问题：\n${errorHtml}\n<div style="margin-top:8px;color:#aaa;">请修改你的需求描述后重新生成，或提供更具体的指导。</div>${rawSection}`
            });
        }

        // ==================== Step 1: 主AI配置生成 ====================

        async _generateInitialConfig(initialMessage = '') {
            this.isGenerating = true;
            this._renderChatHistory();

            try {
                // 先导入 Workshop 角色卡
                await this._importWorkshopCards();

                const novelType = AGENT_WORKSHOP.NOVEL_TYPES.find(t => t.id === this.workshopData.novelType);
                const complexity = AGENT_WORKSHOP.COMPLEXITY_PRESETS[this.workshopData.complexity];
                const creationMode = AGENT_WORKSHOP.CREATION_MODES.find(m => m.id === this.workshopData.creationMode);
                const narrativePov = AGENT_WORKSHOP.NARRATIVE_POVS.find(p => p.id === this.workshopData.narrativePov);
                const outputTarget = AGENT_WORKSHOP.OUTPUT_TARGETS.find(t => t.id === this.workshopData.outputTarget);

                const prompt = `
【用户需求】
小说类型：${novelType?.name || '未指定'}
创作模式：${creationMode?.name || '未指定'}（${creationMode?.desc || ''}）
叙事视角：${narrativePov?.name || '未指定'}（${narrativePov?.desc || ''}）
输出目标：${outputTarget?.name || '未指定'}（${outputTarget?.desc || ''}）
风格/氛围：${this.workshopData.style || '未指定'}
复杂度：${complexity?.name || '快速'}（约${complexity?.agents || 5}个Agent）
详细需求：${this.workshopData.customRequirement || '无'}
用户补充：${initialMessage || '无'}

请输出完整的JSON配置，不要包含其他文字。`;

                // 使用角色卡调用 AI
                const response = await this._callAIWithCharacter('Workshop主AI', prompt);

                // 解析 JSON
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    throw new Error('AI返回内容不包含有效JSON');
                }

                const parsed = JSON.parse(jsonMatch[0]);

                // Schema 校验
                const validation = this._validateMainAIConfig(parsed);
                if (!validation.valid) {
                    this._renderValidationErrors(validation.errors, response);
                    return;
                }

                this.workshopData.configStructure = parsed;
                this.workshopData.chatHistory.push({
                    role: 'assistant',
                    content: '✅ 配置已生成并通过校验！你可以继续描述调整需求，或者直接进入下一步。'
                });
            } catch (e) {
                console.error('[AgentWorkshop] 生成配置失败:', e);
                this.workshopData.chatHistory.push({
                    role: 'assistant',
                    content: `❌ 生成失败: ${e.message}。请重试或直接描述你的需求。`
                });
            }

            this.isGenerating = false;
            this._renderChatHistory();
            this._updateConfigPreview();
        }

        async _adjustConfig(message) {
            this.isGenerating = true;
            this._renderChatHistory();

            try {
                const prompt = `
当前配置：
${JSON.stringify(this.workshopData.configStructure, null, 2)}

用户调整需求：${message}

请根据用户需求修改配置，仍输出完整JSON，不要包含其他文字。`;

                // 使用角色卡调用 AI
                const response = await this._callAIWithCharacter('Workshop主AI', prompt);
                const jsonMatch = response.match(/\{[\s\S]*\}/);

                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);

                    // Schema 校验
                    const validation = this._validateMainAIConfig(parsed);
                    if (!validation.valid) {
                        this._renderValidationErrors(validation.errors, response);
                        this.isGenerating = false;
                        this._renderChatHistory();
                        return;
                    }

                    this.workshopData.configStructure = parsed;
                    this.workshopData.chatHistory.push({
                        role: 'assistant',
                        content: '✅ 已根据你的需求调整配置并通过校验！'
                    });
                }
            } catch (e) {
                this.workshopData.chatHistory.push({
                    role: 'assistant',
                    content: `❌ 调整失败: ${e.message}`
                });
            }

            this.isGenerating = false;
            this._renderChatHistory();
            this._updateConfigPreview();
        }

        async _regenerateConfig() {
            this.workshopData.chatHistory = [];
            await this._generateInitialConfig();
        }

        _updateConfigPreview() {
            const preview = document.getElementById('nc-config-preview');
            if (preview) {
                preview.innerHTML = this._renderConfigPreview();
            }
        }

        // ==================== Step 2: Agent类型选择 ====================

        _renderStep2AgentSelect(main) {
            main.style.cssText = 'flex: 1; padding: 24px; overflow-y: auto;';

            const agents = this.workshopData.configStructure?.agents || [];
            
            let html = `
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        🔧 Agent 类型选择
                    </div>
                    <div style="font-size: 13px; color: #888; margin-bottom: 16px;">
                        为每个 Agent 选择角色卡类型：
                        <br>• <span style="color:#3498db;">🔧 通用</span> — 使用"通用生成器"（通过标记动态指定任务）
                        <br>• <span style="color:#9b59b6;">✨ 专用</span> — 生成专属 .json 文件
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
            `;

            agents.forEach((agent, idx) => {
                const config = this.workshopData.agentConfigs[agent.id] || { type: 'general' };
                const canBeSpecial = AGENT_WORKSHOP.SPECIALIZABLE_AGENTS.find(a => a.id === agent.id);
                const isCore = AGENT_WORKSHOP.CORE_AGENTS.find(a => a.id === agent.id);

                html += `
                    <div class="nc-agent-card" data-agent-id="${agent.id}" style="
                        padding: 16px; border-radius: 12px;
                        border: 1px solid #444; background: #252540;
                    ">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                            <div style="
                                width: 36px; height: 36px; border-radius: 8px;
                                background: ${agent.required ? '#667eea' : '#444'};
                                display: flex; align-items: center; justify-content: center;
                                color: #fff; font-size: 16px;
                            ">${idx + 1}</div>
                            <div>
                                <div style="font-size: 14px; font-weight: bold; color: #fff;">
                                    ${agent.name}
                                    ${agent.required ? '<span style="font-size:10px;color:#667eea;margin-left:6px;">必需</span>' : ''}
                                </div>
                                <div style="font-size: 12px; color: #888; margin-top: 2px;">
                                    ${agent.desc}
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; gap: 10px;">
                            <!-- 通用选项 -->
                            <div class="nc-agent-type-btn ${config.type === 'general' ? 'nc-agent-type-btn--active' : ''}"
                                 data-agent="${agent.id}" data-type="general" style="
                                flex: 1; padding: 12px; border-radius: 8px; cursor: pointer;
                                border: 2px solid ${config.type === 'general' ? '#3498db' : '#444'};
                                background: ${config.type === 'general' ? 'rgba(52,152,219,0.1)' : 'transparent'};
                                text-align: center; transition: all 0.2s;
                            ">
                                <div style="font-size: 14px; color: #3498db; margin-bottom: 4px;">🔧 通用</div>
                                <div style="font-size: 11px; color: #888;">
                                    ${isCore ? '核心Agent只能使用通用' : '使用通用生成器'}
                                </div>
                            </div>

                            ${!isCore && canBeSpecial ? `
                            <!-- 专用选项 -->
                            <div class="nc-agent-type-btn ${config.type === 'special' ? 'nc-agent-type-btn--active' : ''}"
                                 data-agent="${agent.id}" data-type="special" style="
                                flex: 1; padding: 12px; border-radius: 8px; cursor: pointer;
                                border: 2px solid ${config.type === 'special' ? '#9b59b6' : '#444'};
                                background: ${config.type === 'special' ? 'rgba(155,89,182,0.1)' : 'transparent'};
                                text-align: center; transition: all 0.2s;
                            ">
                                <div style="font-size: 14px; color: #9b59b6; margin-bottom: 4px;">✨ 专用</div>
                                <div style="font-size: 11px; color: #888;">
                                    生成专属 .json 文件
                                </div>
                            </div>
                            ` : ''}
                        </div>

                        ${config.type === 'special' && !isCore ? `
                        <div style="margin-top: 12px;">
                            <input type="text" 
                                   class="nc-special-name-input"
                                   data-agent="${agent.id}"
                                   placeholder="输入专属角色卡名称（将生成 .json 文件）"
                                   value="${config.specialName || agent.name + '_专用'}"
                                   style="
                                       width: 100%; padding: 8px 12px; border-radius: 6px;
                                       border: 1px solid #9b59b6; background: #1a1a2e; color: #fff;
                                       font-size: 12px; box-sizing: border-box;
                                   ">
                        </div>
                        ` : ''}
                    </div>
                `;
            });

            html += '</div>';
            main.innerHTML = html;

            // 绑定事件
            this._bindStep2Events();
        }

        _bindStep2Events() {
            document.querySelectorAll('.nc-agent-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const agentId = btn.dataset.agent;
                    const type = btn.dataset.type;
                    
                    // 更新数据
                    this.workshopData.agentConfigs[agentId] = {
                        type,
                        specialName: type === 'special' 
                            ? (this.workshopData.agentConfigs[agentId]?.specialName || AGENT_WORKSHOP.SPECIALIZABLE_AGENTS.find(a => a.id === agentId)?.name + '_专用')
                            : ''
                    };

                    // 重新渲染
                    const main = document.getElementById('nc-workshop-main');
                    if (main) this._renderStep2AgentSelect(main);
                });
            });

            document.querySelectorAll('.nc-special-name-input').forEach(input => {
                input.addEventListener('input', () => {
                    const agentId = input.dataset.agent;
                    if (this.workshopData.agentConfigs[agentId]) {
                        this.workshopData.agentConfigs[agentId].specialName = input.value;
                    }
                });
            });
        }

        // ==================== Step 3: 生成专用角色卡 ====================

        _renderStep3GenerateSpecial(main) {
            main.style.cssText = 'flex: 1; padding: 24px; overflow-y: auto;';

            const specialAgents = Object.entries(this.workshopData.agentConfigs)
                .filter(([id, config]) => config.type === 'special')
                .map(([id, config]) => {
                    const agent = this.workshopData.configStructure?.agents?.find(a => a.id === id);
                    return { id, config, agent };
                });

            if (specialAgents.length === 0) {
                main.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                        <div style="font-size: 18px; color: #fff; margin-bottom: 8px;">无需生成专用角色卡</div>
                        <div style="font-size: 13px; color: #888;">
                            所有 Agent 都使用通用生成器
                        </div>
                    </div>
                `;
                return;
            }

            let html = `
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        ✨ 生成专用角色卡（${specialAgents.length}个）
                    </div>
                    <div style="font-size: 13px; color: #888;">
                        子 AI 正在为每个专用 Agent 生成专属的角色卡内容...
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
            `;

            specialAgents.forEach((item, idx) => {
                const card = this.workshopData.specialCards[item.id];
                const isGenerated = !!card;

                html += `
                    <div class="nc-special-card" data-agent-id="${item.id}" style="
                        padding: 16px; border-radius: 12px;
                        border: 1px solid ${isGenerated ? '#27ae60' : '#444'}; 
                        background: ${isGenerated ? 'rgba(39,174,96,0.1)' : '#252540'};
                    ">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                            <div style="
                                width: 28px; height: 28px; border-radius: 50%;
                                background: ${isGenerated ? '#27ae60' : '#444'};
                                display: flex; align-items: center; justify-content: center;
                                color: #fff; font-size: 14px;
                            ">${isGenerated ? '✓' : idx + 1}</div>
                            <div style="flex: 1;">
                                <div style="font-size: 14px; font-weight: bold; color: #fff;">
                                    ${item.config.specialName}
                                </div>
                                <div style="font-size: 12px; color: #888;">
                                    ${item.agent?.desc || item.id}
                                </div>
                            </div>
                            ${!isGenerated ? `
                                <button class="nc-generate-btn" data-agent-id="${item.id}" style="
                                    padding: 8px 16px; border-radius: 6px;
                                    border: none; background: #9b59b6; color: #fff;
                                    cursor: pointer; font-size: 12px;
                                ">生成</button>
                            ` : ''}
                        </div>
                        ${isGenerated ? `
                            <div style="padding: 10px; background: #1a1a2e; border-radius: 6px; font-size: 12px; color: #aaa;">
                                <div style="margin-bottom: 6px;">
                                    <span style="color:#9b59b6;">名称：</span>${card.name}
                                </div>
                                <div style="margin-bottom: 6px;">
                                    <span style="color:#9b59b6;">描述：</span>${(card.description || '').substring(0, 80)}...
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            html += '</div>';
            main.innerHTML = html;

            // 绑定生成按钮
            document.querySelectorAll('.nc-generate-btn').forEach(btn => {
                btn.addEventListener('click', () => this._generateSpecialCard(btn.dataset.agentId));
            });
        }

        /**
         * 构造传递给子AI的结构化输入对象
         * @param {string} agentId - Agent ID
         * @returns {object} 结构化输入
         */
        _buildStructuredAgentInput(agentId) {
            const agent = this.workshopData.configStructure?.agents?.find(a => a.id === agentId);
            const config = this.workshopData.agentConfigs[agentId];
            const configStructure = this.workshopData.configStructure;

            // 收集当前 Agent 在工作流中的上下游关系
            const upstreamAgents = [];
            const downstreamAgents = [];
            if (Array.isArray(configStructure?.workflowStages)) {
                for (let i = 0; i < configStructure.workflowStages.length; i++) {
                    const stage = configStructure.workflowStages[i];
                    if (!Array.isArray(stage.agents)) continue;
                    const myIdx = stage.agents.indexOf(agentId);
                    if (myIdx === -1) continue;

                    // 同阶段前置 Agent
                    for (let j = 0; j < myIdx; j++) {
                        const upstream = configStructure.agents.find(a => a.id === stage.agents[j]);
                        if (upstream) upstreamAgents.push({ id: upstream.id, name: upstream.name, desc: upstream.desc });
                    }
                    // 同阶段后续 Agent
                    for (let j = myIdx + 1; j < stage.agents.length; j++) {
                        const downstream = configStructure.agents.find(a => a.id === stage.agents[j]);
                        if (downstream) downstreamAgents.push({ id: downstream.id, name: downstream.name, desc: downstream.desc });
                    }
                    // 前置阶段的 Agent
                    if (i > 0) {
                        const prevStage = configStructure.workflowStages[i - 1];
                        if (Array.isArray(prevStage.agents)) {
                            prevStage.agents.forEach(aid => {
                                const a = configStructure.agents.find(x => x.id === aid);
                                if (a && !upstreamAgents.find(u => u.id === a.id)) {
                                    upstreamAgents.push({ id: a.id, name: a.name, desc: a.desc });
                                }
                            });
                        }
                    }
                    break; // 只找第一个包含当前 Agent 的 stage
                }
            }

            return {
                agent: {
                    id: agentId,
                    name: config.specialName || agent?.name || agentId,
                    category: agent?.category || 'core',
                    desc: agent?.desc || '',
                    required: agent?.required !== false
                },
                workflow: {
                    mode: configStructure?.mode || 'normal',
                    description: configStructure?.description || '',
                    upstreamAgents,
                    downstreamAgents
                },
                novelContext: {
                    type: AGENT_WORKSHOP.NOVEL_TYPES.find(t => t.id === this.workshopData.novelType)?.name || '未指定',
                    style: this.workshopData.style || '未指定',
                    complexity: AGENT_WORKSHOP.COMPLEXITY_PRESETS[this.workshopData.complexity]?.name || '快速'
                }
            };
        }

        async _generateSpecialCard(agentId) {
            const btn = document.querySelector(`.nc-generate-btn[data-agent-id="${agentId}"]`);
            if (btn) {
                btn.disabled = true;
                btn.textContent = '生成中...';
            }

            try {
                // 构造结构化输入
                const structuredInput = this._buildStructuredAgentInput(agentId);

                const prompt = `
【结构化输入 - Agent 角色卡生成任务】

${JSON.stringify(structuredInput, null, 2)}

请根据以上结构化信息，生成符合 chara_card_v2 规范的角色卡JSON。不要包含其他文字。`;

                // 使用角色卡调用 AI
                const response = await this._callAIWithCharacter('Workshop子AI', prompt);
                const jsonMatch = response.match(/\{[\s\S]*"data"[\s\S]*\}/);

                if (!jsonMatch) {
                    Notify.error(`生成 ${agentId} 失败: AI返回内容不包含有效角色卡JSON`);
                    return;
                }

                const cardData = JSON.parse(jsonMatch[0]);

                // Schema 校验
                const validation = this._validateSpecialCard(cardData);
                if (!validation.valid) {
                    const errorDetail = validation.errors.map(e => `  • ${e}`).join('\n');
                    Notify.error(`角色卡校验失败（${agentId}）：\n${errorDetail}`);
                    console.error(`[AgentWorkshop] 角色卡校验失败 ${agentId}:`, validation.errors, '\n原始输出:', response);
                    return;
                }

                this.workshopData.specialCards[agentId] = {
                    name: cardData.data?.name || '',
                    description: cardData.data?.description || '',
                    systemPrompt: cardData.data?.system_prompt || '',
                    personality: cardData.data?.personality || '',
                    ...cardData.data
                };
            } catch (e) {
                console.error(`[AgentWorkshop] 生成 ${agentId} 角色卡失败:`, e);
                Notify.error(`生成 ${agentId} 失败: ${e.message}`);
            }

            // 重新渲染
            const main = document.getElementById('nc-workshop-main');
            if (main) this._renderStep3GenerateSpecial(main);
        }

        // ==================== Step 4: 微调角色卡 ====================

        _renderStep4FineTune(main) {
            main.style.cssText = 'flex: 1; padding: 24px; overflow-y: auto;';

            // 收集所有角色卡（通用 + 专用）
            const allAgents = (this.workshopData.configStructure?.agents || []).map(agent => {
                const config = this.workshopData.agentConfigs[agent.id];
                const specialCard = this.workshopData.specialCards[agent.id];
                const isGeneral = config?.type === 'general' || !config;
                
                return {
                    ...agent,
                    type: config?.type || 'general',
                    specialName: config?.specialName,
                    card: isGeneral ? null : specialCard
                };
            });

            let html = `
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        📐 微调角色卡
                    </div>
                    <div style="font-size: 13px; color: #888;">
                        点击角色卡展开详细内容进行编辑。通用角色卡使用"通用生成器"，专用角色卡可完全自定义。
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
            `;

            allAgents.forEach((agent, idx) => {
                const isGeneral = agent.type === 'general';

                html += `
                    <div class="nc-card-editor" data-agent-id="${agent.id}" style="
                        border-radius: 12px; border: 1px solid #444; overflow: hidden;
                    ">
                        <!-- 头部 -->
                        <div class="nc-card-header" style="
                            padding: 16px; background: #252540; cursor: pointer;
                            display: flex; align-items: center; justify-content: space-between;
                        ">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div style="
                                    width: 32px; height: 32px; border-radius: 8px;
                                    background: ${isGeneral ? '#3498db' : '#9b59b6'};
                                    display: flex; align-items: center; justify-content: center;
                                    color: #fff; font-size: 14px;
                                ">${isGeneral ? '🔧' : '✨'}</div>
                                <div>
                                    <div style="font-size: 14px; font-weight: bold; color: #fff;">
                                        ${isGeneral ? '通用生成器' : agent.specialName}
                                    </div>
                                    <div style="font-size: 12px; color: #888;">
                                        ${agent.name} — ${isGeneral ? '通用角色卡' : '专用角色卡'}
                                    </div>
                                </div>
                            </div>
                            <div style="color: #666; font-size: 18px;">▼</div>
                        </div>

                        <!-- 内容 -->
                        <div class="nc-card-content" style="display: none; padding: 16px; background: #1a1a2e;">
                            ${isGeneral ? this._renderGeneralCardEditor(agent) : this._renderSpecialCardEditor(agent)}
                        </div>
                    </div>
                `;
            });

            html += '</div>';
            main.innerHTML = html;

            // 绑定折叠事件
            document.querySelectorAll('.nc-card-header').forEach(header => {
                header.addEventListener('click', () => {
                    const content = header.nextElementSibling;
                    const arrow = header.querySelector('div:last-child');
                    if (content.style.display === 'none') {
                        content.style.display = 'block';
                        arrow.textContent = '▲';
                    } else {
                        content.style.display = 'none';
                        arrow.textContent = '▼';
                    }
                });
            });
        }

        _renderGeneralCardEditor(agent) {
            return `
                <div style="padding: 12px; background: rgba(52,152,219,0.1); border-radius: 8px;">
                    <div style="font-size: 13px; color: #3498db; margin-bottom: 8px;">
                        🔧 通用生成器说明
                    </div>
                    <div style="font-size: 12px; color: #aaa; line-height: 1.6;">
                        通用生成器是一个元Agent，通过【标记】动态指定任务。
                        每次调用时，输入会包含以下标记：
                        <br>• 【职能】— 当前角色任务
                        <br>• 【职能规则】— 行为约束
                        <br>• 【唯一输出格式】— 输出格式要求
                        <br>• 【输出示例】— 格式示例
                        <br>• 【自定义】— 额外要求
                        <br>• 【输入】— 实际内容
                    </div>
                    <div style="margin-top: 12px;">
                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">Agent 职责</div>
                        <div style="font-size: 12px; color: #ccc;">${agent.desc}</div>
                    </div>
                </div>
            `;
        }

        _renderSpecialCardEditor(agent) {
            const card = agent.card || {};
            
            return `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div>
                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">角色名称</div>
                        <input type="text" class="nc-card-field" data-agent="${agent.id}" data-field="name"
                               value="${card.name || agent.specialName || agent.name}" style="
                            width: 100%; padding: 8px 12px; border-radius: 6px;
                            border: 1px solid #9b59b6; background: #252540; color: #fff;
                            font-size: 12px; box-sizing: border-box;
                        ">
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">角色定位/描述</div>
                        <textarea class="nc-card-field" data-agent="${agent.id}" data-field="description" style="
                            width: 100%; height: 80px; padding: 8px 12px; border-radius: 6px;
                            border: 1px solid #9b59b6; background: #252540; color: #fff;
                            font-size: 12px; resize: none; box-sizing: border-box;
                        ">${card.description || ''}</textarea>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">性格特点（逗号分隔）</div>
                        <input type="text" class="nc-card-field" data-agent="${agent.id}" data-field="personality"
                               value="${card.personality || ''}" style="
                            width: 100%; padding: 8px 12px; border-radius: 6px;
                            border: 1px solid #9b59b6; background: #252540; color: #fff;
                            font-size: 12px; box-sizing: border-box;
                        ">
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">系统提示词（核心）</div>
                        <textarea class="nc-card-field" data-agent="${agent.id}" data-field="system_prompt" style="
                            width: 100%; height: 150px; padding: 8px 12px; border-radius: 6px;
                            border: 1px solid #9b59b6; background: #252540; color: #fff;
                            font-size: 12px; resize: vertical; box-sizing: border-box;
                        ">${card.system_prompt || card.systemPrompt || ''}</textarea>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">首次消息</div>
                        <input type="text" class="nc-card-field" data-agent="${agent.id}" data-field="first_mes"
                               value="${card.first_mes || ''}" style="
                            width: 100%; padding: 8px 12px; border-radius: 6px;
                            border: 1px solid #9b59b6; background: #252540; color: #fff;
                            font-size: 12px; box-sizing: border-box;
                        ">
                    </div>
                </div>
            `;
        }

        // ==================== Step 5: 导出 ====================

        _renderStep5Export(main) {
            main.style.cssText = 'flex: 1; padding: 24px; overflow-y: auto;';

            const specialCards = Object.entries(this.workshopData.specialCards);
            const config = this.workshopData.configStructure;

            let html = `
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                        💾 导出配置
                    </div>
                </div>

                <!-- 配置文件 -->
                <div style="margin-bottom: 24px;">
                    <div style="
                        padding: 16px; border-radius: 12px;
                        border: 1px solid #667eea; background: rgba(102,126,234,0.1);
                    ">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <div>
                                <div style="font-size: 14px; font-weight: bold; color: #fff;">
                                    📄 工作流配置
                                </div>
                                <div style="font-size: 12px; color: #888; margin-top: 4px;">
                                    ${config?.description || '配置描述'}
                                </div>
                            </div>
                            <button id="nc-download-config" style="
                                padding: 8px 16px; border-radius: 6px;
                                border: none; background: #667eea; color: #fff;
                                cursor: pointer; font-size: 12px;
                            ">下载 JSON</button>
                        </div>
                    </div>
                </div>

                ${specialCards.length > 0 ? `
                <!-- 专用角色卡 -->
                <div style="margin-bottom: 24px;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 12px;">
                        ✨ 专用角色卡（${specialCards.length}个）
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                ` : ''}
            `;

            specialCards.forEach(([agentId, card]) => {
                const agent = config?.agents?.find(a => a.id === agentId);
                html += `
                    <div style="
                        padding: 12px 16px; border-radius: 8px;
                        border: 1px solid #9b59b6; background: rgba(155,89,182,0.1);
                        display: flex; align-items: center; justify-content: space-between;
                    ">
                        <div>
                            <div style="font-size: 13px; color: #fff;">
                                📄 ${card.name || agent?.name || agentId}.json
                            </div>
                            <div style="font-size: 11px; color: #888; margin-top: 2px;">
                                ${agent?.desc || agentId}
                            </div>
                        </div>
                        <button class="nc-download-card" data-agent-id="${agentId}" style="
                            padding: 6px 12px; border-radius: 6px;
                            border: 1px solid #9b59b6; background: transparent; color: #9b59b6;
                            cursor: pointer; font-size: 11px;
                        ">下载</button>
                    </div>
                `;
            });

            if (specialCards.length > 0) {
                html += `
                    </div>
                    <button id="nc-download-all-cards" style="
                        width: 100%; margin-top: 12px; padding: 10px; border-radius: 8px;
                        border: none; background: #9b59b6; color: #fff;
                        cursor: pointer; font-size: 13px;
                    ">📥 下载全部角色卡</button>
                </div>
                `;
            }

            // 导入酒馆
            html += `
                <div style="
                    padding: 16px; border-radius: 12px;
                    border: 1px solid #27ae60; background: rgba(39,174,96,0.1);
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <div style="font-size: 14px; font-weight: bold; color: #fff;">
                                🏠 导入酒馆
                            </div>
                            <div style="font-size: 12px; color: #888; margin-top: 4px;">
                                将专用角色卡导入 SillyTavern
                            </div>
                        </div>
                        <button id="nc-import-tavern" style="
                            padding: 8px 16px; border-radius: 6px;
                            border: none; background: #27ae60; color: #fff;
                            cursor: pointer; font-size: 12px;
                        ">导入酒馆</button>
                    </div>
                </div>
            `;

            main.innerHTML = html;

            // 绑定下载事件
            document.getElementById('nc-download-config')?.addEventListener('click', () => {
                this._downloadConfig();
            });

            document.querySelectorAll('.nc-download-card').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._downloadCard(btn.dataset.agentId);
                });
            });

            document.getElementById('nc-download-all-cards')?.addEventListener('click', () => {
                specialCards.forEach(([agentId]) => this._downloadCard(agentId));
            });

            document.getElementById('nc-import-tavern')?.addEventListener('click', () => {
                this._importToTavern();
            });
        }

        _downloadConfig() {
            const config = {
                ...this.workshopData.configStructure,
                agents: Object.fromEntries(
                    Object.entries(this.workshopData.configStructure?.agents || {}).map(([id, agent]) => {
                        const agentConfig = this.workshopData.agentConfigs[id];
                        return [id, {
                            ...agent,
                            cardType: agentConfig?.type || 'general',
                            cardName: agentConfig?.type === 'special' ? agentConfig.specialName : null
                        }];
                    })
                )
            };

            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workflow-config-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            Notify.success('配置文件已下载');
        }

        _downloadCard(agentId) {
            const card = this.workshopData.specialCards[agentId];
            if (!card) return;

            const fullCard = {
                spec: 'chara_card_v2',
                spec_version: '1.0',
                data: {
                    name: card.name || card.name_input || agentId,
                    description: card.description || card.description_input || '',
                    personality: card.personality || card.personality_input || '',
                    scenario: card.scenario || '',
                    first_mes: card.first_mes || card.first_mes_input || `【${card.name || agentId}】已就绪。`,
                    alternate_greetings: card.alternate_greetings || [card.first_mes || ''],
                    system_prompt: card.system_prompt || card.systemPrompt || card.system_prompt_input || '',
                    post_history_instructions: card.post_history_instructions || '',
                    tags: [card.name || agentId, 'AI生成', '专用角色卡'],
                    creator: 'Agent工坊',
                    character_version: '1.0',
                    extensions: {
                        sillytavern: {
                            agent_type: 'specialized',
                            agent_id: agentId
                        }
                    }
                }
            };

            const blob = new Blob([JSON.stringify(fullCard, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${card.name || agentId}.json`;
            a.click();
            URL.revokeObjectURL(url);
            Notify.success(`角色卡 ${card.name} 已下载`);
        }

        async _importToTavern() {
            const specialCards = Object.entries(this.workshopData.specialCards);
            
            if (specialCards.length === 0) {
                Notify.warning('没有可导入的专用角色卡');
                return;
            }

            if (typeof TavernHelper === 'undefined') {
                Notify.error('酒馆助手不可用，请下载 JSON 文件手动导入');
                return;
            }

            let success = 0;
            for (const [agentId, card] of specialCards) {
                try {
                    const fullCard = {
                        spec: 'chara_card_v2',
                        spec_version: '1.0',
                        data: {
                            name: card.name || card.name_input || agentId,
                            description: card.description || '',
                            personality: card.personality || '',
                            scenario: '',
                            first_mes: card.first_mes || `【${card.name}】已就绪。`,
                            alternate_greetings: [card.first_mes || ''],
                            system_prompt: card.system_prompt || card.systemPrompt || '',
                            post_history_instructions: '',
                            tags: ['AI生成', '专用角色卡'],
                            creator: 'Agent工坊',
                            character_version: '1.0'
                        }
                    };

                    await TavernHelper.createOrReplaceCharacter(card.name, fullCard, { render: 'debounced' });
                    success++;
                } catch (e) {
                    console.error(`导入 ${agentId} 失败:`, e);
                }
            }

            Notify.success(`成功导入 ${success}/${specialCards.length} 个角色卡`);
        }

        // ==================== 底部按钮 ====================

        _renderFooter(footer) {
            const isFirst = this.currentStep === 0;
            const isLast = this.currentStep === this.totalSteps;

            // Step 0 确认需求摘要 checkbox
            const confirmCheckboxHtml = isFirst ? `
                <label style="
                    display: flex; align-items: center; gap: 8px;
                    font-size: 12px; color: #aaa; cursor: pointer; user-select: none;
                ">
                    <input type="checkbox" id="nc-confirm-requirement" style="
                        width: 16px; height: 16px; accent-color: #667eea; cursor: pointer;
                    ">
                    我已确认需求信息无误，准备生成工作流配置
                </label>
            ` : '';

            // Step 0 时"下一步"按钮初始禁用
            const nextBtnStyle = isFirst
                ? `padding: 10px 24px; border-radius: 8px; border: none; background: #444; color: #666; cursor: not-allowed; font-size: 13px; font-weight: bold;`
                : `padding: 10px 24px; border-radius: 8px; border: none; background: #667eea; color: #fff; cursor: pointer; font-size: 13px; font-weight: bold;`;

            footer.innerHTML = `
                <button id="nc-btn-cancel" style="
                    padding: 10px 20px; border-radius: 8px;
                    border: 1px solid #444; background: transparent; color: #888;
                    cursor: pointer; font-size: 13px;
                ">取消</button>

                ${confirmCheckboxHtml}

                <div style="display: flex; gap: 10px;">
                    ${!isFirst ? `
                        <button id="nc-btn-prev" style="
                            padding: 10px 20px; border-radius: 8px;
                            border: 1px solid #444; background: transparent; color: #fff;
                            cursor: pointer; font-size: 13px;
                        ">← 上一步</button>
                    ` : ''}
                    
                    <button id="nc-btn-next" style="${nextBtnStyle}"
                        ${isFirst ? 'disabled' : ''}
                    >${isLast ? '完成' : '下一步'} →</button>
                </div>
            `;

            document.getElementById('nc-btn-cancel')?.addEventListener('click', () => {
                const overlay = document.querySelector('.nc-modal-overlay');
                if (overlay) this._closeOverlay(overlay);
            });

            if (!isFirst) {
                document.getElementById('nc-btn-prev')?.addEventListener('click', () => this._prevStep());
            }

            // Step 0 checkbox: 勾选后启用"下一步"按钮
            const confirmCheckbox = document.getElementById('nc-confirm-requirement');
            if (confirmCheckbox) {
                confirmCheckbox.addEventListener('change', () => {
                    const btnNext = document.getElementById('nc-btn-next');
                    if (btnNext) {
                        if (confirmCheckbox.checked) {
                            btnNext.disabled = false;
                            btnNext.style.background = '#667eea';
                            btnNext.style.color = '#fff';
                            btnNext.style.cursor = 'pointer';
                        } else {
                            btnNext.disabled = true;
                            btnNext.style.background = '#444';
                            btnNext.style.color = '#666';
                            btnNext.style.cursor = 'not-allowed';
                        }
                    }
                });
            }

            document.getElementById('nc-btn-next')?.addEventListener('click', () => this._nextStep());
        }

        _nextStep() {
            // Step 0: 验证必填项 + 确认摘要
            if (this.currentStep === 0) {
                if (!this.workshopData.novelType) {
                    Notify.warning('请选择小说类型');
                    return;
                }
                if (!this.workshopData.creationMode) {
                    Notify.warning('请选择创作模式');
                    return;
                }
                if (!this.workshopData.narrativePov) {
                    Notify.warning('请选择叙事视角');
                    return;
                }
                if (!this.workshopData.outputTarget) {
                    Notify.warning('请选择输出目标');
                    return;
                }
                // 检查确认 checkbox（防御性检查，按钮本身已被 disabled 控制）
                const confirmCheckbox = document.getElementById('nc-confirm-requirement');
                if (!confirmCheckbox || !confirmCheckbox.checked) {
                    Notify.warning('请先确认需求信息无误');
                    return;
                }
                // 自动进入 Step 1 并生成配置
                this.currentStep = 1;
            } else if (this.currentStep === 1) {
                // Step 1: 如果还没生成配置，先生成
                if (!this.workshopData.configStructure) {
                    this._generateInitialConfig().then(() => {
                        this.currentStep = 2;
                        this._refreshUI();
                    });
                    return;
                }
                this.currentStep = 2;
            } else if (this.currentStep === 2) {
                // Step 2: 检查专用 Agent 是否都生成了
                const specialAgents = Object.entries(this.workshopData.agentConfigs)
                    .filter(([id, config]) => config.type === 'special');
                
                const allGenerated = specialAgents.every(([id]) => !!this.workshopData.specialCards[id]);
                
                if (specialAgents.length > 0 && !allGenerated) {
                    Notify.warning('请先生成所有专用角色卡');
                    return;
                }
                this.currentStep = 3;
            } else if (this.currentStep === 3) {
                // Step 3: 保存微调内容
                this._saveFineTuneData();
                this.currentStep = 4;
            } else if (this.currentStep === 4) {
                // 完成
                if (typeof this.onComplete === 'function') {
                    this.onComplete({
                        config: this.workshopData.configStructure,
                        agentConfigs: this.workshopData.agentConfigs,
                        specialCards: this.workshopData.specialCards
                    });
                }
                const overlay = document.querySelector('.nc-modal-overlay');
                if (overlay) this._closeOverlay(overlay);
                return;
            }

            this._refreshUI();
        }

        _prevStep() {
            if (this.currentStep > 0) {
                this.currentStep--;
                this._refreshUI();
            }
        }

        _refreshUI() {
            const container = document.querySelector('.nc-agent-workshop');
            if (container) {
                this._renderWorkshop(container);
            }
        }

        _saveFineTuneData() {
            document.querySelectorAll('.nc-card-field').forEach(input => {
                const agentId = input.dataset.agent;
                const field = input.dataset.field;
                const value = input.value;

                if (!this.workshopData.specialCards[agentId]) {
                    this.workshopData.specialCards[agentId] = {};
                }
                this.workshopData.specialCards[agentId][field] = value;
            });
        }
    }

    // 导出到全局
    window.AgentWorkshop = AgentWorkshop;
