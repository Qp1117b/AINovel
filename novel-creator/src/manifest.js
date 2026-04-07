/**
 * manifest.js — 多模块加载清单
 *
 * 用途1（Electron / Node.js）：
 *   const { loadAll } = require('./manifest');
 *   loadAll(window);   // 将所有模块顺序注入到指定全局上下文
 *
 * 用途2（油猴 @require 多文件加载）：
 *   将下方 USERSCRIPT_REQUIRES 中的路径替换为实际可访问的 URL，
 *   添加到油猴脚本的 @require 头部，顺序加载。
 *
 * 用途3（Electron 主进程 preload / webContents.executeJavaScript）：
 *   参考 loadAllForElectron() 函数。
 */

'use strict';

const path = require('path');
const fs   = require('fs');

/** 模块加载顺序（严格保持，共享闭包作用域） */
const MODULE_ORDER = [
    'config.js',
    'errors.js',
    'state.js',
    'utils.js',
    'config-parser.js',
    'indexeddb.js',
    'storage.js',
    'mapping-manager.js',
    'worldbook.js',
    'branch.js',
    'agent-state.js',
    'api.js',
    'preflight.js',
    'notify.js',
    'modal.js',
    'snapshot.js',
    'media-store.js',
    'styles.js',
    'ui.js',
    'config-editor.js',
    'galgame.js',
    'history-ui.js',
    'workflow.js',
    'init.js',
];

const SRC_DIR = path.join(__dirname, 'src');

/**
 * 获取所有模块的绝对路径列表
 * @returns {string[]}
 */
function getModulePaths() {
    return MODULE_ORDER.map(f => path.join(SRC_DIR, f));
}

/**
 * Electron 模式：将所有模块内容顺序注入到渲染进程
 * 在主进程中调用：await loadAllForElectron(webContents)
 *
 * @param {Electron.WebContents} webContents
 */
async function loadAllForElectron(webContents) {
    // 先注入 IIFE 开始
    await webContents.executeJavaScript("(function(){'use strict';");

    for (const filePath of getModulePaths()) {
        const code = fs.readFileSync(filePath, 'utf8');
        await webContents.executeJavaScript(code);
    }

    // 关闭 IIFE
    await webContents.executeJavaScript('})();');
}

/**
 * 油猴多文件 @require 头部（将路径替换为实际 URL 后粘贴到脚本头）
 * 由于油猴要求 URL，本地开发可用 file:// 协议或起一个本地 HTTP 服务
 */
const USERSCRIPT_REQUIRES = MODULE_ORDER.map(
    f => `// @require      file://${SRC_DIR.replace(/\\/g, '/')}/${f}`
).join('\n');

// ─────────── CLI 辅助：打印 @require 列表 ───────────

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args[0] === '--print-requires') {
        console.log('\n将以下 @require 行添加到油猴脚本头部（需先移除原来的整体 @require auto.js）：\n');
        console.log(USERSCRIPT_REQUIRES);
        console.log();
    } else {
        console.log('模块列表 (src/ 目录):');
        getModulePaths().forEach((p, i) => {
            const exists = fs.existsSync(p);
            const size = exists ? (fs.statSync(p).size / 1024).toFixed(1) + ' KB' : '缺失！';
            console.log(`  ${String(i + 1).padStart(2)}. ${MODULE_ORDER[i].padEnd(28)} ${size}`);
        });
        console.log('\n用法：');
        console.log('  node manifest.js --print-requires   # 打印油猴 @require 列表');
    }
}

module.exports = { MODULE_ORDER, SRC_DIR, getModulePaths, loadAllForElectron, USERSCRIPT_REQUIRES };
