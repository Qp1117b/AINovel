/**
 * build.js — 自动化小说创作系统构建脚本
 *
 * 功能：将 src/ 下的24个模块拼接打包为单文件 auto.js
 * 策略：直接文本拼接（非 ESM bundle），保持原始闭包共享作用域
 * 用法：node build.js
 *       node build.js --watch    (监听变化自动重建)
 *       node build.js --minify   (压缩输出)
 */

const fs   = require('fs');
const path = require('path');

// ─────────── 配置 ───────────

const SRC_DIR  = __dirname;  // 模块文件直接在此目录
const OUT_FILE = path.join(__dirname, 'auto.js');

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
    'agent-workshop.js',    // AI Agent 工坊（通用生成器 + 主/子AI协作）
    'galgame.js',
    'history-ui.js',
    'workflow.js',
    'init.js',
];

const USERSCRIPT_HEADER = `\
// ==UserScript==
// @name         自动化小说创作系统
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  SillyTavern 自动化小说创作系统，支持多Agent协作、分层分类型预选、状态快照、历史管理
// @author       nosay137
// @run-at       document-idle
// @match        http://127.0.0.1:8000/
// @match        http://localhost:8000/
// @icon         NULL
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://unpkg.com/gpt-tokenizer
// @grant        none
// ==/UserScript==
`;

// ─────────── 构建函数 ───────────

function build(options = {}) {
    const startTime = Date.now();
    const chunks = [USERSCRIPT_HEADER, '', '(function () {', "    'use strict';", ''];

    let totalLines = 0;

    for (const file of MODULE_ORDER) {
        const filePath = path.join(SRC_DIR, file);
        if (!fs.existsSync(filePath)) {
            console.error(`[build] ✗ 缺少模块文件: ${file}`);
            process.exit(1);
        }
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').length;
        totalLines += lines;
        chunks.push(content);
        chunks.push('');  // 模块间空行
        console.log(`  + ${file.padEnd(28)} (${lines} 行)`);
    }

    chunks.push('})();');

    let output = chunks.join('\n');

    if (options.minify) {
        // 简单压缩：移除纯注释行和多余空行（不破坏字符串内容）
        // 注：如需深度压缩请用 terser，此处仅做轻量处理
        output = output
            .replace(/^[ \t]*\/\/(?![ \t]*@|[ \t]*=).*$/gm, '')   // 移除纯注释行（保留 @UserScript 头）
            .replace(/\n{3,}/g, '\n\n');                            // 折叠3+连续空行为2行
        console.log('[build] 已启用轻量压缩');
    }

    fs.writeFileSync(OUT_FILE, output, 'utf8');

    const outSize  = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
    const elapsed  = Date.now() - startTime;
    console.log(`\n✓ 构建成功：auto.js  (${outSize} KB | ${totalLines} 行 | ${elapsed}ms)\n`);
}

// ─────────── CLI ───────────

const args    = process.argv.slice(2);
const watch   = args.includes('--watch');
const minify  = args.includes('--minify');

console.log('\n=== 自动化小说创作系统 - 构建器 ===\n');
build({ minify });

if (watch) {
    console.log('👀 监听 src/ 目录变化...\n');
    let debounceTimer = null;
    fs.watch(SRC_DIR, { recursive: true }, (event, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            console.log(`[watch] 检测到变更: ${filename}`);
            try {
                build({ minify });
            } catch (e) {
                console.error('[watch] 构建失败:', e.message);
            }
        }, 300);
    });
}
