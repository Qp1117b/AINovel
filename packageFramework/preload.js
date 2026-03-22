/**
 * preload.js — Electron 预加载脚本
 *
 * 关键原则：contextIsolation=true 下，preload 运行在 isolated world。
 * 页面里的全局变量（如 TavernHelper、SillyTavern）在 isolated world 中
 * 完全不可见，直接读 window.TavernHelper 永远是 undefined。
 *
 * 正确做法：
 *   用 Node.js（preload 可用）读取本地文件内容，
 *   然后把"等待 TavernHelper + 注入 auto.js"的整套逻辑
 *   打包为一个字符串，通过 <script> 标签注入到页面 main world。
 *   <script> 标签在 main world 执行，可以正常访问 TavernHelper。
 */

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// ─── 暴露有限 API 给页面 ──────────────────────────────────────
const api = {};

api.getVersion = () => ipcRenderer.invoke('app-version');
api.openDevTools = () => ipcRenderer.invoke('open-devtools');
api.onLogMessage = (callback) => ipcRenderer.on('log-message', (event, data) => callback(data));

contextBridge.exposeInMainWorld('electronAPI', api);

// ─── 读取本地文件（Node.js 侧） ────────────────────────────────
const VENDOR_DIR = path.join(__dirname, 'vendor');
const AUTO_JS_PATH = path.join(__dirname, 'auto.js');

function readLocalFile(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error(`[preload] 读取文件失败: ${filePath}`, e.message);
  }
  return null;
}

// 依赖库：优先本地 vendor，降级 CDN（CDN 地址作为字符串嵌入 bootstrap）
const DEPS = [
  {
    local: path.join(VENDOR_DIR, 'marked.min.js'),
    cdn: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    name: 'marked',
  },
  {
    local: path.join(VENDOR_DIR, 'jszip.min.js'),
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    name: 'JSZip',
  },
  {
    local: path.join(VENDOR_DIR, 'gpt-tokenizer.js'),
    cdn: 'https://unpkg.com/gpt-tokenizer',
    name: 'GPTTokenizer',
  },
];

// ─── 构建注入脚本（在 main world 执行） ───────────────────────
function buildBootstrapScript() {
  const parts = [];
  console.log(`[preload] 构建 bootstrap，auto.js 路径: ${AUTO_JS_PATH}`);

  // 1. 内联依赖库（已下载到 vendor），或记录需要 CDN 加载的列表
  const cdnDeps = [];

  for (const dep of DEPS) {
    const code = readLocalFile(dep.local);
    if (code) {
      parts.push(`/* vendor: ${dep.name} */\n(function(){\n${code}\n})();`);
      console.log(`[preload] 内联本地依赖: ${dep.name}`);
    } else {
      cdnDeps.push({ name: dep.name, url: dep.cdn });
      console.log(`[preload] 将从 CDN 加载: ${dep.name}`);
    }
  }

  // 2. 读取 auto.js，去除 UserScript 头
  let autoCode = readLocalFile(AUTO_JS_PATH);
  if (!autoCode) {
    console.error('[preload] ❌ 找不到 auto.js，请确认文件存在于:', AUTO_JS_PATH);
    return null;
  }
  autoCode = autoCode.replace(
    /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/m, ''
  ).trim();

  // 3. 把所有逻辑组合为一个在 main world 执行的 bootstrap 函数
  const cdnDepsJson = JSON.stringify(cdnDeps);

  const bootstrap = `
(function() {
  'use strict';

  function loadScript(url) {
    return new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload  = resolve;
      s.onerror = function() { reject(new Error('CDN 加载失败: ' + url)); };
      document.head.appendChild(s);
    });
  }

  function injectCode(code, id) {
    var s = document.createElement('script');
    if (id) s.id = id;
    s.textContent = code;
    document.head.appendChild(s);
  }

  function waitFor(checkFn, timeout, label) {
    return new Promise(function(resolve, reject) {
      var start = Date.now();
      var timer = setInterval(function() {
        try {
          if (checkFn()) {
            clearInterval(timer);
            resolve();
          } else if (Date.now() - start > timeout) {
            clearInterval(timer);
            reject(new Error(label + ' 等待超时 (' + (timeout/1000) + 's)'));
          }
        } catch(e) {
          clearInterval(timer);
          reject(e);
        }
      }, 500);
    });
  }

  function showError(msg) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;' +
      'background:#dc2626;color:#fff;padding:12px 16px;border-radius:8px;' +
      'font-family:monospace;font-size:12px;max-width:420px;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.4);white-space:pre-wrap';
    d.textContent = '[NovelCreator] ' + msg;
    document.body && document.body.appendChild(d);
    setTimeout(function(){ d.remove(); }, 15000);
  }

  async function main() {
    console.log('[NovelCreator] bootstrap 启动（main world）');

    var cdnList = ${cdnDepsJson};
    for (var i = 0; i < cdnList.length; i++) {
      console.log('[NovelCreator] 从 CDN 加载:', cdnList[i].name);
      await loadScript(cdnList[i].url);
    }

    console.log('[NovelCreator] 等待 SillyTavern 上下文...');
    await waitFor(function() {
      return typeof window.SillyTavern !== 'undefined' &&
             typeof window.SillyTavern.getContext === 'function';
    }, 120000, 'SillyTavern.getContext');
    console.log('[NovelCreator] SillyTavern 上下文就绪');

    console.log('[NovelCreator] 等待 TavernHelper...');
    await waitFor(function() {
      return typeof window.TavernHelper !== 'undefined' &&
             typeof window.TavernHelper.getWorldbook        === 'function' &&
             typeof window.TavernHelper.updateWorldbookWith === 'function' &&
             typeof window.TavernHelper.generate            === 'function' &&
             typeof window.TavernHelper.triggerSlash        === 'function' &&
             typeof window.TavernHelper.stopAllGeneration   === 'function';
    }, 120000, 'TavernHelper');
    console.log('[NovelCreator] TavernHelper 就绪');

    injectCode(${JSON.stringify(autoCode)}, 'novel-creator-auto');
    console.log('[NovelCreator] ✅ auto.js 注入成功');
  }

  main().catch(function(err) {
    console.error('[NovelCreator] ❌ 加载失败:', err.message);
    showError('加载失败: ' + err.message);
  });
})();
`;

  parts.push(bootstrap);
  return parts.join('\n\n');
}

// ─── 在页面加载完成后注入 bootstrap ──────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload] DOMContentLoaded，开始构建 bootstrap...');

  const bootstrapCode = buildBootstrapScript();
  if (!bootstrapCode) {
    console.error('[preload] bootstrap 构建失败，放弃注入');
    return;
  }

  const script = document.createElement('script');
  script.id = 'novel-creator-bootstrap';
  script.textContent = bootstrapCode;
  document.head.appendChild(script);

  console.log('[preload] bootstrap 已注入 main world');
});