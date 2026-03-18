// === 增强版全量控件库 (control_js.js) ===
// 功能：支持7种基础控件，添加细腻动画、音效、错误反馈和打字机效果
// 存储位置：TextStore，ID 固定为 "control_js"
// 修改：控件在文字段落全部显示完毕后才会出现；增加全局交互状态，防止重复调用 resolver；
//       添加全局清理机制：交互解决后所有控件自动清除定时器、禁用按钮，避免后台运行。
(function () {
    'use strict';

    // ---------- 配置 ----------
    const CONFIG = {
        enableSound: false,          // 是否启用音效（需在TextStore中预置音频资源）
        soundIds: {                   // 预置音效ID（若启用）
            click: 'audio_click',      // 按钮点击音效
            dice: 'audio_dice',         // 掷骰子音效
            success: 'audio_success',   // 成功提交音效
            error: 'audio_error'        // 错误提示音效
        },
        typewriterSpeed: 50,          // 打字机速度（毫秒/字符）
        paragraphDelay: 500           // 段落切换延迟（毫秒）
    };

    // ---------- 全局交互状态 ----------
    // 确保每次新的交互开始时状态为 false
    if (!window.__interactionResolved) {
        window.__interactionResolved = false;
    }

    // ---------- 安全调用函数 ----------
    // 在所有控件中统一使用此函数调用 resolver，避免因 resolver 丢失而崩溃
    function safeResolve(result) {
        if (window.__interactionResolved) {
            console.warn('[控件库] 交互已解决，忽略重复调用', result);
            return;
        }
        if (typeof window.__interactionResolver === 'function') {
            window.__interactionResolved = true;
            window.__interactionResolver(result);
            // 触发全局清理事件，通知所有控件停止活动
            window.dispatchEvent(new CustomEvent('interaction-resolved', { detail: result }));
        } else {
            console.warn('[控件库] 交互解析器已失效，无法返回结果', result);
            // 在页面上显示一个临时提示，告知用户需要刷新
            const tip = document.createElement('div');
            tip.textContent = '⏳ 交互已超时或已关闭，请刷新重试';
            tip.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#dc3545; color:white; padding:8px 16px; border-radius:20px; font-size:14px; z-index:100000; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
            document.body.appendChild(tip);
            setTimeout(() => tip.remove(), 3000);
        }
    }

    // ---------- 工具函数 ----------
    function safeJSONParse(str, fallback = {}) {
        try {
            return JSON.parse(str) || fallback;
        } catch {
            return fallback;
        }
    }

    // 播放音效（如果启用且资源存在）
    async function playSound(soundId) {
        if (!CONFIG.enableSound) return;
        try {
            const audioBlob = await AudioStore.get(soundId);
            if (audioBlob) {
                const url = URL.createObjectURL(audioBlob);
                const audio = new Audio(url);
                audio.play().catch(e => console.warn('音效播放失败', e));
                audio.onended = () => URL.revokeObjectURL(url);
            }
        } catch (e) {
            console.warn('音效加载失败', e);
        }
    }

    // 添加波纹点击效果
    function addRippleEffect(btn) {
        btn.addEventListener('click', function (e) {
            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            const rect = btn.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
            btn.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    }

    // 打字机效果
    async function typewriter(element, text, speed = CONFIG.typewriterSpeed) {
        element.textContent = '';
        for (let char of text) {
            element.textContent += char;
            await new Promise(resolve => setTimeout(resolve, speed));
        }
    }

    // ---------- 核心渲染函数映射 ----------
    const renderers = {};

    // ---------- 1. 选项按钮组 (choice) ----------
    renderers.choice = (container, config) => {
        const options = config.options || [];
        container.classList.add('choice-container');
        container.innerHTML = '';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'gal-btn';
            btn.textContent = opt;
            addRippleEffect(btn);
            btn.addEventListener('click', () => {
                playSound(CONFIG.soundIds.click);
                safeResolve(`[选择: ${opt}]`);
            });
            container.appendChild(btn);
        });

        // 清理函数：禁用所有按钮
        container.__cleanup = () => {
            container.querySelectorAll('button').forEach(btn => btn.disabled = true);
        };
    };

    // ---------- 2. 掷骰子 (dice) ----------
    renderers.dice = (container, config) => {
        const range = config.range || '1-6';
        const [min, max] = range.split('-').map(Number);
        container.innerHTML = `
            <button class="dice-btn">🎲</button>
            <div class="dice-result"></div>
        `;
        const btn = container.querySelector('.dice-btn');
        const resultDiv = container.querySelector('.dice-result');
        let rolling = false;
        let interval = null;

        btn.addEventListener('click', () => {
            if (rolling) return;
            if (window.__interactionResolved) {
                console.warn('[骰子] 交互已结束，无法掷骰子');
                return;
            }
            rolling = true;
            btn.disabled = true;
            playSound(CONFIG.soundIds.dice);
            btn.style.transform = 'rotate(360deg)';
            setTimeout(() => btn.style.transform = '', 300);
            let rollCount = 0;
            interval = setInterval(() => {
                if (window.__interactionResolved) {
                    clearInterval(interval);
                    btn.disabled = false;
                    rolling = false;
                    return;
                }
                const fake = Math.floor(Math.random() * (max - min + 1)) + min;
                resultDiv.textContent = fake;
                resultDiv.style.transform = 'scale(1.5)';
                setTimeout(() => resultDiv.style.transform = '', 100);
                rollCount++;
                if (rollCount >= 10) {
                    clearInterval(interval);
                    const final = Math.floor(Math.random() * (max - min + 1)) + min;
                    resultDiv.textContent = final;
                    resultDiv.classList.add('pop');
                    setTimeout(() => resultDiv.classList.remove('pop'), 300);
                    safeResolve(`[骰子: ${final}]`);
                }
            }, 80);
        });

        // 清理函数：清除定时器并禁用按钮
        container.__cleanup = () => {
            if (interval) {
                clearInterval(interval);
                interval = null;
            }
            btn.disabled = true;
        };
    };

    // ---------- 3. 文本输入 (input) ----------
    renderers.input = (container, config) => {
        const prompt = config.prompt || '输入：';
        const placeholder = config.placeholder || '';
        container.innerHTML = `
            <div class="input-container">
                <span>${prompt}</span>
                <input type="text" class="input-field" placeholder="${placeholder}">
                <button class="gal-btn">提交</button>
            </div>
        `;
        const input = container.querySelector('.input-field');
        const submit = container.querySelector('button');
        addRippleEffect(submit);
        const showError = () => {
            input.classList.add('shake');
            playSound(CONFIG.soundIds.error);
            setTimeout(() => input.classList.remove('shake'), 300);
        };
        submit.addEventListener('click', () => {
            if (window.__interactionResolved) return;
            const value = input.value.trim();
            if (value) {
                playSound(CONFIG.soundIds.success);
                safeResolve(`[输入: ${value}]`);
            } else {
                showError();
            }
        });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit.click();
            }
        });

        // 清理函数：禁用按钮和输入框
        container.__cleanup = () => {
            submit.disabled = true;
            input.disabled = true;
        };
    };

    // ---------- 4. 滑块 (slider) ----------
    renderers.slider = (container, config) => {
        const { min = 0, max = 100, step = 1, default: def = (min + max) / 2 } = config;
        container.innerHTML = `
            <div class="slider-container">
                <input type="range" min="${min}" max="${max}" step="${step}" value="${def}">
                <span class="slider-value">${def}</span>
                <button class="gal-btn">确认</button>
            </div>
        `;
        const slider = container.querySelector('input');
        const valueSpan = container.querySelector('.slider-value');
        const confirmBtn = container.querySelector('button');
        addRippleEffect(confirmBtn);
        slider.addEventListener('input', () => {
            valueSpan.textContent = slider.value;
            valueSpan.style.transform = 'scale(1.3)';
            setTimeout(() => valueSpan.style.transform = '', 150);
        });
        confirmBtn.addEventListener('click', () => {
            if (window.__interactionResolved) return;
            playSound(CONFIG.soundIds.success);
            safeResolve(`[滑块: ${slider.value}]`);
        });

        // 清理函数：禁用滑块和按钮
        container.__cleanup = () => {
            confirmBtn.disabled = true;
            slider.disabled = true;
        };
    };

    // ---------- 5. 计时器 (timer) ----------
    renderers.timer = (container, config) => {
        const seconds = config.seconds || 30;
        let remaining = seconds;
        container.innerHTML = `
            <div class="timer-display">${remaining}s</div>
            <button class="gal-btn">立即确认</button>
        `;
        const timerDiv = container.querySelector('.timer-display');
        const confirmBtn = container.querySelector('button');
        addRippleEffect(confirmBtn);
        let interval = setInterval(() => {
            if (window.__interactionResolved) {
                clearInterval(interval);
                return;
            }
            remaining--;
            timerDiv.textContent = `${remaining}s`;
            if (remaining <= 5) {
                timerDiv.style.animation = 'pulse 0.5s infinite';
            }
            if (remaining <= 0) {
                clearInterval(interval);
                confirmBtn.remove();
                timerDiv.style.animation = '';
                safeResolve('[超时]');
            }
        }, 1000);

        confirmBtn.addEventListener('click', () => {
            if (window.__interactionResolved) return;
            clearInterval(interval);
            playSound(CONFIG.soundIds.success);
            safeResolve('[确认: 提前]');
        });

        // 清理函数：清除定时器并禁用按钮
        container.__cleanup = () => {
            clearInterval(interval);
            confirmBtn.disabled = true;
        };
    };

    // ---------- 6. 确认对话框 (confirm) ----------
    renderers.confirm = (container, config) => {
        const { title = '确认', message = '', confirmText = '是', cancelText = '否' } = config;
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-box">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirm-buttons">
                    <button class="gal-btn">${confirmText}</button>
                    <button class="gal-btn">${cancelText}</button>
                </div>
            </div>
        `;
        container.appendChild(overlay);
        const confirmBtn = overlay.querySelector('button:first-child');
        const cancelBtn = overlay.querySelector('button:last-child');
        addRippleEffect(confirmBtn);
        addRippleEffect(cancelBtn);
        const close = (result) => {
            if (window.__interactionResolved) return;
            overlay.style.animation = 'popOut 0.2s';
            setTimeout(() => {
                overlay.remove();
                playSound(CONFIG.soundIds.success);
                safeResolve(`[确认: ${result}]`);
            }, 200);
        };
        confirmBtn.addEventListener('click', () => close(true));
        cancelBtn.addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });

        // 清理函数：移除整个overlay（或禁用按钮）
        container.__cleanup = () => {
            overlay.remove(); // 直接移除对话框，避免残留
        };
    };

    // ---------- 7. 开关 (toggle) ----------
    renderers.toggle = (container, config) => {
        const { onText = '开启', offText = '关闭', default: def = true } = config;
        let state = def;
        container.innerHTML = `
            <div class="toggle-switch ${state ? 'active' : ''}">
                <span class="toggle-label">${state ? onText : offText}</span>
                <div class="toggle-track">
                    <div class="toggle-thumb"></div>
                </div>
            </div>
        `;
        const toggle = container.querySelector('.toggle-switch');
        const label = container.querySelector('.toggle-label');
        toggle.addEventListener('click', () => {
            if (window.__interactionResolved) return;
            state = !state;
            toggle.classList.toggle('active', state);
            label.textContent = state ? onText : offText;
            toggle.style.transform = 'scale(0.95)';
            setTimeout(() => toggle.style.transform = '', 100);
            playSound(CONFIG.soundIds.click);
            safeResolve(`[开关: ${state}]`);
        });

        // 清理函数：移除点击事件（禁用开关效果）
        container.__cleanup = () => {
            toggle.style.pointerEvents = 'none';
            toggle.style.opacity = '0.5';
        };
    };

    // ---------- 段落打字机效果（返回 Promise，完成后 resolve） ----------
    function setupParagraphs() {
        return new Promise((resolve) => {
            const paragraphsContainer = document.querySelector('[data-id="paragraphs"]');
            if (!paragraphsContainer) {
                resolve();
                return;
            }
            const paragraphs = Array.from(paragraphsContainer.querySelectorAll('p'));
            if (paragraphs.length === 0) {
                resolve();
                return;
            }

            // 隐藏所有段落
            paragraphs.forEach(p => p.style.display = 'none');
            let index = 0;

            async function showNext() {
                if (index >= paragraphs.length) {
                    resolve(); // 所有段落显示完毕
                    return;
                }
                const p = paragraphs[index];
                p.style.display = 'block';
                const text = p.textContent;
                p.textContent = '';
                await typewriter(p, text);
                index++;
                if (index < paragraphs.length) {
                    const continueBtn = document.createElement('button');
                    continueBtn.className = 'gal-btn continue-btn';
                    continueBtn.textContent = '继续';
                    continueBtn.addEventListener('click', () => {
                        continueBtn.remove();
                        showNext();
                    });
                    paragraphsContainer.appendChild(continueBtn);
                } else {
                    // 最后一段显示完，直接调用下一轮，触发 resolve
                    showNext();
                }
            }

            showNext();
        });
    }

    // ---------- 初始化（等待段落显示完成后渲染控件） ----------
    async function init() {
        // 重置交互状态，准备新的交互
        window.__interactionResolved = false;

        // 等待段落展示完成
        await setupParagraphs();

        // 扫描并渲染所有控件
        document.querySelectorAll('[data-control-type]').forEach(container => {
            const type = container.dataset.controlType;
            const config = safeJSONParse(container.dataset.config);
            if (renderers[type]) {
                renderers[type](container, config);
            } else {
                console.warn(`[控件库] 未知控件类型: ${type}`);
            }
        });

        // 注入全局动画样式（补充CSS样式师可能遗漏的动画）
        const style = document.createElement('style');
        style.textContent = `
            .ripple {
                position: absolute;
                border-radius: 50%;
                background: rgba(255,255,255,0.5);
                transform: scale(0);
                animation: ripple 0.6s ease-out;
                pointer-events: none;
            }
            @keyframes ripple {
                to { transform: scale(4); opacity: 0; }
            }
            .shake {
                animation: shake 0.3s;
            }
            @keyframes shake {
                0%,100% { transform: translateX(0); }
                20%,60% { transform: translateX(-5px); }
                40%,80% { transform: translateX(5px); }
            }
            .pop {
                animation: pop 0.2s;
            }
            @keyframes pop {
                0% { transform: scale(1); }
                50% { transform: scale(1.3); }
                100% { transform: scale(1); }
            }
            @keyframes popOut {
                from { opacity: 1; transform: scale(1); }
                to { opacity: 0; transform: scale(0.8); }
            }
            .continue-btn {
                margin-top: 20px;
                display: block;
                width: fit-content;
                margin-left: auto;
                margin-right: auto;
            }
        `;
        document.head.appendChild(style);

        // 添加全局清理事件监听（只执行一次）
        window.addEventListener('interaction-resolved', function onResolved(e) {
            window.removeEventListener('interaction-resolved', onResolved);
            document.querySelectorAll('[data-control-type]').forEach(container => {
                if (typeof container.__cleanup === 'function') {
                    container.__cleanup();
                }
            });
        });
    }

    // 确保在DOM加载完成后执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();