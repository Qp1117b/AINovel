    // ║  模块 01：全局常量与配置                                             ║
    // ║  CONFIG 配置对象与预定义角色列表                                      ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module Config — 全局常量 CONFIG + 预定义角色列表 PREDEFINED_ROLES */

    // ==================== 配置 ====================

    const CONFIG = {
        VERSION: '1.0',
        NAME: '自动化小说创作系统',

        // 调试开关 - 生产环境设为 false
        DEBUG: false,

        WORLD_BOOK_NAME: '状态书',
        SETTING_BOOK_NAME: '设定书',
        STATE_ENTRY_PREFIX: '状态-',
        STATE_BOOK_PREFIX: '状态书-',
        STATE_TEMPLATE_PREFIX: '状态模板-',
        MAX_STATE_BOOKS: 5,
        STATE_TYPE_LIMIT: 20,
        MAX_IMAGES_PER_BOOK: 20,
        MAX_AUDIOS_PER_BOOK: 20,

        // 新增：回流次数控制
        MAX_CONSECUTIVE_REFLOWS: 3,    // 同一源连续触发同一目标的最大次数
        MAX_REFLOOP_DEPTH: 100,        // 全局回流处理的最大迭代次数

        STORAGE_KEY: 'novel_creator_chapters_v1',
        SETTINGS_KEY: 'novel_creator_settings_v1',
        STORAGE: {
            maxChapters: 10000,
            warningThreshold: 10000,
            criticalThreshold: 10000
        },
        TOKEN_STATS_KEY: 'novel_creator_token_stats_v1',

        AGENT_SWITCH_DELAY: 1000,
        MAX_PROGRESS_LINES: 500,

        PROTOCOL_PATTERN: /===第([^章]+)章续写锁定协议===([\s\S]*?)(?:===|$)/,
        CHAPTER_PREFIX_RE: /^(?:第?\d+章|第?(?:[零一二三四五六七八九十百千万]+)章)[\s:：]*/,

        UI: {
            panelId: 'nc-panel',
            overlayId: 'nc-overlay',
            historyPanelId: 'nc-history-panel',
            historyOverlayId: 'nc-history-overlay',
            buttonId: 'nc-float-btn'
        },

        AGENT_STATUS_COLORS: {
            idle: {
                bg: 'rgba(102, 126, 234, 0.15)',
                border: 'rgba(102, 126, 234, 0.4)',
                text: '#667eea',
                glow: 'none'
            },
            running: {
                bg: 'rgba(245, 158, 11, 0.15)',
                border: '#f59e0b',
                text: '#fbbf24',
                glow: '0 0 15px rgba(245, 158, 11, 0.3)'
            },
            pending: {
                bg: 'rgba(147, 51, 234, 0.15)',
                border: '#9333ea',
                text: '#c084fc',
                glow: '0 0 15px rgba(147, 51, 234, 0.4)'
            },
            waiting_input: {
                bg: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                border: '#06b6d4',
                text: '#ffffff',
                glow: '0 0 15px rgba(6, 182, 212, 0.4)'
            },
            reflow_processing: {
                bg: 'linear-gradient(135deg, #ec4899, #db2777)',
                border: '#ec4899',
                text: '#ffffff',
                glow: '0 0 25px rgba(236, 72, 153, 0.6)'
            },
            reflow_waiting: {
                bg: 'rgba(251, 113, 133, 0.12)',
                border: 'rgba(251, 113, 133, 0.5)',
                text: '#fb7185',
                glow: 'none'
            },
            completed: {
                bg: 'linear-gradient(135deg, #10b981, #059669)',
                border: '#10b981',
                text: '#ffffff',
                glow: '0 0 20px rgba(16, 185, 129, 0.5)'
            },
            error: {
                bg: 'linear-gradient(135deg, #ef4444, #dc2626)',
                border: '#ef4444',
                text: '#ffffff',
                glow: '0 0 20px rgba(239, 68, 68, 0.6)'
            }
        }
    };


    const PREDEFINED_ROLES = [
        'finalChapter', 'optimizer', 'updater', 'storySummarizer',
        'imageGenerator', 'typesetter', 'interactiveAgent', 'saver',
        'fusionGenerator', 'imageLibrarian', 'imageVariator',
        'musicGenerator', 'voiceCloner', 'audioEditor', 'audioLibrarian'
    ];


    // ╔══════════════════════════════════════════════════════════════════╗
