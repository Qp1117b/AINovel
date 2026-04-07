    // ║  模块 12：API 适配层                                              ║
    // ║  API 对象 + testAPIConnection — TavernHelper 封装与外部 API 测试  ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module API — TavernHelper 封装 + 外部 LLM/图像/音频 API 调用 */

    // ==================== API 适配层 ====================

    const API = {
        getContext() {
            if (typeof window.SillyTavern !== 'undefined' && window.SillyTavern.getContext) {
                return window.SillyTavern.getContext();
            }
            throw new Error('无法获取 SillyTavern 上下文');
        },

        async selectCharacter(agentName) {
            if (typeof TavernHelper?.triggerSlash === 'function') {
                await TavernHelper.triggerSlash(`/go ${agentName}`);
                return;
            }
            throw new Error('TavernHelper.triggerSlash 不可用');
        },

        async generate(message, options = {}) {
            if (typeof TavernHelper?.generate !== 'function') throw new Error('TavernHelper.generate 不可用');
            const context = this.getContext();
            const result = await TavernHelper.generate({
                user_input: message, max_chat_history: 0, should_silence: true, ...options
            });
            let text = '';
            if (typeof result === 'string') {
                text = result;
            } else if (result && typeof result === 'object') {
                text = result.text || result.message || result.response || '';
            }
            if (!text) {
                const last = [...(context.chat || [])].reverse().find(m => !m.is_user);
                if (last) text = last.mes;
            }
            return { mes: text, name: context.name2 || 'Assistant', is_user: false, extra: result?.extra || {} };
        },

        async getWorldbook(name) {
            if (typeof TavernHelper?.getWorldbook === 'function') return TavernHelper.getWorldbook(name);
            if (typeof window.getWorldbook === 'function') return window.getWorldbook(name);
            throw new Error('getWorldbook 不可用');
        },

        async updateWorldbook(name, callback, options = {}) {
            if (typeof TavernHelper?.updateWorldbookWith === 'function') return TavernHelper.updateWorldbookWith(name, callback, options);
            if (typeof window.updateWorldbookWith === 'function') return window.updateWorldbookWith(name, callback, options);
            throw new Error('updateWorldbookWith 不可用');
        },

        async stopGeneration() {
            if (typeof TavernHelper?.stopAllGeneration === 'function') {
                try {

                    await TavernHelper.stopAllGeneration();
                } catch (e) {
                    console.error('[API.stopGeneration] 调用 stopAllGeneration 失败:', e);
                }
            } else {
                console.warn('[API.stopGeneration] TavernHelper.stopAllGeneration 不可用');
                // 可以保留原有的降级方案，例如调用 SillyTavern 的停止方法
                // if (typeof SillyTavern?.getContext?.()?.stopGenerating === 'function') { ... }
            }
        },

        sleep: (ms) => new Promise(r => setTimeout(r, ms))
    };

    /**
     * 测试单个API配置的连通性
     * @param {Object} config - API配置对象，包含 source, apiUrl, key, model, timeout 等
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async function testAPIConnection(config) {

        const { type, source, apiUrl, key, model } = config;
        const url = apiUrl.replace(/\/+$/, ''); // 去除末尾多余的斜杠

        // 连通性测试使用固定10秒超时
        const testTimeout = 10000;

        // 检查密钥是否包含非ASCII字符（中文等）
        if (/[^\x00-\x7F]/.test(key)) {
            const errorMsg = 'API密钥包含非ASCII字符（如中文），请使用有效的密钥';
            console.error(`[DEBUG][testAPIConnection] ${errorMsg}`);
            return { ok: false, error: errorMsg };
        }

        // ========== 文本平台 ==========
        if (type === 'text') {
            // ----- Gemini 特殊处理：根据 url 判断原生或代理 -----
            if (source === 'gemini') {
                const modelsUrl = `${url}/v1beta/models?key=${key}`;
                const options = {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(testTimeout),
                };
                try {
                    const response = await fetch(modelsUrl, options);
                    if (response.ok) return { ok: true };
                    else {
                        const errorText = await response.text();
                        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                    }
                } catch (err) {
                    console.error(`[DEBUG][testAPIConnection] Gemini请求失败:`, err);
                    return { ok: false, error: err.message };
                }
            }

            if (source === 'doubao') {
                // 豆包测试：发送最小对话请求
                const testUrl = url; // 假设 url 已是完整的 base URL，如 https://ark.cn-beijing.volces.com/api/v3
                const testBody = {
                    model: config.model || 'doubao-1-5-pro-32k-250115', // 使用配置中的模型或默认
                    messages: [{ role: "user", content: "hi" }],
                    max_tokens: 1
                };

                const options = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`
                    },
                    body: JSON.stringify(testBody),
                    signal: AbortSignal.timeout(testTimeout),
                };
                try {
                    const response = await fetch(testUrl, options);
                    // 只要能收到响应（即使因为 max_tokens 太小而失败，也算连通）
                    if (response.status < 500) return { ok: true };
                    else {
                        const errorText = await response.text();
                        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                    }
                } catch (err) {
                    console.error(`[DEBUG][testAPIConnection] 豆包请求失败:`, err);
                    return { ok: false, error: err.message };
                }
            }

            // ----- 文心一言 (wenxin) 特殊处理 -----
            if (source === 'wenxin') {
                // 文心一言的测试：直接发送一个最小对话请求
                const testUrl = url;
                const testBody = {
                    messages: [{ role: "user", content: "hi" }],
                    max_tokens: 1
                };

                const options = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`
                    },
                    body: JSON.stringify(testBody),
                    signal: AbortSignal.timeout(testTimeout),
                };
                try {
                    const response = await fetch(testUrl, options);
                    // 只要能收到响应（即使因为 max_tokens 太小而失败，也算连通）
                    if (response.status < 500) return { ok: true };
                    else {
                        const errorText = await response.text();
                        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                    }
                } catch (err) {
                    console.error(`[DEBUG][testAPIConnection] 文心一言请求失败:`, err);
                    return { ok: false, error: err.message };
                }
            }

            // 其他文本平台统一测试 GET /models
            const modelsUrl = url + '/models';

            const options = {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(testTimeout),
            };

            try {
                const response = await fetch(modelsUrl, options);
                if (response.ok) {
                    return { ok: true };
                } else {
                    const errorText = await response.text();
                    console.error(`[DEBUG][testAPIConnection][text] 响应错误文本:`, errorText);
                    return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                }
            } catch (err) {
                console.error(`[DEBUG][testAPIConnection][text] 请求异常:`, err);
                return { ok: false, error: err.message };
            }
        }

        // ========== 图像平台 ==========
        else if (type === 'image') {
            if (source === 'openai') {
                // OpenAI 图像 API 测试：尝试 GET /models
                const modelsUrl = url + '/models';
                const options = {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json',
                    },
                    signal: AbortSignal.timeout(testTimeout),
                };
                try {
                    const response = await fetch(modelsUrl, options);
                    if (response.ok) return { ok: true };
                    else {
                        const errorText = await response.text();
                        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                    }
                } catch (err) {
                    console.error(`[DEBUG][testAPIConnection] OpenAI图像测试失败:`, err);
                    return { ok: false, error: err.message };
                }
            } else if (source === 'stability') {
                // Stability AI 测试：尝试 GET /user/account
                const accountUrl = url + '/user/account';
                const options = {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` },
                    signal: AbortSignal.timeout(testTimeout),
                };
                try {
                    const response = await fetch(accountUrl, options);
                    if (response.ok) return { ok: true };
                    else {
                        const errorText = await response.text();
                        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                    }
                } catch (err) {
                    console.error(`[DEBUG][testAPIConnection] Stability测试失败:`, err);
                    return { ok: false, error: err.message };
                }
            } else if (source === 'midjourney') {
                // Midjourney 测试：尝试 GET /mj/ping（假设有此端点）
                const pingUrl = url + '/mj/ping';
                const options = {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` },
                    signal: AbortSignal.timeout(testTimeout),
                };
                try {
                    const response = await fetch(pingUrl, options);
                    if (response.ok) return { ok: true };
                    else {
                        const errorText = await response.text();
                        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                    }
                } catch (err) {
                    console.warn('[testAPIConnection][midjourney] ping 失败，尝试轻量任务...');
                    return { ok: false, error: `无法验证 Midjourney 连通性: ${err.message}` };
                }
            } else if (source === 'flux') {
                // Flux 测试：尝试 GET /models（假设兼容 OpenAI）
                const modelsUrl = url + '/models';
                const options = {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` },
                    signal: AbortSignal.timeout(testTimeout),
                };
                try {
                    const response = await fetch(modelsUrl, options);
                    if (response.ok) return { ok: true };
                    else {
                        const errorText = await response.text();
                        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                    }
                } catch (err) {
                    console.error(`[DEBUG][testAPIConnection] Flux测试失败:`, err);
                    return { ok: false, error: err.message };
                }
            } else if (source === 'picsart') {
                // Picsart 测试：尝试 GET /health（假设）
                const healthUrl = url + '/health';
                const options = {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` },
                    signal: AbortSignal.timeout(testTimeout),
                };
                try {
                    const response = await fetch(healthUrl, options);
                    if (response.ok) return { ok: true };
                    else {
                        const errorText = await response.text();
                        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                    }
                } catch (err) {
                    console.error(`[DEBUG][testAPIConnection] Picsart测试失败:`, err);
                    return { ok: false, error: err.message };
                }
            } else if (source === 'siliconflow') {
                // SiliconFlow 图像：尝试 GET /models（假设兼容 OpenAI）
                const modelsUrl = url + '/models';
                const options = {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` },
                    signal: AbortSignal.timeout(testTimeout),
                };
                try {
                    const response = await fetch(modelsUrl, options);
                    if (response.ok) return { ok: true };
                    else {
                        const errorText = await response.text();
                        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                    }
                } catch (err) {
                    console.error(`[DEBUG][testAPIConnection] SiliconFlow图像测试失败:`, err);
                    return { ok: false, error: err.message };
                }
            } else if (source === 'sdwebui') {
                // Stable Diffusion WebUI 测试：尝试 GET /sdapi/v1/sd-models
                const testUrl = url + '/sdapi/v1/sd-models';
                const options = {
                    method: 'GET',
                    signal: AbortSignal.timeout(testTimeout),
                };
                try {
                    const response = await fetch(testUrl, options);
                    if (response.ok) return { ok: true };
                    else {
                        const errorText = await response.text();
                        return { ok: false, error: `SD WebUI 未正确响应 (${response.status}): ${errorText}` };
                    }
                } catch (err) {
                    console.error(`[DEBUG][testAPIConnection] SD WebUI测试失败:`, err);
                    return { ok: false, error: `无法连接到 SD WebUI: ${err.message}` };
                }
            } else if (source === 'sora') {
                // Sora 不支持图像，返回明确错误
                return { ok: false, error: 'Sora 平台仅支持视频生成，不支持图像生成' };
            } else if (source === 'other') {
                // 其他图像 API：尝试 OPTIONS 请求或简单 GET
                try {
                    const response = await fetch(url, {
                        method: 'OPTIONS',
                        signal: AbortSignal.timeout(testTimeout),
                    });
                    if (response.status < 500) {
                        return { ok: true, warning: '仅验证了URL可达性，密钥有效性未确认' };
                    } else {
                        const errorText = await response.text();
                        return { ok: false, error: `OPTIONS 请求失败 (${response.status})` };
                    }
                } catch (err) {
                    console.error(`[DEBUG][testAPIConnection] other图像测试失败:`, err);
                    return { ok: false, error: `无法验证图像API连通性，请手动检查URL和密钥。详细错误: ${err.message}` };
                }
            } else {
                return { ok: false, error: `不支持的图像平台: ${source}` };
            }
        }

        // ========== 音频平台 ==========
        else if (type === 'audio') {
            // 根据不同的 source 构造不同的测试端点
            let testUrl = url;
            let method = 'GET';
            let headers = {};

            const authSources = [
                'elevenlabs', 'minimax', 'minimax-music', 'minimax-speech',
                'mureka', 'mubert', 'aiva', 'wondera', 'huggingface',
                'openai-tts', 'azure-tts', 'google-tts', 'stableaudio',
                'riffusion', 'audiocraft', 'edge-tts', 'other'
            ];
            if (authSources.includes(source) && key && key.trim() !== '') {
                if (source === 'azure-tts') {
                    headers['Ocp-Apim-Subscription-Key'] = key;
                } else if (source === 'mubert') {
                    headers['access-token'] = key;
                    headers['customer-id'] = config.customer_id || 'test';
                } else if (source === 'riffusion') {
                    headers['Api-Key'] = key;
                } else if (source === 'audiocraft' && url.includes('replicate.com')) {
                    headers['Authorization'] = `Token ${key}`;
                } else if (source === 'edge-tts') {
                    // Edge TTS 无认证
                } else {
                    headers['Authorization'] = `Bearer ${key}`;
                }
                headers['Content-Type'] = 'application/json';
            }

            switch (source) {
                case 'elevenlabs':
                    testUrl = url + '/voices';
                    break;
                case 'minimax':
                case 'minimax-music':
                case 'minimax-speech':
                    // MiniMax 需要一个 Group ID，尝试访问用户信息
                    testUrl = url + '/user/info?GroupId=' + (config.group_id || 'test');
                    break;
                case 'mureka':
                    testUrl = url + '/health';
                    break;
                case 'mubert':
                    testUrl = url + '/api/v3/public/ping';
                    method = 'POST';
                    break;
                case 'aiva':
                    testUrl = url + '/health';
                    break;
                case 'wondera':
                    testUrl = url + '/health';
                    break;
                case 'riffusion':
                    testUrl = url + '/health';
                    break;
                case 'audiocraft':
                    if (url.includes('replicate.com')) {
                        testUrl = url + '/models';
                    } else {
                        testUrl = url + '/health';
                    }
                    break;
                case 'edge-tts':
                    if (!config.apiUrl || config.apiUrl.trim() === '') {
                        return { ok: false, error: '请先配置 Edge TTS 的 API URL' };
                    }
                    testUrl = config.apiUrl.replace(/\/+$/, '') + '/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491EF6C';
                    method = 'GET';
                    headers = {};  // Edge TTS 无认证
                    break;
                case 'huggingface':
                    testUrl = url + '/api/models';
                    break;
                case 'openai-tts':
                    testUrl = url + '/models';
                    break;
                case 'azure-tts':
                    testUrl = url + '/cognitiveservices/voices/list';
                    break;
                case 'google-tts':
                    testUrl = url + `/voices?key=${encodeURIComponent(key)}`;
                    headers = {};
                    break;
                case 'stableaudio':
                    testUrl = url + '/v2beta/audio/health';
                    break;
                case 'other':
                    method = 'OPTIONS';
                    testUrl = url;
                    break;
                default:
                    testUrl = url;
            }

            const options = {
                method: method,
                headers: headers,
                signal: AbortSignal.timeout(testTimeout),
            };

            try {
                const startTime = Date.now();
                const response = await fetch(testUrl, options);
                if (response.ok) {
                    return { ok: true };
                } else {
                    const errorText = await response.text();
                    return { ok: false, error: `HTTP ${response.status}: ${response.statusText}\n${errorText}` };
                }
            } catch (err) {
                console.error(`[DEBUG][testAPIConnection] 音频测试失败:`, err);
                return { ok: false, error: err.message };
            }
        } else {
            console.error(`[testAPIConnection] 未知的 type: ${type}`);
            return { ok: false, error: `未知的 type: ${type}` };
        }
    }

    /**
     * 根据 API 配置获取模型列表
     * @param {Object} config - API 配置对象，包含 type, source, apiUrl, key 等
     * @returns {Promise<Array<{id: string, description: string}>>}
     */
    async function fetchModelList(config) {
        const { type, source, apiUrl, key } = config;
        if (!apiUrl || !key) {
            throw new Error('请先填写 API URL 和密钥');
        }
        const url = apiUrl.replace(/\/+$/, ''); // 去除末尾多余的斜杠


        try {
            // ---------- 文本平台 ----------
            if (type === 'text') {
                // Gemini
                if (source === 'gemini') {
                    const response = await fetch(`${url}/v1beta/models?key=${key}`, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    if (!response.ok) {
                        throw new Error(`Gemini API 错误 (${response.status}): ${await response.text()}`);
                    }
                    const data = await response.json();
                    // Gemini 返回格式: { models: [{ name: "models/gemini-1.5-flash", description: "...", ... }] }
                    return data.models.map(m => ({
                        id: m.name.replace('models/', ''),
                        description: m.description || m.displayName || ''
                    }));
                }

                // OpenAI 兼容平台 (包括 deepseek, siliconflow, qwen, wenxin, glm, mistral, groq, inference, openrouter, 4sapi, other)
                if (['openai', 'deepseek', 'siliconflow', 'qwen', 'wenxin', 'glm', 'mistral', 'groq', 'inference', 'openrouter', '4sapi', 'other'].includes(source)) {
                    const response = await fetch(`${url}/models`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${key}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (!response.ok) {
                        throw new Error(`OpenAI 兼容 API 错误 (${response.status}): ${await response.text()}`);
                    }
                    const data = await response.json();
                    // 常见格式: { data: [{ id: "gpt-4", ... }] }
                    if (data.data && Array.isArray(data.data)) {
                        return data.data.map(m => ({ id: m.id, description: m.description || '' }));
                    } else if (Array.isArray(data)) {
                        // 某些平台直接返回数组
                        return data.map(m => ({ id: m.id || m, description: '' }));
                    } else {
                        throw new Error('无法解析响应格式');
                    }
                }

                // Claude
                if (source === 'claude') {
                    const response = await fetch(`${url}/models`, {
                        method: 'GET',
                        headers: {
                            'x-api-key': key,
                            'anthropic-version': '2023-06-01',
                            'Content-Type': 'application/json'
                        }
                    });
                    if (!response.ok) {
                        throw new Error(`Claude API 错误 (${response.status}): ${await response.text()}`);
                    }
                    const data = await response.json();
                    // Claude 格式: { data: [{ id: "claude-3-opus-20240229", display_name: ... }] }
                    return data.data.map(m => ({
                        id: m.id,
                        description: m.display_name || ''
                    }));
                }

                // 豆包 (特殊处理：不支持自动获取)
                if (source === 'doubao') {
                    throw new Error('豆包平台不支持自动获取模型列表，请手动输入接入点ID (Endpoint ID)');
                }

                // 其他未列出的文本平台
                throw new Error(`文本平台 ${source} 暂不支持自动获取模型列表`);
            }

            // ---------- 图像平台 ----------
            else if (type === 'image') {
                // OpenAI 兼容图像平台 (openai, siliconflow, flux, other)
                if (['openai', 'siliconflow', 'flux', 'other'].includes(source)) {
                    const response = await fetch(`${url}/models`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${key}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (!response.ok) {
                        throw new Error(`图像 API 错误 (${response.status}): ${await response.text()}`);
                    }
                    const data = await response.json();
                    if (data.data && Array.isArray(data.data)) {
                        return data.data.map(m => ({ id: m.id, description: '' }));
                    } else if (Array.isArray(data)) {
                        return data.map(m => ({ id: m.id || m, description: '' }));
                    } else {
                        throw new Error('无法解析响应格式');
                    }
                }

                // Stability AI
                if (source === 'stability') {
                    // 获取可用引擎：GET /v2beta/engines
                    const response = await fetch(`${url}/engines`, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${key}` }
                    });
                    if (!response.ok) {
                        throw new Error(`Stability AI 错误 (${response.status}): ${await response.text()}`);
                    }
                    const data = await response.json();
                    // 返回格式: [{ id: "stable-diffusion-xl-1024-v1-0", description: "..." }]
                    return data.map(e => ({ id: e.id, description: e.description || '' }));
                }

                // Midjourney
                if (source === 'midjourney') {
                    // Midjourney 通常没有模型列表接口，返回预设
                    return [
                        { id: 'midjourney-v7', description: 'Midjourney V7' },
                        { id: 'midjourney-v6.1', description: 'Midjourney V6.1' }
                    ];
                }

                // SD WebUI
                if (source === 'sdwebui') {
                    const response = await fetch(`${url}/sdapi/v1/sd-models`, {
                        method: 'GET',
                        headers: {}
                    });
                    if (!response.ok) {
                        throw new Error(`SD WebUI 错误 (${response.status}): ${await response.text()}`);
                    }
                    const data = await response.json();
                    // 返回格式: [{ model_name: "v1-5-pruned-emaonly", ... }]
                    return data.map(m => ({ id: m.model_name || m.title, description: '' }));
                }

                // Picsart
                if (source === 'picsart') {
                    const response = await fetch(`${url}/models`, {
                        headers: { 'Authorization': `Bearer ${key}` }
                    });
                    if (!response.ok) {
                        throw new Error(`Picsart 错误 (${response.status}): ${await response.text()}`);
                    }
                    const data = await response.json();
                    return data.data.map(m => ({ id: m.id, description: m.name }));
                }

                // Sora（不支持图像）
                if (source === 'sora') {
                    throw new Error('Sora 平台不支持图像生成');
                }

                throw new Error(`图像平台 ${source} 暂不支持自动获取模型列表`);
            }

            // ---------- 音频平台 ----------
            else if (type === 'audio') {
                switch (source) {
                    case 'elevenlabs':
                        const voicesRes = await fetch(`${url}/voices`, {
                            headers: { 'xi-api-key': key }
                        });
                        if (!voicesRes.ok) throw new Error(`ElevenLabs 错误: ${await voicesRes.text()}`);
                        const voicesData = await voicesRes.json();
                        return voicesData.voices.map(v => ({ id: v.voice_id, description: v.name }));

                    case 'minimax':
                    case 'minimax-music':
                    case 'minimax-speech':
                        // MiniMax 没有公开模型列表，返回预设
                        return [
                            { id: 'music-2.5+', description: 'MiniMax Music 2.5' },
                            { id: 'music-2.0', description: 'MiniMax Music 2.0' },
                            { id: 'speech-2.8-hd', description: 'MiniMax Speech 2.8 HD' },
                            { id: 'speech-2.8-turbo', description: 'MiniMax Speech 2.8 Turbo' }
                        ];

                    case 'mureka':
                        return [
                            { id: 'mureka-v8', description: 'Mureka V8' },
                            { id: 'mureka-v7', description: 'Mureka V7' }
                        ];

                    case 'mubert':
                        const mubertRes = await fetch(`${url}/api/v3/public/channels`, {
                            headers: { 'access-token': key, 'customer-id': config.customer_id || 'test' }
                        });
                        if (!mubertRes.ok) throw new Error(`Mubert 错误: ${await mubertRes.text()}`);
                        const mubertData = await mubertRes.json();
                        return mubertData.data.channels.map(c => ({ id: c.id, description: c.name }));

                    case 'aiva':
                        const aivaRes = await fetch(`${url}/style_presets`, {
                            headers: { 'Authorization': `Bearer ${key}` }
                        });
                        if (!aivaRes.ok) throw new Error(`AIVA 错误: ${await aivaRes.text()}`);
                        const aivaData = await aivaRes.json();
                        return aivaData.map(s => ({ id: s.id, description: s.name }));

                    case 'wondera':
                        return [
                            { id: 'wondera-v1', description: 'Wondera V1' }
                        ];

                    case 'riffusion':
                        return [
                            { id: 'riffusion-v1', description: 'Riffusion V1' }
                        ];

                    case 'audiocraft':
                        if (url.includes('replicate.com')) {
                            const modelsRes = await fetch(`${url}/models`, {
                                headers: { 'Authorization': `Token ${key}` }
                            });
                            if (!modelsRes.ok) throw new Error(`Replicate 错误: ${await modelsRes.text()}`);
                            const modelsData = await modelsRes.json();
                            return modelsData.results.map(m => ({ id: m.id, description: m.description || m.name }));
                        } else {
                            // 本地部署，返回常见模型
                            return [
                                { id: 'facebook/musicgen-small', description: 'MusicGen Small' },
                                { id: 'facebook/musicgen-medium', description: 'MusicGen Medium' },
                                { id: 'facebook/musicgen-large', description: 'MusicGen Large' },
                                { id: 'facebook/musicgen-melody', description: 'MusicGen Melody' }
                            ];
                        }

                    case 'edge-tts':
                        if (!config.apiUrl || config.apiUrl.trim() === '') {
                            throw new Error('请先配置 Edge TTS 的 API URL');
                        }
                        const listUrl = config.apiUrl.replace(/\/+$/, '') + '/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491EF6C';
                        const edgeRes = await fetch(listUrl);
                        if (!edgeRes.ok) throw new Error(`EdgeTTS 声音列表请求失败 (${edgeRes.status})`);
                        const edgeVoices = await edgeRes.json();
                        return edgeVoices.map(v => ({ id: v.ShortName, description: v.FriendlyName }));

                    case 'huggingface':
                        const hfRes = await fetch(`${url}/api/models`, {
                            headers: { 'Authorization': `Bearer ${key}` }
                        });
                        if (!hfRes.ok) throw new Error(`Hugging Face 错误: ${await hfRes.text()}`);
                        const hfData = await hfRes.json();
                        return hfData.map(m => ({ id: m.id, description: m.cardData?.title || '' }));

                    case 'openai-tts':
                        const oaiRes = await fetch(`${url}/models`, {
                            headers: { 'Authorization': `Bearer ${key}` }
                        });
                        if (!oaiRes.ok) throw new Error(`OpenAI TTS 错误: ${await oaiRes.text()}`);
                        const oaiData = await oaiRes.json();
                        return oaiData.data
                            .filter(m => m.id.includes('tts'))
                            .map(m => ({ id: m.id, description: m.id }));

                    case 'azure-tts':
                        const azureRes = await fetch(`${url}/cognitiveservices/voices/list`, {
                            headers: { 'Ocp-Apim-Subscription-Key': key }
                        });
                        if (!azureRes.ok) throw new Error(`Azure TTS 错误: ${await azureRes.text()}`);
                        const azureData = await azureRes.json();
                        return azureData.map(v => ({ id: v.ShortName, description: v.FriendlyName }));

                    case 'google-tts':
                        const googleRes = await fetch(`${url}/voices?key=${key}`);
                        if (!googleRes.ok) throw new Error(`Google TTS 错误: ${await googleRes.text()}`);
                        const googleData = await googleRes.json();
                        return googleData.voices.map(v => ({
                            id: v.name,
                            description: `${v.ssmlGender || ''} - ${v.languageCodes?.join(', ') || ''}`
                        }));

                    case 'stableaudio':
                        // Stable Audio 没有模型列表接口，返回预设
                        return [
                            { id: 'stable-audio-2', description: 'Stable Audio 2.0' }
                        ];

                    case 'other':
                        throw new Error('自定义平台请手动输入模型名称');

                    default:
                        throw new Error(`不支持的音频平台: ${source}`);
                }
            }

            // ---------- 未知类型 ----------
            else {
                throw new Error(`不支持的类型: ${type}`);
            }
        } catch (error) {
            console.error('[fetchModelList] 获取失败:', error);
            throw error; // 向上层传递错误
        }
    }


    // ╔══════════════════════════════════════════════════════════════════╗