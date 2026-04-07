    // ║  模块 04：工具函数                                                  ║
    // ║  escapeHtml / deepMerge / getNestedValue / setNestedValue / parseConfigLine / convertArrayValues / countTokens║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module Utils — escapeHtml / deepMerge / getNestedValue / setNestedValue / countTokens */

    // HTML转义函数 - 防止XSS攻击
    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // 调试日志函数 - 仅在 DEBUG=true 时输出
    function debugLog(...args) {
        if (typeof CONFIG !== 'undefined' && CONFIG.DEBUG) {
            console.log('[DEBUG]', ...args);
        }
    }

    function deepMerge(target, source) {
        if (source === null || typeof source !== 'object') return source;
        if (typeof target !== 'object') target = {};
        for (let key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    target[key] = deepMerge(target[key] || {}, source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
        return target;
    }

    // 辅助函数：获取嵌套对象的值
    function getNestedValue(obj, path) {
        const result = path.split('.').reduce((o, p) => o?.[p], obj);
        return result;
    }

    // 辅助函数：设置嵌套对象的值
    function setNestedValue(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((o, p) => o[p] = o[p] || {}, obj);
        target[last] = value;
    }

    /**
     * 解析优化师输出的属性配置行
     * 规则：中文分号；分隔属性，中文逗号，分隔数组元素（保持原样不分割）
     * @param {string} configStr - 属性配置行文本
     * @returns {Object} 解析后的属性对象，数组值保持中文逗号分隔的字符串形式
     */
    function parseConfigLine(configStr) {
        const config = {};
        // 定义数组字段集合（这些字段的值应该被视为数组）
        const arrayFields = new Set(['key', 'keysecondary', 'triggers', 'characterFilter.names', 'characterFilter.tags']);

        // 按中文分号；分割属性对（核心分隔符）
        // 注意：只使用中文分号，不支持英文分号，确保严格符合规范
        const pairs = configStr.split('；').map(p => p.trim()).filter(p => p !== '');

        for (let pair of pairs) {
            // 查找冒号分隔符（支持中英文冒号）
            const colonIndex = pair.search(/[：:]/);
            if (colonIndex === -1) {
                continue; // 没有冒号，跳过此对
            }

            const key = pair.substring(0, colonIndex).trim();
            let value = pair.substring(colonIndex + 1).trim();

            if (value === '') continue;

            // 检查是否为数组字段
            const isArrayField = arrayFields.has(key) ||
                (key.startsWith('characterFilter.') &&
                    (key.endsWith('.names') || key.endsWith('.tags')));

            if (isArrayField) {
                // 数组字段：保持原始字符串值（包含中文逗号），不进行分割
                // 后续由 convertArrayValues 处理转换
                config[key] = value;
            } else {
                // 单值处理：布尔值、数字、字符串
                if (value === 'true') {
                    config[key] = true;
                } else if (value === 'false') {
                    config[key] = false;
                } else if (!isNaN(value) && value && value !== '') {
                    config[key] = Number(value);
                } else {
                    // 去除可能的引号包裹
                    config[key] = value.replace(/^["']|["']$/g, '');
                }
            }
        }

        return config;
    }

    /**
     * 将属性对象中的中文逗号数组转换为英文逗号格式
     * 用于最终注入状态书前的格式转换
     * @param {Object} config - parseConfigLine 返回的属性对象
     * @returns {Object} 转换后的属性对象，数组字段使用英文逗号分隔
     */
    function convertArrayValues(config) {
        const converted = {};
        // 定义数组字段集合
        const arrayFields = new Set(['key', 'keysecondary', 'triggers', 'characterFilter.names', 'characterFilter.tags']);

        for (const [key, value] of Object.entries(config)) {
            // 检查是否为数组字段且值为字符串
            const isArrayField = arrayFields.has(key) ||
                (key.startsWith('characterFilter.') &&
                    (key.endsWith('.names') || key.endsWith('.tags')));

            if (isArrayField && typeof value === 'string') {
                // 将中文逗号，转为英文逗号,
                // 注意：只转换中文逗号，保留其他内容不变
                converted[key] = value.replace(/，/g, ',');
            } else {
                converted[key] = value;
            }
        }

        return converted;
    }

    // ==================== Token 计数 ====================

    /**
     * 获取精确 token 计数（如果可用）
     * @param {string} text - 要计数的文本
     * @param {string} source - API 类型 ('openai', 'claude', 'custom', 'default')
     * @param {string} model - 模型名称（仅用于日志和未来可能的编码选择）
     * @returns {Promise<number>} token 数
     */
    async function countTokens(text, source = 'unknown', model = '') {
        if (!text) return 0;

        // 1. 尝试使用 gpt-tokenizer（适用于 OpenAI 兼容模型）
        if (window.GPTTokenizer_cl100k_base && (source === 'openai' || source === 'custom')) {
            try {
                const tokens = window.GPTTokenizer_cl100k_base.encode(text);
                return tokens.length;
            } catch (_) {
                // gpt-tokenizer 失败时静默降级到字符估算，属预期分支
            }
        }

        // 2. 如果无法精确计数，则使用估算
        const estimated = Math.ceil(text.length / 3.35);
        return estimated;
    }

    // ── clipboard 工具 ─────────────────────────────────────────────────
    /**
     * 复制文本到剪贴板，自动降级为 execCommand。
     * @param {string} text  要复制的内容
     * @param {string} [successMsg='已复制到剪贴板']  成功提示
     * @returns {Promise<void>}
     */
    async function copyToClipboard(text, successMsg = '已复制到剪贴板') {
        try {
            await navigator.clipboard.writeText(text);
            Notify.success(successMsg, '', { timeOut: 2000 });
        } catch (_) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                Notify.success(successMsg + '（降级方案）', '', { timeOut: 2000 });
            } catch (err2) {
                console.error('[copyToClipboard] 两种复制方案均失败:', err2);
                Notify.error('复制失败，请手动选择文本后复制');
            }
        }
    }


    // ╔══════════════════════════════════════════════════════════════════╗
