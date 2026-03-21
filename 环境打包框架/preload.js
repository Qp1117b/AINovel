/**
 * preload.js — Electron 预加载脚本
 * 运行于渲染进程（BrowserWindow），但可访问 Node.js API（fs、path）
 *
 * 职责：
 *   1. 等待 SillyTavern 页面 DOM 就绪
 *   2. 顺序加载三个外部依赖库（marked / jszip / gpt-tokenizer）
 *   3. 等待 TavernHelper（酒馆助手扩展）在页面上暴露全局对象
 *   4. 最后注入 auto.js 脚本
 *
 * 注意：contextIsolation=true，此文件在 isolated world 运行。
 * 通过 contextBridge 暴露给页面的内容才可在 main world 访问。
 * 由于 auto.js 是通过 script 标签注入 main world 的，
 * 我们用 webContents.executeJavaScript 或动态 script 标签来注入。
 */

const { contextBridge, ipcRenderer } = require('electron');
const fs   = require('fs');
const path = require('path');

// ─── 向页面暴露有限的 Electron API ─────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion:   () => ipcRenderer.invoke('app-version'),
  openDevTools: () => ipcRenderer.invoke('open-devtools'),
});

// ─── 工具函数 ──────────────────────────────────────────────────

/** 动态加载外部脚本，返回 Promise */
function loadExternalScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload  = () => { console.log(`[preload] 已加载: ${url}`); resolve(); };
    s.onerror = () => reject(new Error(`外部脚本加载失败: ${url}`));
    document.head.appendChild(s);
  });
}

/** 注入本地脚本内容（string），返回 Promise */
function injectInlineScript(code, id) {
  return new Promise((resolve, reject) => {
    try {
      const s = document.createElement('script');
      if (id) s.id = id;
      s.textContent = code;
      document.head.appendChild(s);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 轮询等待 window[key] 满足 condition
 * @param {string} key     - window 上的属性名
 * @param {Function} cond  - 判断函数，默认检查是否存在
 * @param {number} timeout - 最大等待毫秒
 */
function waitForGlobal(key, cond = (v) => !!v, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const val = window[key];
      if (cond(val)) return resolve(val);
      if (Date.now() - start > timeout) {
        return reject(new Error(`等待 window.${key} 超时 (${timeout}ms)`));
      }
      setTimeout(check, 500);
    };
    check();
  });
}

// ─── auto.js 所需的三个外部依赖（原 @require 头） ─────────────
// 优先从本地 vendor 目录加载（离线），降级到 CDN
const VENDOR_DIR = path.join(__dirname, 'vendor');

const DEPS = [
  {
    local: path.join(VENDOR_DIR, 'marked.min.js'),
    cdn:   'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    name:  'marked',
  },
  {
    local: path.join(VENDOR_DIR, 'jszip.min.js'),
    cdn:   'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    name:  'JSZip',
  },
  {
    local: path.join(VENDOR_DIR, 'gpt-tokenizer.js'),
    cdn:   'https://unpkg.com/gpt-tokenizer',
    name:  'GPTTokenizer',
  },
];

async function loadDependency(dep) {
  // 优先本地 vendor
  if (fs.existsSync(dep.local)) {
    const code = fs.readFileSync(dep.local, 'utf8');
    await injectInlineScript(code, `dep-${dep.name}`);
    console.log(`[preload] 本地依赖已注入: ${dep.name}`);
  } else {
    // 降级 CDN
    await loadExternalScript(dep.cdn);
  }
}

// ─── 主注入流程 ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  console.log('[preload] DOM 就绪，开始注入流程');

  try {
    // 1. 加载三个依赖库
    for (const dep of DEPS) {
      await loadDependency(dep);
    }
    console.log('[preload] 所有依赖加载完毕');

    // 2. 等待酒馆助手（JS-Slash-Runner）暴露 TavernHelper
    //    酒馆助手初始化需要等 ST 扩展系统加载完毕，可能需要较长时间
    console.log('[preload] 等待 TavernHelper (酒馆助手) 就绪…');
    await waitForGlobal('TavernHelper', (v) => {
      return v
        && typeof v.getWorldbook          === 'function'
        && typeof v.updateWorldbookWith   === 'function'
        && typeof v.generate              === 'function'
        && typeof v.triggerSlash          === 'function'
        && typeof v.stopAllGeneration     === 'function';
    }, 120000); // 最多等 2 分钟
    console.log('[preload] TavernHelper 已就绪');

    // 3. 读取并注入 auto.js
    const autoJsPath = path.join(__dirname, 'auto.js');
    if (!fs.existsSync(autoJsPath)) {
      throw new Error(`找不到 auto.js: ${autoJsPath}`);
    }
    let autoCode = fs.readFileSync(autoJsPath, 'utf8');

    // 去除 UserScript 元数据头（==UserScript== ... ==/UserScript==）
    autoCode = autoCode.replace(
      /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/m,
      ''
    ).trim();

    await injectInlineScript(autoCode, 'novel-creator-auto');
    console.log('[preload] ✅ auto.js 注入成功，NovelCreator 已启动');

  } catch (err) {
    console.error('[preload] ❌ 注入失败:', err.message);
    // 在页面右下角显示错误提示，不影响 ST 主界面
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 99999;
      background: #dc2626; color: #fff;
      padding: 12px 16px; border-radius: 8px;
      font-family: monospace; font-size: 12px;
      max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `;
    banner.textContent = `[NovelCreator] 加载失败: ${err.message}`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 10000);
  }
});
