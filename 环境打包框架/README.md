# 快速开始

## 环境要求

- Windows 10/11 x64
- Git：<https://git-scm.com/>
- Node.js v20 LTS：<https://nodejs.org/>

---

## 一、初始化（只做一次）

```powershell
# 1. 进入项目目录
cd xxx

# 2. 安装 npm 依赖
npm install

# 3. 克隆 SillyTavern + 酒馆助手，下载前端依赖
npm run setup

# 4. 下载便携版 node.exe（约 55MB）
node scripts/download-node.js

# 5. 将 auto.js 放到项目根目录
#    copy D:\你的路径\auto.js .
```

完成后目录结构：

```
xxx/
├── auto.js              ← 你的脚本
├── resources/
│   ├── node/node.exe    ← 便携版 Node.js
│   └── sillytavern/     ← ST 源码
└── vendor/              ← 前端依赖
```

---

## 二、开发测试

```powershell
chcp 65001
npm start
```

**验证注入成功**：按 F12 打开控制台，看到以下日志即正常：

```
[NovelCreator] TavernHelper 就绪
[NovelCreator] ✅ auto.js 注入成功
```

---

## 三、打包 exe

```powershell
npm run build:win
```

生成文件：`dist\自动化小说创作系统 Setup 1.0.0.exe`

---

## 四、常见报错

| 报错 | 解决 |
|------|------|
| `Cannot find module 'app-builder-bin'` | `rmdir /s /q node_modules` → `npm install --save-dev electron-builder@latest` → `npm install` |
| 启动报「找不到 Node.js」 | 运行 `node scripts/download-node.js` |
| 启动报「找不到 SillyTavern」 | 运行 `npm run setup` |
| auto.js 未注入 | F12 控制台查看报错；检查 JS-Slash-Runner 是否在 ST 扩展页启用 |
| 首次启动等待很久 | 正常，ST 首次需编译前端库约 1~3 分钟 |
| 端口 8000 被占用 | `netstat -ano \| findstr :8000` → `taskkill /F /PID <pid>` |
