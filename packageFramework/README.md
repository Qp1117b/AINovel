# 自动化小说创作系统 — 绿色免安装版

将 SillyTavern + 酒馆助手（JS-Slash-Runner）+ auto.js 打包为独立 `.exe`，用户无需单独安装任何依赖。

---

## 架构说明

```
应用目录（exe同级）
├── 自动化小说创作系统.exe    ← 主程序
├── auto.js                  ← 自动化脚本
├── splash.html              ← 启动画面
├── preload.js               ← 预加载脚本
│
├── resources/               ← 运行时资源
│   ├── sillytavern/         ← ST 源码 + node_modules
│   │   ├── data/            ← ST 用户数据（自动生成）
│   │   └── public/scripts/extensions/third-party/
│   │       └── JS-Slash-Runner/  ← 酒馆助手
│   └── node/                ← Node.js（系统无时下载）
│       └── node.exe
│
├── vendor/                  ← 前端依赖
│   ├── marked.min.js
│   ├── jszip.min.js
│   └── gpt-tokenizer.js
│
├── download/                ← 下载缓存（保留zip）
│   ├── sillytavern.zip
│   ├── tavern-helper.zip
│   └── node.zip
└── data/                    ← 应用运行日志
    └── launcher.log
```

---

## 快速开始（三步）

### 第一步：克隆本项目

```bash
git clone <仓库地址>
cd packageFramework
```

### 第二步：放入 auto.js

将你的 `auto.js` 复制到项目根目录：

```
packageFramework/
└── auto.js   ← 放在这里
```

### 第三步：一键初始化

```bash
npm run setup
```

`setup` 脚本会自动完成：

1. 检测系统 Node.js（有则使用，无则下载）
2. 下载 SillyTavern（zip 解压）
3. 下载酒馆助手（JS-Slash-Runner）
4. 创建默认配置
5. 下载前端依赖（marked, jszip, gpt-tokenizer）
6. 安装 npm 依赖

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
npm run build
```

生成文件：
- `dist/自动化小说创作系统 Setup 1.0.0.exe` - 安装包
- `dist/win-unpacked/` - 免安装版

### 打包版特性

- 绿色免安装，所有数据在 exe 同级目录
- 自动检测系统 Node.js，无则下载
- 首次运行自动下载 SillyTavern 和酒馆助手
- 下载成功后保留 zip，下次启动直接解压
- 动态分配端口（18000-18100），支持多实例

---

## 清理

```bash
npm run clean
```

删除所有生成文件，只保留源代码。

---

## 前端依赖

| 文件 | 用途 |
|------|------|
| marked.min.js | Markdown 解析 |
| jszip.min.js | ZIP 文件处理 |
| gpt-tokenizer.js | Token 计数 |

依赖会自动从 CDN 下载，失败时在运行时自动降级使用 CDN。

---

## 常见问题

### Q：启动后提示「TavernHelper 未正确加载」

检查 `resources/sillytavern/data/default-user/extensions/JS-Slash-Runner.json` 是否存在，内容应为 `{"enabled": true}`

### Q：系统没有 Node.js 怎么办？

打包版会自动检测并下载到 `resources/node/`

### Q：如何更新 SillyTavern 或酒馆助手？

删除 `resources/sillytavern/` 和 `download/*.zip`，重新运行 `npm run setup`

### Q：下载失败怎么办？

检查网络连接，或手动下载解压：
- SillyTavern: 解压到 `resources/sillytavern/`
- 酒馆助手: 解压到 `resources/sillytavern/public/scripts/extensions/third-party/JS-Slash-Runner/`

---

## 依赖版本

| 组件 | 版本 | 来源 |
|------|------|------|
| Electron | 29.x | npm |
| SillyTavern | release 最新 | GitHub (zip) |
| JS-Slash-Runner | main 最新 | GitHub (zip) |
| Node.js | 20.x LTS 或系统版本 | 系统/nodejs.org |
| marked | latest | CDN/vendor |
| JSZip | 3.10.1 | CDN/vendor |
| gpt-tokenizer | latest | CDN/vendor |

---

## 许可证

本打包方案代码 MIT。SillyTavern 遵循 AGPL-3.0。
