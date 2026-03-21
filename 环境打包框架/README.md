# 自动化小说创作系统 — Electron 打包方案

将 SillyTavern + 酒馆助手（JS-Slash-Runner）+ auto.js 打包为独立 `.exe`，用户无需单独安装任何依赖。

---

## 架构说明

```
Electron (.exe)
├── Main Process (main.js)
│   ├── 启动 SillyTavern 服务器子进程（使用内置 node.exe）
│   └── 等待 HTTP:8000 就绪后创建 BrowserWindow
│
├── BrowserWindow
│   ├── 加载 http://127.0.0.1:8000（SillyTavern 界面）
│   └── preload.js 注入：
│       ├── vendor/marked.min.js
│       ├── vendor/jszip.min.js
│       ├── vendor/gpt-tokenizer.js
│       ├── 等待 TavernHelper 全局对象（酒馆助手）
│       └── auto.js（你的脚本，去除 UserScript 头）
│
└── Resources（打包内）
    ├── sillytavern/          ← ST 完整源码 + node_modules
    │   └── public/scripts/extensions/third-party/
    │       └── JS-Slash-Runner/  ← 酒馆助手扩展
    └── node/
        └── node.exe          ← 便携版 Node.js（子进程专用）
```

---

## 快速开始（四步）

### 第一步：克隆本项目

```bash
git clone <此项目仓库> xxx
cd xxx
```

### 第二步：放入 auto.js

将你的 `auto.js`（`自动化小说创作系统` UserScript）复制到项目根目录：

```
xxx/
└── auto.js   ← 放在这里，UserScript 头保留或删除均可
```

### 第三步：一键初始化环境

```bash
npm install
npm run setup
```

`setup` 脚本会自动完成：
- 克隆 SillyTavern（release 分支）到 `./sillytavern/`
- 安装 ST 的 npm 依赖
- 克隆 JS-Slash-Runner（酒馆助手）到 ST 扩展目录
- 修改 ST 配置（关闭 CSRF、禁止自动打开浏览器）
- 下载三个前端依赖到 `./vendor/`

### 第四步：准备便携 Node.js

```bash
# 自动下载（需要网络）
node scripts/download-node.js

# 或手动：
# 1. 从 https://nodejs.org/dist/v20.18.1/win-x64/node.exe 下载
# 2. 放到 resources/node/node.exe
```

---

## 开发测试

```bash
npm start
```

打开后会显示启动画面，等待 SillyTavern 启动（约 5-15 秒），然后正常显示 ST 界面。
右下角出现悬浮按钮即说明 auto.js 注入成功。

---

## 打包为 exe

```bash
npm run build:win
```

生成文件：`dist/自动化小说创作系统 Setup 1.0.0.exe`

用户安装后，桌面出现快捷方式，双击直接运行，无需安装 Node.js 或 Git。

---

## 目录结构（完整）

```
xxx/
├── main.js              ← Electron 主进程
├── preload.js           ← 脚本注入逻辑
├── auto.js              ← 你的创作系统脚本 ← 你放这里
├── package.json         ← 项目配置 + electron-builder 配置
│
├── scripts/
│   ├── setup.js         ← 一键初始化（克隆 ST + 酒馆助手）
│   └── download-node.js ← 下载便携版 node.exe
│
├── vendor/              ← 前端依赖（离线备用，由 setup 下载）
│   ├── marked.min.js
│   ├── jszip.min.js
│   └── gpt-tokenizer.js
│
├── resources/           ← 手动放入
│   └── node/
│       └── node.exe     ← Node.js v20 便携版 ← 必须手动准备
│
├── build/               ← electron-builder 打包资源
│   ├── icon.ico         ← 应用图标（你自己放）
│   └── ...
│
└── sillytavern/         ← 由 setup 自动克隆
    ├── server.js
    ├── package.json
    ├── node_modules/    ← 由 setup 自动安装
    └── public/
        └── scripts/
            └── extensions/
                └── third-party/
                    └── JS-Slash-Runner/  ← 酒馆助手，由 setup 克隆
```

---

## 常见问题

### Q：启动后提示「TavernHelper 未正确加载」

说明酒馆助手扩展未被 SillyTavern 激活。检查：
1. `sillytavern/data/default-user/extensions/JS-Slash-Runner.json` 是否存在且内容为 `{"enabled": true}`
2. 手动在 ST 界面的扩展面板里开启 JS-Slash-Runner，然后重启

### Q：SillyTavern 子进程报错 `node: not found`

`resources/node/node.exe` 不存在，请运行 `node scripts/download-node.js`

### Q：打包后安装包很大（300-500MB）

正常。ST 的 `node_modules` 约 200-300MB，加上便携版 node.exe（50MB）。
可在 `package.json` 的 `build.extraResources` filter 里排除不必要的文件。

### Q：想更新 SillyTavern 或酒馆助手

重新运行 `npm run setup`，脚本会自动 `git pull` 更新。

### Q：如何添加自定义图标

将 512×512 的 `.ico` 文件放到 `build/icon.ico` 即可，electron-builder 自动使用。

---

## 依赖版本

| 组件 | 版本 | 来源 |
|------|------|------|
| Electron | 29.x | npm |
| SillyTavern | release 最新 | GitHub |
| JS-Slash-Runner | main 最新 | GitHub |
| Node.js (内置) | 20.x LTS | nodejs.org |
| marked | latest | CDN/vendor |
| JSZip | 3.10.1 | CDN/vendor |
| gpt-tokenizer | latest | CDN/vendor |

---

## 许可证

本打包方案代码 MIT。
SillyTavern 遵循 AGPL-3.0。
JS-Slash-Runner 遵循其原始许可证。
auto.js 版权归原作者所有。
