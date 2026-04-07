    // ║  模块 14：通知                                                   ║
    // ║  Notify — toastr 封装                                            ║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module Notify — toastr 封装：success / error / warning / info */

    // ==================== 通知 ====================

    const Notify = {
        _call(type, msg, title, opts) {
            // 确保 msg 和 title 是字符串
            const safeMsg = (msg === null || msg === undefined) ? '' : String(msg);
            const safeTitle = (title === null || title === undefined) ? '' : String(title);
            const formattedMsg = safeMsg.replace(/\n/g, '<br>');

            if (typeof window.toastr !== 'undefined') {
                const defaultOptions = {
                    escapeHtml: false,          // 允许 HTML，使 <br> 生效
                    closeButton: true,
                    progressBar: true,
                    timeOut: 5000,
                    extendedTimeOut: 5000,
                    positionClass: 'toast-top-right',
                    preventDuplicates: true,
                };
                const userOptions = opts || {};
                const options = { ...defaultOptions, ...userOptions };
                toastr[type](formattedMsg, safeTitle, options);
            } else {
                console[type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log'](`[${type.toUpperCase()}]`, safeTitle, safeMsg);
                if (type === 'error' || type === 'success') {
                    alert((safeTitle ? safeTitle + '\n' : '') + safeMsg);
                }
            }
        },
        success: (msg, title, opts) => Notify._call('success', msg, title, opts),
        error: (msg, title, opts) => Notify._call('error', msg, title, opts),
        warning: (msg, title, opts) => Notify._call('warning', msg, title, opts),
        info: (msg, title, opts) => Notify._call('info', msg, title, opts)
    };


    // ╔══════════════════════════════════════════════════════════════════╗