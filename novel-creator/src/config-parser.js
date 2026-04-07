    // ║  模块 05：配置解析                                                ║
    // ║  parseCategoryFromContent / buildTemplateContentFromCategories / validateConfig / loadConfigFromJson║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module ConfigParser — loadConfigFromJson / validateConfig / buildTemplateContentFromCategories */

    /**
     * 从优化师输出动作的内容中提取类别定义
     * 优先匹配 **类别数字:名称** 格式；若失败则匹配任意 **名称** 格式，并使用传入的 uid 作为类别编号。
     * @param {string} content 动作的模板内容
     * @param {number|string} uid 该动作的条目 uid（用于后备编号）
     * @returns {Object|null} { catId, catName, definition } 或 null（若解析失败）
     */
    function parseCategoryFromContent(content, uid) {
        const lines = content.split('\n');
        if (lines.length === 0) {
            console.warn('[parseCategoryFromContent] content 为空，返回 null');
            return null;
        }
        const firstLine = lines[0].trim();

        // 优先匹配 **类别数字:名称** 格式
        let match = firstLine.match(/^\*\*类别(\d+):([^*]+)\*\*.*$/);
        if (match) {
            const catId = match[1];
            const catName = match[2].trim();

            return { catId, catName, definition: content };
        }
        // 否则，尝试匹配任何 **名称** 格式，使用 uid 作为 catId
        match = firstLine.match(/^\*\*([^*]+)\*\*.*$/);
        if (match && uid !== undefined) {
            const catName = match[1].trim();

            return { catId: String(uid), catName, definition: content };
        }

        return null;
    }

    /**
     * 根据类别定义映射构建新的模板内容（按类别编号排序）
     * @param {Map<number, string>} categories 类别编号 -> 完整定义
     * @returns {string} 拼接后的模板内容
     */
    function buildTemplateContentFromCategories(categories) {
        const sorted = Array.from(categories.entries()).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        return sorted.map(([_, def]) => def).join('\n\n');
    }

    function validateConfig(json) {

        const errors = [];

        // 辅助函数：添加错误
        const addError = (msg) => {
            console.warn('[validateConfig] 校验错误:', msg);
            errors.push(msg);
        };

        // ---------- 0. 自动修复常见格式问题（就地修改 json，不影响原始文件） ----------
        (function autoFixAgentFields() {
            if (!json.agents || typeof json.agents !== 'object') return;
            for (const [key, agent] of Object.entries(json.agents)) {
                // inputMode: 字符串自动转为数组
                if (agent.inputMode !== undefined && !Array.isArray(agent.inputMode)) {
                    const inputsLen = Array.isArray(agent.inputs) ? agent.inputs.length : 0;
                    if (agent.inputMode === '' || agent.inputMode === null || agent.inputMode === undefined) {
                        agent.inputMode = Array(inputsLen).fill('txt');
                    } else if (typeof agent.inputMode === 'string') {
                        // 单字符串如 "txt" → ["txt"]，但如果 inputs 为空则 []
                        agent.inputMode = inputsLen > 0 ? [agent.inputMode] : [];
                    } else {
                        agent.inputMode = [String(agent.inputMode)];
                    }
                    console.log(`[validateConfig] 自动修复 Agent ${key} inputMode: 转为数组`);
                }
                // autoConfig: 数字自动转为数组
                if (agent.autoConfig !== undefined && !Array.isArray(agent.autoConfig)) {
                    agent.autoConfig = [Number(agent.autoConfig) || 0];
                    console.log(`[validateConfig] 自动修复 Agent ${key} autoConfig: 转为数组`);
                }
                // inputPrompts: 字符串自动转为数组
                if (agent.inputPrompts !== undefined && !Array.isArray(agent.inputPrompts)) {
                    agent.inputPrompts = [String(agent.inputPrompts)];
                    console.log(`[validateConfig] 自动修复 Agent ${key} inputPrompts: 转为数组`);
                }
                // reflowConditions: 字符串/对象自动转为数组
                if (agent.reflowConditions !== undefined && !Array.isArray(agent.reflowConditions)) {
                    agent.reflowConditions = [agent.reflowConditions];
                    console.log(`[validateConfig] 自动修复 Agent ${key} reflowConditions: 转为数组`);
                }
            }
        })();

        // ---------- 1. 校验全局数值配置 ----------
        (function validateGlobal() {

            if (json.maxStateBooks === undefined) addError('缺少必填字段 maxStateBooks');
            else {
                const val = Number(json.maxStateBooks);
                if (!Number.isInteger(val) || val <= 0) addError('maxStateBooks 必须为正整数');
            }

            if (json.stateTypeLimit === undefined) addError('缺少必填字段 stateTypeLimit');
            else {
                const val = Number(json.stateTypeLimit);
                if (!Number.isInteger(val) || val <= 0) addError('stateTypeLimit 必须为正整数');
            }

            if (json.maxConsecutiveReflows === undefined) addError('缺少必填字段 maxConsecutiveReflows');
            else {
                const val = Number(json.maxConsecutiveReflows);
                if (!Number.isInteger(val) || val <= 0) addError('maxConsecutiveReflows 必须为正整数');
            }

            if (json.maxReflowDepth === undefined) addError('缺少必填字段 maxReflowDepth');
            else {
                const val = Number(json.maxReflowDepth);
                if (!Number.isInteger(val) || val <= 0) addError('maxReflowDepth 必须为正整数');
            }

            if (json.maxImagesPerBook !== undefined) {
                const val = Number(json.maxImagesPerBook);
                if (!Number.isInteger(val) || val <= 0) addError('maxImagesPerBook 必须为正整数');
            }

            if (json.maxAudiosPerBook !== undefined) {
                const val = Number(json.maxAudiosPerBook);
                if (!Number.isInteger(val) || val <= 0) addError('maxAudiosPerBook 必须为正整数');
            }

            if (!json.mode) {
                addError('缺少必填字段 mode');
            } else if (typeof json.mode !== 'string') {
                addError('mode 必须为字符串');
            } else if (!['normal', 'datafication', 'interactive', 'workshop'].includes(json.mode)) {
                addError('mode 必须是 "normal"、"datafication"、"interactive" 或 "workshop" 之一');
            }
        })();

        // ---------- 2. 校验 apiConfigs ----------
        let imageConfigCount = 0;
        let hasValidApiConfigs = true;
        const audioModes = ['music-generation', 'voice-cloning', 'audio-editing'];
        const imageModes = new Set();          // 记录已出现的图像 mode
        const audioModeSet = new Set();        // 记录已出现的音频 mode，用于唯一性校验

        (function validateApiConfigBase() {

            if (!json.apiConfigs) {
                addError('缺少必填字段 apiConfigs（必须存在，可为空对象 {}）');
                hasValidApiConfigs = false;
                return;
            }
            if (typeof json.apiConfigs !== 'object') {
                addError('apiConfigs 必须是对象');
                hasValidApiConfigs = false;
                return;
            }

            const apiConfigs = json.apiConfigs;
            for (const [id, config] of Object.entries(apiConfigs)) {

                if (id.trim() === '') {
                    addError(`apiConfigs 中存在空字符串作为 ID，不允许`);
                    continue;
                }

                if (!config.type || !['text', 'image', 'audio'].includes(config.type)) {
                    addError(`apiConfigs.${id} 缺少 type 字段或 type 无效（必须为 "text"、"image" 或 "audio"）`);
                    continue;
                }

                // 公共必填字段，但 key 和 model 允许为空字符串或缺失
                const requiredFields = ['source', 'apiUrl', 'key', 'model'];
                for (const field of requiredFields) {
                    // key 和 model 允许为空（缺失或空字符串均不报错）
                    if (field === 'key' || field === 'model') {
                        // 如果字段存在但类型不是字符串，则报错
                        if (field in config && typeof config[field] !== 'string') {
                            addError(`apiConfigs.${id} 的字段 ${field} 必须是字符串，当前类型为 ${typeof config[field]}`);
                        }
                        // 字段缺失或为空字符串，视为允许，不报错
                        continue;
                    }
                    // 其他字段 (source, apiUrl) 必须存在且非空字符串
                    if (!config[field] || typeof config[field] !== 'string' || config[field].trim() === '') {
                        addError(`apiConfigs.${id} 缺少必填字段 ${field} 或字段为空`);
                    }
                }

                // 文本类型：必须包含 mode 字段，且值必须为 "txt-txt"
                if (config.type === 'text') {
                    if (!config.mode) {
                        addError(`apiConfigs.${id} 缺少必填字段 mode（当 type 为 text 时）`);
                    } else if (config.mode !== 'txt-txt') {
                        addError(`apiConfigs.${id} mode 必须是 "txt-txt"（当前为 "${config.mode}"）`);
                    }
                }

                // 图像类型：必须包含 mode，且 mode 值有效，且同一 mode 只能出现一次
                if (config.type === 'image') {
                    if (!config.mode) {
                        addError(`apiConfigs.${id} 缺少必填字段 mode（当 type 为 image 时）`);
                    } else if (!['txt2img', 'img2img', 'fusion'].includes(config.mode)) {
                        addError(`apiConfigs.${id} mode 必须是 "txt2img"、"img2img" 或 "fusion"`);
                    } else if (imageModes.has(config.mode)) {
                        addError(`apiConfigs 中 mode 为 "${config.mode}" 的 image 配置只能有一个`);
                    } else {
                        imageModes.add(config.mode);
                    }
                }

                // 音频类型：必须包含 mode，且 mode 值有效，且同一 mode 只能出现一次
                if (config.type === 'audio') {
                    if (!config.mode) {
                        addError(`apiConfigs.${id} 缺少必填字段 mode（当 type 为 audio 时）`);
                    } else if (!audioModes.includes(config.mode)) {
                        addError(`apiConfigs.${id} mode 必须是 "${audioModes.join('", "')}" 之一`);
                    } else if (audioModeSet.has(config.mode)) {
                        addError(`apiConfigs 中 mode 为 "${config.mode}" 的 audio 配置只能有一个`);
                    } else {
                        audioModeSet.add(config.mode);
                    }
                }

                // URL 格式校验
                if (config.apiUrl && !config.apiUrl.match(/^https?:\/\//)) {
                    addError(`apiConfigs.${id} apiUrl 必须以 http:// 或 https:// 开头`);
                }

                // 可选字段类型校验
                if (config.timeout !== undefined && (typeof config.timeout !== 'number' || config.timeout <= 0))
                    addError(`apiConfigs.${id} timeout 必须为正整数`);
                if (config.maxTokens !== undefined && (typeof config.maxTokens !== 'number' || config.maxTokens <= 0))
                    addError(`apiConfigs.${id} maxTokens 必须为正整数`);
                if (config.temperature !== undefined && (typeof config.temperature !== 'number' || config.temperature < 0 || config.temperature > 2))
                    addError(`apiConfigs.${id} temperature 必须为 0-2 之间的数字`);
                if (config.top_p !== undefined && (typeof config.top_p !== 'number' || config.top_p < 0 || config.top_p > 1))
                    addError(`apiConfigs.${id} top_p 必须为 0-1 之间的数字`);
                if (config.frequency_penalty !== undefined && (typeof config.frequency_penalty !== 'number' || config.frequency_penalty < -2 || config.frequency_penalty > 2))
                    addError(`apiConfigs.${id} frequency_penalty 必须为 -2 到 2 之间的数字`);
                if (config.presence_penalty !== undefined && (typeof config.presence_penalty !== 'number' || config.presence_penalty < -2 || config.presence_penalty > 2))
                    addError(`apiConfigs.${id} presence_penalty 必须为 -2 到 2 之间的数字`);
                if (config.stop !== undefined && !Array.isArray(config.stop) && typeof config.stop !== 'string')
                    addError(`apiConfigs.${id} stop 必须是字符串或字符串数组`);
                if (config.logit_bias !== undefined && typeof config.logit_bias !== 'object')
                    addError(`apiConfigs.${id} logit_bias 必须是对象`);
                if (config.n !== undefined && (typeof config.n !== 'number' || config.n < 1))
                    addError(`apiConfigs.${id} n 必须为正整数`);
                if (config.stream !== undefined && typeof config.stream !== 'boolean')
                    addError(`apiConfigs.${id} stream 必须是布尔值`);

                if (config.type === 'image') imageConfigCount++;
            }
        })();

        // ---------- 3. 收集所有阶段ID ----------
        const stageIds = new Set();
        const stageMap = {};
        if (json.workflowStages && Array.isArray(json.workflowStages)) {
            json.workflowStages.forEach((stage, index) => {
                if (!stage.id || typeof stage.id !== 'string' || stage.id.trim() === '') {
                    addError(`workflowStages[${index}] 缺少必填字段 id 或 id 为空`);
                } else {
                    if (stageIds.has(stage.id)) {
                        addError(`workflowStages 中存在重复的 id: ${stage.id}`);
                    }
                    stageIds.add(stage.id);
                    stageMap[stage.id] = stage;
                }
                if (!stage.name || typeof stage.name !== 'string') {
                    addError(`workflowStages[${index}] 缺少 name 或 name 类型错误`);
                }
                if (stage.color && typeof stage.color !== 'string') {
                    addError(`workflowStages[${index}] color 应为字符串`);
                }
                if (!stage.mode || !['serial', 'parallel'].includes(stage.mode)) {
                    addError(`workflowStages[${index}] mode 必须为 "serial" 或 "parallel"`);
                }
                if (!Array.isArray(stage.agents)) {
                    addError(`workflowStages[${index}] agents 必须为数组`);
                }
            });
        } else {
            addError('workflowStages 必须为数组');
        }

        // ---------- 4. 先收集所有Agent键 ----------
        const agentKeys = new Set();
        if (json.agents && typeof json.agents === 'object') {
            for (const key of Object.keys(json.agents)) {
                agentKeys.add(key);
            }
        }

        // ---------- 5. 校验 agents ----------
        const roleCount = {};

        (function validateAgents() {

            if (!json.agents || typeof json.agents !== 'object') {
                addError('配置缺少 agents 对象或 agents 无效');
                return;
            }

            for (const [key, agent] of Object.entries(json.agents)) {

                const requiredFields = [
                    'name', 'displayName', 'hover', 'order', 'required',
                    'inputs', 'inputTemplate', 'inputMode',
                    'autoConfig', 'role', 'reflowConditions', 'executeInterval', 'inputPrompts',
                    'apiConfigId', 'review'
                ];
                for (const field of requiredFields) {
                    if (!(field in agent)) {
                        addError(`Agent ${key} 缺少字段 ${field}`);
                    }
                }

                if (typeof agent.review !== 'boolean') addError(`Agent ${key} review 字段必须为布尔值`);
                if (typeof agent.name !== 'string') addError(`Agent ${key} name 应为字符串`);
                if (typeof agent.displayName !== 'string') addError(`Agent ${key} displayName 应为字符串`);
                if (typeof agent.hover !== 'string') addError(`Agent ${key} hover 应为字符串`);
                if (typeof agent.order !== 'number') addError(`Agent ${key} order 应为数字`);
                if (typeof agent.required !== 'boolean') addError(`Agent ${key} required 应为布尔值`);
                if (!Array.isArray(agent.inputs)) addError(`Agent ${key} inputs 应为数组`);
                if (typeof agent.inputTemplate !== 'string') addError(`Agent ${key} inputTemplate 应为字符串`);
                if (!Array.isArray(agent.inputMode)) addError(`Agent ${key} inputMode 应为数组`);
                if (!Array.isArray(agent.autoConfig)) addError(`Agent ${key} autoConfig 应为数组`);
                if (typeof agent.role !== 'string') addError(`Agent ${key} role 应为字符串`);
                if (!Array.isArray(agent.inputPrompts)) addError(`Agent ${key} inputPrompts 应为数组`);
                if (typeof agent.apiConfigId !== 'string') addError(`Agent ${key} apiConfigId 应为字符串`);

                // 检查 inputTemplate 中的占位符数量（workshop 模式跳过，因为 inputs 是 Agent 名称引用）
                if (json.mode !== 'workshop' && agent.inputs && agent.inputTemplate) {
                    const placeholderCount = (agent.inputTemplate.match(/【】/g) || []).length;
                    if (placeholderCount !== agent.inputs.length) {
                        addError(`Agent ${key} inputTemplate 中包含 ${placeholderCount} 个占位符【】，但 inputs 长度为 ${agent.inputs.length}，请确保数量相等`);
                    }
                }

                // workshop 模式下 inputs 是 Agent 名称引用，跳过 inputMode/autoConfig/inputPrompts 的严格对齐检查
                const isWorkshop = json.mode === 'workshop';

                if (!isWorkshop && agent.inputs && agent.inputMode) {
                    if (agent.inputMode.length !== agent.inputs.length) {
                        addError(`Agent ${key} inputMode 长度 (${agent.inputMode.length}) 与 inputs 长度 (${agent.inputs.length}) 不相等`);
                    } else {
                        const validModes = ['txt', 'status', 'chapter', 'all'];
                        for (let i = 0; i < agent.inputMode.length; i++) {
                            const mode = agent.inputMode[i];
                            if (!validModes.includes(mode)) {
                                addError(`Agent ${key} inputMode[${i}] 值 "${mode}" 无效，应为 ${validModes.join('/')}`);
                            }
                            const src = agent.inputs[i];
                            if (src !== 'user' && src !== 'auto' && mode !== 'txt') {
                                addError(`Agent ${key} inputMode[${i}] 应为 "txt"，因为输入源 "${src}" 不是用户或自动提取`);
                            }
                        }
                    }
                }

                if (!isWorkshop && agent.inputs && agent.autoConfig) {
                    if (agent.autoConfig.length !== agent.inputs.length) {
                        addError(`Agent ${key} autoConfig 长度 (${agent.autoConfig.length}) 与 inputs 长度 (${agent.inputs.length}) 不相等`);
                    } else {
                        for (let i = 0; i < agent.autoConfig.length; i++) {
                            const val = agent.autoConfig[i];
                            if (typeof val !== 'number' && (typeof val !== 'string' || isNaN(Number(val)))) {
                                addError(`Agent ${key} autoConfig[${i}] 应为数字`);
                            } else {
                                const num = Number(val);
                                if (num < 0) addError(`Agent ${key} autoConfig[${i}] 不能为负数`);
                                if (agent.inputs[i] !== 'auto' && num !== 0) {
                                    addError(`Agent ${key} inputs[${i}] 不是 "auto"，但 autoConfig[${i}] 必须为 0，当前为 ${num}`);
                                }
                            }
                            if (agent.inputs[i] === 'auto') {
                                const mode = agent.inputMode?.[i];
                                if (mode && mode !== 'status' && mode !== 'chapter' && mode !== 'all') {
                                    addError(`Agent ${key} inputs[${i}] 为 "auto"，但 inputMode[${i}] 必须是 "status"/"chapter"/"all" 之一，当前为 "${mode}"`);
                                }
                            }
                        }
                    }
                }

                if (!isWorkshop && agent.inputs && agent.inputPrompts) {
                    if (agent.inputPrompts.length !== agent.inputs.length) {
                        addError(`Agent ${key} inputPrompts 长度 (${agent.inputPrompts.length}) 与 inputs 长度 (${agent.inputs.length}) 不相等`);
                    } else {
                        for (let i = 0; i < agent.inputPrompts.length; i++) {
                            if (typeof agent.inputPrompts[i] !== 'string') {
                                addError(`Agent ${key} inputPrompts[${i}] 应为字符串`);
                            }
                        }
                    }
                }

                if (agent.reflowConditions) {
                    if (!Array.isArray(agent.reflowConditions)) {
                        addError(`Agent ${key} reflowConditions 应为数组`);
                    } else {
                        for (let i = 0; i < agent.reflowConditions.length; i++) {
                            if (typeof agent.reflowConditions[i] !== 'string') {
                                addError(`Agent ${key} reflowConditions[${i}] 应为字符串`);
                            }
                        }
                    }
                }

                const interval = agent.executeInterval;
                if (typeof interval !== 'number' && (typeof interval !== 'string' || isNaN(Number(interval)))) {
                    addError(`Agent ${key} executeInterval 应为数字`);
                } else {
                    const num = Number(interval);
                    if (num < 0) addError(`Agent ${key} executeInterval 不能为负数`);
                }

                if (agent.stage !== undefined) {
                    if (typeof agent.stage !== 'string') {
                        addError(`Agent ${key} stage 应为字符串`);
                    } else if (!stageIds.has(agent.stage)) {
                        addError(`Agent ${key} stage 的值 "${agent.stage}" 未在 workflowStages 的 id 中定义`);
                    }
                }

                // 校验 inputs 中的引用（使用已收集的 agentKeys 和 stageIds）
                if (agent.inputs && Array.isArray(agent.inputs)) {
                    for (let i = 0; i < agent.inputs.length; i++) {
                        const src = agent.inputs[i];
                        if (typeof src !== 'string') {
                            addError(`Agent ${key} inputs[${i}] 应为字符串`);
                            continue;
                        }
                        if (src === 'user' || src === 'auto' || src === 'before') {
                            continue;
                        }
                        if (src.startsWith('id.')) {
                            const idPart = src.substring(3);
                            if (!idPart) {
                                addError(`Agent ${key} inputs[${i}] 的 id. 源必须指定具体ID，如 "id.other_xxx"`);
                            } else {
                                const idRegex = /^[a-zA-Z0-9_]+$/;
                                if (!idRegex.test(idPart)) {
                                    addError(`Agent ${key} inputs[${i}] 的 ID "${idPart}" 只能包含字母、数字和下划线`);
                                }
                                if (agent.inputMode && agent.inputMode[i] && agent.inputMode[i] !== 'txt') {
                                    addError(`Agent ${key} inputs[${i}] 为 id. 源时，inputMode[${i}] 必须为 "txt"`);
                                }
                            }
                            continue;
                        }
                        if (src.endsWith('.last')) {
                            const base = src.slice(0, -5);
                            if (!agentKeys.has(base) && !stageIds.has(base)) {
                                addError(`Agent ${key} inputs[${i}] 引用的 "${base}" 既不是 Agent 键也不是阶段 ID`);
                            }
                        } else {
                            if (!agentKeys.has(src) && !stageIds.has(src)) {
                                addError(`Agent ${key} inputs[${i}] 引用的 "${src}" 既不是 Agent 键也不是阶段 ID`);
                            }
                        }
                    }
                }

                // 检查 inputs 中的重复必然相同内容源
                if (agent.inputs && Array.isArray(agent.inputs)) {
                    const seen = new Set();
                    for (const src of agent.inputs) {
                        if (src === 'auto' || src === 'user' || src.startsWith('read.') || src.startsWith('save.')) {
                            continue;
                        }
                        let core = src;
                        if (src.endsWith('.last')) core = src.slice(0, -5);
                        else if (src.endsWith('.raw')) core = src.slice(0, -4);
                        if (seen.has(core)) {
                            addError(`Agent ${key} 的 inputs 中包含重复的必然内容源 "${core}"（源自 "${src}"），每个源最多出现一次`);
                        } else {
                            seen.add(core);
                        }
                    }
                }

                if (agent.apiConfigId && agent.apiConfigId.trim() !== '') {
                    if (!json.apiConfigs || !json.apiConfigs.hasOwnProperty(agent.apiConfigId)) {
                        addError(`Agent ${key} 引用了不存在的 apiConfigId: "${agent.apiConfigId}"`);
                    } else {
                        const apiCfg = json.apiConfigs[agent.apiConfigId];
                        if (apiCfg.type !== 'text') {
                            addError(`Agent ${key} 的 apiConfigId 指向的配置类型必须为 "text"，实际为 "${apiCfg.type}"`);
                        }
                    }
                }

                if (agent.role && agent.role.trim() !== '') {
                    const trimmed = agent.role.trim();
                    roleCount[trimmed] = (roleCount[trimmed] || 0) + 1;
                }
            }
        })();

        // ---------- 6. 校验 workflowStages 中的 agents 列表 ----------
        if (json.workflowStages) {
            json.workflowStages.forEach((stage, idx) => {
                if (!stage.agents) return;
                stage.agents.forEach(agentKey => {
                    if (!json.agents || !json.agents[agentKey]) {
                        addError(`workflowStages[${idx}] 的 agents 列表引用了不存在的 Agent 键: ${agentKey}`);
                    }
                });
            });
        }

        // ---------- 7. 图像配置数量唯一性校验 ----------
        (function validateImageConfigCount() {
            const hasImageGenerator = roleCount['imageGenerator'] > 0;
            if (hasImageGenerator) {
                if (imageConfigCount !== 1) {
                    addError(`配置中包含 role 为 "imageGenerator" 的 Agent，因此必须且只能有一个 type 为 "image" 的 API 配置，当前有 ${imageConfigCount} 个`);
                }
            } else {
                if (imageConfigCount > 1) {
                    addError(`最多只能有一个 type 为 "image" 的 API 配置，当前有 ${imageConfigCount} 个`);
                }
            }
        })();

        // ---------- 8. 角色唯一性校验 ----------
        (function validateRoleUniqueness() {
            const uniqueRoles = [
                'finalChapter',
                'optimizer',
                'updater',
                'storySummarizer',
                'imageGenerator',
                'typesetter',
                'interactiveAgent',
                'fusionGenerator',
                'imageLibrarian',
                'imageVariator',
                'musicGenerator',
                'voiceCloner',
                'audioEditor',
                'audioLibrarian',
                'interactionAnalyzer'
            ];
            for (const role of uniqueRoles) {
                if (roleCount[role] > 1) {
                    addError(`role "${role}" 出现 ${roleCount[role]} 次，必须唯一`);
                }
            }
        })();

        if (errors.length > 0) {
            console.warn('[validateConfig] 校验失败，错误详情:', errors);
        } else {
        }
        return { valid: errors.length === 0, errors };
    }

    // ==================== 从 JSON 加载配置 ====================

    function loadConfigFromJson(json, fileName, fileSize) {
        const validation = validateConfig(json);
        if (!validation.valid) {
            console.error('[validateConfig] 配置校验失败:', validation.errors);
            const errorMessage = validation.errors.map(err => `• ${err}`).join('\n');
            UI.showErrorPanel(`配置文件校验失败：\n\n${errorMessage}`);
            return false;
        }

        // 保存原始配置值
        CONFIG.MAX_STATE_BOOKS = Number(json.maxStateBooks);
        CONFIG.STATE_TYPE_LIMIT = Number(json.stateTypeLimit);
        CONFIG.MAX_CONSECUTIVE_REFLOWS = Number(json.maxConsecutiveReflows);
        CONFIG.MAX_REFLOOP_DEPTH = Number(json.maxReflowDepth);
        CONFIG.MAX_IMAGES_PER_BOOK = json.maxImagesPerBook !== undefined ? Number(json.maxImagesPerBook) : CONFIG.STATE_TYPE_LIMIT;
        CONFIG.MAX_AUDIOS_PER_BOOK = json.maxAudiosPerBook !== undefined ? Number(json.maxAudiosPerBook) : CONFIG.MAX_IMAGES_PER_BOOK;

        // 解析 apiConfigs
        CONFIG.apiConfigs = json.apiConfigs || {};

        CONFIG.stages = []; // 设为空数组，避免旧代码报错，但后续不应使用

        if (json.agents) {
            const newAgents = {};
            for (const [key, agent] of Object.entries(json.agents)) {
                // 处理 inputMode
                let inputMode = agent.inputMode || [];
                if (!Array.isArray(inputMode)) inputMode = [inputMode];
                while (inputMode.length < agent.inputs.length) inputMode.push('txt');
                if (inputMode.length > agent.inputs.length) inputMode = inputMode.slice(0, agent.inputs.length);

                // 处理 autoConfig
                let autoConfig = agent.autoConfig || [];
                if (!Array.isArray(autoConfig)) autoConfig = [autoConfig];
                while (autoConfig.length < agent.inputs.length) autoConfig.push(0);
                if (autoConfig.length > agent.inputs.length) autoConfig = autoConfig.slice(0, agent.inputs.length);
                autoConfig = autoConfig.map(v => Number(v) || 0);

                // 处理 reflowConditions
                let reflowConditions = agent.reflowConditions || [];
                if (!Array.isArray(reflowConditions)) reflowConditions = [reflowConditions];
                reflowConditions = reflowConditions.map(c => String(c));

                // 处理 inputPrompts
                let inputPrompts = agent.inputPrompts || [];
                if (!Array.isArray(inputPrompts)) inputPrompts = [inputPrompts];
                while (inputPrompts.length < agent.inputs.length) inputPrompts.push('');
                if (inputPrompts.length > agent.inputs.length) inputPrompts = inputPrompts.slice(0, agent.inputs.length);
                inputPrompts = inputPrompts.map(p => String(p));

                const review = agent.review !== undefined ? Boolean(agent.review) : false;

                // 注意：移除了 agent.parallel 的处理，不再设置 parallel 字段
                newAgents[key] = {
                    name: agent.name,
                    displayName: agent.displayName || '',
                    hover: agent.hover,
                    stage: agent.stage || '',
                    order: agent.order,
                    required: agent.required || false,
                    // parallel 字段不再使用，但为了兼容旧配置，可以保留读取但不赋值，或者不保留。这里选择不保留。
                    inputs: agent.inputs || [],
                    inputTemplate: agent.inputTemplate || '',
                    reflowConditions: reflowConditions,
                    inputMode: inputMode,
                    autoConfig: autoConfig,
                    description: agent.description || '',
                    inputPrompts: inputPrompts,
                    role: agent.role || '',
                    executeInterval: agent.executeInterval !== undefined ? Number(agent.executeInterval) : 0,
                    apiConfigId: agent.apiConfigId || '',
                    review: review,
                };
            }
            CONFIG.AGENTS = newAgents;
        }

        if (json.workflowStages && Array.isArray(json.workflowStages)) {
            CONFIG.WORKFLOW_STAGES = json.workflowStages.map(stage => ({
                stage: stage.stage,
                name: stage.name,
                agents: stage.agents,
                mode: stage.mode,
                id: stage.id,
                color: stage.color,
                description: stage.description,
            }));
        }

        if (json.categories) {
            CONFIG.categories = json.categories;
        }
        if (json.categoryGroups && Array.isArray(json.categoryGroups)) {
            CONFIG.categoryGroups = json.categoryGroups;
        }

        WORKFLOW_STATE.currentConfigFile = { name: fileName, size: fileSize };

        // 重置预选状态，使用新配置的 categories 生成全 null 的 selectionState
        const newSelection = {};
        if (CONFIG.categories) {
            Object.keys(CONFIG.categories).forEach(cat => {
                newSelection[cat] = null;
            });
        }


        const enforceUniqueBranches = json.enforceUniqueBranches === true; // 默认为 false

        // 重置全部状态，然后写入本次配置相关的字段
        // （使用 StateStore.reset 避免对 const Proxy 整体重赋值）
        const _savedConfigFile = StateStore.get('currentConfigFile');
        StateStore.reset();                                                    // 全量清零
        StateStore.set('currentConfigFile', _savedConfigFile);            // 恢复刚写入的文件信息
        StateStore.set('selectionState', newSelection);
        StateStore.set('enforceUniqueBranches', enforceUniqueBranches);
        StateStore.set('configVersion', json.version || CONFIG.VERSION);
        StateStore.set('configDescription', json.description || '');
        StateStore.set('configMode', json.mode || 'normal');

        Storage.saveSelectionState(newSelection);
        AgentStateManager.init();
        WORKFLOW_STATE.lastCheckFailed = false;
        WORKFLOW_STATE.lastCheckErrorMessage = '';


        return true;
    }


    // ╔══════════════════════════════════════════════════════════════════╗
