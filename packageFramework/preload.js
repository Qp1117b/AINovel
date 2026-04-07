/**
 * preload.js — Electron 预加载脚本
 *
 * 功能：暴露 electronAPI（contextBridge）给渲染进程
 *
 * 注意：模块加载已移至 main.js 通过 executeJavaScript 注入。
 * preload 仅负责暴露必要的 Electron API。
 */

const { contextBridge, ipcRenderer } = require('electron');

// ─── 暴露有限 API 给页面 ──────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app-version'),
  openDevTools: () => ipcRenderer.invoke('open-devtools'),
  onLogMessage: (callback) => ipcRenderer.on('log-message', (event, data) => callback(data)),
});
