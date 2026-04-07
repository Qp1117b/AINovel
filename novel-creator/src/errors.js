    // ║  模块 02：错误类                                                   ║
    // ║  UserInterruptError / ExistingBranchError / AbortChapterError    ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module Errors — UserInterruptError / ExistingBranchError / AbortChapterError */

    // ==================== 用户中断专用错误 ====================

    class UserInterruptError extends Error {
        constructor() {
            super('用户中断');
            this.name = 'UserInterruptError';
        }
    }


    class ExistingBranchError extends Error {
        constructor() {
            super('分支冲突：该互动结果已存在对应章节');
            this.name = 'ExistingBranchError';
        }
    }


    class AbortChapterError extends Error {
        constructor(message) {
            // 若未传入消息，使用默认回流超限消息
            super(message || '本章因连续回流超过3次被标记为废章，已终止');
            this.name = 'AbortChapterError';
        }
    }


    // ╔══════════════════════════════════════════════════════════════════╗